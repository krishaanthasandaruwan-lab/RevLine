// Garage page: cars (claim + select), engine swap and sound-tuning parts.
// Car, engine and turbo on/off go through the backend RevGarage (garage.js) and are used
// by races. Exhaust, turbo variant, blow-off and intake are saved by RevTuningStore.
(() => {
    const storage = revOpenStorage();
    const garage = new RevGarage(storage);
    const tuning = new RevTuningStore(storage);
    const career = new RevCareerStore(storage, tuning);
    career.grantStarter(garage);
    const lab = new RevSoundLab();
    const $ = id => document.getElementById(id);

    const ICONS = {
        cars: '<path d="M5 17h14M6 17l1.4-5.2A2 2 0 0 1 9.3 10h5.4a2 2 0 0 1 1.9 1.8L18 17"/><circle cx="8" cy="17.5" r="1.8"/><circle cx="16" cy="17.5" r="1.8"/>',
        engine: '<path d="M4 10h3l2-3h6v3h3l2 2v4l-2 2h-3l-2 2H8l-2-2H4z"/><path d="M10 13h4"/>',
        exhaust: '<path d="M3 14h10a3 3 0 0 0 3-3V8"/><rect x="14" y="4" width="5" height="4" rx="1.5"/><circle cx="19" cy="15" r="2"/><circle cx="21" cy="19" r="1.3"/>',
        turbo: '<path d="M12 12a1.5 1.5 0 1 1 1.5 1.5A3.5 3.5 0 1 1 10 10a5.5 5.5 0 1 1 5.5 5.5H21"/><path d="M21 13v5M3 6l3 3"/>',
        bov: '<rect x="7" y="9" width="10" height="9" rx="2"/><path d="M12 9V5M9 5h6M3 13h4M17 13h4"/><path d="M20 6l2-2M20 10l2 1"/>',
        meter: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.4"/>',
        intake: '<path d="M4 9l9-3v12l-9-3z"/><path d="M13 10h4v4h-4M17 12h4"/><path d="M6 10v4M9 9v6"/>'
    };
    const TABS = [
        { id: 'cars', name: 'Cars' }, { id: 'engine', name: 'Engine' },
        ...REV_PART_CATEGORIES.map(category => ({ id: category.id, name: category.name })),
        { id: 'meter', name: 'Meter' }
    ];
    const STAT_ROWS = [['loudness', 'Loudness'], ['tone', 'Tone · deep → high'], ['rasp', 'Rasp'], ['whistle', 'Turbo whistle'], ['crackle', 'Pops & crackle'], ['induction', 'Intake roar']];
    let activeTab = TABS.some(tab => tab.id === location.hash.slice(1)) ? location.hash.slice(1) : 'cars';
    let previewing = null;           // { key, sound } while a preview plays
    const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

    const build = () => tuning.effective(garage.car.id, garage.state.equipped.turbo);
    const engineSound = engineId => (REV_SHOP.engine.find(engine => engine.id === engineId) || garage.engine).sound;
    const ownedCars = () => REV_CARS.filter(car => garage.owns('car', car.id));
    let statusTimer = 0;
    function status(message) {
        const output = $('g-status');
        output.textContent = message; output.dataset.visible = 'true';
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { output.dataset.visible = 'false'; }, 3200);
    }

    // ---------- Backend sync ----------
    function syncTurbo(carId) {
        const wanted = revPart('turbo', tuning.build(carId).turbo).backend;
        return garage.state.equipped.turbo === wanted ? '' : garage.equip('turbo', wanted);
    }
    function selectCar(carId) {
        const error = garage.equip('car', carId) || syncTurbo(carId);
        status(error || `${garage.car.name} is in the bay · ${garage.engine.name}.`);
        render();
    }

    // ---------- Rendering ----------
    function render() {
        const current = build();
        $('car-name').textContent = garage.car.name;
        $('car-engine').textContent = garage.engine.name;
        $('power').textContent = `×${garage.power.toFixed(2)}`;
        $('build-chips').replaceChildren(...[
            ['engine', garage.engine.name], ['exhaust', revPart('exhaust', current.exhaust).name],
            ['turbo', revPart('turbo', current.turbo).name],
            ['bov', current.turbo === 'none' ? 'No blow-off (NA)' : revPart('bov', current.bov).name],
            ['intake', revPart('intake', current.intake).name]
        ].map(([category, label]) => {
            const chip = document.createElement('li'); chip.dataset.category = category;
            chip.innerHTML = icon(category); chip.append(label); return chip;
        }));
        const pager = ownedCars().length > 1;
        $('car-prev').disabled = $('car-next').disabled = !pager;
        $('w-coins').textContent = garage.state.credits.toLocaleString('en-US');
        $('w-gems').textContent = career.state.gems.toLocaleString('en-US');
        renderTabs(); renderParts(); renderStats();
    }

    function renderTabs() {
        $('g-tabs').replaceChildren(...TABS.map(tab => {
            const button = document.createElement('button');
            button.type = 'button'; button.setAttribute('role', 'tab'); button.id = `tab-${tab.id}`;
            button.setAttribute('aria-selected', String(tab.id === activeTab));
            button.setAttribute('aria-controls', 'g-parts'); button.tabIndex = tab.id === activeTab ? 0 : -1;
            button.dataset.category = tab.id;
            button.innerHTML = `${icon(tab.id)}<span>${tab.name}</span>`;
            button.addEventListener('click', () => setTab(tab.id));
            button.addEventListener('keydown', event => {
                const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (!step) return;
                const index = TABS.findIndex(t => t.id === tab.id);
                setTab(TABS[(index + step + TABS.length) % TABS.length].id, true);
            });
            return button;
        }));
        $('g-parts').setAttribute('aria-labelledby', `tab-${activeTab}`);
        const strip = $('g-tabs'), selected = $(`tab-${activeTab}`);
        if (selected.offsetLeft + selected.offsetWidth > strip.scrollLeft + strip.clientWidth || selected.offsetLeft < strip.scrollLeft) strip.scrollLeft = selected.offsetLeft - 8;
    }
    function setTab(id, focus = false) {
        activeTab = id; history.replaceState(null, '', `#${id}`);
        renderTabs(); renderParts();
        if (focus) $(`tab-${id}`).focus();
    }

    // Each entry: { key, title, blurb, tags, state, primary, onPrimary, hear, thumb }
    const coins = n => `${n.toLocaleString('en-US')} coins`;
    // Buying spends coins first; the backend garage then records the car or part as owned.
    function buy(price, label, then) {
        const error = garage.spend(price);
        if (error) { status(`${error} ${label} costs ${coins(price)}; you have ${coins(garage.state.credits)}. Win races to earn more.`); return; }
        then(); render();
    }
    function entries() {
        const current = build();
        if (activeTab === 'cars') return REV_CARS.map(car => {
            const owned = garage.owns('car', car.id), driving = garage.car.id === car.id, price = revCarPrice(car.id);
            return { key: `car:${car.id}`, title: car.name, blurb: car.note,
                tags: [REV_SOUND_TIERS[revCarTier(car.id)].label, `${REV_CAR_CLASSES[revCarClass(car.id)]} class`, owned ? 'In your garage' : price ? coins(price) : 'Free'],
                state: driving ? 'fitted' : owned ? 'owned' : 'locked', primary: driving ? 'Driving' : owned ? 'Drive this' : price ? `Buy · ${price.toLocaleString('en-US')}` : 'Add · free',
                onPrimary: () => {
                    if (owned) { selectCar(car.id); return; }
                    buy(price, car.name, () => { const error = garage.claim(car.id); status(error || `${car.name} is yours. Tap Drive this to bring it into the bay.`); });
                },
                hear: { soundId: engineSound(car.engine), sound: revComposeSound(tuning.build(car.id)) }, car };
        });
        if (activeTab === 'engine') return REV_SHOP.engine.map(engine => {
            const fitted = garage.engine.id === engine.id, owned = garage.owns('engine', engine.id) || garage.owns('car', engine.sound);
            const price = owned ? 0 : revEnginePrice(engine);
            return { key: `engine:${engine.id}`, art: `engine-${engine.id}`, title: engine.name, blurb: engine.id === 'sport' ? 'Legacy tune of the Carrera GT reference (+8% acceleration).' : `Engine sound from the ${REV_CARS.find(c => c.id === engine.sound)?.name || 'reference'} recording.`,
                tags: [REV_SOUND_TIERS[revCarTier(engine.sound)].label, engine.power > 1 ? `+${Math.round((engine.power - 1) * 100)}% accel` : 'Sound swap'],
                state: fitted ? 'fitted' : owned || !price ? 'owned' : 'locked', primary: fitted ? 'Fitted' : price ? `Buy · ${price.toLocaleString('en-US')}` : 'Fit',
                onPrimary: () => {
                    const fit = () => { const error = garage.equip('engine', engine.id); status(error || `${engine.name} fitted to the ${garage.car.name}.`); };
                    if (price) buy(price, engine.name, fit); else { fit(); render(); }
                },
                hear: { soundId: engine.sound, sound: revComposeSound(current) } };
        });
        if (activeTab === 'meter') return Object.entries(REV_METER_SKINS).map(([id, skin]) => {
            const owned = career.ownsSkin(id), using = career.state.skin === id;
            const price = skin.gems ? `${skin.gems} gems` : skin.coins ? coins(skin.coins) : 'Free';
            return { key: `meter:${id}`, art: `skin-${id}`, title: skin.name, blurb: 'Tachometer look for your races.', tags: [owned ? 'Owned' : price], skin,
                state: using ? 'fitted' : owned ? 'owned' : 'locked', primary: using ? 'In use' : owned ? 'Use' : `Buy · ${skin.gems ? `${skin.gems} gems` : skin.coins.toLocaleString('en-US')}`,
                onPrimary: () => {
                    if (!owned) { const error = career.buySkin(id, garage); if (error) { status(`${error} ${skin.name} costs ${price}.${skin.gems ? ' Earn gems with 3★ wins and finished regions.' : ' Win races to earn more.'}`); return; } }
                    career.setSkin(id); status(`${skin.name} meter in use.`); render();
                } };
        });
        const category = activeTab;
        return REV_PARTS[category].map(part => {
            const fitted = current[category] === part.id, key = `${category}:${part.id}`, owned = career.ownsPart(key), price = REV_PART_PRICES[key] || 0;
            const needsTurbo = category === 'bov' && current.turbo === 'none';
            const trial = { ...current, [category]: part.id };
            if (needsTurbo) trial.turbo = 'street';
            return { key, art: `part-${category}-${part.id}`, title: part.name, blurb: needsTurbo ? `${part.blurb} Needs a turbo; preview uses the street turbo.` : part.blurb,
                tags: [...part.tags, owned ? 'Owned' : coins(price)], state: fitted ? 'fitted' : owned ? 'owned' : 'locked',
                primary: fitted ? 'Fitted' : owned ? 'Fit' : `Buy · ${price.toLocaleString('en-US')}`, category,
                onPrimary: () => {
                    if (!owned) { const error = career.buyPart(key, garage); if (error) { status(`${error} ${part.name} costs ${coins(price)}.`); return; } }
                    const error = tuning.set(garage.car.id, category, part.id) || (category === 'turbo' ? garage.equip('turbo', part.backend) : '');
                    status(error || `${part.name} fitted to the ${garage.car.name}.${category === 'turbo' && part.backend === 'street' ? ' Races get the turbo boost.' : ''}`);
                    render();
                },
                hear: { soundId: engineSound(garage.engine.id), sound: revComposeSound(trial) } };
        });
    }

    function renderParts() {
        const grid = $('g-parts');
        grid.replaceChildren(...entries().map(entry => {
            const card = document.createElement('article');
            card.className = 'part'; card.dataset.state = entry.state; card.dataset.category = entry.category || activeTab;
            const thumb = document.createElement('div'); thumb.className = 'part-thumb';
            if (entry.car) {
                // Reference artwork from the archive (engine above, car below); the dot is the race colour.
                const photo = document.createElement('img');
                const portrait = revArtSrc(`portrait-${entry.car.id}`);
                if (portrait) thumb.classList.add('has-portrait');
                photo.src = portrait || entry.car.photo; photo.alt = ''; photo.loading = 'lazy'; photo.decoding = 'async';
                const swatch = document.createElement('i'); swatch.className = 'car-swatch'; swatch.style.background = entry.car.color;
                thumb.append(photo, swatch);
            } else if (entry.skin && !revArtSrc(entry.art)) {
                const { face, ring, text, needle } = entry.skin;
                thumb.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="sk-${entry.key.slice(6)}"><stop offset="0" stop-color="${face[0]}"/><stop offset="1" stop-color="${face[1]}"/></radialGradient></defs>
                    <circle cx="24" cy="24" r="21" fill="url(#sk-${entry.key.slice(6)})" stroke="${ring}" stroke-width="4"/>
                    <path d="M11 32a15 15 0 1 1 26 0" fill="none" stroke="${text}" stroke-width="2.4" stroke-dasharray="2 4"/>
                    <path d="M24 26l9-11" stroke="${needle}" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="26" r="3" fill="${ring}"/></svg>`;
            } else if (entry.art && revArtSrc(entry.art)) {
                const image = document.createElement('img');
                image.src = revArtSrc(entry.art); image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
                thumb.append(image);
            } else thumb.innerHTML = icon(activeTab);
            const body = document.createElement('div'); body.className = 'part-body';
            const title = document.createElement('h3'); title.textContent = entry.title;
            const blurb = document.createElement('p'); blurb.textContent = entry.blurb;
            const tags = document.createElement('ul'); tags.className = 'part-tags';
            tags.append(...entry.tags.map(text => { const tag = document.createElement('li'); tag.textContent = text; return tag; }));
            body.append(title, blurb, tags);
            const actions = document.createElement('div'); actions.className = 'part-actions';
            const hear = document.createElement('button');
            hear.type = 'button'; hear.className = 'rl-btn rl-btn--dark rl-btn--small part-hear';
            const playing = previewing?.key === entry.key;
            hear.setAttribute('aria-pressed', String(playing));
            hear.setAttribute('aria-label', `${playing ? 'Stop' : 'Hear'} ${entry.title}`);
            hear.innerHTML = playing ? '■ Stop' : '▶ Hear';
            hear.addEventListener('click', () => preview(entry.key, entry.hear.soundId, entry.hear.sound, entry.title));
            if (!entry.hear) hear.hidden = true;
            const fit = document.createElement('button');
            fit.type = 'button'; fit.className = `rl-btn rl-btn--small ${entry.state === 'locked' ? 'rl-btn--yellow' : entry.state === 'fitted' ? 'rl-btn--green' : 'rl-btn--orange'}`;
            fit.textContent = entry.primary; fit.disabled = entry.state === 'fitted';
            fit.addEventListener('click', () => { stopPreview(); entry.onPrimary(); });
            if (entry.hear) actions.append(hear);
            actions.append(fit);
            card.append(thumb, body, actions);
            return card;
        }));
    }

    function renderStats() {
        const sound = previewing?.sound || revComposeSound(build());
        const stats = revSoundStats(sound);
        $('stats-title').textContent = previewing ? `Hearing · ${previewing.title}` : 'Your build';
        $('stats').replaceChildren(...STAT_ROWS.map(([key, label]) => {
            const row = document.createElement('div'); row.className = 'stat';
            const name = document.createElement('dt'); name.textContent = label;
            const value = document.createElement('dd');
            const bar = document.createElement('span'); bar.style.setProperty('--value', stats[key].toFixed(3)); bar.dataset.stat = key;
            value.append(bar); row.append(name, value); return row;
        }));
    }

    // ---------- Preview ----------
    function stopPreview() {
        lab.stop();
        if (previewing) { previewing = null; renderParts(); renderStats(); updateBayButtons(); }
    }
    async function preview(key, soundId, sound, title) {
        if (previewing?.key === key) { stopPreview(); return; }
        previewing = { key, sound, title };
        renderParts(); renderStats(); updateBayButtons();
        status(`Playing ${title}…`);
        try {
            const finished = await lab.play(soundId, sound);
            if (finished && previewing?.key === key) { previewing = null; renderParts(); renderStats(); updateBayButtons(); status(`${title} · preview finished.`); }
        } catch {
            if (previewing?.key === key) { previewing = null; renderParts(); renderStats(); updateBayButtons(); }
            status('Sound could not play. Open the game from a local server (see frontend/README.md) and try again.');
        }
    }
    function updateBayButtons() {
        for (const [id, key, label] of [['hear-build', 'bay:build', 'Hear my build'], ['hear-stock', 'bay:stock', 'Hear stock']]) {
            const playing = previewing?.key === key;
            $(id).setAttribute('aria-pressed', String(playing));
            $(id).lastChild.textContent = playing ? 'Stop' : label;
        }
    }
    $('hear-build').addEventListener('click', () => preview('bay:build', engineSound(garage.engine.id), revComposeSound(build()), `${garage.car.name} build`));
    $('hear-stock').addEventListener('click', () => preview('bay:stock', engineSound(garage.engine.id), revComposeSound(REV_STOCK_BUILD), `${garage.car.name} stock`));
    for (const [id, step] of [['car-prev', -1], ['car-next', 1]]) $(id).addEventListener('click', () => {
        stopPreview();
        const cars = ownedCars(), index = cars.findIndex(car => car.id === garage.car.id);
        selectCar(cars[(index + step + cars.length) % cars.length].id);
    });
    window.addEventListener('pagehide', () => lab.stop());
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreview(); });

    // ---------- Bay animation ----------
    const bay = $('bay-canvas'), bayCtx = bay.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const puffs = [], bubbles = [];
    let flame = 0, bayTime = 0, lastFrame = 0, bayWidth = 1, bayHeight = 1;
    const BUBBLES = { pop: ['POP!', 'BANG!', 'CRACK!'], 'bov:atmos': ['PSSHH!'], 'bov:flutter': ['STU-TU-TU!'], 'bov:recirc': ['pff…'] };
    lab.onEvent = name => {
        const words = BUBBLES[name];
        if (!words) return;
        if (name === 'pop') { flame = 1; for (let i = 0; i < 4; i++) puffs.push(newPuff(true)); }
        bubbles.push({ text: words[Math.floor(Math.random() * words.length)], age: 0, x: name === 'pop' ? .82 : .3, y: name === 'pop' ? .3 : .22, tilt: (Math.random() - .5) * .3 });
        if (bubbles.length > 4) bubbles.shift();
    };
    function newPuff(bang = false) {
        return { x: 0, y: (Math.random() - .5) * .3, vx: .25 + Math.random() * .35, vy: (Math.random() - .5) * .12, r: .02, age: 0, life: bang ? .7 : 1.1, bang };
    }
    function resizeBay() {
        const rect = bay.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
        bayWidth = Math.max(1, rect.width); bayHeight = Math.max(1, rect.height);
        bay.width = Math.round(bayWidth * dpr); bay.height = Math.round(bayHeight * dpr);
        bayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    new ResizeObserver(resizeBay).observe(bay);

    function drawBay(now) {
        requestAnimationFrame(drawBay);
        const dt = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 1 / 60; lastFrame = now; bayTime += dt;
        const ctx = bayCtx, W = bayWidth, H = bayHeight, level = lab.playing ? lab.level() : 0, still = reduced.matches;
        // Floor, tiles and spotlight.
        ctx.fillStyle = '#1b2638'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
        ctx.fillStyle = '#2a3346'; ctx.fillRect(0, 0, W, H * .16);
        ctx.fillStyle = REV_INK; ctx.fillRect(0, H * .16 - 3, W, 3);
        const toolX = W * .06;
        ctx.fillStyle = '#d63a3a'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(toolX, H * .04, W * .16, H * .14, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff8a8a'; for (let i = 0; i < 3; i++) ctx.fillRect(toolX + 6, H * .065 + i * H * .035, W * .16 - 12, 3);
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = '#15181d'; ctx.beginPath(); ctx.arc(W * .88 - i * 4, H * .1 - i * 3, H * .065, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#59606b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(W * .88 - i * 4, H * .1 - i * 3, H * .035, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = REV_INK; ctx.lineWidth = 2.5;
        }
        ctx.save(); ctx.font = `${Math.round(H * .085)}px "Lilita One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#38e1ff'; ctx.shadowBlur = 14 + (still ? 0 : Math.sin(bayTime * 3) * 4);
        ctx.fillStyle = '#bff4ff'; ctx.fillText('REVLINE GARAGE', W * .52, H * .09); ctx.restore();
        const spot = ctx.createRadialGradient(W / 2, H * .58, 10, W / 2, H * .58, Math.max(W, H) * .55);
        spot.addColorStop(0, 'rgba(255,240,200,.22)'); spot.addColorStop(1, 'rgba(0,0,0,.35)');
        ctx.fillStyle = spot; ctx.fillRect(0, H * .16, W, H * .84);

        const carLength = Math.min(W * .5, H * .4 * REV_CAR_H / REV_CAR_W), scale = carLength / REV_CAR_H;
        const cx = W / 2, cy = H * .6;
        // Hazard-striped lift pad.
        const padW = carLength * 1.18, padH = REV_CAR_W * scale * 1.45;
        ctx.save(); ctx.beginPath(); ctx.roundRect(cx - padW / 2, cy - padH / 2, padW, padH, 10); ctx.clip();
        ctx.fillStyle = '#ffc928'; ctx.fillRect(cx - padW / 2, cy - padH / 2, padW, padH);
        ctx.fillStyle = REV_INK;
        for (let x = -padH; x < padW; x += 22) { ctx.beginPath(); ctx.moveTo(cx - padW / 2 + x, cy + padH / 2); ctx.lineTo(cx - padW / 2 + x + 11, cy + padH / 2); ctx.lineTo(cx - padW / 2 + x + 11 + padH, cy - padH / 2); ctx.lineTo(cx - padW / 2 + x + padH, cy - padH / 2); ctx.fill(); }
        ctx.fillStyle = '#273246'; ctx.fillRect(cx - padW / 2 + 9, cy - padH / 2 + 9, padW - 18, padH - 18);
        ctx.restore();
        ctx.strokeStyle = REV_INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(cx - padW / 2, cy - padH / 2, padW, padH, 10); ctx.stroke();
        ctx.fillStyle = '#7d8896';
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) { ctx.beginPath(); ctx.roundRect(cx + sx * carLength * .3 - 14, cy + sy * padH * .36 - 5, 28, 10, 4); ctx.fill(); ctx.stroke(); }

        // Exhaust puffs leave the rear (right side; the car faces left).
        const shake = still ? 0 : level * 2.6;
        const rearX = cx + carLength / 2 + 4;
        if (lab.playing && !still && Math.random() < level * .7) puffs.push(newPuff());
        if (puffs.length > 40) puffs.splice(0, puffs.length - 40);
        for (let i = puffs.length - 1; i >= 0; i--) {
            const puff = puffs[i]; puff.age += dt;
            if (puff.age > puff.life) { puffs.splice(i, 1); continue; }
            puff.x += puff.vx * dt; puff.y += puff.vy * dt; puff.r += dt * .09;
            const fade = 1 - puff.age / puff.life, size = puff.r * W;
            ctx.fillStyle = puff.bang ? `rgba(70,75,85,${fade * .6})` : `rgba(235,240,246,${fade * .45})`;
            ctx.beginPath(); ctx.arc(rearX + puff.x * W * .4, cy + puff.y * padH, size, 0, Math.PI * 2); ctx.fill();
        }
        const current = build(), visual = revBuildVisual(previewing ? { ...current, exhaust: previewing.key.startsWith('exhaust:') ? previewing.key.split(':')[1] : current.exhaust } : current);
        ctx.save();
        ctx.translate(cx + (Math.random() - .5) * shake, cy + (Math.random() - .5) * shake * .6);
        ctx.rotate(-Math.PI / 2);
        ctx.scale(scale, scale);
        revDrawCarShadow(ctx, .5);
        revDrawCar(ctx, { id: garage.car.id, style: garage.car.style || garage.car.id, color: garage.car.color, player: true, exhaust: visual.tips }, Math.min(4, Math.ceil(scale * 2)));
        flame = Math.max(0, flame - dt * 6);
        revDrawCarFx(ctx, { braking: lab.playing ? .4 : 0, flame, flameColor: visual.flame, exhaust: visual.tips, time: bayTime });
        ctx.restore();

        // Comic sound bubbles.
        for (let i = bubbles.length - 1; i >= 0; i--) {
            const bubble = bubbles[i]; bubble.age += dt;
            if (bubble.age > .9) { bubbles.splice(i, 1); continue; }
            const pop = Math.min(1, bubble.age / .12), fade = bubble.age > .6 ? 1 - (bubble.age - .6) / .3 : 1;
            ctx.save(); ctx.globalAlpha = fade;
            ctx.translate(W * bubble.x, H * bubble.y + 8 - pop * 8); ctx.rotate(bubble.tilt); ctx.scale(.6 + pop * .4, .6 + pop * .4);
            ctx.font = `${Math.round(Math.max(18, H * .075))}px "Lilita One", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const width = ctx.measureText(bubble.text).width + 26, height = H * .075 + 18;
            ctx.fillStyle = '#fff'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.roundRect(-width / 2, -height / 2, width, height, height / 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = bubble.text.startsWith('P') && bubble.text !== 'POP!' ? '#2f8cff' : '#ff3b47';
            ctx.fillText(bubble.text, 0, 2); ctx.restore();
        }
        drawScope();
    }

    // ---------- Scope ----------
    const scope = $('scope'), scopeCtx = scope.getContext('2d');
    let spectrum = null;
    function drawScope() {
        const rect = scope.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
        if (scope.width !== Math.round(rect.width * dpr)) { scope.width = Math.round(rect.width * dpr); scope.height = Math.round(rect.height * dpr); }
        const ctx = scopeCtx, W = rect.width, H = rect.height;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#081120'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(56,225,255,.1)'; ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
        if (!lab.playing) {
            ctx.fillStyle = 'rgba(169,182,202,.8)'; ctx.font = '600 13px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText('Press Hear to see the sound', W / 2, H / 2 - 10);
            return;
        }
        spectrum = spectrum || new Uint8Array(lab.analyser.frequencyBinCount);
        lab.analyser.getByteFrequencyData(spectrum);
        const bars = 48, barWidth = W / bars;
        for (let i = 0; i < bars; i++) {
            const bin = Math.floor(Math.pow(i / bars, 2) * spectrum.length * .5);
            const value = spectrum[bin] / 255;
            ctx.fillStyle = `hsla(${200 - value * 160}, 95%, 58%, .55)`;
            ctx.fillRect(i * barWidth + 1, H - value * H * .9, barWidth - 2, value * H * .9);
        }
        lab.analyser.getByteTimeDomainData(lab.samples);
        ctx.strokeStyle = '#00e676'; ctx.lineWidth = 2.5; ctx.shadowColor = '#00e676'; ctx.shadowBlur = 8;
        ctx.beginPath();
        for (let i = 0; i < lab.samples.length; i += 4) {
            const x = i / lab.samples.length * W, y = H / 2 + (lab.samples[i] - 128) / 128 * H * .45;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke(); ctx.shadowBlur = 0;
    }

    // Cards wait for the art list, so they show the generated portraits instead of first
    // requesting every archive photo.
    revCarArt.ready.then(() => { render(); if (document.fonts) document.fonts.ready.then(renderParts); });
    requestAnimationFrame(drawBay);
})();
