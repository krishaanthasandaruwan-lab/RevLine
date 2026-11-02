// Store economy: prices follow how much players love a sound, not performance.
// Research summary (frontend/ART-REQUESTS/SOUND-RESEARCH.md): naturally aspirated V10/V12 and
// race-rotary screams top "best sounding" lists (LFA, 787B, F1 V10, Huracán); turbo whistle and
// blow-off flutter (Supra 2JZ, R34 RB26) and the rotary "brap" are the most shared tuner sounds;
// V8 burble is mass-appeal; VTEC four-cylinders are loved but cheaper; diesels sit at the bottom.
const REV_SOUND_TIERS = {
    legend: { label: 'Legend sound', note: 'High-revving V10/V12 and race rotary screams' },
    turbo: { label: 'Turbo icon', note: 'Whistle, flutter and turbo straight-six howl' },
    rotary: { label: 'Rotary', note: 'The rotary brap and crackle' },
    v8: { label: 'V8 / big engine', note: 'Burble, rumble and crackle' },
    vtec: { label: 'High-rev four', note: 'VTEC and twin-cam scream' },
    street: { label: 'Street', note: 'Everyday turbo and small engines' },
    utility: { label: 'Utility', note: 'Diesel and work trucks' }
};

// Car classes: a map recommends one; any car may race, but an unsuited one faces faster rivals.
const REV_CAR_CLASSES = {
    track: 'Track', drift: 'Drift', rally: 'Rally', muscle: 'Muscle', truck: 'Truck'
};
const REV_UNSUITED_PACE = 1.06;

// id: [coin price, sound tier, class]. The starter Carrera GT is owned by everyone.
const REV_CAR_PRICES = {
    gt: [0, 'legend', 'track'],
    mazda787b: [75000, 'legend', 'track'], apx: [70000, 'legend', 'track'], lfa: [60000, 'legend', 'track'],
    huracan: [55000, 'legend', 'track'], p1: [50000, 'rotary', 'track'],
    supra: [40000, 'turbo', 'drift'], r34: [38000, 'turbo', 'track'], suprav12: [36000, 'legend', 'drift'],
    r35: [34000, 'turbo', 'track'], r34v12: [34000, 'legend', 'track'], veilside: [34000, 'rotary', 'drift'],
    rx7: [32000, 'rotary', 'drift'], rx7gpu: [30000, 'rotary', 'drift'], brz: [30000, 'turbo', 'drift'],
    e92jz: [30000, 'turbo', 'drift'], c8: [30000, 'v8', 'track'], cls63: [28000, 'v8', 'track'],
    rwb993: [28000, 'v8', 'track'], s180sx: [26000, 'turbo', 'drift'], dodge37: [26000, 'v8', 'muscle'],
    e92m3: [25000, 'v8', 'track'], evo9: [24000, 'turbo', 'rally'], challenger: [24000, 'v8', 'muscle'],
    m4gts: [23000, 'turbo', 'track'], a90: [22000, 'turbo', 'track'], camaro: [21000, 'v8', 'muscle'],
    mustang: [20000, 'v8', 'muscle'], supra30: [20000, 'turbo', 'track'], silverado: [18000, 'v8', 'truck'],
    wrx: [17000, 'turbo', 'rally'], s2000: [16000, 'vtec', 'track'], evox: [16000, 'turbo', 'rally'],
    g35: [15000, 'turbo', 'drift'], fl5: [15000, 'vtec', 'track'], civic: [14000, 'vtec', 'track'],
    s240sx: [14000, 'turbo', 'drift'], civicek: [12000, 'vtec', 'rally'], ae86: [12000, 'vtec', 'drift'],
    satria: [8000, 'street', 'rally'], wira: [7000, 'street', 'rally'], hilux: [6000, 'utility', 'truck']
};
const revCarPrice = id => (REV_CAR_PRICES[id] || [10000, 'street', 'track'])[0];
const revCarTier = id => (REV_CAR_PRICES[id] || [0, 'street'])[1];
const revCarClass = id => (REV_CAR_PRICES[id] || [0, 'street', 'track'])[2];
// An engine swap costs 40% of the car whose sound it is; your own cars' engines are free.
const revEnginePrice = engine => Math.round(revCarPrice(engine.sound) * 0.4 / 100) * 100;

// Garage parts, priced by how loved their sound is (stock parts are free).
const REV_PART_PRICES = {
    'exhaust:stock': 0, 'exhaust:sport': 1500, 'exhaust:resonator': 3000, 'exhaust:straight': 6000, 'exhaust:titanium': 9000,
    'turbo:none': 0, 'turbo:street': 4000, 'turbo:bigsingle': 8000, 'turbo:twin': 12000,
    'bov:none': 0, 'bov:recirc': 1000, 'bov:atmos': 3000, 'bov:flutter': 5000,
    'intake:airbox': 0, 'intake:cai': 2000, 'intake:itb': 5000
};

// Meter (tachometer) skins for the race HUD. Gems are the premium currency.
const REV_METER_SKINS = {
    classic: { name: 'Classic blue', coins: 0, gems: 0, face: ['#24406e', '#0b1426'], ring: '#0f1724', text: '#c9d4e6', needle: '#ff3b47' },
    carbon: { name: 'Carbon', coins: 5000, gems: 0, face: ['#3a3f47', '#121418'], ring: '#0a0b0d', text: '#e8ecef', needle: '#ff8a1f' },
    retro: { name: 'Retro white', coins: 6000, gems: 0, face: ['#ffffff', '#d9dde3'], ring: '#1d2636', text: '#1d2636', needle: '#e8372f' },
    neon: { name: 'Neon night', coins: 8000, gems: 0, face: ['#2b1048', '#0b0418'], ring: '#38e1ff', text: '#ff7ce5', needle: '#38e1ff' },
    gold: { name: 'Gold', coins: 0, gems: 25, face: ['#6b4d12', '#241703'], ring: '#ffc928', text: '#ffe27a', needle: '#ffffff' }
};

// Gem packs are shown for a future store; there are no real-money payments in this build.
const REV_GEM_PACKS = [{ gems: 50, label: 'Handful' }, { gems: 150, label: 'Pouch' }, { gems: 500, label: 'Chest' }];

// Coins for a race: by place, difficulty and how far into the region the map is.
const REV_DIFFICULTY_COINS = { easy: 1, normal: 1.5, hard: 2.2 };
function revRaceCoins({ place, finished, difficulty = 'normal', mapIndex = 0, career = false }) {
    if (!finished) return 0;
    const base = [0, 400, 200, 100, 40][place] || 0;
    return Math.round(base * (REV_DIFFICULTY_COINS[difficulty] || 1) * (1 + mapIndex * 0.05) * (career ? 1 : 0.5) / 5) * 5;
}

if (typeof module !== 'undefined') module.exports = { REV_SOUND_TIERS, REV_CAR_CLASSES, REV_UNSUITED_PACE, REV_CAR_PRICES, revCarPrice, revCarTier, revCarClass,
    revEnginePrice, REV_PART_PRICES, REV_METER_SKINS, REV_GEM_PACKS, REV_DIFFICULTY_COINS, revRaceCoins };
