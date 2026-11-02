// Engine sound and effect variations: every car has a real layout, its own voice, and a bank
// of 100+ distinct effect variants that stays the same for that car.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = vm.createContext({ console });
for (const file of ['garage.js', 'frontend/garage/parts-catalog.js', 'frontend/race/engine-sound.js'])
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const { REV_CARS, REV_SHOP, REV_PARTS, REV_ENGINE_LAYOUTS, REV_ENGINE_FOR, revEngineVoice, revBuildSfxBank, revComposeSound } =
    vm.runInContext('({ REV_CARS, REV_SHOP, REV_PARTS, REV_ENGINE_LAYOUTS, REV_ENGINE_FOR, revEngineVoice, revBuildSfxBank, revComposeSound })', context);

const stock = revComposeSound({ exhaust: 'stock', turbo: 'none', bov: 'none', intake: 'airbox' });
const loud = revComposeSound({ exhaust: 'straight', turbo: 'twin', bov: 'flutter', intake: 'itb' });

// Every engine in the store maps to a real layout.
for (const engine of REV_SHOP.engine) assert(REV_ENGINE_LAYOUTS[REV_ENGINE_FOR[engine.id]], `${engine.id} has a layout`);
const layoutOf = id => REV_ENGINE_FOR[id];
assert.equal(layoutOf('rotary'), 'rotary2'); assert.equal(layoutOf('mazda787b'), 'rotary4'); assert.equal(layoutOf('twojz'), 'inline6');
assert.equal(layoutOf('v8'), 'v8cross'); assert.equal(layoutOf('v10'), 'v10'); assert.equal(layoutOf('r34v12'), 'v12'); assert.equal(layoutOf('hilux'), 'diesel4');
assert(new Set(Object.values(REV_ENGINE_FOR)).size >= 14, 'Many distinct engine layouts');

// Voices: deterministic per car, different between cars and between part builds.
for (const car of REV_CARS) {
    const voice = revEngineVoice(car.id, car.engine, stock);
    assert.deepEqual({ ...voice }, { ...revEngineVoice(car.id, car.engine, stock) }, `${car.id} sounds the same every time`);
    for (const key of ['lope', 'half', 'scream', 'rasp', 'body', 'drive', 'fires']) assert(Number.isFinite(voice[key]) && voice[key] >= 0, `${car.id}.${key}`);
    assert(voice.fires >= 2 && voice.fires <= 6);
}
const signature = v => [v.layoutId, v.lope, v.scream, v.rasp, v.body, v.detune].map(x => typeof x === 'number' ? x.toFixed(4) : x).join('|');
assert.equal(new Set(REV_CARS.map(car => signature(revEngineVoice(car.id, car.engine, stock)))).size, REV_CARS.length, 'Each of the 42 cars has its own voice');
const supraStock = revEngineVoice('supra', 'twojz', stock), supraLoud = revEngineVoice('supra', 'twojz', loud);
assert(supraLoud.rasp > supraStock.rasp && supraLoud.drive > supraStock.drive && supraLoud.gain > supraStock.gain, 'Straight pipe is louder and raspier');
assert(supraLoud.intakeGain > supraStock.intakeGain, 'Velocity stacks add intake roar');
let builds = 0;
for (const exhaust of REV_PARTS.exhaust) for (const turbo of REV_PARTS.turbo) for (const bov of REV_PARTS.bov) for (const intake of REV_PARTS.intake) builds++;
assert(builds >= 100, 'Part combinations give 100+ engine variations per car');
assert(builds * REV_CARS.length > 10000);

// Effect banks: 100+ variants per car, deterministic, distinct between cars.
const bank = revBuildSfxBank('supra', loud);
assert(bank.count >= 100, `bank has ${bank.count} variants`);
const lists = Object.entries(bank).filter(([, v]) => Array.isArray(v));
assert.equal(lists.reduce((sum, [, v]) => sum + v.length, 0), bank.count);
for (const [kind, list] of lists) assert.equal(new Set(list.map(v => JSON.stringify(v))).size, list.length, `${kind} variants are distinct`);
assert.equal(JSON.stringify(revBuildSfxBank('supra', loud)), JSON.stringify(bank), 'Same car, same bank');
assert.notEqual(JSON.stringify(revBuildSfxBank('rx7', loud)), JSON.stringify(bank), 'Another car, another bank');
assert(bank.pops.every(v => v.count >= 2 && v.gap > 0 && v.pitch > 0) && bank.blowOff.every(v => v.from > v.to));
assert.deepEqual([...new Set(bank.surface.map(v => v.kind))].sort(), ['dirt', 'gravel', 'sand', 'snow']);
console.log(`Engine sound passed: ${REV_CARS.length} cars on ${new Set(Object.values(REV_ENGINE_FOR)).size} layouts, ${builds} part builds each, ${bank.count} effect variants per car.`);
