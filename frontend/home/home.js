// Home hub: current car, mode buttons, race setup and a live attract-mode track.
// Race setup writes the backend's own course key ('revline-course-v1', read by game.js).
(() => {
    const storage = revOpenStorage();
    const garage = new RevGarage(storage);
    const tuning = new RevTuningStore(storage);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const $ = id => document.getElementById(id);
    const build = tuning.effective(garage.car.id, garage.state.equipped.turbo);

    // ---------- Car card ----------
    $('home-car-name').textContent = garage.car.name;
    $('home-car-engine').textContent = `${garage.engine.name} · race power ×${garage.power.toFixed(2)}`;
    $('home-build').replaceChildren(...[revPart('exhaust', build.exhaust).name, revPart('turbo', build.turbo).name, revPart('intake', build.intake).name]
        .map(text => { const item = document.createElement('li'); item.textContent = text; return item; }));
    const owned = REV_CARS.filter(car => garage.owns('car', car.id)).length;
    $('garage-detail').textContent = `${owned} ${owned === 1 ? 'car' : 'cars'} · tune the sound`;

    // ---------- Controls: voice, or manual clutch + shift buttons (game.js reads the same key) ----------
    const CONTROL_HELP = {
        voice: 'Rev with your voice: a short break shifts up, one small rev shifts down.',
        manual: 'No microphone. The throttle revs by itself; hold CLUTCH and tap ▲ / ▼ to shift.'
    };
    function renderControls() {
        let mode = 'voice';
        try { mode = localStorage.getItem('revline-control-v1') === 'manual' ? 'manual' : 'voice'; } catch {}
        document.querySelectorAll('#control-chips [data-control]').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.control === mode)));
        $('control-help').textContent = CONTROL_HELP[mode];
    }
    $('control-chips').addEventListener('click', event => {
        const mode = event.target.closest('[data-control]')?.dataset.control;
        if (!mode) return;
        try { localStorage.setItem('revline-control-v1', mode); } catch {}
        renderControls();
    });
    renderControls();

    // ---------- Settings window ----------
    const settings = $('home-settings');
    $('open-settings').addEventListener('click', () => settings.showModal());
    settings.addEventListener('click', e => { if (e.target === settings) settings.close(); });

    // ---------- Profile chip ----------
    const me = new RevProfileStore(storage).public();
    $('home-me').innerHTML = `${revAvatarHTML(me, 30)}<span>${revFlag(me.country)} ${revEscape(me.name)}</span>`;

    // ---------- Career and wallet ----------
    const career = new RevCareerStore(storage, tuning);
    career.grantStarter(garage);
    const creator = $('creator-mode');
    creator.checked = career.creator;
    creator.addEventListener('change', () => {
        career.setCreator(creator.checked);
        $('setup-status').textContent = creator.checked ? 'Creator mode: every round in all 20 regions is open.' : 'Normal career: rounds open in order with stars.';
        renderCareer();
    });
    $('home-coins').textContent = garage.state.credits.toLocaleString('en-US');
    $('home-gems').textContent = career.state.gems.toLocaleString('en-US');
    $('home-stars').textContent = String(career.totalStars());
    function renderCareer() {
        if (career.creator) { $('career-detail').textContent = `Creator mode · all ${Object.keys(REV_MAPS).length} rounds open`; return; }
        const region = REV_REGIONS.find(r => career.regionStatus(r).open && revRegionMaps(r.id).some(m => !career.starsFor(m.id))) || REV_REGIONS[0];
        const next = career.currentMap(region.id);
        $('career-detail').textContent = next && !career.starsFor(next.id)
            ? `${region.name} · Round ${next.index + 1}: ${next.name}`
            : `${region.name} complete · ${career.regionStars(region.id)} ★`;
    }
    renderCareer();

    // ---------- Race setup (same schema game.js validates) ----------
    const course = { traffic: false, curves: false, race: false, distance: 1000, difficulty: 'normal', steering: 'normal' };
    const STEERING_HELP = {
        easy: 'Curves steer themselves. Each tap moves one whole lane.',
        normal: 'Curves steer themselves. Steer freely between lanes.',
        hard: 'You steer the curves. Hold or tap 2–3 times to change lane; sharp bends cost speed.'
    };
    try {
        const saved = JSON.parse(storage.getItem('revline-course-v1') || '{}');
        if (typeof saved.traffic === 'boolean') course.traffic = saved.traffic;
        if (typeof saved.curves === 'boolean') course.curves = saved.curves;
        if (typeof saved.race === 'boolean') course.race = saved.race;
        if ([1000, 3000, 5000].includes(saved.distance)) course.distance = saved.distance;
        if (Object.hasOwn(REV_DIFFICULTIES, saved.difficulty)) course.difficulty = saved.difficulty;
        if (REV_STEERING.includes(saved.steering)) course.steering = saved.steering;
    } catch {}
    function renderSetup() {
        document.querySelectorAll('[data-setting] .rl-chip').forEach(chip => {
            const setting = chip.parentElement.dataset.setting;
            chip.setAttribute('aria-pressed', String(String(course[setting]) === chip.dataset.value));
        });
        document.querySelectorAll('[data-toggle]').forEach(chip => chip.setAttribute('aria-pressed', String(course[chip.dataset.toggle])));
        $('steering-help').textContent = STEERING_HELP[course.steering];
        $('race-detail').textContent = `${course.distance / 1000} km · 3 rivals · ${course.difficulty[0].toUpperCase()}${course.difficulty.slice(1)}`;
        road.curved = course.curves;
    }
    function saveSetup() {
        try { storage.setItem('revline-course-v1', JSON.stringify(course)); $('setup-status').textContent = 'Saved for your next drive.'; }
        catch { $('setup-status').textContent = 'Device storage is unavailable; the race uses its defaults.'; }
        renderSetup();
    }
    document.querySelectorAll('[data-setting] .rl-chip').forEach(chip => chip.addEventListener('click', () => {
        const setting = chip.parentElement.dataset.setting;
        course[setting] = setting === 'distance' ? Number(chip.dataset.value) : chip.dataset.value;
        saveSetup();
    }));
    document.querySelectorAll('[data-toggle]').forEach(chip => chip.addEventListener('click', () => {
        course[chip.dataset.toggle] = !course[chip.dataset.toggle]; saveSetup();
    }));

    // ---------- Turntable ----------
    const table = $('home-turntable'), tableCtx = table.getContext('2d');
    function sizeCanvas(canvas, ctx) {
        const rect = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(rect.width * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return rect;
    }
    function drawTurntable(time) {
        const { width: W, height: H } = sizeCanvas(table, tableCtx), ctx = tableCtx;
        const radius = Math.min(W, H) * .44, angle = reduced.matches ? -Math.PI / 4 : time * .45;
        ctx.clearRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(W / 2, H / 2, radius * .2, W / 2, H / 2, radius * 1.15);
        glow.addColorStop(0, 'rgba(255,201,40,.35)'); glow.addColorStop(1, 'rgba(255,201,40,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#1d2a42'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
            const a = angle + i / 12 * Math.PI * 2;
            ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * radius * .3, H / 2 + Math.sin(a) * radius * .3); ctx.lineTo(W / 2 + Math.cos(a) * radius * .95, H / 2 + Math.sin(a) * radius * .95); ctx.stroke();
        }
        ctx.strokeStyle = '#ffc928'; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -time * 20;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, radius * .93, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        const scale = radius * 1.6 / REV_CAR_H;
        ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(angle); ctx.scale(scale, scale);
        revDrawCarShadow(ctx, .5);
        revDrawCar(ctx, { id: garage.car.id, style: garage.car.style || garage.car.id, color: garage.car.color, player: true, exhaust: revBuildVisual(build).tips }, Math.min(4, Math.ceil(scale * 2)));
        ctx.restore();
    }

    // ---------- Attract-mode track ----------
    const road = new RevRoadScene();
    const renderer = new RevTrackRenderer($('home-bg'), {
        reducedMotion: () => reduced.matches, anchor: .62,
        scale: (width, height) => Math.max(height / REV_WORLD.height, width / 1150)
    });
    window.addEventListener('resize', () => renderer.resize());
    const ROAD_PERIOD = Math.PI * 400 * 2 / .45, CRUISE = 1150;   // px per second ≈ 100 km/h
    const rivals = [{ lane: 0, color: '#65d5e0', name: 'Nova', phase: 0 }, { lane: 3, color: '#ff9e52', name: 'Blaze', phase: 2 }];
    let scroll = 0, time = 0, last = 0;
    renderSetup();
    function frame(now) {
        requestAnimationFrame(frame);
        const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now;
        const moving = !reduced.matches;
        if (moving) { time += dt; scroll += CRUISE * dt; road.distance = (road.distance + CRUISE * dt) % ROAD_PERIOD; }
        const carY = 580, weave = Math.sin(time * .55) * 62;
        const x = REV_WORLD.roadLeft + REV_WORLD.laneWidth * 1.5 + 21 + weave;
        const angle = road.headingAt(carY + 43) + Math.cos(time * .55) * .09;
        const vehicles = rivals.map((rival, i) => {
            const y = carY - 210 - i * 160 + Math.sin(time * .3 + rival.phase) * 60;
            const rx = REV_WORLD.roadLeft + rival.lane * REV_WORLD.laneWidth + (REV_WORLD.laneWidth - 46) / 2 + road.offsetAt(y + 43);
            return { x: rx, y, angle: road.headingAt(y + 43), name: rival.name, color: rival.color, art: { style: 'rival', color: rival.color, number: i + 2 } };
        });
        renderer.render({
            road, scroll: scroll * .45, dt: moving ? dt : 0, speedRatio: .55,   // ground moves with the curve (see race-ui.js)
            player: { x: x + road.offsetAt(carY + 43), y: carY, h: REV_CAR_H, angle, speedKmh: 100,
                art: { id: garage.car.id, style: garage.car.style || garage.car.id, color: garage.car.color, player: true, exhaust: revBuildVisual(build).tips } },
            vehicles, skidMarks: [], tireSmoke: [], exhaust: [], startY: null, finishY: null, offRoad: false, offRoadSide: 1, limiting: false
        }, dt);
        drawTurntable(time);
    }
    revCarArt.ready.then(() => requestAnimationFrame(frame));
})();
