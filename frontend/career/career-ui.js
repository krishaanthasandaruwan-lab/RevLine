// Career map screen: 20 regions (▲/▼ or swipe), each a one-screen snake road of 20 rounds
// with stars under every round, a painted region scene, and the round sheet.
(() => {
    const storage = revOpenStorage();
    const garage = new RevGarage(storage);
    const tuning = new RevTuningStore(storage);
    const career = new RevCareerStore(storage, tuning);
    const $ = id => document.getElementById(id);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const DIFFICULTY_KEY = 'revline-career-difficulty';
    const COLS = 4, ROWS = 5;
    const starSvg = (on, size = '') => `<svg class="star-svg ${on ? 'on' : ''} ${size}" viewBox="0 0 24 24" aria-hidden="true"><use href="#star"/></svg>`;
    const regionComplete = region => revRegionMaps(region.id).every(map => career.starsFor(map.id) > 0);
    let regionIndex = REV_REGIONS.findIndex(r => career.regionStatus(r).open && !regionComplete(r));
    if (regionIndex < 0) regionIndex = Math.max(0, REV_REGIONS.findLastIndex(r => career.regionStatus(r).open));
    let difficulty = 'normal';
    try { difficulty = ['easy', 'normal', 'hard'].includes(localStorage.getItem(DIFFICULTY_KEY)) ? localStorage.getItem(DIFFICULTY_KEY) : 'normal'; } catch {}
    const playable = REV_REGIONS.filter(r => r.developed).length;

    const starter = career.grantStarter(garage);

    function renderWallet() {
        $('w-coins').textContent = garage.state.credits.toLocaleString('en-US');
        $('w-gems').textContent = career.state.gems.toLocaleString('en-US');
        $('w-stars').textContent = String(career.totalStars());
    }

    // Snake: row 0 (bottom) runs left → right, row 1 right → left, … ending top-left/right.
    function layout(width, height) {
        const node = Math.max(38, Math.min(58, Math.min(width / COLS, height / ROWS) * 0.5));
        const padX = node / 2 + 18, padTop = node / 2 + 16, padBottom = node / 2 + 28;
        const points = Array.from({ length: COLS * ROWS }, (_, i) => {
            const row = Math.floor(i / COLS), step = i % COLS, col = row % 2 ? COLS - 1 - step : step;
            const x = padX + col * (width - padX * 2) / (COLS - 1);
            const y = height - padBottom - row * (height - padTop - padBottom) / (ROWS - 1) + Math.sin(col * 1.7 + row * 2.1) * node * 0.18;
            return { x, y };
        });
        return { node, points };
    }

    // The road between rounds: straight-ish along a row, a U-turn between rows.
    function segment(a, b, node) {
        if (Math.abs(a.y - b.y) < node) return `C ${a.x + (b.x - a.x) * 0.4} ${a.y} ${b.x - (b.x - a.x) * 0.4} ${b.y} ${b.x} ${b.y}`;
        const out = (a.x < 120 ? -1 : 1) * node * 1.1;
        return `C ${a.x + out} ${a.y} ${b.x + out} ${b.y} ${b.x} ${b.y}`;
    }

    function renderRegion() {
        const region = REV_REGIONS[regionIndex], status = career.regionStatus(region), maps = revRegionMaps(region.id);
        $('region-number').textContent = region.developed ? `Region ${regionIndex + 1} / ${playable}` : 'Future update';
        $('region-name').textContent = region.name;
        const stars = career.regionStars(region.id), total = 60;
        $('region-stars').textContent = `${stars} / ${total}`;
        $('region-bar').style.transform = `scaleX(${stars / total})`;
        $('region-down').disabled = regionIndex === 0;
        $('region-up').disabled = regionIndex === REV_REGIONS.length - 1;
        document.body.dataset.theme = region.theme;
        $('creator-badge').hidden = !career.creator;
        const board = $('board');
        board.classList.toggle('is-locked', !status.open);
        $('region-lock').hidden = status.open;
        if (!status.open) {
            $('lock-title').textContent = status.reason === 'coming' ? 'Coming in a future update' : `Collect ${status.need} stars`;
            $('lock-text').textContent = status.reason === 'coming'
                ? `${region.name}: ${region.blurb} Finish the first ${playable} regions while it's being built.`
                : `Win ${status.need} stars in ${status.from} to open ${region.name} (you have ${status.have}). ${region.blurb}`;
        }
        drawBoard(region, maps, status.open);
    }

    function drawBoard(region, maps, open) {
        const board = $('board'), width = board.clientWidth, height = board.clientHeight;
        if (!width || !height) return;
        const { node, points } = layout(width, height);
        board.style.setProperty('--node', `${node}px`);

        // Background: generated region art when imported, otherwise the painted scene.
        const canvas = $('board-art'), ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
        const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const art = revCarArt.props[`region-${region.id}`];
        if (art) {
            const scale = Math.max(width / art.naturalWidth, height / art.naturalHeight);
            ctx.drawImage(art, (width - art.naturalWidth * scale) / 2, (height - art.naturalHeight * scale) / 2, art.naturalWidth * scale, art.naturalHeight * scale);
        } else revPaintRegionScene(ctx, width, height, region.theme, region.id, points.map(p => ({ ...p, r: node * 0.75 })));

        // Road, then the part already driven in yellow.
        const road = $('board-road');
        road.setAttribute('viewBox', `0 0 ${width} ${height}`);
        const done = maps.length ? maps.findIndex(map => !career.starsFor(map.id)) : 0;
        const reach = done < 0 ? points.length - 1 : done;
        let d = `M ${points[0].x} ${points[0].y}`, driven = d;
        points.forEach((p, i) => { if (!i) return; const piece = segment(points[i - 1], p, node); d += ` ${piece}`; if (i <= reach) driven += ` ${piece}`; });
        const startY = points[0].y + node * 0.95;
        road.innerHTML = `
            <path d="M ${points[0].x} ${startY} L ${points[0].x} ${points[0].y}" class="road-edge" style="stroke-width:${node * 0.62}px"/>
            <path d="${d}" class="road-edge" style="stroke-width:${node * 0.62}px"/>
            <path d="${d}" class="road-top" style="stroke-width:${node * 0.5}px"/>
            <path d="${driven}" class="road-driven" style="stroke-width:${node * 0.5}px"/>
            <path d="${d}" class="road-dash"/>`;

        // Rounds.
        const holder = $('board-nodes');
        holder.replaceChildren();
        const current = open ? career.currentMap(region.id) : null;
        points.forEach((p, i) => {
            const map = maps[i];
            const isOpen = Boolean(open && map && career.isMapOpen(map)), stars = map ? career.starsFor(map.id) : 0;
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'node';
            button.style.left = `${p.x}px`; button.style.top = `${p.y}px`;
            button.dataset.state = !isOpen ? 'locked' : map === current && !stars ? 'current' : stars ? 'done' : 'open';
            if (i === points.length - 1) button.dataset.final = 'true';
            const kind = map?.type === 'drift' ? 'drift' : map?.hills.length ? 'hill' : map?.obstacles.length ? 'hazard' : map && map.surface !== 'tarmac' ? 'rough' : '';
            button.innerHTML = `<span class="node-face">${isOpen ? (i === points.length - 1 ? '<svg class="node-trophy" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M10 14h4l1 4H9z M7 20h10"/></svg>' : i + 1) : '<svg class="node-lock" aria-hidden="true"><use href="#lock"/></svg>'}</span>
                ${kind && isOpen ? `<span class="node-kind" data-kind="${kind}" aria-hidden="true"></span>` : ''}
                <span class="node-stars" aria-hidden="true">${[1, 2, 3].map(n => starSvg(n <= stars)).join('')}</span>`;
            button.setAttribute('aria-label', map ? `Round ${i + 1}, ${map.name}${map.type === 'drift' ? ', drift' : ''}, ${isOpen ? `${stars} of 3 stars` : 'locked'}` : `Round ${i + 1}, locked`);
            button.disabled = !isOpen;
            if (isOpen) button.addEventListener('click', () => openSheet(map));
            holder.append(button);
        });
        // Your car drives up the road toward the next round to play.
        if (current) {
            const target = points[current.index];
            const from = current.index ? points[current.index - 1] : { x: target.x + node * 2.2, y: target.y };
            const share = Math.min(0.62, 1 - node * 1.05 / Math.max(1, Math.hypot(target.x - from.x, target.y - from.y)));
            const at = { x: from.x + (target.x - from.x) * share, y: from.y + (target.y - from.y) * share }, next = target;
            const marker = document.createElement('canvas'); marker.className = 'car-marker';
            const size = node * 0.8; marker.width = size * 2 * ratio; marker.height = size * 2 * ratio;
            marker.style.width = `${size * 2}px`; marker.style.height = `${size * 2}px`;
            marker.style.left = `${at.x}px`; marker.style.top = `${at.y}px`;
            const c = marker.getContext('2d'); c.setTransform(ratio, 0, 0, ratio, 0, 0); c.translate(size, size);
            c.rotate(Math.atan2(next.y - at.y, next.x - at.x) + Math.PI / 2 || Math.PI / 2);
            revDrawCar(c, { id: garage.car.id, style: garage.car.style || garage.car.id, color: garage.car.color, player: true }, Math.ceil(size / 40 * ratio));
            holder.append(marker);
        }
    }

    // ---------- Round sheet ----------
    function drawSheetArt(map) {
        const canvas = $('sheet-canvas'), box = $('sheet-art'), ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = box.clientWidth || 440, height = box.clientHeight || 120;
        canvas.width = width * ratio; canvas.height = height * ratio;
        const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        const art = revCarArt.props[`map-${map.id}`] || (map.index % 2 && revCarArt.props[`banner-${map.theme}-2`]) || revCarArt.props[`banner-${map.theme}`];
        if (art) {
            const scale = Math.max(width / art.naturalWidth, height / art.naturalHeight);
            ctx.drawImage(art, (width - art.naturalWidth * scale) / 2, (height - art.naturalHeight * scale) / 2, art.naturalWidth * scale, art.naturalHeight * scale);
        } else {
            revPaintRegionScene(ctx, width, height, map.theme, map.id, [{ x: width / 2, y: height / 2, r: 40 }]);
            ctx.lineCap = 'round';
            for (const [w, color] of [[34, '#0f1724'], [28, map.surface === 'tarmac' ? '#3c4049' : map.surface === 'snow' ? '#c3d0dd' : '#86613a']]) {
                ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-10, height * 0.7);
                ctx.bezierCurveTo(width * 0.3, height * (0.7 - map.curves * 0.5), width * 0.6, height * (0.3 + map.curves * 0.5), width + 10, height * 0.35); ctx.stroke();
            }
        }
    }
    let sheetMap = null;
    const titleCase = text => text[0].toUpperCase() + text.slice(1);
    function openSheet(map) {
        sheetMap = map;
        const region = REV_REGIONS.find(r => r.id === map.region);
        $('sheet-kicker').textContent = `${region.name} · Round ${map.index + 1} · ${map.type === 'drift' ? 'Drift' : 'Race'}`;
        $('sheet-title').textContent = map.name;
        drawSheetArt(map);
        $('sheet-badge').textContent = map.type === 'drift' ? 'DRIFT' : map.surface !== 'tarmac' ? map.surface.toUpperCase() : `${map.distance / 1000} KM`;
        const stars = career.starsFor(map.id);
        $('sheet-stars').innerHTML = [1, 2, 3].map(n => starSvg(n <= stars, 'big')).join('');
        const facts = [`${map.distance / 1000} km`, map.curves >= 1 ? 'Sharp bends' : map.curves >= 0.6 ? 'Bends' : map.curves ? 'Gentle bends' : 'Straight',
            map.traffic ? 'Traffic' : 'No traffic', titleCase(map.surface),
            map.hills.length ? `${map.hills.length} hill${map.hills.length > 1 ? 's' : ''} · gear ${Math.min(...map.hills.map(h => h.maxGear))} or lower` : '',
            map.obstacles.length ? `${map.obstacles.length} obstacles` : ''].filter(Boolean);
        $('sheet-facts').replaceChildren(...facts.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
        const carClass = revCarClass(garage.car.id), suited = map.recommended === 'any' || map.recommended === carClass;
        $('sheet-class').textContent = map.recommended === 'any'
            ? `Any car. Yours: ${garage.car.name} (${REV_CAR_CLASSES[carClass]}).`
            : `Recommended: ${REV_CAR_CLASSES[map.recommended]} car. Yours: ${garage.car.name} (${REV_CAR_CLASSES[carClass]})${suited ? ' ✓' : `. Not suited: rivals are ${Math.round((REV_UNSUITED_PACE - 1) * 100)}% faster.`}`;
        $('sheet-class').dataset.suited = String(suited);
        renderDifficulty();
        const best = career.state.best[map.id];
        $('sheet-best').textContent = best ? `Your best: ${best.points.toLocaleString('en-US')} points${best.place ? ` · finished ${best.place}${['st', 'nd', 'rd'][best.place - 1] || 'th'}` : ''}` : 'Not raced yet.';
        $('map-sheet').showModal();
    }
    function renderDifficulty() {
        document.querySelectorAll('#sheet-difficulty .rl-chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.value === difficulty)));
        const map = sheetMap, win = revRaceCoins({ place: 1, finished: true, difficulty, mapIndex: map.index, career: true });
        $('sheet-rules').textContent = map.type === 'drift'
            ? `Drift points: ${map.driftTarget} for 1★, ${map.driftTarget * 2} for 2★, ${map.driftTarget * 3} for 3★ (up to ${REV_MAX_STARS[difficulty]}★ on ${difficulty}). Coins grow with your drift points.`
            : `1st place: ${REV_MAX_STARS[difficulty]}★ and ${win.toLocaleString('en-US')} coins. 2nd place: one star less. First 3★ on a round: +3 gems.`;
        $('sheet-race').href = `frontend/race/index.html?map=${map.id}&difficulty=${difficulty}`;
    }
    document.querySelectorAll('#sheet-difficulty .rl-chip').forEach(chip => chip.addEventListener('click', () => {
        difficulty = chip.dataset.value;
        try { localStorage.setItem(DIFFICULTY_KEY, difficulty); } catch {}
        renderDifficulty();
    }));

    // ---------- Gems ----------
    $('w-gems-button').addEventListener('click', () => {
        $('gem-packs').replaceChildren(...REV_GEM_PACKS.map(pack => {
            const li = document.createElement('li');
            li.innerHTML = `<i class="gem" aria-hidden="true"></i><b>${pack.gems}</b><span>${pack.label}</span><button type="button" class="rl-btn rl-btn--small rl-btn--dark" disabled>Soon</button>`;
            return li;
        }));
        $('gem-sheet').showModal();
    });

    // ---------- Region change: arrows, swipe, keys ----------
    function go(step) {
        const next = regionIndex + step;
        if (next < 0 || next >= REV_REGIONS.length) return;
        regionIndex = next;
        const board = $('board');
        board.dataset.slide = step > 0 ? 'up' : 'down';
        renderRegion();
        if (!reduced.matches) { board.classList.remove('slide'); void board.offsetWidth; board.classList.add('slide'); }
    }
    $('region-up').addEventListener('click', () => go(1));
    $('region-down').addEventListener('click', () => go(-1));
    let touchY = null;
    $('board').addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
    $('board').addEventListener('touchend', e => {
        if (touchY === null) return;
        const dy = e.changedTouches[0].clientY - touchY; touchY = null;
        if (Math.abs(dy) > 70) go(dy < 0 ? 1 : -1);
    });
    document.addEventListener('keydown', e => {
        if (document.querySelector('dialog[open]')) return;
        if (e.key === 'ArrowUp' || e.key === 'PageUp') go(1);
        if (e.key === 'ArrowDown' || e.key === 'PageDown') go(-1);
    });
    for (const sheet of document.querySelectorAll('dialog.sheet')) sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
    let resizeTimer = 0;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderRegion, 120); });

    renderWallet(); renderRegion();
    revCarArt.ready.then(renderRegion);
    // Region and banner art load on demand; redraw when they arrive.
    document.addEventListener('revline:art', () => { renderRegion(); if ($('map-sheet').open && sheetMap) drawSheetArt(sheetMap); });
    if (starter) {
        const toast = document.createElement('output'); toast.className = 'c-toast'; toast.textContent = `Welcome bonus: +${starter.toLocaleString('en-US')} coins`;
        document.body.append(toast); setTimeout(() => toast.remove(), 3500);
    }
    if (reduced.matches) document.body.classList.add('still');
})();
