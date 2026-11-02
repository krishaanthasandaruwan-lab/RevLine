const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { REV_CARS, REV_SHOP, RevGarage } = require('../garage.js');
const { revSaveRace, revReadLeaderboard } = require('../driving-scene.js');
const assetsRoot = path.join(__dirname, '..');
const storage = () => ({ data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } });
const memory = storage(), garage = new RevGarage(memory);
assert.equal(REV_CARS.length, 42, 'Original eight cars plus 34 from the reviewed archive'); assert(Object.values(REV_SHOP).flat().every(item => item.price === 0));
assert.equal(garage.power, 1); assert.equal(garage.state.credits, 500);
assert(garage.equip('car', 'rx7'), 'A car must first be claimed from the Store');
assert.equal(garage.claim('rx7'), ''); assert.equal(garage.claim('rx7'), '');
assert.equal(garage.state.owned.filter(id => id === 'car:rx7').length, 1);
assert.equal(garage.state.credits, 500); assert.equal(garage.equip('car', 'rx7'), '');
assert.equal(garage.engine.id, 'rotary'); assert.equal(garage.power, 1);
assert.equal(garage.equip('engine', 'twojz'), ''); assert.equal(garage.equip('turbo', 'street'), '');
assert.equal(garage.state.credits, 500); assert.equal(garage.reward(1, 10000), 0);
assert.equal(new RevGarage(memory).key, 'rx7:twojz:street');
assert(garage.equip('__proto__', 'invalid')); assert(garage.equip('turbo', 'made-up')); assert(garage.claim('unknown'));
const emptyWallet = storage(); emptyWallet.setItem('revline-garage-v1', JSON.stringify({credits:0,owned:[],equipped:{}}));
const free = new RevGarage(emptyWallet); assert.equal(free.claim('lfa'), ''); assert.equal(free.equip('car', 'lfa'), ''); assert.equal(free.state.credits, 0);
const legacyStore = storage(); legacyStore.setItem('revline-garage-v1', JSON.stringify({credits:200,owned:['car:coupe','engine:sport'],equipped:{car:'coupe',engine:'sport',turbo:'off'}}));
const legacy = new RevGarage(legacyStore); assert.equal(legacy.key, 'coupe:sport:off'); assert.equal(legacy.state.credits, 200);
const broken = new RevGarage({ getItem: () => '{', setItem() { throw Error('Full'); } });
assert(broken.claim('supra')); assert.equal(broken.key, 'gt:stock:off'); assert.equal(broken.state.credits, 500);
assert(broken.equip('engine','v8')); assert.equal(broken.engine.id, 'stock');
revSaveRace(memory, { course: '1:1:1000', time: 30, score: 100, place: 1 });
revSaveRace(memory, { course: '1:1:1000|normal|0|rx7:twojz:street', time: 37, score: 220, place: 2 });
revSaveRace(memory, { course: '1:1:1000|hard|1|coupe:sport:street', time: 35, score: 200, place: 2 });
assert.equal(revReadLeaderboard(memory).length, 3, 'Existing saved results remain readable');
const previewSources = JSON.parse(fs.readFileSync(path.join(assetsRoot, 'assets/engines/sources.json')));
assert.equal(previewSources.length, 42);
const recordings = new Set();
for (const source of previewSources) {
    const bytes = fs.readFileSync(path.join(assetsRoot, source.file));
    assert(bytes.length > 5000); recordings.add(crypto.createHash('sha256').update(bytes).digest('hex'));
    assert.equal(source.duration_seconds, 3);
}
assert.equal(recordings.size, 42, 'Every car has its own engine excerpt');
for (const car of REV_CARS) {
    assert(fs.statSync(path.join(assetsRoot, car.photo)).size > 5000, car.id + ' has a store photo');
    assert(REV_SHOP.engine.some(engine => engine.id === car.engine), car.id + ' has its engine');
}
assert.equal(new Set(REV_CARS.map(c => c.id)).size, REV_CARS.length, 'Car ids are unique');
revSaveRace(memory, { course: '1:1:1000|easy|0|huracan:huracan:street', time: 41, score: 300, place: 1 });
assert.equal(revReadLeaderboard(memory).length, 4, 'Results for archive cars are kept');
for (const engine of REV_SHOP.engine) assert(previewSources.some(s => s.id === engine.sound));

// Neutral selection remains unchanged. Shift grading and engine consequences are
// exercised against the actual game routines in shift-window.test.cjs.
const core = fs.readFileSync(path.join(assetsRoot, 'game.js'), 'utf8');
const expected = {
    "toggleNeutral": "7c64fcab4a500206e4ce6d79ed02acb17d07aae7888bcc9d8511363d8e2b7d4f",
    "setAutomaticGear": "8d8723f655fe267fa9dc2550481d95bfa0496d2ec2dc0873b415220be6510c12"
};
for (const [name, hash] of Object.entries(expected)) {
    const start = core.indexOf('function ' + name + '('), end = core.indexOf('\n}', start) + 2;
    assert(start >= 0 && end > start, name);
    assert.equal(crypto.createHash('sha256').update(core.slice(start, end)).digest('hex'), hash, name + ' changed');
}
for (const file of ['fpv-renderer.js', 'car-sprites.js', 'driving-options.js', 'assets/sprites/cars-atlas.png']) assert(!fs.existsSync(path.join(assetsRoot, file)), file + ' should be removed');
const page = fs.readFileSync(path.join(assetsRoot, 'index.html'), 'utf8');
assert(!page.includes('<style>') && !page.includes('<script>'), 'Markup, styles and runtime have separate owners');
assert(!/fpv-enabled|events-enabled|hazard-cue|virtual-accel-btn/.test(page));
console.log('Garage/cleanup passed: free claims, migration, storage rollback, 42 cars with photos and previews, removed feature files and preserved neutral routines.');
