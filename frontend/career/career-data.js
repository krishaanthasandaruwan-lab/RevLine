// Career: twenty regions of 20 maps each, easy to hard. Regions after the twentieth show on
// the map screen as locked "coming in a future update".
// Map fields:
//   type        race | drift   (drift: stars from drift points, not position)
//   distance    1000 | 3000 | 5000 metres
//   curves      0 (straight) or a curve strength (0.5 gentle … 1.25 sharp)
//   traffic     other cars on the road
//   pace        rival pace multiplier on top of the chosen difficulty
//   theme       renderer look: grass | gravel | dirt | snow | desert | city | autumn | coast | jungle | volcano | canyon | arena
//   surface     tarmac | gravel | dirt | sand | snow (grip and drag, driving-course.js)
//   hills       [{ from, to, maxGear }] metres: climbs that need a low gear
//   obstacles   [{ at, lane, kind }] metres: cone | barrel | rock | mud
//   recommended car class (economy.js REV_CAR_CLASSES); 'any' = no recommendation
//   driftTarget drift points for one star (drift maps)

// Evenly spread obstacles: n of a kind from `from` to `to` metres, alternating lanes.
function revObstacleRun(kind, n, from, to, lanes = [0, 1, 2, 3]) {
    return Array.from({ length: n }, (_, i) => ({ kind, at: Math.round(from + (to - from) * (i + 0.5) / n), lane: lanes[(i * 3 + 1) % lanes.length] }));
}

// Twenty playable regions, then more that are shown as "coming in a future update".
// Each region needs stars from the one before it. Profile fields drive the round generator
// below: main surface/theme, the rough surface of the closing rounds, recommended classes,
// and the region's special rules (drift-only, monster-truck hills, traffic-heavy, speed).
const REV_REGIONS = [
    { id: 'r1', name: 'Green Valley', theme: 'grass', blurb: 'Grass circuits, grandstands and your first rivals. Ends on muddy dirt.' },
    { id: 'r2', name: 'Coastal Sprint', theme: 'coast', blurb: 'Seaside highways with long, fast bends.',
      places: ['Harbour', 'Lighthouse', 'Palm', 'Surf', 'Cliff', 'Bay', 'Pier', 'Dune'], cls: 'track', traffic: 0.6 },
    { id: 'r3', name: 'Autumn Hills', theme: 'autumn', blurb: 'Twisting forest roads under orange leaves.',
      places: ['Maple', 'Acorn', 'Copper', 'Harvest', 'Oak', 'Ember', 'Pumpkin', 'Rustwood'], cls: 'any', curvy: true, hilly: true },
    { id: 'r4', name: 'Gravel Quarry', theme: 'gravel', surface: 'gravel', blurb: 'Loose stone, rally cars and rock gardens.',
      places: ['Quarry', 'Crusher', 'Slate', 'Flint', 'Boulder', 'Pit', 'Granite', 'Crane'], cls: 'rally', obstacles: 'rock' },
    { id: 'r5', name: 'Desert Dust', theme: 'desert', surface: 'sand', rough: 'sand', blurb: 'Sand drifts and dust storms between the dunes.',
      places: ['Dune', 'Mirage', 'Cactus', 'Oasis', 'Scorpion', 'Sahara', 'Mesa', 'Dust'], cls: 'rally' },
    { id: 'r6', name: 'Snow Peak Pass', theme: 'snow', surface: 'snow', rough: 'snow', blurb: 'Icy mountain passes with almost no grip.',
      places: ['Frost', 'Glacier', 'Avalanche', 'Igloo', 'Blizzard', 'Summit', 'Pine', 'Polar'], cls: 'rally', hilly: true },
    { id: 'r7', name: 'Neon City Nights', theme: 'city', blurb: 'Night streets, heavy traffic and neon.',
      places: ['Neon', 'Downtown', 'Subway', 'Skyline', 'Arcade', 'Tunnel', 'Avenue', 'Metro'], cls: 'track', traffic: 1, obstacles: 'barrel' },
    { id: 'r8', name: 'Jungle Mud Run', theme: 'jungle', surface: 'dirt', blurb: 'Deep mud, roots and river crossings.',
      places: ['Vine', 'Temple', 'River', 'Monkey', 'Canopy', 'Swamp', 'Fern', 'Tiger'], cls: 'rally', obstacles: 'mud' },
    { id: 'r9', name: 'Canyon Drift Kings', theme: 'canyon', blurb: 'Drift-only canyon roads with judged runs and a drift final.',
      places: ['Red Rock', 'Echo', 'Coyote', 'Arch', 'Sunset', 'Eagle', 'Cliffside', 'Sandstone'], cls: 'drift', drift: true },
    { id: 'r10', name: 'Volcano Ridge', theme: 'volcano', surface: 'gravel', blurb: 'Black rock, lava glow and steep climbs.',
      places: ['Lava', 'Ash', 'Magma', 'Crater', 'Obsidian', 'Ember', 'Basalt', 'Smoke'], cls: 'rally', hilly: true, obstacles: 'rock' },
    { id: 'r11', name: 'Monster Arena', theme: 'arena', surface: 'dirt', blurb: 'Truck arena: steep dirt hills that only a low gear can climb.',
      places: ['Crusher', 'Ramp', 'Stadium', 'Bigfoot', 'Mudpit', 'Thunder', 'Jump', 'Rumble'], cls: 'truck', monster: true },
    { id: 'r12', name: 'Alpine Rally', theme: 'snow', surface: 'gravel', rough: 'snow', blurb: 'Gravel stages that climb into the snow line.',
      places: ['Alpine', 'Chalet', 'Edelweiss', 'Ridge', 'Col', 'Gondola', 'Valley', 'Peak'], cls: 'rally', hilly: true },
    { id: 'r13', name: 'Harbour Docks', theme: 'coast', blurb: 'Container yards, cranes and barrel slaloms by the sea.',
      places: ['Dock', 'Container', 'Anchor', 'Crane', 'Cargo', 'Wharf', 'Tugboat', 'Quay'], cls: 'any', traffic: 0.7, obstacles: 'barrel' },
    { id: 'r14', name: 'Salt Flats', theme: 'desert', blurb: 'Endless white flats built for top speed.',
      places: ['Salt', 'Mirage', 'Bonneville', 'White', 'Horizon', 'Flat', 'Speed', 'Crystal'], cls: 'track', fast: true },
    { id: 'r15', name: 'Rainforest Rally', theme: 'jungle', surface: 'dirt', blurb: 'Rain-soaked jungle stages with mud everywhere.',
      places: ['Rain', 'Parrot', 'Waterfall', 'Jaguar', 'Orchid', 'Mangrove', 'Lagoon', 'Toucan'], cls: 'rally', obstacles: 'mud', curvy: true },
    { id: 'r16', name: 'Midnight Touge', theme: 'autumn', blurb: 'Mountain pass at night: hairpins, drifts and hill runs.',
      places: ['Touge', 'Hairpin', 'Shrine', 'Lantern', 'Moon', 'Akina', 'Cedar', 'Fog'], cls: 'drift', curvy: true, hilly: true, driftMix: true },
    { id: 'r17', name: 'Glacier Drift', theme: 'snow', surface: 'snow', rough: 'snow', blurb: 'Ice drifting on frozen lakes, with a drift final.',
      places: ['Ice', 'Aurora', 'Fjord', 'Crystal', 'Frozen', 'Husky', 'Tundra', 'Northern'], cls: 'drift', drift: true },
    { id: 'r18', name: 'Red Rock Rally', theme: 'canyon', surface: 'dirt', blurb: 'Dusty canyon rally with boulders and climbs.',
      places: ['Mesa', 'Butte', 'Rattler', 'Canyon', 'Dusty', 'Outlaw', 'Gulch', 'Badlands'], cls: 'rally', hilly: true, obstacles: 'rock' },
    { id: 'r19', name: 'Monster Mayhem', theme: 'arena', surface: 'dirt', blurb: 'The hardest truck hills: gear 2 or you stall on the slope.',
      places: ['Mayhem', 'Destroyer', 'Wrecker', 'Titan', 'Grave', 'Avalanche', 'Smash', 'Goliath'], cls: 'truck', monster: true, hilly: true },
    { id: 'r20', name: 'Legends Final', theme: 'grass', blurb: 'Every surface, the fastest rivals and a drift final for the title.',
      places: ['Legend', 'Champion', 'Grand Prix', 'Victory', 'Golden', 'Hall of Fame', 'Crown', 'Final'], cls: 'any', curvy: true, legends: true },
    // Shown blurred and locked until a future update.
    { id: 'r21', name: 'Sky Circuit', theme: 'coast', future: true, blurb: 'A circuit above the clouds.' },
    { id: 'r22', name: 'Island Rally', theme: 'jungle', future: true, blurb: 'Volcanic islands joined by bridges.' },
    { id: 'r23', name: 'Arctic Night', theme: 'snow', future: true, blurb: 'Polar night racing under the aurora.' },
    { id: 'r24', name: 'World Tour', theme: 'city', future: true, blurb: 'Every region, one championship.' }
].map((region, index) => ({ developed: !region.future, starsToUnlock: index ? Math.min(48, 28 + index) : 0, ...region, index }));

// Region 1: twenty maps from a gentle first race to a dirt championship with obstacles.
const REV_REGION1_MAPS = [
    { name: 'Starting Grid', type: 'race', distance: 1000, curves: 0, traffic: false, pace: 0.85, recommended: 'any' },
    { name: 'Valley Loop', type: 'race', distance: 1000, curves: 0.5, traffic: false, pace: 0.88, recommended: 'any' },
    { name: 'First Traffic', type: 'race', distance: 1000, curves: 0.5, traffic: true, pace: 0.9, recommended: 'any' },
    { name: 'Windmill Bends', type: 'race', distance: 1000, curves: 0.8, traffic: false, pace: 0.92, recommended: 'any' },
    { name: 'Drift School', type: 'drift', distance: 1000, curves: 0.9, traffic: false, pace: 0.85, recommended: 'drift', driftTarget: 120 },
    { name: 'Long Straight', type: 'race', distance: 3000, curves: 0, traffic: true, pace: 0.95, recommended: 'track' },
    { name: 'Hairpin Hill', type: 'race', distance: 1000, curves: 1.0, traffic: false, pace: 0.95, recommended: 'any',
      hills: [{ from: 450, to: 650, maxGear: 4 }] },
    { name: 'Rush Hour', type: 'race', distance: 1000, curves: 0.8, traffic: true, pace: 0.96, recommended: 'any' },
    { name: 'Gravel Detour', type: 'race', distance: 1000, curves: 0.7, traffic: false, pace: 0.96, recommended: 'rally', theme: 'gravel', surface: 'gravel' },
    { name: 'Midseason Cup', type: 'race', distance: 3000, curves: 0.9, traffic: true, pace: 1, recommended: 'track' },
    { name: 'Cone Slalom', type: 'race', distance: 1000, curves: 0.6, traffic: false, pace: 0.98, recommended: 'any',
      obstacles: revObstacleRun('cone', 14, 120, 900) },
    { name: 'Twisty Forest', type: 'race', distance: 1000, curves: 1.1, traffic: false, pace: 1, recommended: 'any' },
    { name: 'Drift Trophy', type: 'drift', distance: 3000, curves: 1.1, traffic: false, pace: 0.9, recommended: 'drift', driftTarget: 320 },
    { name: 'Barrel Run', type: 'race', distance: 1000, curves: 0.8, traffic: true, pace: 1.02, recommended: 'any',
      obstacles: revObstacleRun('barrel', 10, 150, 900) },
    { name: 'Hill Climb', type: 'race', distance: 1000, curves: 0.9, traffic: false, pace: 1.02, recommended: 'rally',
      hills: [{ from: 250, to: 420, maxGear: 3 }, { from: 620, to: 820, maxGear: 2 }] },
    { name: 'Endurance 5K', type: 'race', distance: 5000, curves: 0.9, traffic: true, pace: 1.03, recommended: 'track' },
    { name: 'Dirt Dash', type: 'race', distance: 1000, curves: 0.9, traffic: false, pace: 1.04, recommended: 'rally', theme: 'dirt', surface: 'dirt',
      obstacles: revObstacleRun('mud', 6, 150, 900) },
    { name: 'Rock Garden', type: 'race', distance: 1000, curves: 1.0, traffic: false, pace: 1.05, recommended: 'rally', theme: 'dirt', surface: 'dirt',
      obstacles: [...revObstacleRun('rock', 9, 120, 900), ...revObstacleRun('mud', 4, 200, 800, [1, 2])] },
    { name: 'Mountain Climb', type: 'race', distance: 1000, curves: 1.1, traffic: false, pace: 1.06, recommended: 'rally', theme: 'dirt', surface: 'dirt',
      hills: [{ from: 300, to: 520, maxGear: 2 }], obstacles: revObstacleRun('rock', 6, 560, 950) },
    { name: 'Valley Championship', type: 'race', distance: 3000, curves: 1.2, traffic: true, pace: 1.1, recommended: 'rally', theme: 'dirt', surface: 'dirt',
      hills: [{ from: 1200, to: 1450, maxGear: 3 }, { from: 2300, to: 2500, maxGear: 2 }],
      obstacles: [...revObstacleRun('barrel', 8, 200, 1100), ...revObstacleRun('rock', 10, 1500, 2250), ...revObstacleRun('mud', 6, 2550, 2950)] }
].map((map, i) => ({ id: `r1m${i + 1}`, index: i, region: 'r1', theme: 'grass', surface: 'tarmac', hills: [], obstacles: [], ...map,
}));

// Regions 2–20: the same twenty round slots as Region 1, shaped by the region profile and
// harder in later regions (faster rivals, sharper and more bends, longer runs). The last four
// rounds are rough-surface races with obstacles; drift regions end with a drift final.
const REV_ROUND_SLOTS = [
    ['Opening Sprint', 'race'], ['Sweepers', 'race'], ['Traffic Rush', 'race'], ['Hairpins', 'race'], ['Drift School', 'drift'],
    ['Long Haul', 'race'], ['Hill Run', 'race'], ['Rush Hour', 'race'], ['Detour', 'race'], ['Cup', 'race'],
    ['Slalom', 'race'], ['Twisties', 'race'], ['Drift Trophy', 'drift'], ['Barrel Run', 'race'], ['Hill Climb', 'race'],
    ['Endurance', 'race'], ['Mud Dash', 'race'], ['Rock Garden', 'race'], ['Summit Climb', 'race'], ['Championship', 'race']
];
// Drift-only regions use their own round names and end in a drift final.
const REV_DRIFT_SLOTS = ['Warm-up Slide', 'Smoke Show', 'Figure Eight', 'Hairpin Drift', 'Tandem Run', 'Long Slide', 'Hill Drift', 'Touge Run',
    'Dust Drift', 'Drift Cup', 'Cone Drift', 'Snake Drift', 'Drift Trophy', 'Clipping Points', 'Angle Attack', 'Endurance Drift',
    'Dirt Drift', 'Rock Drift', 'Summit Drift', 'Drift Final'];
const REV_ROUGH_THEME = { dirt: 'dirt', sand: 'desert', snow: 'snow', gravel: 'gravel' };

function revGenerateRegion(region) {
    const k = region.index, steps = (value, step = 0.05) => Math.round(Math.round(value / step) * step * 100) / 100;
    return REV_ROUND_SLOTS.map(([slot, slotType], i) => {
        const t = i / 19, distanceFor = n => n === 5 || n === 9 || n === 19 ? 3000 : n === 15 ? 5000 : 1000;
        const late = i >= 16, rough = region.rough || 'dirt';
        const drift = region.drift || (!region.monster && (region.driftMix ? slotType === 'drift' || i % 4 === 1 : slotType === 'drift'));
        let curves = steps(Math.min(1.25, 0.35 + 0.75 * t + 0.015 * k + (region.curvy ? 0.12 : 0)));
        if (region.fast && i % 3 !== 2) curves = steps(curves * 0.45);
        if (i === 0 && !region.curvy) curves = steps(curves * 0.6);
        const map = {
            name: `${region.places[i % region.places.length]} ${drift ? REV_DRIFT_SLOTS[i] : region.monster && slotType === 'drift' ? (i < 10 ? 'Hill Sprint' : 'Truck Trophy') : slot}`,
            type: drift ? 'drift' : 'race', distance: region.fast && i % 4 === 3 ? 5000 : distanceFor(i), curves,
            traffic: !drift && (i % 3 === 2 || (region.traffic || 0) > ((i * 37) % 10) / 10),
            pace: Math.round(Math.min(1.25, 0.86 + 0.22 * t + 0.009 * k + (region.legends ? 0.04 : 0)) * 100) / 100,
            recommended: region.cls === 'truck' ? 'truck' : drift ? 'drift' : late ? 'rally' : region.cls === 'drift' ? 'any' : region.cls,
            theme: region.theme, surface: region.surface || 'tarmac', hills: [], obstacles: []
        };
        if (i === 8 && !region.drift) Object.assign(map, { surface: rough === 'snow' ? 'snow' : 'gravel', theme: rough === 'snow' ? region.theme : 'gravel' });
        if (late) Object.assign(map, { surface: rough, theme: REV_ROUGH_THEME[rough] === 'snow' || region.theme === 'arena' ? region.theme : REV_ROUGH_THEME[rough] });
        if (drift) map.driftTarget = Math.round((map.distance / 1000) * (100 + k * 3 + i * 2) / 10) * 10;
        // Hills: slopes that need a low gear. Monster regions climb in gear 2 almost every round.
        const len = map.distance;
        if (region.monster) {
            const count = 1 + Math.min(3, Math.floor(i / 5));
            map.hills = Array.from({ length: count }, (_, h) => ({ from: Math.round(len * (0.18 + h * 0.2)), to: Math.round(len * (0.18 + h * 0.2) + len * 0.1), maxGear: i > 10 && h % 2 ? 1 : 2 }));
        } else if (!drift && (i === 6 || i === 14 || i === 18 || (region.hilly && i % 5 === 3))) {
            map.hills = [{ from: Math.round(len * 0.35), to: Math.round(len * 0.52), maxGear: i >= 14 || k > 10 ? 2 : 3 }];
            if (i === 14 || i === 18) map.hills.push({ from: Math.round(len * 0.7), to: Math.round(len * 0.82), maxGear: 2 });
        }
        // Obstacles: slalom and barrel rounds, the region's own hazard, and every closing round.
        const hazard = region.obstacles || (rough === 'snow' ? 'barrel' : 'rock');
        const run = (kind, n, a, b, lanes) => revObstacleRun(kind, n + Math.floor(k / 4), Math.round(len * a), Math.round(len * b), lanes);
        if (!drift) {
            if (i === 10) map.obstacles = run('cone', 12, 0.12, 0.9);
            if (i === 13) map.obstacles = run('barrel', 9, 0.15, 0.9);
            if (region.obstacles && (i === 7 || i === 11)) map.obstacles = run(hazard, 6, 0.2, 0.85);
            if (i === 16) map.obstacles = run('mud', 6, 0.15, 0.9);
            if (i === 17) map.obstacles = [...run(hazard === 'mud' ? 'rock' : hazard, 8, 0.12, 0.9), ...run('mud', 3, 0.2, 0.8, [1, 2])];
            if (i === 18) map.obstacles = run('rock', 6, 0.56, 0.95);
            if (i === 19) map.obstacles = [...run('barrel', 7, 0.07, 0.36), ...run(hazard, 9, 0.5, 0.75), ...run('mud', 5, 0.85, 0.98)];
        }
        if (map.surface === 'tarmac' && !late) map.theme = region.theme;
        return map;
    });
}

const REV_REGION_MAPS = Object.fromEntries(REV_REGIONS.filter(r => r.developed).map(region => {
    const maps = region.id === 'r1' ? REV_REGION1_MAPS : revGenerateRegion(region).map((map, i) => ({ id: `${region.id}m${i + 1}`, index: i, region: region.id, ...map }));
    return [region.id, maps];
}));
const REV_MAPS = Object.fromEntries(Object.values(REV_REGION_MAPS).flat().map(map => [map.id, map]));
const revRegionMaps = regionId => REV_REGION_MAPS[regionId] || [];

if (typeof module !== 'undefined') module.exports = { REV_REGIONS, REV_REGION1_MAPS, REV_REGION_MAPS, REV_MAPS, revRegionMaps, revObstacleRun, revGenerateRegion };
