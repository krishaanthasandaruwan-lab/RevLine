// Multiplayer network layer. One API, two transports:
//   Game Center (iPhone app): GameKit through the native bridge (ios/RevLine/RevGameCenter.swift).
//   Simulator (any browser): BroadcastChannel between tabs of the same browser, so 2–4 players
//   can be tested on one computer. Each tab is one player.
// Later a Firebase transport can implement the same methods without changing the pages.
//
// Events (net.on): 'players' [remote players], 'message' {from, data}, 'invite' {code, from},
// 'disconnected' {id}, 'status' {text}. Players are { id, name }; the local player is net.me.
const REV_NET_BOARDS = { wins: 'revline.wins', stars: 'revline.stars', points: 'revline.points' };
const REV_MAX_PLAYERS = 4;

class RevNet {
    constructor() {
        this.listeners = {};
        this.me = null;
        this.players = [];
        const native = typeof window !== 'undefined' && window.webkit?.messageHandlers?.gameCenter;
        this.transport = native ? new RevGameCenterTransport(this) : new RevSimTransport(this);
        this.kind = native ? 'gamecenter' : 'simulator';
    }
    on(event, fn) { (this.listeners[event] ||= new Set()).add(fn); return () => this.listeners[event].delete(fn); }
    emit(event, data) {
        if (event === 'players') this.players = data;
        for (const fn of this.listeners[event] || []) { try { fn(data); } catch (error) { console.error(error); } }
    }

    // Signs in (Game Center) or makes a simulator identity. → { ok, id, name, error }
    async auth() { const me = await this.transport.auth(); if (me.ok) this.me = { id: me.id, name: me.name }; return me; }
    // The match the native side (or this tab) is still in after a page change. → { group, players } | null
    resume() { return this.transport.resume(); }
    // mode 'code': friends lobby (group from the 6-digit code); 'online': anyone searching now.
    find({ mode, code = '' }) { return this.transport.find({ mode, group: mode === 'code' ? revCodeGroup(code) : 1 }); }
    cancel() { return this.transport.cancel(); }
    // A round started: stop adding players to this match.
    lock() { return this.transport.lock?.(); }
    leave() { this.players = []; return this.transport.leave(); }
    send(data, { reliable = true } = {}) { return this.transport.send(JSON.stringify(data), reliable); }
    searching() { return this.transport.searching(); }
    friends() { return this.transport.friends(); }
    addFriend() { return this.transport.addFriend(); }
    invite(ids, code) { return this.transport.invite(ids, code); }
    photo(id) { return this.transport.photo(id); }
    submitScore(board, score) { return this.transport.submitScore(REV_NET_BOARDS[board], Math.max(0, Math.round(score))); }
    leaderboard(board, scope = 'global') { return this.transport.leaderboard(REV_NET_BOARDS[board], scope); }
    dashboard() { return this.transport.dashboard(); }
    async share({ text, url }) {
        if (this.transport.share) return this.transport.share(text, url);
        if (navigator.share) { try { await navigator.share({ text, url }); return true; } catch { return false; } }
        return revCopy(`${text} ${url}`);
    }
}

// Invite codes: 6 digits. Game Center's playerGroup groups players searching with the same code.
const revNewCode = () => String(100000 + Math.floor(Math.random() * 900000));
const revCodeGroup = code => 1000 + Number(String(code).replace(/\D/g, '').slice(0, 6) || 0);
const revInviteText = code => `Race me on RevLine! Open RevLine → Multiplayer → Join, code ${code}.`;
const revInviteUrl = code => `revline://join/${code}`;
async function revCopy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); return ok; } catch { return false; }
}

// ---------- Game Center (native bridge) ----------
class RevGameCenterTransport {
    constructor(net) {
        this.net = net; this.calls = new Map(); this.next = 1;
        // The native side answers with revNetNative.reply(id, ok, data) and pushes events with
        // revNetNative.event(name, data).
        window.revNetNative = {
            reply: (id, ok, data) => { const call = this.calls.get(id); if (!call) return; this.calls.delete(id); ok ? call.resolve(data) : call.reject(new Error(data?.error || 'Game Center error')); },
            event: (name, data) => {
                if (name === 'data') { try { this.net.emit('message', { from: data.from, data: JSON.parse(data.payload) }); } catch {} return; }
                this.net.emit(name, data);
            }
        };
    }
    call(cmd, args = {}) {
        return new Promise((resolve, reject) => {
            const id = this.next++;
            this.calls.set(id, { resolve, reject });
            window.webkit.messageHandlers.gameCenter.postMessage({ id, cmd, args });
        });
    }
    async auth() { try { return { ok: true, ...(await this.call('auth')) }; } catch (error) { return { ok: false, error: error.message }; } }
    async resume() { try { return await this.call('state'); } catch { return null; } }
    find({ group }) { return this.call('find', { group, min: 2, max: REV_MAX_PLAYERS }); }
    cancel() { return this.call('cancel').catch(() => {}); }
    lock() { return this.call('lock').catch(() => {}); }
    leave() { return this.call('leave').catch(() => {}); }
    send(payload, reliable) { return this.call('send', { payload, reliable }).catch(() => {}); }
    searching() { return this.call('activity').catch(() => 0); }
    friends() { return this.call('friends'); }
    addFriend() { return this.call('addFriend'); }
    invite(ids, code) { return this.call('invite', { ids, group: revCodeGroup(code), max: REV_MAX_PLAYERS }); }
    photo(id) { return this.call('photo', { id }).catch(() => ''); }
    submitScore(board, score) { return this.call('submit', { board, score }).catch(() => false); }
    leaderboard(board, scope) { return this.call('leaderboard', { board, scope }); }
    dashboard() { return this.call('dashboard').catch(() => {}); }
    share(text, url) { return this.call('share', { text, url }).then(() => true, () => false); }
}

// ---------- Simulator (BroadcastChannel; for testing in a browser) ----------
// Every tab announces itself every 0.8 s while searching or matched; players silent for 4 s
// drop out. Session storage keeps the tab's identity and match across page changes.
class RevSimTransport {
    constructor(net) {
        this.net = net;
        this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('revline-sim') : null;
        this.seen = new Map();   // id → { id, name, group, at }
        this.group = null; this.searchingFor = null; this.waiters = [];
        try { this.id = sessionStorage.getItem('revline-sim-id'); } catch {}
        if (!this.id) { this.id = `sim-${Math.random().toString(36).slice(2, 8)}`; try { sessionStorage.setItem('revline-sim-id', this.id); } catch {} }
        try { this.group = JSON.parse(sessionStorage.getItem('revline-sim-group')); } catch {}
        this.channel?.addEventListener('message', event => this.receive(event.data));
        this.timer = setInterval(() => this.tick(), 800);
    }
    get name() {
        try { return JSON.parse(localStorage.getItem('revline-profile-v1'))?.name || `Player ${this.id.slice(-3)}`; } catch { return `Player ${this.id.slice(-3)}`; }
    }
    post(message) { this.channel?.postMessage({ ...message, from: this.id, name: this.name }); }
    setGroup(group) { this.group = group; try { sessionStorage.setItem('revline-sim-group', JSON.stringify(group)); } catch {} }
    members() {
        const now = Date.now();
        return [...this.seen.values()].filter(p => p.group === this.group && now - p.at < 4000).sort((a, b) => a.id.localeCompare(b.id)).slice(0, REV_MAX_PLAYERS - 1);
    }
    // Announce this tab (timer only: answering an announcement would ping-pong between tabs).
    tick() {
        const group = this.group ?? this.searchingFor;
        if (group !== null && group !== undefined) this.post({ type: 'here', group, matched: this.group !== null });
        this.refresh();
    }
    refresh() {
        if (this.group === null) return;
        const list = this.members().map(({ id, name }) => ({ id, name }));
        if (JSON.stringify(list) !== JSON.stringify(this.net.players)) this.net.emit('players', list);
    }
    receive(message) {
        if (!message || message.from === this.id) return;
        if (message.type === 'here') {
            this.seen.set(message.from, { id: message.from, name: message.name, group: message.group, at: Date.now() });
            if (this.searchingFor !== null && message.group === this.searchingFor) this.matched();
            if (this.group !== null && message.group === this.group) this.refresh();
        }
        // Data for the lobby this tab is still joining means the match exists: join it first.
        if (message.type === 'data' && this.searchingFor !== null && message.group === this.searchingFor) {
            this.seen.set(message.from, { id: message.from, name: message.name, group: message.group, at: Date.now() });
            this.matched();
        }
        if (message.type === 'data' && message.group === this.group && (!message.to || message.to === this.id)) {
            try { this.net.emit('message', { from: message.from, data: JSON.parse(message.payload) }); } catch {}
        }
        if (message.type === 'invite' && message.to?.includes(this.id)) this.net.emit('invite', { code: message.code, from: { id: message.from, name: message.name } });
        if (message.type === 'bye') { this.seen.delete(message.from); this.refresh(); }
    }
    matched() {
        this.setGroup(this.searchingFor); this.searchingFor = null;
        const players = this.members().map(({ id, name }) => ({ id, name }));
        this.net.emit('players', players);
        this.waiters.splice(0).forEach(resolve => resolve({ group: this.group, players }));
    }
    async auth() { return { ok: true, id: this.id, name: this.name, simulator: true }; }
    async resume() { return this.group !== null ? { group: this.group, players: this.members().map(({ id, name }) => ({ id, name })) } : null; }
    find({ group }) {
        this.leaveQuietly(); this.searchingFor = group; this.tick();
        return new Promise(resolve => this.waiters.push(resolve));
    }
    async cancel() { this.searchingFor = null; this.waiters.splice(0).forEach(resolve => resolve(null)); }
    leaveQuietly() { if (this.group !== null) this.post({ type: 'bye' }); this.setGroup(null); }
    async leave() { await this.cancel(); this.leaveQuietly(); }
    async send(payload) { if (this.group !== null) this.post({ type: 'data', group: this.group, payload }); }
    async searching() {
        const now = Date.now();
        return [...this.seen.values()].filter(p => p.group === 1 && now - p.at < 5000).length;
    }
    async friends() { const now = Date.now(); return [...this.seen.values()].filter(p => now - p.at < 60000).map(({ id, name }) => ({ id, name, online: true })); }
    async addFriend() { return false; }
    async invite(ids, code) { this.post({ type: 'invite', to: ids, code }); return true; }
    async photo() { return ''; }
    board(board) { try { return JSON.parse(localStorage.getItem(`revline-sim-board:${board}`)) || {}; } catch { return {}; } }
    async submitScore(board, score) {
        const entries = this.board(board), mine = entries[this.id];
        if (!mine || score > mine.score) entries[this.id] = { name: this.name, score };
        try { localStorage.setItem(`revline-sim-board:${board}`, JSON.stringify(entries)); } catch {}
        return true;
    }
    async leaderboard(board) {
        const entries = Object.entries(this.board(board)).map(([id, e]) => ({ id, name: e.name, score: e.score })).sort((a, b) => b.score - a.score);
        return { entries: entries.slice(0, 50).map((e, i) => ({ ...e, rank: i + 1 })), local: entries.findIndex(e => e.id === this.id) + 1 || null };
    }
    async dashboard() {}
}

const revNet = typeof window !== 'undefined' ? new RevNet() : null;

if (typeof module !== 'undefined') module.exports = { RevNet, revNewCode, revCodeGroup, revInviteText, revInviteUrl, REV_NET_BOARDS, REV_MAX_PLAYERS };
