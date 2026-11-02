// Multiplayer race glue (race page with ?mp=1). game.js still runs this player's car; other
// players appear as rivals marked `remote`: the network moves them (≈10 updates a second,
// extrapolated between updates), the rival AI and collisions skip them. Empty grid slots keep
// AI rivals, so a race always has four cars. Everyone counts down together when the host
// says go; the host collects finish times and sends the final places.
const revMpRace = (() => {
    if (new URLSearchParams(location.search).get('mp') !== '1' || typeof revNet === 'undefined') return null;
    const profile = new RevProfileStore(gameStorage);
    let storage = null; try { storage = sessionStorage; } catch {}
    const lobby = new RevLobby(revNet, () => profile.public({ carId: garage.car.id, color: garage.car.color, style: garage.car.style || garage.car.id }), storage);
    if (lobby.state.phase !== 'race' && lobby.state.phase !== 'results') return null;
    const round = lobby.state.round;
    const SURFACE_THEME = { gravel: 'gravel', dirt: 'dirt', sand: 'desert', snow: 'snow' };

    // The host's settings as a course (a career round keeps its hills and obstacles).
    const settings = lobby.state.settings;
    const map = settings.source === 'career' ? REV_MAPS[settings.map] : null;
    const course = map ? { ...map, type: 'race', pace: 1, recommended: 'any' } : {
        id: null, name: 'Custom race', type: 'race', distance: settings.distance, curves: settings.curves, traffic: settings.traffic,
        surface: settings.surface, theme: settings.surface === 'tarmac' ? settings.theme : SURFACE_THEME[settings.surface], hills: [], obstacles: [], pace: 1, recommended: 'any'
    };

    let go = false, goWaiters = [], loadedTimer = 0, sendClock = 0;
    const remote = new Map();   // id → { d, v, x, g, f, out, at }

    lobby.onRace((kind, data) => {
        if (kind === 'go' && !go) { go = true; clearInterval(loadedTimer); goWaiters.splice(0).forEach(fn => fn()); }
        if (kind === 'state') remote.set(data.id, { ...data.state, at: performance.now() });
        if (kind === 'done') { const r = remote.get(data.id) || {}; remote.set(data.id, { ...r, done: lobby.state.race[data.id]?.done }); }
        if (kind === 'results') api.onResults?.(lobby.state.results);
    });
    // A new round from the host reloads this page; "back" returns to the lobby page.
    lobby.subscribe(state => {
        if (state.phase === 'race' && state.round !== round) location.reload();
        if (state.phase === 'lobby') location.href = 'frontend/multiplayer/index.html';
    });
    revNet.auth().then(() => revNet.resume());

    const others = () => lobby.members.filter(m => m.id !== lobby.me);
    const api = {
        lobby, profile, course, settings, round,
        get go() { return go; },
        // Called by race-ui once the player pressed Start: tell the host and wait for GO.
        ready(onGo) {
            if (go) { onGo(); return; }
            goWaiters.push(onGo);
            lobby.loaded();
            clearInterval(loadedTimer);
            let waited = 0;
            loadedTimer = setInterval(() => {
                lobby.loaded();
                // The host does not wait forever for a phone that never loads the race.
                if (lobby.isHost && (waited += 1) >= 12) lobby.maybeGo(true);
            }, 1000);
        },
        waitingText() {
            const loaded = lobby.members.filter(m => lobby.state.race[m.id]?.loaded).length;
            return lobby.isHost ? `Waiting for players · ${loaded}/${lobby.members.length}` : 'Waiting for the host…';
        },
        // After every resetGame(): other players take the first rival slots; this car starts in its own lane.
        assignRivals(race) {
            const order = lobby.state.order || lobby.members.map(m => m.id);
            const mySlot = Math.max(0, order.indexOf(lobby.me));
            car.x = roadLeft + mySlot * laneWidth + (laneWidth - car.width) / 2;
            others().slice(0, race.rivals.length).forEach((member, i) => {
                const rival = race.rivals[i], slot = Math.max(0, order.indexOf(member.id));
                const p = member.profile || {};
                Object.assign(rival, {
                    remote: true, id: member.id, name: String(p.name || 'Racer').slice(0, 10), color: p.color || '#38e1ff',
                    carId: p.carId, style: p.style, distance: 0, speedKmh: 0, finishTime: null, lane: slot,
                    x: roadLeft + slot * laneWidth + (laneWidth - rival.width) / 2, netX: null
                });
            });
            // AI rivals start behind the players' grid row.
            race.rivals.filter(r => !r.remote).forEach((r, i) => { r.lane = (mySlot + 1 + i) % 4; r.distance = -10 - i * 8; });
        },
        // Every frame: send this car (10×/s) and move the other players' cars.
        frame(dt) {
            sendClock += dt;
            if (go && sendClock >= 0.1) {
                sendClock = 0;
                lobby.sendState({ d: Math.round(race.distance * 10) / 10, v: Math.round(car.speedKmh), x: Math.round(car.x), g: gear, f: race.finished ? race.finishTime : null });
            }
            const now = performance.now();
            for (const rival of race.rivals) {
                if (!rival.remote) continue;
                const r = remote.get(rival.id);
                if (!r) continue;
                const done = r.done || lobby.state.race[rival.id]?.done;
                if (done && !done.out && done.time) { rival.finishTime = done.time; rival.distance = race.length; rival.speedKmh = 0; continue; }
                // Extrapolate at most 1.5 s past the last update.
                const ahead = Math.min(1.5, (now - r.at) / 1000);
                rival.distance = Math.min(race.length, (r.d || 0) + (r.v || 0) / 3.6 * ahead);
                rival.speedKmh = r.v || 0;
                rival.netX = r.x;
                rival.stale = now - r.at > 5000;
            }
        },
        finish() {
            lobby.finish({ time: race.finished ? Math.round(race.finishTime * 100) / 100 : 0, out: !race.finished, distance: Math.round(race.distance) });
        },
        members: () => lobby.members,
        onResults: null
    };
    return api;
})();
