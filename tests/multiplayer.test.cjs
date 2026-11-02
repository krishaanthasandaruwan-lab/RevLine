// Multiplayer: profiles, lobby protocol (host, settings, ready, start, go, live state,
// results) and the race-engine hooks for other players' cars. Players share an in-memory bus
// that behaves like Game Center: messages reach everyone else in the same match.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const { RevProfileStore, REV_COUNTRY_CODES, revFlag, revCleanText, revEscape, revAvatarHTML } = require('../frontend/shared/profile-store.js');
const { RevLobby, revCleanSettings, revAutoSettings, revRankResults } = require('../frontend/shared/lobby.js');
const { revCodeGroup, revNewCode, revInviteText, revInviteUrl } = require('../frontend/shared/net.js');
const { RevRace } = require('../driving-scene.js');
const storage = () => ({ data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); }, removeItem(k) { delete this.data[k]; } });

// ---------- Profiles ----------
const profile = new RevProfileStore(storage());
assert(profile.setName(' a '), 'Names need at least 2 letters');
assert.equal(profile.setName('  Krish   Sandaruwan  <script>  '), '');
assert.equal(profile.state.name, 'Krish Sandaruwan scr', 'Trimmed, single-spaced, no markup, 20 characters');
assert.equal(profile.setCountry('LK'), ''); assert(profile.setCountry('XX'));
assert.equal(revFlag('LK'), '🇱🇰'); assert.equal(revFlag(''), '🏁');
assert(REV_COUNTRY_CODES.length > 240 && REV_COUNTRY_CODES.includes('LK') && REV_COUNTRY_CODES.includes('US'));
profile.setBio('x'.repeat(400)); assert.equal(profile.state.bio.length, 150);
assert(profile.setAvatar('javascript:alert(1)'), 'Only image data URLs');
assert.equal(profile.setAvatar('data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'), '');
const pub = profile.public({ carId: 'supra' });
assert.deepEqual([pub.name, pub.country, pub.avatar, pub.carId], ['Krish Sandaruwan scr', 'LK', 'data:image/jpeg;base64,BBBB', 'supra'], 'Others get the small picture');
profile.linkGameCenter({ id: 'G:1', name: 'Other' }); assert.equal(profile.state.name, 'Krish Sandaruwan scr', 'Game Center name only fills an empty name');
assert.deepEqual({ ...profile.recordRace({ place: 1, players: 3, time: 62.5 }) }, { races: 1, wins: 1, podiums: 1, bestTime: 62.5 });
profile.recordRace({ place: 3, players: 3, time: 70 }); profile.recordRace({ place: 1, players: 1, time: 50 });
assert.deepEqual([profile.state.stats.wins, profile.state.stats.podiums, profile.state.stats.bestTime], [1, 3, 50], 'Solo races are not wins');
profile.remember('G:2', { name: '<b>Bad</b>', country: 'ZZ', avatar: 'data:text/html;base64,AA', bio: 'hi' });
assert.deepEqual([profile.player('G:2').name, profile.player('G:2').country, profile.player('G:2').avatar], ['bBad/b', '', ''], 'Remote profiles are cleaned');
assert.equal(revEscape('<img onerror=x>'), '&lt;img onerror=x&gt;');
assert(!revAvatarHTML({ avatar: 'data:image/png;base64,AA" onerror="x' }).includes('onerror'), 'No injected attributes');
assert.equal(revCleanText('a\u0000b', 5), 'ab');

// ---------- Codes and links ----------
const code = revNewCode();
assert.match(code, /^\d{6}$/);
assert.equal(revCodeGroup('123 456'), 1000 + 123456); assert.notEqual(revCodeGroup('123456'), 1, 'Friend codes never use the online group');
assert(revInviteText('123456').includes('123456') && revInviteUrl('123456') === 'revline://join/123456');

// ---------- Lobby over an in-memory match ----------
function makeBus() {
    const peers = new Map(); const sent = [];
    const bus = {
        sent,
        join(id) {
            const listeners = {};
            const net = {
                me: { id, name: id }, players: [], locked: 0,
                on: (event, fn) => { (listeners[event] ||= []).push(fn); },
                emit: (event, data) => (listeners[event] || []).forEach(fn => fn(data)),
                send: data => { sent.push({ from: id, data }); for (const [other, peer] of peers) if (other !== id) peer.emit('message', { from: id, data: JSON.parse(JSON.stringify(data)) }); },
                lock: () => { net.locked += 1; }
            };
            peers.set(id, net);
            return net;
        },
        // Everyone sees the current member list (like GKMatch players, without themselves).
        sync() { for (const [id, net] of peers) net.emit('players', [...peers.keys()].filter(o => o !== id).map(o => ({ id: o, name: o }))); },
        drop(id) { peers.delete(id); bus.sync(); }
    };
    return bus;
}
const maps = Object.values(vm.runInContext('REV_MAPS', (() => { const c = vm.createContext({ console }); vm.runInContext(fs.readFileSync(path.join(root, 'frontend/career/career-data.js'), 'utf8'), c); return c; })()));
const bus = makeBus();
const nets = { A: bus.join('A'), B: bus.join('B'), C: bus.join('C') };
const lobbies = Object.fromEntries(Object.entries(nets).map(([id, net]) => [id, new RevLobby(net, () => ({ name: `Player ${id}`, country: 'LK' }), storage())]));
lobbies.B.open({ mode: 'code', code, host: true });      // B created the lobby
lobbies.A.open({ mode: 'code', code, host: false });
lobbies.C.open({ mode: 'code', code, host: false });
bus.sync();
for (const lobby of Object.values(lobbies)) {
    assert.equal(lobby.state.hostId, 'B', 'The creator hosts, even though A has the lowest id');
    assert.equal(lobby.members.length, 3);
    assert.equal(lobby.members[0].id, 'B', 'Host listed first');
    assert.equal(lobby.state.members.A.profile.name, 'Player A', 'Profiles reach everyone');
}
assert(!lobbies.A.isHost && lobbies.B.isHost);

// Only the host changes settings; values are validated.
lobbies.A.setSettings({ distance: 5000 });
assert.equal(lobbies.B.state.settings.distance, 1000, 'Guests cannot change the race');
lobbies.B.setSettings({ source: 'career', map: 'r3m7', distance: 3000, curves: 9, surface: 'lava', difficulty: 'hard' });
for (const lobby of Object.values(lobbies)) assert.deepEqual({ ...lobby.state.settings }, { ...revCleanSettings({ source: 'career', map: 'r3m7', distance: 3000, curves: 1.25, surface: 'tarmac', difficulty: 'hard' }) });

// Ready, start: everyone gets the same round, settings and grid order; the match locks.
assert.equal(lobbies.B.everyoneReady, false);
lobbies.A.setReady(true); lobbies.C.setReady(true);
assert.equal(lobbies.B.everyoneReady, true);
assert.equal(lobbies.A.start(maps), false, 'Only the host starts');
assert.equal(lobbies.B.start(maps), true);
for (const [id, lobby] of Object.entries(lobbies)) {
    assert.deepEqual([lobby.state.phase, lobby.state.round, lobby.state.settings.map], ['race', 1, 'r3m7'], id);
    assert.deepEqual([...lobby.state.order], ['B', 'A', 'C']);
    assert.equal(nets[id].locked, 1, 'No new players during a round');
}

// GO only when every phone has loaded the race.
const goes = { A: 0, B: 0, C: 0 };
for (const [id, lobby] of Object.entries(lobbies)) lobby.onRace(kind => { if (kind === 'go') goes[id] += 1; });
lobbies.B.loaded(); lobbies.A.loaded();
assert.deepEqual(goes, { A: 0, B: 0, C: 0 }, 'Waiting for C');
lobbies.C.loaded();
assert.deepEqual(goes, { A: 1, B: 1, C: 1 }, 'Everyone counts down together');
lobbies.C.loaded(); assert.deepEqual(goes, { A: 1, B: 1, C: 1 }, 'GO once per round');

// Live positions reach the others.
let seen = null;
lobbies.A.onRace((kind, data) => { if (kind === 'state') seen = data; });
lobbies.C.sendState({ d: 412.5, v: 155, x: 300, g: 4 });
assert.deepEqual([seen.id, seen.state.d, seen.state.v], ['C', 412.5, 155]);

// Results: finishers by time, then distance; out last. Every phone gets the host's order.
lobbies.A.finish({ time: 61.2, out: false, distance: 3000 });
assert.equal(lobbies.B.state.results, null, 'Host waits for everyone');
lobbies.C.finish({ time: 0, out: true, distance: 1800 });
lobbies.B.finish({ time: 59.9, out: false, distance: 3000 });
for (const lobby of Object.values(lobbies)) {
    assert.equal(lobby.state.phase, 'results');
    assert.deepEqual(lobby.state.results.order.map(r => `${r.place}:${r.id}`), ['1:B', '2:A', '3:C']);
}
// Next round keeps the host's settings.
lobbies.B.start(maps);
for (const lobby of Object.values(lobbies)) assert.deepEqual([lobby.state.round, lobby.state.settings.map, lobby.state.phase], [2, 'r3m7', 'race']);

// The host leaves: the lowest remaining id takes over.
bus.drop('B');
assert.equal(lobbies.A.state.hostId, 'A'); assert.equal(lobbies.C.state.hostId, 'A');
assert.equal(lobbies.A.members.length, 2);

// Messages from non-hosts cannot start rounds or set results.
const before = lobbies.C.state.round;
nets.C.emit('message', { from: 'C', data: { type: 'start', round: 99, settings: {}, order: [] } });
assert.equal(lobbies.C.state.round, before);

// A hello sent before the other phone knew the match is answered, so both sides learn profiles.
const late = makeBus(); const n1 = late.join('X'), n2 = late.join('Y');
const l1 = new RevLobby(n1, () => ({ name: 'Ex' }), storage()), l2 = new RevLobby(n2, () => ({ name: 'Why' }), storage());
l1.open({ mode: 'code', code: '111111', host: true });
n1.emit('players', [{ id: 'Y', name: 'Y' }]);          // X sees Y and says hello; Y is not in a lobby yet
l2.open({ mode: 'code', code: '111111', host: false });
n2.emit('players', [{ id: 'X', name: 'X' }]);          // Y joins, says hello; X answers
assert.equal(l2.state.hostId, 'X'); assert.equal(l2.state.members.X.profile.name, 'Ex'); assert.equal(l1.state.members.Y.profile.name, 'Why');

// Online: lowest id hosts; the track is picked automatically, the same on every phone.
const onlineBus = makeBus(); const o1 = onlineBus.join('m2'), o2 = onlineBus.join('m1');
const ol1 = new RevLobby(o1, () => ({ name: 'One' }), storage()), ol2 = new RevLobby(o2, () => ({ name: 'Two' }), storage());
ol1.open({ mode: 'online' }); ol2.open({ mode: 'online' }); onlineBus.sync();
assert.equal(ol1.state.hostId, 'm1'); assert.equal(ol2.isHost, true);
ol2.start(maps);
assert.equal(ol1.state.settings.source, 'career'); assert.equal(ol1.state.settings.map, ol2.state.settings.map);
assert.equal(REV_MAPS_TYPE(ol1.state.settings.map), 'race', 'Online races never pick a drift round');
function REV_MAPS_TYPE(id) { return maps.find(m => m.id === id).type; }
assert.deepEqual(revAutoSettings(maps, 'seed'), revAutoSettings(maps, 'seed'));

// Ranking helper.
assert.deepEqual(revRankResults([{ id: 'a', time: 0, out: false, distance: 500 }, { id: 'b', time: 70, out: false }, { id: 'c', time: 0, out: true, distance: 900 }, { id: 'd', time: 65, out: false }]).map(r => r.id), ['d', 'b', 'a', 'c']);

// Persistence across page changes (lobby page → race page).
const shared = storage();
const p1 = new RevLobby(bus.join('P'), () => ({ name: 'P' }), shared);
p1.open({ mode: 'code', code: '222222', host: true });
const p2 = new RevLobby(bus.join('P'), () => ({ name: 'P' }), shared);
assert.deepEqual([p2.state.mode, p2.state.code, p2.state.hostId], ['code', '222222', 'P']);

// ---------- Race engine: other players' cars are moved by the network ----------
const race = new RevRace(); race.reset(true, 1000);
race.rivals[0].remote = true; race.rivals[0].distance = 123; race.rivals[0].speedKmh = 0;
race.started = true;
for (let i = 0; i < 60; i++) race.update(1 / 60, 100, true, 0);
assert.equal(race.rivals[0].distance, 123, 'Remote rivals ignore the AI');
assert(race.rivals[1].distance > 16, 'AI rivals still drive');
race.rivals[0].finishTime = 10; race.rivals[0].distance = 1000;
assert.equal(race.standings()[0].name, race.rivals[0].name, 'A finished player ranks by their time');

const game = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
assert(/race\.rivals\.filter\(r => !r\.remote\)/.test(game), 'No collisions with other players\' cars (network delay)');
console.log('Multiplayer passed: profiles, codes/links, host and settings, ready/start/lock, shared GO, live positions, results, next round, host hand-over, late hello, online auto track, page persistence and remote rivals.');
