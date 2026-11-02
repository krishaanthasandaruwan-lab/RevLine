// Builds frontend/ART-REQUESTS/requests.json and PROMPTS.md from the game data, so every
// requested image has the exact file name, size and slot the game reads.
// Run: node scripts/build-art-requests.cjs   (then scripts/import-art.py after generating)
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const out = path.join(root, 'frontend/ART-REQUESTS');
const context = vm.createContext({ console });
for (const file of ['garage.js', 'frontend/garage/parts-catalog.js', 'frontend/shared/economy.js', 'frontend/career/career-data.js'])
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const { REV_CARS, REV_SHOP, REV_PARTS, REV_METER_SKINS, REV_REGIONS, REV_MAPS, REV_CAR_PRICES, REV_SOUND_TIERS } =
    vm.runInContext('({ REV_CARS, REV_SHOP, REV_PARTS, REV_METER_SKINS, REV_REGIONS, REV_MAPS, REV_CAR_PRICES, REV_SOUND_TIERS })', context);

const STYLE = 'Mobile racing game asset in a bold cartoon style: thick dark navy outlines (#0f1724), flat bright colours with one soft glossy highlight, simple shapes, no text, no letters, no numbers, no logos, no badges, no watermark.';
const GREEN = 'Isolated on a perfectly flat pure green (#00FF00) chroma-key background that fills the whole image edge to edge, no gradient, no floor, no shadow on the background, no green anywhere on the subject.';
const MAGENTA = 'Isolated on a perfectly flat pure magenta (#FF00FF) chroma-key background that fills the whole image edge to edge, no gradient, no floor, no shadow on the background, no magenta or pink anywhere on the subject.';
const TOP = 'Strict top-down orthographic view from directly above (90°), no perspective, no tilt, the car points straight UP (front at the top edge, rear at the bottom), centred, filling about 92% of the image height, wheels just visible at the sides.';

// Body cues for each car (shape only; "-style" means inspired by, without any branding).
const CAR_LOOK = {
    gt: 'Porsche Carrera GT-style mid-engine roadster, long rear deck with two humps behind the seats, side air intakes, twin yellow racing stripes',
    rx7: 'Mazda RX-7 FD-style curvy sports coupe, smooth rounded nose with closed pop-up headlights, small rear lip spoiler',
    supra: 'Toyota Supra MK4-style sports coupe, long rounded nose, big hoop rear wing',
    r34: 'Nissan Skyline R34 GT-R-style boxy coupe, bonnet vents, tall rear wing',
    mustang: '1965 Ford Mustang fastback-style muscle car, long bonnet, short boot, one wide white centre stripe',
    s2000: 'Honda S2000-style roadster with the roof open, two seats and roll hoops visible',
    civic: 'Honda Civic Type R FK8-style hot hatch, large rear wing, sharp vents, red accents',
    lfa: 'Lexus LFA-style wedge supercar, long bonnet, small rear spoiler, side vents',
    challenger: 'Dodge Challenger Scat Pack-style wide muscle coupe, long square body, twin bonnet scoops',
    s240sx: 'Nissan 240SX S13-style slim drift coupe, closed pop-up headlights',
    s180sx: 'Nissan 180SX-style hatchback, closed pop-up headlights, small rear spoiler',
    evox: 'Mitsubishi Lancer Evolution X-style sports sedan, big bonnet vents, tall rear wing',
    evo9: 'Mitsubishi Lancer Evolution IX-style rally sedan, bonnet vents, big rear wing',
    satria: 'Proton Satria Neo-style small three-door hatchback, rounded roof, roof spoiler',
    g35: 'Infiniti G35-style smooth two-door coupe',
    veilside: 'Mazda RX-7 Veilside Fortune-style widebody, very wide smooth fenders, bubble canopy, ducktail',
    r35: 'Nissan GT-R R35-style muscular coupe, big rear wing',
    wrx: 'Subaru WRX STI-style rally sedan, bonnet scoop, tall rear wing, gold wheels',
    p1: 'McLaren P1-style hypercar, teardrop cabin, large rear wing',
    rx7gpu: 'Mazda RX-7 FD-style coupe with a simple circuit-board graphic on the bonnet',
    c8: 'Chevrolet Corvette C8-style mid-engine coupe, sharp angular body, glass engine cover',
    mazda787b: 'Mazda 787B-style Le Mans prototype, closed cockpit, long tail, wide rear wing, orange with green stripes',
    hilux: 'Toyota Hilux-style double-cab pickup truck with an open load bed',
    rwb993: 'Porsche 993 RWB-style widebody, bolt-on wide fenders, huge ducktail wing',
    a90: 'Toyota Supra A90-style coupe, double-bubble roof, ducktail spoiler',
    e92jz: 'BMW E92-style two-door coupe with a power-dome bonnet',
    m4gts: 'BMW M4 GTS-style coupe, big carbon rear wing, orange accents',
    silverado: 'Chevrolet Silverado-style full-size pickup truck, open load bed',
    e92m3: 'BMW E92 M3-style coupe, bonnet power dome',
    supra30: 'Toyota Supra A90 3.0-style coupe, double-bubble roof',
    r34v12: 'Nissan Skyline R34-style boxy coupe, tall wing, bonnet vents',
    wira: 'Proton Wira-style small sedan, rear spoiler',
    huracan: 'Lamborghini Huracán STO-style wedge supercar, roof scoop fin, big rear wing',
    ae86: 'Toyota AE86 Trueno-style small hatchback coupe, closed pop-up headlights, two-tone body with black lower half',
    civicek: 'Honda Civic EK-style small hatchback',
    apx: 'modern open-wheel formula race car, exposed wheels, front and rear wings, cockpit halo',
    fl5: 'Honda Civic Type R FL5-style hot hatch, clean body, rear wing',
    brz: 'Subaru BRZ-style compact sports coupe',
    suprav12: 'Toyota Supra MK4-style coupe, big hoop rear wing',
    cls63: 'Mercedes CLS 63-style four-door coupe sedan',
    dodge37: '1937 Dodge coupe hot-rod style, rounded separate fenders, long bonnet with an exposed engine',
    camaro: 'Chevrolet Camaro SS-style muscle coupe'
};

// What each engine looks like (sound identity drives the art too).
const ENGINE_LOOK = id => {
    const name = REV_SHOP.engine.find(e => e.id === id).name;
    if (/rotary|R26B|20B|13B/i.test(name)) return `compact Wankel rotary engine (${name}), small flat housing with big intake runners, no cylinder head`;
    if (/V12/.test(name)) return `long V12 engine (${name}) with two rows of six intake trumpets`;
    if (/V10/.test(name)) return `V10 race engine (${name}) with ten individual throttle bodies`;
    if (/V8|HEMI|LS/.test(name)) return `V8 engine (${name}) with a big air box on top and chrome valve covers`;
    if (/GPU/.test(name)) return 'fun engine-shaped block built from a glowing graphics card with fans';
    if (/flat-six|M64/.test(name)) return `air-cooled flat-six boxer engine (${name}) with a big cooling fan`;
    if (/V634|Mecachrome/.test(name)) return 'compact Formula race V6 hybrid engine with exposed turbo';
    if (/2GD|diesel/i.test(name)) return `turbo-diesel four-cylinder (${name}), boxy and heavy`;
    if (/EJ20|boxer/i.test(name)) return `flat-four boxer turbo engine (${name}) with a top-mount intercooler`;
    if (/2JZ|1JZ|RB26|B58|S55|VR38|VQ35|SR20|4G63|4B11|4G93|4G15|K20|K24|F22|4A-GE|M157|S65/.test(name))
        return `${/RB26|2JZ|1JZ|B58|S55/.test(name) ? 'straight-six' : /VR38|VQ35|M157|S65/.test(name) ? 'V-type' : 'four-cylinder'} engine (${name})${/T\b|TT|DET|GTE|DETT|T1|VR38|M157|4G63|4B11|EJ|B58|SR20/.test(name) ? ' with a shiny turbocharger and intercooler pipes' : ' with a red cam cover and individual intake runners'}`;
    return `performance car engine (${name})`;
};

const PART_LOOK = {
    'exhaust-stock': 'plain factory car silencer muffler box with a single tip',
    'exhaust-sport': 'polished sport back-box silencer with twin round tips',
    'exhaust-resonator': 'exhaust pipe section with the middle resonator box cut out, slightly blued pipe',
    'exhaust-straight': 'straight-through exhaust pipe with no silencer, wide open tip with a small flame puff',
    'exhaust-titanium': 'titanium race exhaust can with heat-blued purple-gold rainbow finish and a blue flame',
    'turbo-none': 'simple naturally aspirated intake manifold, no turbo',
    'turbo-street': 'small shiny turbocharger snail shell',
    'turbo-bigsingle': 'very large single turbocharger snail with a wide compressor inlet',
    'turbo-twin': 'two small matching turbochargers side by side',
    'bov-none': 'capped-off pipe with no valve',
    'bov-recirc': 'small black factory recirculating valve',
    'bov-atmos': 'chrome atmospheric blow-off valve with a trumpet vent and little air puff',
    'bov-flutter': 'turbo with fluttering air waves drawn as curved lines around the inlet',
    'intake-airbox': 'black factory air box',
    'intake-cai': 'cold-air intake with a red cone filter',
    'intake-itb': 'row of polished velocity stacks (individual throttle bodies)'
};

const REGION_LOOK = {
    grass: 'green rolling hills, grandstands, a small lake and trees',
    coast: 'sea coast, sandy beach, palm trees and a lighthouse',
    autumn: 'hills covered with orange and red autumn forest',
    gravel: 'grey stone quarry with cranes, rocks and dusty tracks',
    desert: 'golden sand dunes, cactus and dusty wind',
    snow: 'snowy mountains, pine trees and ice',
    city: 'night city blocks with neon lights from above',
    jungle: 'dense jungle, muddy river and big leaves',
    canyon: 'red rock canyon with long sweeping roads',
    volcano: 'black volcanic rock with glowing orange lava rivers',
    arena: 'monster-truck stadium with dirt mounds, ramps and crushed cars'
};

const requests = [];
const add = (entry) => requests.push(entry);
const priceLine = id => { const p = REV_CAR_PRICES[id]; return p ? `${REV_SOUND_TIERS[p[1]].label} · ${p[0].toLocaleString('en-US')} coins` : ''; };

// 1. Top-down race cars (player sprite; facing up).
for (const car of REV_CARS) add({
    group: 'Top-down cars', name: `topdown-${car.id}.png`, size: [480, 900], key: carKey(car),
    target: `frontend/shared/art/cars/${car.id}.webp`, slot: ['cars', car.id],
    refs: [`references/screens/race-grass.png`, `references/screens/car-sprites.png`, `references/cars/${car.id}.jpg`],
    use: `Your car in races, garage bay and home turntable (${car.name}).`,
    prompt: `${STYLE} ${TOP} A ${colourName(car.color)} ${CAR_LOOK[car.id] || car.name}, dark tinted glass, main body colour ${colourName(car.color)} (${car.color}). ${carKey(car) === 'magenta' ? MAGENTA : GREEN}`
});
// 2. Store portraits (replace the video screenshots in the Garage store).
for (const car of REV_CARS) add({
    group: 'Store car portraits', name: `portrait-${car.id}.png`, size: [512, 512], key: carKey(car),
    target: `frontend/shared/art/portraits/${car.id}.webp`, slot: ['props', `portrait-${car.id}`],
    refs: [`references/cars/${car.id}.jpg`, `references/screens/garage-cars.png`],
    use: `Garage store card for ${car.name} (${priceLine(car.id)}).`,
    prompt: `${STYLE} Three-quarter front view (front-left), slightly from above, of a ${colourName(car.color)} (${car.color}) ${CAR_LOOK[car.id] || car.name}, chunky toy-like proportions, big wheels, glossy paint, centred, whole car visible with margin. ${carKey(car) === 'magenta' ? MAGENTA : GREEN}`
});
// 3. Engines.
for (const engine of REV_SHOP.engine.filter(e => e.id !== 'sport')) add({
    group: 'Engines', name: `engine-${engine.id}.png`, size: [512, 512], key: 'green',
    target: `frontend/shared/art/engines/${engine.id}.webp`, slot: ['props', `engine-${engine.id}`],
    refs: ['references/screens/garage-parts.png'],
    use: `Garage → Engine tab card (${engine.name}).`,
    prompt: `${STYLE} Three-quarter view of a ${ENGINE_LOOK(engine.id)}, isolated engine only, chunky cartoon proportions, metal with bright accent colours, centred with margin. ${engine.id === 'rx7gpu' ? MAGENTA : GREEN}`
});
// 4. Sound parts.
for (const [category, parts] of Object.entries(REV_PARTS)) for (const part of parts) add({
    group: 'Sound parts', name: `part-${category}-${part.id}.png`, size: [512, 512], key: 'green',
    target: `frontend/shared/art/parts/${category}-${part.id}.webp`, slot: ['props', `part-${category}-${part.id}`],
    refs: ['references/screens/garage-parts.png'],
    use: `Garage → ${category} tab card (${part.name}).`,
    prompt: `${STYLE} Three-quarter view of a ${PART_LOOK[`${category}-${part.id}`] || part.name}, single car part, centred with margin. ${GREEN}`
});
// 5. Meter skins (garage thumbnails; the race gauge keeps drawing its live needle and numbers).
for (const [id, skin] of Object.entries(REV_METER_SKINS)) add({
    group: 'Meter skins', name: `skin-${id}.png`, size: [512, 512], key: id === 'neon' ? 'green' : 'magenta',
    target: `frontend/shared/art/skins/${id}.webp`, slot: ['props', `skin-${id}`],
    refs: ['references/screens/race-hud.png'],
    use: `Garage → Meter tab card (${skin.name}).`,
    prompt: `${STYLE} Front view of a round car tachometer gauge, "${skin.name}" theme: face gradient ${skin.face.join(' to ')}, outer ring ${skin.ring}, tick marks in ${skin.text}, a red zone at the top right, needle ${skin.needle} pointing to the middle, tick marks only, no numbers. ${id === 'neon' ? GREEN : MAGENTA}`
});
// 6. Challenge items and currency.
const ICONS = {
    'icon-coin': 'one shiny gold coin, front view, embossed with a simple piston shape, thick rim',
    'icon-gem': 'one cut cyan-blue diamond gem with bright facets and a sparkle',
    'icon-star': 'one plump five-pointed gold star with a glossy highlight',
    'icon-star-empty': 'one empty five-pointed star socket, dark slate grey, slightly inset',
    'icon-trophy': 'one gold racing trophy cup with two handles on a dark base',
    'icon-chest': 'one wooden treasure chest with gold trim, lid slightly open with gold coins and blue gems inside',
    'icon-coin-stack': 'a small stack of gold coins with a few loose coins',
    'icon-gem-pile': 'a small pile of cyan-blue gems',
    'icon-lock': 'one chunky gold padlock, closed',
    'icon-flag': 'one waving black and white chequered race flag on a short pole'
};
for (const [name, look] of Object.entries(ICONS)) add({
    group: 'Challenge items', name: `${name}.png`, size: [256, 256], key: 'magenta',
    target: `frontend/shared/art/ui/${name.slice(5)}.webp`, slot: ['props', name],
    refs: ['references/screens/career-map.png', 'references/screens/race-win.png'],
    use: name === 'icon-coin' || name === 'icon-gem' || name === 'icon-star' ? 'Wallets (home, garage, career) and race rewards.' : 'Rewards and career screens (slot ready for later use).',
    prompt: `${STYLE} ${look}, centred, filling about 80% of the image. ${MAGENTA}`
});
// 7. Region backgrounds (career map). Full scenes: no chroma key.
for (const region of REV_REGIONS) add({
    group: 'Region backgrounds', name: `region-${region.id}.jpg`, size: [768, 1366], key: 'none',
    target: `frontend/shared/art/regions/${region.id}.jpg`, slot: ['props', `region-${region.id}`],
    refs: ['references/screens/career-map.png'],
    use: `Career map background for ${region.name}${region.developed ? '' : ' (shown blurred until the region is released)'}.`,
    prompt: `${STYLE} Tall portrait (9:16) bird's-eye cartoon landscape for a racing game world map: ${REGION_LOOK[region.theme] || region.blurb}. Calm, slightly darker centre column (the game draws a winding path of round level buttons on top), more detail at the left and right edges, soft lighting. Mood: ${region.blurb} No roads in the centre, no buttons, no UI, no text.`
});
// 8. Round banners: one per track theme (400 rounds share them; a round-specific map-<id> also works).
const BANNER_LOOK = {
    grass: 'green grass valley with red-white kerbs and grandstands', coast: 'seaside road with beach, palms and blue sea', autumn: 'forest road under orange autumn trees',
    gravel: 'grey gravel quarry road with rocks and cranes', desert: 'sandy desert road between dunes and cactus', snow: 'icy snowy mountain road with pine trees',
    city: 'night city street with neon signs and traffic', jungle: 'muddy jungle track with big leaves and a river', canyon: 'red rock canyon road with drift tyre marks',
    volcano: 'black volcanic road with glowing lava cracks', arena: 'monster-truck dirt arena with ramps and a crowd', dirt: 'muddy dirt rally track with puddles, barrels and rocks'
};
const themes = [...new Set(Object.values(REV_MAPS).map(m => m.theme))];
// Two banners per theme: odd rounds use the second one.
for (const theme of themes) for (const variant of ['', '-2']) add({
    group: 'Round banners', name: `banner-${theme}${variant}.jpg`, size: [1200, 480], key: 'none',
    target: `frontend/shared/art/banners/${theme}${variant}.jpg`, slot: ['props', `banner-${theme}${variant}`],
    refs: [theme === 'dirt' || theme === 'arena' ? 'references/screens/race-dirt.png' : 'references/screens/race-grass.png'],
    use: `Round sheet banner for the ${Object.values(REV_MAPS).filter(m => m.theme === theme).length} rounds on the ${theme} theme.`,
    prompt: `${STYLE} Wide banner (5:2), top-down cartoon view of a ${BANNER_LOOK[theme] || theme} race road curving across the picture, two tiny cartoon race cars. No UI, no text.`
});
// 9. Obstacles and track props (drawn from above at small sizes).
const PROPS = {
    'obstacle-cone': ['green', 256, 'one orange traffic cone seen from directly above: round base, white ring, orange tip in the centre'],
    'obstacle-barrel': ['green', 256, 'one blue oil drum barrel seen from directly above: round lid with two rings'],
    'obstacle-rock': ['green', 256, 'one grey boulder seen from directly above, rounded with a highlight top-left'],
    'obstacle-mud': ['green', 512, 'one dark brown wet mud puddle seen from directly above, irregular rounded shape with lighter splashes'],
    tree: ['magenta', 512, 'one round leafy tree canopy seen from directly above, several green lobes, lighter top-left highlight'],
    pine: ['magenta', 512, 'one snowy pine tree seen from directly above: star-shaped dark green layers with white snow on the tips'],
    cactus: ['magenta', 512, 'one round desert cactus seen from directly above with three arms and tiny spines'],
    bush: ['magenta', 256, 'one small round green bush seen from directly above'],
    tent: ['green', 512, 'one square pop-up event tent seen from directly above, four triangular roof panels, blue and white'],
    grandstand: ['green', [560, 800], 'a race-track grandstand seen from directly above, long side vertical, tiered seats full of a colourful crowd, red and white striped roof strip on the left edge'],
    billboard: ['green', [160, 520], 'a tall thin trackside advertising board seen from directly above, blue face with an orange abstract speed swoosh']
};
for (const [name, [key, size, look]] of Object.entries(PROPS)) add({
    group: 'Obstacles and track props', name: `prop-${name}.png`, size: Array.isArray(size) ? size : [size, size], key,
    target: `frontend/shared/art/props/${name}.webp`, slot: ['props', name],
    refs: [name.startsWith('obstacle') ? 'references/screens/race-dirt.png' : 'references/screens/race-grass.png'],
    use: name.startsWith('obstacle') ? `Career obstacle: ${name.slice(9)}.` : `Trackside ${name}${name === 'pine' ? ' (snow regions)' : name === 'cactus' ? ' (desert regions)' : ''}.`,
    prompt: `${STYLE} ${look}, strictly top-down orthographic, centred. ${key === 'magenta' ? MAGENTA : GREEN}`
});
// 10. Monster trucks for the Monster Arena and Monster Mayhem regions (slots are ready).
for (const [n, color] of [[1, '#2f8cff'], [2, '#ff8a1f'], [3, '#00b85c'], [4, '#b07cff']]) add({
    group: 'Monster trucks', name: `topdown-monster${n}.png`, size: [560, 900], key: n === 3 ? 'magenta' : 'green',
    target: `frontend/shared/art/cars/monster${n}.webp`, slot: ['cars', `monster${n}`],
    refs: ['references/screens/car-sprites.png'],
    use: 'Monster Arena / Monster Mayhem trucks (slot ready; needs truck engine recordings).',
    prompt: `${STYLE} ${TOP.replace('car points', 'truck points')} A ${color} monster truck: small pickup body on four huge knobbly tyres, visible suspension arms, roll bar, flame decals. ${n === 3 ? MAGENTA : GREEN}`
});

function isGreen(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return g > r * 1.2 && g > b * 1.2;
}
// Green subjects cannot sit on a green screen.
function carKey(car) { return isGreen(car.color) || /green/i.test(CAR_LOOK[car.id] || '') ? 'magenta' : 'green'; }
// Image models follow colour names better than hex codes, so prompts give both.
function colourName(hex) {
    const NAMES = { 'royal blue': '#1565c0', 'sunflower yellow': '#e2b83d', orange: '#dc7939', 'bright blue': '#2b75b9', 'gunmetal grey': '#505862',
        red: '#c7443b', 'pearl white': '#e6eaef', 'silver': '#a7b0ba', 'dark red': '#913a3e', 'charcoal grey': '#3b424c', 'racing red': '#c70010',
        'burnt orange': '#c75000', 'cobalt blue': '#0947c7', 'deep blue': '#1a2fc7', 'lime green': '#6cc71e', 'rust orange': '#c75c28',
        'indigo blue': '#4437c7', teal: '#1ac7a8', 'apple green': '#70c737', 'mustard yellow': '#c7be20', 'navy blue': '#0125c7',
        'bronze gold': '#c78e18', 'ocean blue': '#0054c7', 'tan gold': '#c78f46', 'orange red': '#c72b00' };
    const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    const [r, g, b] = rgb(hex);
    return Object.entries(NAMES).map(([name, h]) => { const [R, G, B] = rgb(h); return [name, (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2]; }).sort((x, y) => x[1] - y[1])[0][0];
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'requests.json'), JSON.stringify({
    readme: 'Generated by scripts/build-art-requests.cjs. Put finished files in frontend/ART-REQUESTS/incoming/ with these names, then run python3 scripts/import-art.py.',
    style: STYLE, requests
}, null, 2) + '\n');

// ---------- PROMPTS.md (agent-ready sheet) ----------
const groups = [...new Set(requests.map(r => r.group))];
let md = `# RevLine image requests: agent prompt sheet

Generated from the game data by \`scripts/build-art-requests.cjs\` (${requests.length} images).
Every file name below is what the game looks for. Wrong or weak images can simply be
regenerated and dropped in again.

## Instructions for the image agent

1. Read every image in \`references/\` first. \`references/screens/\` shows the game's
   look (cartoon, thick navy outlines, bright flat colours, glossy highlights); match it.
   \`references/cars/<id>.jpg\` shows each real car model (from the source videos). Use it
   only for the body shape and colour, never copy text, plates, watermarks or logos.
2. Generate each request with its prompt. Use the size given (or the same aspect
   ratio, larger is fine). One subject per image.
3. **Chroma key:** \`green\` = pure #00FF00 background, \`magenta\` = pure #FF00FF
   background (used when the subject is green), \`none\` = full scene, no key. Keep the
   background perfectly flat: no gradient, shadow, floor or vignette.
4. Top-down cars and trucks must point **straight up**, seen from exactly above.
5. Save with the exact file name into \`frontend/ART-REQUESTS/incoming/\` (PNG for keyed
   images, JPG for full scenes; any of .png .jpg .webp is accepted).
6. Then run \`python3 scripts/import-art.py\`: it removes the key colour, trims, resizes,
   saves into \`frontend/shared/art/\` and lists the file in the game's art manifest.

## Style line (start every prompt with it; already included below)

> ${STYLE}

`;
for (const group of groups) {
    const list = requests.filter(r => r.group === group);
    md += `## ${group} (${list.length})\n\n| File | Size | Key | Use | Prompt |\n|---|---|---|---|---|\n`;
    for (const r of list) md += `| \`${r.name}\` | ${r.size.join('×')} | ${r.key} | ${r.use} | ${r.prompt.replace(STYLE + ' ', '').replace(/\|/g, '/')} |\n`;
    md += '\n';
}
fs.writeFileSync(path.join(out, 'PROMPTS.md'), md);
console.log(`${requests.length} requests in ${groups.length} groups → frontend/ART-REQUESTS/`);
