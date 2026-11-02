// Career rules: regions, map order, stars, coins, gems, points and the coin store.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = vm.createContext({ console });
// Classic browser scripts share one global scope, so they are loaded together like the pages do.
for (const file of ['garage.js', 'frontend/garage/parts-catalog.js', 'frontend/shared/tuning-store.js', 'frontend/shared/economy.js', 'frontend/career/career-data.js', 'frontend/shared/career-store.js'])
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const run = code => vm.runInContext(code, context);
const { RevGarage, RevTuningStore, RevCareerStore, REV_REGIONS, REV_REGION1_MAPS, REV_MAPS, REV_CARS, REV_SHOP, REV_PARTS, revRegionMaps } = run('({ RevGarage, RevTuningStore, RevCareerStore, REV_REGIONS, REV_REGION1_MAPS, REV_MAPS, REV_CARS, REV_SHOP, REV_PARTS, revRegionMaps })');
const { REV_CAR_PRICES, REV_SOUND_TIERS, REV_CAR_CLASSES, REV_PART_PRICES, REV_METER_SKINS, revCarPrice, revEnginePrice, revRaceCoins } = run('({ REV_CAR_PRICES, REV_SOUND_TIERS, REV_CAR_CLASSES, REV_PART_PRICES, REV_METER_SKINS, revCarPrice, revEnginePrice, revRaceCoins })');
// Locking rules are checked with creator mode off; creator mode has its own checks below.
RevCareerStore.creatorDefault = false;
const storage = () => ({ data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = String(v); } });

// ---------- Data ----------
assert.equal(new Set(REV_REGIONS.map(r => r.id)).size, REV_REGIONS.length);
const developed = REV_REGIONS.filter(r => r.developed);
assert.equal(developed.length, 20, 'Twenty playable regions');
assert(REV_REGIONS.slice(0, 20).every(r => r.developed), 'Regions 1–20 are playable');
assert(REV_REGIONS.length > 20 && REV_REGIONS.slice(20).every(r => !r.developed), 'Regions after 20 are coming soon');
assert(REV_REGIONS.slice(1).every(r => r.starsToUnlock > 0 && r.starsToUnlock <= 60));
assert.equal(Object.keys(REV_MAPS).length, 400, '20 regions × 20 rounds');
for (const region of developed) {
    const maps = revRegionMaps(region.id);
    assert.equal(maps.length, 20, `${region.id} has 20 rounds`);
    maps.forEach((map, i) => { assert.equal(map.index, i); assert.equal(map.region, region.id); assert.equal(map.id, `${region.id}m${i + 1}`); });
    assert.equal(new Set(maps.map(m => m.name)).size, 20, `${region.id} round names are unique`);
    for (const map of maps) {
        assert([1000, 3000, 5000].includes(map.distance) && map.curves >= 0 && map.curves <= 1.25 && map.pace > 0.8 && map.pace <= 1.25, map.id);
        assert(['tarmac', 'gravel', 'dirt', 'sand', 'snow'].includes(map.surface), map.id);
        if (map.type === 'drift') assert(map.driftTarget > 0 && !map.obstacles.length, map.id);
        for (const hill of map.hills) assert(hill.from < hill.to && hill.to <= map.distance && hill.maxGear >= 1, map.id);
        for (const o of map.obstacles) assert(o.at > 0 && o.at < map.distance && ['cone', 'barrel', 'rock', 'mud'].includes(o.kind), map.id);
    }
    const finale = maps.at(-1);
    if (region.drift) assert(finale.type === 'drift' && /Final/.test(finale.name), `${region.id} ends with a drift final`);
    else assert(finale.surface !== 'tarmac' && finale.obstacles.length > 0, `${region.id} ends with a rough race with obstacles`);
    if (region.monster) assert(maps.every(m => m.type === 'race' && m.hills.length && m.hills.every(h => h.maxGear <= 2) && m.recommended === 'truck'), `${region.id} monster hills`);
    else assert(maps.some(m => m.type === 'drift'), `${region.id} has drift rounds`);
    const early = maps.slice(0, 5).reduce((a, m) => a + m.curves, 0), late = maps.slice(15).reduce((a, m) => a + m.curves, 0);
    assert(late > early, `${region.id}: later rounds have more bends`);
}
const regionPace = id => revRegionMaps(id).reduce((a, m) => a + m.pace, 0) / 20;
assert(regionPace('r20') > regionPace('r2') && regionPace('r2') > regionPace('r1') - 0.05, 'Later regions are harder');
assert(REV_REGIONS.some(r => r.monster) && REV_REGIONS.some(r => r.drift), 'Monster-truck and drift regions');
assert.equal(REV_REGION1_MAPS.length, 20, 'Twenty rounds per region');
REV_REGION1_MAPS.forEach((map, i) => { assert.equal(map.index, i); assert.equal(map.region, 'r1'); });
assert(REV_REGION1_MAPS.some(m => m.type === 'drift'), 'Region has a drift track');
assert.equal(REV_REGION1_MAPS.at(-1).surface, 'dirt', 'Region finale is a dirt race');
assert(REV_REGION1_MAPS.at(-1).obstacles.length > 0, 'Dirt finale has obstacles');
assert(REV_REGION1_MAPS.filter(m => m.type === 'drift').every(m => m.driftTarget > 0));
const curves = REV_REGION1_MAPS.map(m => m.curves);
assert(curves.at(-1) >= curves[0] && Math.max(...curves.slice(10)) > Math.max(...curves.slice(0, 5)), 'Later maps have more curves');
assert(REV_REGION1_MAPS.slice(-3).every(m => m.pace >= REV_REGION1_MAPS[0].pace), 'Later rivals are at least as fast');

// Every car has a price, sound tier and class; legend sounds cost more than utility ones.
for (const car of REV_CARS) {
    const entry = REV_CAR_PRICES[car.id];
    assert(entry, `${car.id} has a price`);
    assert(REV_SOUND_TIERS[entry[1]] && REV_CAR_CLASSES[entry[2]], `${car.id} tier/class`);
}
assert.equal(revCarPrice('gt'), 0, 'Starter car is free');
assert(revCarPrice('lfa') > revCarPrice('supra') && revCarPrice('supra') > revCarPrice('civic') && revCarPrice('civic') > revCarPrice('hilux'));
assert.equal(revEnginePrice(REV_SHOP.engine.find(e => e.id === 'v10')), Math.round(revCarPrice('lfa') * 0.4 / 100) * 100);
for (const [category, parts] of Object.entries(REV_PARTS)) for (const part of parts) assert(`${category}:${part.id}` in REV_PART_PRICES, `${category}:${part.id} priced`);
assert(REV_METER_SKINS.classic && REV_METER_SKINS.gold.gems > 0);

// ---------- Coins per race ----------
assert.equal(revRaceCoins({ place: 1, finished: false }), 0, 'Crashed or blown: no coins');
assert(revRaceCoins({ place: 1, finished: true, difficulty: 'hard', career: true }) > revRaceCoins({ place: 1, finished: true, difficulty: 'easy', career: true }));
assert(revRaceCoins({ place: 1, finished: true, career: true }) > revRaceCoins({ place: 2, finished: true, career: true }));
assert(revRaceCoins({ place: 1, finished: true, mapIndex: 19, career: true }) > revRaceCoins({ place: 1, finished: true, mapIndex: 0, career: true }));
assert(revRaceCoins({ place: 1, finished: true }) > 0, 'Quick races also pay, at half rate');

// ---------- Stars ----------
const race = REV_REGION1_MAPS.find(m => m.type === 'race'), drift = REV_REGION1_MAPS.find(m => m.type === 'drift');
const stars = (o) => RevCareerStore.starsEarned({ map: race, finished: true, ...o });
assert.equal(stars({ difficulty: 'hard', place: 1 }), 3);
assert.equal(stars({ difficulty: 'normal', place: 1 }), 2);
assert.equal(stars({ difficulty: 'easy', place: 1 }), 1);
assert.equal(stars({ difficulty: 'hard', place: 2 }), 2);
assert.equal(stars({ difficulty: 'easy', place: 2 }), 0);
assert.equal(stars({ difficulty: 'hard', place: 3 }), 0);
assert.equal(RevCareerStore.starsEarned({ map: race, difficulty: 'hard', place: 1, finished: false }), 0);
const driftStars = points => RevCareerStore.starsEarned({ map: drift, difficulty: 'hard', finished: true, driftPoints: points });
assert.equal(driftStars(drift.driftTarget - 1), 0);
assert.equal(driftStars(drift.driftTarget * 2), 2);
assert.equal(driftStars(drift.driftTarget * 10), 3);
assert.equal(RevCareerStore.starsEarned({ map: drift, difficulty: 'easy', finished: true, driftPoints: drift.driftTarget * 3 }), 1);

// ---------- Progress, unlocks and rewards ----------
const memory = storage(), garage = new RevGarage(memory), tuning = new RevTuningStore(memory);
const career = new RevCareerStore(memory, tuning);
const startCoins = garage.state.credits;
assert.equal(career.grantStarter(garage), 2000);
assert.equal(career.grantStarter(garage), 0, 'Starter coins only once');
assert.equal(garage.state.credits, startCoins + 2000);
const [first, second] = REV_REGION1_MAPS;
assert(career.isMapOpen(first) && !career.isMapOpen(second), 'Maps open in order');
assert.equal(career.currentMap('r1'), first);
assert(!career.regionStatus(REV_REGIONS[1]).open, 'Next region is locked');
const lost = career.record({ map: first, difficulty: 'hard', place: 3, finished: true, score: 500 }, garage);
assert.equal(lost.stars, 0); assert(!career.isMapOpen(second), '3rd place does not open the next round');
const coinsBefore = garage.state.credits;
const won = career.record({ map: first, difficulty: 'hard', place: 1, finished: true, score: 500, clean: true }, garage);
assert.deepEqual([won.stars, won.newStars, won.gems], [3, 3, 3], 'Hard win: three stars and first-3★ gems');
assert.equal(garage.state.credits, coinsBefore + won.coins);
assert(won.points > 500 && career.state.points >= won.points);
assert(career.isMapOpen(second) && career.currentMap('r1') === second);
const again = career.record({ map: first, difficulty: 'easy', place: 1, finished: true }, garage);
assert.deepEqual([again.newStars, again.gems], [0, 0], 'Replays never lower stars or repeat gems');
assert.equal(career.starsFor(first.id), 3);
const persisted = new RevCareerStore(memory, tuning);
assert.equal(persisted.starsFor(first.id), 3); assert.equal(persisted.state.gems, 3);

// Finishing every round pays the region bonus once.
let bonus = 0;
for (const map of REV_REGION1_MAPS.slice(1)) {
    const result = career.record(map.type === 'drift'
        ? { map, difficulty: 'normal', finished: true, driftPoints: map.driftTarget * 2 }
        : { map, difficulty: 'normal', place: 1, finished: true }, garage);
    bonus += result.gems;
}
assert.equal(bonus, 20, 'Region complete: 20 gems');
assert.equal(career.regionStars('r1'), 3 + 19 * 2);
assert.equal(career.totalStars(), career.regionStars('r1'));
// Region 2 opens on stars from Region 1; Region 3 still needs Region 2's stars.
assert(career.regionStars('r1') >= REV_REGIONS[1].starsToUnlock);
assert.equal(career.regionStatus(REV_REGIONS[1]).open, true, 'Enough Region 1 stars open Region 2');
assert(career.isMapOpen(revRegionMaps('r2')[0]) && !career.isMapOpen(revRegionMaps('r2')[1]));
assert.deepEqual({ ...career.regionStatus(REV_REGIONS[2]) }, { open: false, reason: 'stars', need: REV_REGIONS[2].starsToUnlock, have: 0, from: REV_REGIONS[1].name });
const poor = new RevCareerStore(storage(), null);
assert.deepEqual({ ...poor.regionStatus(REV_REGIONS[1]) }, { open: false, reason: 'stars', need: REV_REGIONS[1].starsToUnlock, have: 0, from: REV_REGIONS[0].name });
assert.equal(career.regionStatus(REV_REGIONS[20]).reason, 'coming', 'Region 21 says coming soon');
assert.equal(career.currentMap('r21'), null);

// ---------- Creator mode: every round of the playable regions open ----------
const makerStorage = storage(), maker = new RevCareerStore(makerStorage, null);
assert.equal(maker.creator, false);
maker.setCreator(true);
assert.equal(new RevCareerStore(makerStorage, null).creator, true, 'Creator choice is saved');
assert(REV_REGIONS.filter(r => r.developed).every(r => maker.regionStatus(r).open), 'All 20 regions open');
assert(Object.values(REV_MAPS).every(map => maker.isMapOpen(map)), 'All 400 rounds open');
assert.equal(maker.regionStatus(REV_REGIONS[20]).reason, 'coming', 'Future regions stay coming soon');
const late = revRegionMaps('r20')[19];
const result = maker.record({ map: late, difficulty: 'hard', place: 1, finished: true }, new RevGarage(makerStorage));
assert.equal(result.stars, 3, 'Results still count in creator mode');
maker.setCreator(false);
assert(!maker.isMapOpen(revRegionMaps('r2')[0]) && maker.isMapOpen(REV_REGION1_MAPS[0]), 'Off again: normal locking');
RevCareerStore.creatorDefault = true;
assert.equal(new RevCareerStore(storage(), null).creator, true, 'On by default while maps are being built');
RevCareerStore.creatorDefault = false;

// ---------- Store ----------
const shop = storage(), wallet = new RevGarage(shop), shopTuning = new RevTuningStore(shop), store = new RevCareerStore(shop, shopTuning);
store.grantStarter(wallet);
assert(store.ownsPart('exhaust:stock'), 'Stock parts are free');
assert(!store.ownsPart('exhaust:titanium'));
assert.equal(store.buyPart('exhaust:titanium', wallet), 'Not enough coins.');
assert.equal(store.buyPart('exhaust:sport', wallet), '');
assert(store.ownsPart('exhaust:sport'));
assert.equal(wallet.state.credits, 2500 - REV_PART_PRICES['exhaust:sport']);
assert.equal(store.buyPart('exhaust:sport', wallet), '', 'Buying twice is a no-op');
assert.equal(wallet.state.credits, 2500 - REV_PART_PRICES['exhaust:sport']);
assert.equal(store.buySkin('gold', wallet), 'Not enough gems.');
store.state.gems = 30;
assert.equal(store.buySkin('gold', wallet), ''); assert.equal(store.state.gems, 5);
store.setSkin('gold'); assert.equal(store.state.skin, 'gold');
store.setSkin('neon'); assert.equal(store.state.skin, 'gold', 'Unowned skins cannot be used');
assert.equal(wallet.spend(999999), 'Not enough coins.');

// Parts fitted before the store existed stay owned.
const legacy = storage();
legacy.setItem('revline-tuning-v1', JSON.stringify({ version: 1, cars: { gt: { exhaust: 'titanium', turbo: 'twin' } } }));
const legacyTuning = new RevTuningStore(legacy);
const kept = new RevCareerStore(legacy, legacyTuning);
assert(kept.ownsPart('exhaust:titanium') && kept.ownsPart('turbo:twin'));
console.log('Career passed: 20 regions × 20 rounds, coming-soon regions, drift and monster rules, creator mode, order, stars, coins, gems and store.');
