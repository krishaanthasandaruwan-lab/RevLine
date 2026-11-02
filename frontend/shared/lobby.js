// Multiplayer lobby and race protocol on top of RevNet (net.js). Up to 4 players.
//   Friends lobby: whoever created the code is the host; the host chooses the race (any career
//   round, or a custom road) and starts it. "Next round" keeps the previous settings.
//   Online: players searching at the same time are matched; the race is chosen automatically
//   (the host there is simply the lowest player id, so every phone agrees without asking).
// Messages (JSON, type field): hello, settings, ready, start, loaded, go, state, done, results, back.
// The lobby survives page changes through sessionStorage ('revline-mp').
const REV_MP_KEY = 'revline-mp';
const REV_MP_RESULT_WAIT = 45;      // seconds after the first finisher before results are final

// Settings a host can choose. Career rounds bring their own road; custom builds one.
const REV_MP_DEFAULTS = { source: 'custom', map: null, distance: 1000, curves: 0.6, traffic: false, surface: 'tarmac', theme: 'grass', difficulty: 'normal', ai: true };
function revCleanSettings(input = {}) {
    const s = { ...REV_MP_DEFAULTS, ...input };
    return {
        source: s.source === 'career' ? 'career' : 'custom',
        map: typeof s.map === 'string' && /^r\d{1,2}m\d{1,2}$/.test(s.map) ? s.map : null,
        distance: [1000, 3000, 5000].includes(Number(s.distance)) ? Number(s.distance) : 1000,
        curves: Math.max(0, Math.min(1.25, Number(s.curves) || 0)),
        traffic: Boolean(s.traffic),
        surface: ['tarmac', 'gravel', 'dirt', 'sand', 'snow'].includes(s.surface) ? s.surface : 'tarmac',
        theme: typeof s.theme === 'string' && /^[a-z]{3,10}$/.test(s.theme) ? s.theme : 'grass',
        difficulty: ['easy', 'normal', 'hard'].includes(s.difficulty) ? s.difficulty : 'normal',
        ai: s.ai !== false
    };
}

// Online races pick a race round automatically: same choice on every phone (seeded by round).
function revAutoSettings(maps, seed) {
    const pool = maps.filter(m => m.type === 'race');
    let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const map = pool[h % pool.length];
    return revCleanSettings({ source: 'career', map: map.id, distance: map.distance, curves: map.curves, traffic: map.traffic, surface: map.surface, theme: map.theme, difficulty: 'normal' });
}

// Places: finishers by time, then the rest by distance; drivers who went out are last.
function revRankResults(entries) {
    return [...entries].sort((a, b) => {
        if (a.out !== b.out) return a.out ? 1 : -1;
        if (a.time && b.time) return a.time - b.time;
        if (a.time || b.time) return a.time ? -1 : 1;
        return (b.distance || 0) - (a.distance || 0);
    }).map((e, i) => ({ ...e, place: i + 1 }));
}

class RevLobby {
    // net: RevNet-like ({ me, players, on, send }); profile: () => public profile object.
    constructor(net, profile, storage = null) {
        this.net = net; this.profile = profile; this.storage = storage;
        this.listeners = new Set();
        this.greeted = new Set();   // players this phone has answered with its own hello
        this.state = { mode: null, code: '', hostId: null, round: 0, settings: revCleanSettings(), members: {}, phase: 'idle', results: null, race: {} };
        this.load();
        net.on('players', players => this.onPlayers(players));
        net.on('message', ({ from, data }) => this.onMessage(from, data));
    }
    // ---------- persistence ----------
    load() { try { const saved = JSON.parse(this.storage?.getItem(REV_MP_KEY)); if (saved?.mode) this.state = { ...this.state, ...saved, race: {} }; } catch {} }
    save() { try { this.storage?.setItem(REV_MP_KEY, JSON.stringify({ ...this.state, race: undefined })); } catch {} }
    clear() { this.state = { mode: null, code: '', hostId: null, round: 0, settings: revCleanSettings(), members: {}, phase: 'idle', results: null, race: {} }; try { this.storage?.removeItem(REV_MP_KEY); } catch {} this.changed(); }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    changed() { this.save(); for (const fn of this.listeners) fn(this.state); }

    get me() { return this.net.me?.id; }
    get isHost() { return this.state.hostId === this.me; }
    get members() { return Object.values(this.state.members).sort((a, b) => (b.id === this.state.hostId) - (a.id === this.state.hostId) || a.id.localeCompare(b.id)); }
    get everyoneReady() { return this.members.length >= 2 && this.members.every(m => m.id === this.state.hostId || m.ready); }

    // ---------- lobby ----------
    open({ mode, code = '', host = false }) {
        const me = this.me;
        this.state = { ...this.state, mode, code, phase: 'lobby', results: null, round: 0,
            hostId: mode === 'code' ? (host ? me : null) : me,
            members: { [me]: { id: me, profile: this.profile(), ready: false } } };
        this.changed();
    }
    onPlayers(players) {
        if (!this.state.mode) return;
        const ids = new Set([this.me, ...players.map(p => p.id)]);
        for (const id of Object.keys(this.state.members)) if (!ids.has(id)) delete this.state.members[id];
        for (const p of players) this.state.members[p.id] ||= { id: p.id, profile: { name: p.name }, ready: false };
        // Online: the lowest id hosts. Friends: the creator hosts; if the host left, the lowest id takes over.
        if (this.state.mode === 'online' || !ids.has(this.state.hostId)) {
            if (this.state.mode === 'online' || this.state.hostId) this.state.hostId = [...ids].sort()[0];
        }
        this.hello();
        this.changed();
    }
    hello() { this.net.send({ type: 'hello', profile: this.profile(), host: this.isHost, ready: this.state.members[this.me]?.ready || false, round: this.state.round, settings: this.isHost ? this.state.settings : undefined }); }
    setReady(ready) { if (this.state.members[this.me]) this.state.members[this.me].ready = ready; this.net.send({ type: 'ready', ready }); this.changed(); }
    setSettings(settings) {
        if (!this.isHost) return;
        this.state.settings = revCleanSettings(settings);
        this.net.send({ type: 'settings', settings: this.state.settings });
        this.changed();
    }
    // Host: start a round. Every phone then opens the race with the same settings.
    start(maps = []) {
        if (!this.isHost || this.members.length < 2) return false;
        this.state.round += 1;
        if (this.state.mode === 'online') this.state.settings = revAutoSettings(maps, `${this.state.code}:${this.state.round}:${this.members.map(m => m.id).join()}`);
        const order = this.members.map(m => m.id);
        this.net.send({ type: 'start', host: true, round: this.state.round, settings: this.state.settings, order });
        this.beginRound(this.state.round, this.state.settings, order);
        return true;
    }
    beginRound(round, settings, order) {
        this.state.round = round; this.state.settings = revCleanSettings(settings); this.state.order = order;
        this.state.phase = 'race'; this.state.results = null; this.state.race = {};
        this.net.lock?.();
        for (const m of this.members) m.ready = false;
        this.changed();
    }
    // Host: everyone back to the lobby (results stay visible there).
    backToLobby() { if (this.isHost) this.net.send({ type: 'back' }); this.state.phase = 'lobby'; this.changed(); }

    // ---------- race ----------
    loaded() { this.net.send({ type: 'loaded', round: this.state.round }); this.state.race[this.me] = { ...(this.state.race[this.me] || {}), loaded: true }; this.maybeGo(); }
    maybeGo(force = false) {
        if (!this.isHost || this.state.goSent === this.state.round) return;
        const loaded = this.members.filter(m => this.state.race[m.id]?.loaded).length;
        if (force || loaded >= this.members.length) {
            this.state.goSent = this.state.round;
            this.net.send({ type: 'go', round: this.state.round });
            this.emitRace('go');
        }
    }
    // Sent ~10 times a second while racing: distance (m), speed (km/h), lateral x (px), gear.
    sendState(state) { this.net.send({ type: 'state', round: this.state.round, ...state }, { reliable: false }); }
    finish({ time, out, distance }) {
        const entry = { time: out ? 0 : time, out: Boolean(out), distance };
        this.state.race[this.me] = { ...(this.state.race[this.me] || {}), done: entry };
        this.net.send({ type: 'done', round: this.state.round, ...entry });
        this.maybeResults();
    }
    maybeResults(force = false) {
        if (!this.isHost || this.state.results) return;
        const done = this.members.filter(m => this.state.race[m.id]?.done);
        if (!force && done.length < this.members.length) {
            if (done.length && !this.resultTimer) this.resultTimer = setTimeout(() => { this.resultTimer = null; this.maybeResults(true); }, REV_MP_RESULT_WAIT * 1000);
            return;
        }
        clearTimeout(this.resultTimer); this.resultTimer = null;
        const order = revRankResults(this.members.map(m => {
            const r = this.state.race[m.id] || {};
            return { id: m.id, name: m.profile.name, ...(r.done || { time: 0, out: false, distance: r.state?.d || 0 }) };
        }));
        this.net.send({ type: 'results', round: this.state.round, order });
        this.setResults(order);
    }
    setResults(order) { this.state.results = { round: this.state.round, order }; this.state.phase = 'results'; this.changed(); this.emitRace('results'); }
    raceListeners = new Set();
    onRace(fn) { this.raceListeners.add(fn); return () => this.raceListeners.delete(fn); }
    emitRace(kind, data) { for (const fn of this.raceListeners) fn(kind, data); }

    // ---------- incoming ----------
    onMessage(from, data) {
        if (!data || typeof data.type !== 'string' || !this.state.mode) return;
        const member = this.state.members[from] ||= { id: from, profile: { name: 'Racer' }, ready: false };
        const fromHost = from === this.state.hostId;
        switch (data.type) {
            case 'hello':
                member.profile = data.profile || member.profile; member.ready = Boolean(data.ready);
                // Answer a player's first hello, so profiles and the host are known both ways
                // even if an earlier message was sent before the match had formed.
                if (!this.greeted.has(from)) { this.greeted.add(from); this.hello(); }
                if (data.host && this.state.mode === 'code') this.state.hostId = from;
                if (data.settings && from === this.state.hostId) this.state.settings = revCleanSettings(data.settings);
                this.changed(); this.emitRace('profile', { id: from, profile: member.profile });
                break;
            case 'ready': member.ready = Boolean(data.ready); this.changed(); break;
            case 'settings': if (fromHost) { this.state.settings = revCleanSettings(data.settings); this.changed(); } break;
            case 'start':
                if (data.host && this.state.mode === 'code' && !this.state.hostId) this.state.hostId = from;
                if (from === this.state.hostId) this.beginRound(data.round, data.settings, data.order);
                break;
            case 'back': if (fromHost) { this.state.phase = 'lobby'; this.changed(); } break;
            case 'loaded': if (data.round === this.state.round) { this.state.race[from] = { ...(this.state.race[from] || {}), loaded: true }; this.maybeGo(); } break;
            case 'go': if (fromHost && data.round === this.state.round) this.emitRace('go'); break;
            case 'state': if (data.round === this.state.round) { this.state.race[from] = { ...(this.state.race[from] || {}), state: data, at: Date.now() }; this.emitRace('state', { id: from, state: data }); } break;
            case 'done': if (data.round === this.state.round) { this.state.race[from] = { ...(this.state.race[from] || {}), done: { time: data.out ? 0 : data.time, out: Boolean(data.out), distance: data.distance } }; this.emitRace('done', { id: from }); this.maybeResults(); } break;
            case 'results': if (fromHost && data.round === this.state.round) this.setResults(data.order); break;
        }
    }
}

if (typeof module !== 'undefined') module.exports = { RevLobby, revCleanSettings, revAutoSettings, revRankResults, REV_MP_DEFAULTS, REV_MP_KEY };
