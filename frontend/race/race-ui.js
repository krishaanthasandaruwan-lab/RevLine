// Race page glue. game.js stays the single owner of input, physics, rivals and rules;
// this file swaps its Canvas drawing for the cartoon renderer + HUD and adds the lobby.
(() => {
    const params = new URLSearchParams(location.search);
    // Career round (from frontend/career): ?map=r1m5&difficulty=hard. Otherwise a quick race / free drive.
    const careerMap = REV_MAPS[params.get('map')] || null;
    const careerDifficulty = ['easy', 'normal', 'hard'].includes(params.get('difficulty')) ? params.get('difficulty') : 'normal';
    // Multiplayer round (?mp=1, mp-race.js): the host's course, other players as rivals.
    const mp = typeof revMpRace !== 'undefined' ? revMpRace : null;
    const courseMap = careerMap || mp?.course || null;
    if (mp) document.body.classList.add('mp-race');
    const racing = courseMap ? true : params.get('mode') !== 'free';
    const ROAD_PERIOD = Math.PI * 400 * 2 / .45;     // RevRoadScene distance wrap (game.js)
    const PX_PER_METER = 20 / 197 * 1.9 * 60 * 3.6;  // game.js scroll per metre travelled
    // RevRoadScene.offsetAt() moves the curve at 0.45 × the paint scroll. Everything drawn on the
    // ground uses the curve's rate, so bends, curbs, tyre walls and scenery form one fixed map.
    const CURVE_RATE = .45, GROUND_PX_PER_METER = PX_PER_METER * CURVE_RATE;

    // The backend calls these every frame; drawing now happens in frame() below.
    window.draw = () => {};
    window.drawBlueTachometer = () => {};

    const tuning = new RevTuningStore(gameStorage);
    const career = new RevCareerStore(gameStorage, tuning);
    const careerRegion = careerMap ? REV_REGIONS.find(r => r.id === careerMap.region) : null;
    const carClass = () => revCarClass(garage.car.id);
    const suited = () => !careerMap || careerMap.recommended === 'any' || careerMap.recommended === carClass();
    const stage = document.getElementById('stage');
    const renderer = new RevTrackRenderer(document.getElementById('race-view'), { reducedMotion: () => motionPreference.matches, theme: courseMap?.theme || 'grass' });
    const hud = new RevRaceHud();
    new ResizeObserver(() => renderer.resize()).observe(stage);

    const playerBuild = () => tuning.effective(garage.car.id, garage.state.equipped.turbo);

    // ---------- Lobby ----------
    function courseChips() {
        return [racing ? `${raceLength / 1000} km` : 'Free roam', racing ? '3 rivals' : '', road.curved ? 'Curves' : 'Straight',
            trafficEnabled ? 'Traffic' : 'No traffic', difficulty[0].toUpperCase() + difficulty.slice(1), `${road.assist[0].toUpperCase()}${road.assist.slice(1)} steering`].filter(Boolean);
    }
    function buildSummary() {
        const build = playerBuild();
        return [garage.engine.name, revPart('exhaust', build.exhaust).name, revPart('turbo', build.turbo).name].join(' · ');
    }
    function careerFacts() {
        const map = careerMap;
        return [`${map.distance / 1000} km`, map.type === 'drift' ? 'Drift challenge' : '3 rivals', map.curves ? (map.curves >= 1 ? 'Sharp bends' : 'Bends') : 'Straight',
            map.traffic ? 'Traffic' : '', map.surface !== 'tarmac' ? map.surface[0].toUpperCase() + map.surface.slice(1) : '',
            map.hills.length ? `${map.hills.length} hill climb${map.hills.length > 1 ? 's' : ''}` : '', map.obstacles.length ? `${map.obstacles.length} obstacles` : '',
            `${careerDifficulty[0].toUpperCase()}${careerDifficulty.slice(1)} · up to ${REV_MAX_STARS[careerDifficulty]}★`].filter(Boolean);
    }
    function careerGoal() {
        const map = careerMap;
        const goal = map.type === 'drift' ? `Drift ${map.driftTarget} points for each star.` : `Win for ${REV_MAX_STARS[careerDifficulty]}★; 2nd place earns one star less.`;
        const fit = suited() ? '' : ` Your ${REV_CAR_CLASSES[carClass()]} car is not suited: rivals are ${Math.round((REV_UNSUITED_PACE - 1) * 100)}% faster. Recommended: ${REV_CAR_CLASSES[map.recommended]}.`;
        return goal + fit;
    }
    function mpFacts() {
        const c = courseMap, s = mp.settings;
        return [`${c.distance / 1000} km`, `${mp.members().length} players`, c.curves ? (c.curves >= 1 ? 'Sharp bends' : 'Bends') : 'Straight',
            c.traffic ? 'Traffic' : '', c.surface !== 'tarmac' ? c.surface[0].toUpperCase() + c.surface.slice(1) : '',
            c.hills.length ? `${c.hills.length} hill${c.hills.length > 1 ? 's' : ''}` : '', c.obstacles.length ? `${c.obstacles.length} obstacles` : '',
            `AI ${s.difficulty}`].filter(Boolean);
    }
    function mpPlayers() {
        return `<ul class="mp-grid" aria-label="Players">${mp.members().map(m => `<li>${revAvatarHTML(m.profile, 34)}<span>${revFlag(m.profile.country)} ${revEscape(m.profile.name || 'Racer')}</span>${m.id === mp.lobby.state.hostId ? '<b>Host</b>' : ''}</li>`).join('')}</ul>`;
    }
    // Start button for the chosen controls, plus a Voice / Manual switch right in the lobby.
    const MIC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    const PEDAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="3"/><path d="M9 9h6M9 13h6"/></svg>';
    function startButton(word) {
        const manual = controlMode === 'manual';
        return `<div class="control-switch" role="group" aria-label="Controls">
                <button type="button" class="rl-chip" aria-pressed="${!manual}" onclick="setControlMode('voice')">Voice</button>
                <button type="button" class="rl-chip" aria-pressed="${manual}" onclick="setControlMode('manual')">Manual</button></div>
            <button class="rl-btn rl-btn--yellow lobby-start" type="button" onclick="startDriving()">${manual ? PEDAL_ICON : MIC_ICON}<span>${word} · ${manual ? 'manual' : 'microphone'}</span></button>
            ${manual ? '<p class="lobby-help">The throttle revs by itself. Hold <b>CLUTCH</b> (left) and tap <b>▲ / ▼</b> (right) to shift. Clutch + ▲ selects 1st.</p>' : ''}`;
    }
    // Switching controls redraws the lobby (if it is showing) with the right Start button.
    window.addEventListener('revline:control', () => { if (document.querySelector('#overlay .lobby')) showLobby(); });
    // A shift without the clutch grinds.
    window.addEventListener('revline:grind', () => sfx.clunk());

    function showLobby() {
        const overlay = document.getElementById('overlay');
        if (mp) {
            overlay.innerHTML = `
            <div class="lobby rl-panel">
                <p class="lobby-kicker">Multiplayer · Round ${mp.round}</p>
                <h1 class="rl-title">${revEscape(courseMap.name)}</h1>
                ${mpPlayers()}
                <ul class="lobby-chips" aria-label="Course">${mpFacts().map(chip => `<li>${chip}</li>`).join('')}</ul>
                ${startButton('Ready')}
                <p class="input-start-status" data-input-status role="status" aria-live="polite" aria-atomic="true">${controlMode === 'manual' ? '' : 'Microphone access is needed before you can race.'}</p>
                <nav class="lobby-links" aria-label="More">
                    <button class="rl-btn rl-btn--dark rl-btn--small" type="button" onclick="openSettings()">Settings</button>
                    <a class="rl-btn rl-btn--dark rl-btn--small" href="frontend/multiplayer/index.html">Lobby</a>
                </nav>
                <p class="lobby-help">Everyone counts down together once all players are ready. Other players' cars never collide with yours.</p>
            </div>`;
            overlay.style.display = 'flex';
            overlay.querySelector('.lobby-start').focus({ preventScroll: true });
            return;
        }
        const kicker = careerMap ? `${careerRegion.name} · Round ${careerMap.index + 1}` : racing ? 'Race' : 'Free drive';
        const title = careerMap ? careerMap.name : racing ? 'Ready to race?' : 'Open road';
        overlay.innerHTML = `
            <div class="lobby rl-panel">
                <p class="lobby-kicker">${kicker}</p>
                <h1 class="rl-title">${title}</h1>
                ${careerMap ? `<p class="lobby-goal">${careerGoal()}</p>` : ''}
                <div class="lobby-car"><canvas id="lobby-car" width="240" height="132" aria-hidden="true"></canvas>
                    <div><strong id="lobby-car-name"></strong><span id="lobby-build"></span></div></div>
                <ul class="lobby-chips" aria-label="Course">${(careerMap ? careerFacts() : courseChips()).map(chip => `<li>${chip}</li>`).join('')}</ul>
                ${startButton('Start')}
                <p class="input-start-status" data-input-status role="status" aria-live="polite" aria-atomic="true">${controlMode === 'manual' ? '' : 'Microphone access is needed for voice driving.'}</p>
                ${controlMode === 'manual' ? '' : '<button class="rl-btn rl-btn--dark rl-btn--small" type="button" onclick="playReference(true)">Use sound test recording</button>'}
                <nav class="lobby-links" aria-label="More">
                    <button class="rl-btn rl-btn--dark rl-btn--small" type="button" onclick="openSettings()">Settings</button>
                    <a class="rl-btn rl-btn--orange rl-btn--small" href="frontend/garage/index.html">Garage</a>
                    <a class="rl-btn rl-btn--dark rl-btn--small" href="${careerMap ? 'frontend/career/index.html' : 'frontend/index.html'}">${careerMap ? 'Map' : 'Home'}</a>
                </nav>
                ${controlMode === 'manual' ? '' : '<p class="lobby-help">Rev with your voice to accelerate. A short sound cut shifts up. Tap <b>N ↔ D</b> to drive. One small rev shifts down.</p>'}
            </div>`;
        overlay.style.display = 'flex';
        renderLobbyCar();
        overlay.querySelector('.lobby-start').focus({ preventScroll: true });
        playIntro();
    }
    // A short region / round intro video plays once when the round opens (not after every
    // "Race again"); tap Skip or anywhere on it to go straight to the lobby.
    let introPlayed = false;
    function playIntro() {
        const source = careerMap && (revCarArt.videos[careerMap.id] || revCarArt.videos[careerMap.region]);
        if (!source || introPlayed || document.getElementById('intro-video')) return;
        introPlayed = true;
        const frame = document.createElement('div'); frame.className = 'intro'; frame.id = 'intro-video';
        frame.innerHTML = `<video src="${source}" playsinline autoplay muted></video><button type="button" class="rl-btn rl-btn--small rl-btn--dark">Skip</button>`;
        const close = () => frame.remove();
        frame.addEventListener('click', close);
        frame.querySelector('video').addEventListener('ended', close);
        frame.querySelector('video').addEventListener('error', close);
        document.getElementById('stage').append(frame);
    }
    revCarArt.ready.then(() => { if (document.querySelector('.lobby')) playIntro(); });
    function renderLobbyCar() {
        const canvas = document.getElementById('lobby-car');
        if (!canvas) return;
        document.getElementById('lobby-car-name').textContent = garage.car.name;
        document.getElementById('lobby-build').textContent = buildSummary();
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(Math.PI / 2); ctx.scale(2.1, 2.1);
        revDrawCarShadow(ctx, .45);
        revDrawCar(ctx, { id: garage.car.id, style: garage.car.style || garage.car.id, color: garage.car.color, player: true, exhaust: revBuildVisual(playerBuild()).tips }, 3);
        ctx.restore();
    }
    document.addEventListener('revline:garage', renderLobbyCar);
    revCarArt.ready.then(renderLobbyCar);
    document.addEventListener('revline:art', renderLobbyCar);

    // ---------- Phone sound effects ----------
    const sfx = new RevRaceSfx(gameStorage, () => voiceInput.context);
    window.revlineSfx = sfx;   // for checks (iOS self-test, browser tests)
    const unlockSound = () => sfx.unlock();
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, unlockSound, { capture: true });
    const sfxToggle = document.getElementById('sfx-enabled'), sfxVolume = document.getElementById('sfx-volume');
    sfxToggle.checked = sfx.enabled; sfxVolume.value = String(Math.round(sfx.volume * 100));
    sfxToggle.addEventListener('change', () => sfx.setEnabled(sfxToggle.checked));
    sfxVolume.addEventListener('input', () => sfx.setVolume(Number(sfxVolume.value) / 100));
    // The selected car's own engine sound (engine-sound.js).
    const engineToggle = document.getElementById('engine-enabled'), engineVolume = document.getElementById('engine-volume');
    engineToggle.checked = sfx.engineEnabled; engineVolume.value = String(Math.round(sfx.engineVolume * 100));
    engineToggle.addEventListener('change', () => sfx.setEngineEnabled(engineToggle.checked));
    engineVolume.addEventListener('input', () => sfx.setEngineVolume(Number(engineVolume.value) / 100));
    const syncCar = () => sfx.setCar(garage.car.id, garage.engine.id);
    syncCar(); document.addEventListener('revline:garage', syncCar);

    // Echo cancellation keeps the race sounds out of the microphone (voice-input.js).
    const echoToggle = document.getElementById('echo-cancel');
    try { echoToggle.checked = localStorage.getItem('revline-echo-v1') !== 'off'; } catch {}
    voiceInput.echoCancellation = echoToggle.checked;
    sfx.setEngineAllowed(echoToggle.checked);
    echoToggle.addEventListener('change', () => {
        voiceInput.echoCancellation = echoToggle.checked;
        sfx.setEngineAllowed(echoToggle.checked);
        try { localStorage.setItem('revline-echo-v1', echoToggle.checked ? 'on' : 'off'); } catch {}
        if (voiceInput.mode === 'mic') useMicrophone();   // reopen the microphone with the new setting
    });

    // ---------- 3-2-1-GO before every new run ----------
    // resetGame() marks a new run; the next start (startLoop → hideGameMenu) counts down first,
    // holding the simulation (and a playing sound-test recording) until GO.
    const countdown = document.getElementById('countdown');
    let countdownNeeded = true, counting = false;
    let driftPoints = 0, bumps = 0, rewarded = false;
    const resetRun = window.resetGame;
    window.resetGame = function () {
        resetRun(); countdownNeeded = true;
        driftPoints = 0; bumps = 0; rewarded = false;
        if (mp) mp.assignRivals(race);
        if (careerMap) {
            // The round's own pace, and faster rivals for a car that does not suit the round.
            const factor = careerMap.pace * (suited() ? 1 : REV_UNSUITED_PACE);
            for (const rival of race.rivals) rival.pace *= factor;
        }
    };
    const startDriving = window.hideGameMenu;
    window.hideGameMenu = function () {
        startDriving();
        if (counting) { settingsPaused = true; return; }
        if (!countdownNeeded) return;
        // Multiplayer: hold until every player is ready, then all phones count down together.
        if (mp && !mp.go) {
            settingsPaused = true; countdown.hidden = false; countdown.dataset.step = 'wait'; countdown.textContent = mp.waitingText();
            const waiting = setInterval(() => { if (!mp.go) countdown.textContent = mp.waitingText(); }, 500);
            mp.ready(() => { clearInterval(waiting); countdown.hidden = true; window.hideGameMenu(); });
            return;
        }
        countdownNeeded = false; counting = true; settingsPaused = true;
        const recording = voiceInput.mode === 'reference' && !referenceVideo.paused;
        if (recording) referenceVideo.pause();
        let step = 3;
        const tick = () => {
            if (isGameOver || gameMenuOpen) { counting = false; countdown.hidden = true; return; }
            settingsPaused = true;
            countdown.hidden = false;
            countdown.dataset.step = String(step);
            countdown.textContent = step ? String(step) : 'GO!';
            countdown.style.animation = 'none'; void countdown.offsetWidth; countdown.style.animation = '';
            sfx.beep(step === 0);
            if (step > 0) { step--; setTimeout(tick, 800); return; }
            setTimeout(() => {
                counting = false; settingsPaused = settingsDialog.open; countdown.hidden = true;
                if (mp) race.started = true;   // the clock runs from GO for every player
                if (recording && voiceInput.mode === 'reference') referenceVideo.play().catch(() => {});
            }, 450);
        };
        tick();
    };

    // ---------- Result screen polish (game.js writes the result markup) ----------
    const overlay = document.getElementById('overlay');
    new MutationObserver(() => {
        if (overlay.querySelector('.lobby') || overlay.querySelector('.result-extras')) return;
        const title = overlay.querySelector('h1');
        if (!title) return;
        document.body.dataset.raceState = 'results';
        const outcome = /Engine/.test(title.textContent) ? 'engine' : /Accident/.test(title.textContent) ? 'crash' : 'finish';
        overlay.dataset.outcome = outcome;
        title.classList.add('rl-title');
        if (outcome !== 'finish') {
            const badge = document.createElement('div');
            badge.className = 'result-badge'; badge.dataset.outcome = outcome;
            badge.innerHTML = outcome === 'engine'
                ? '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="12" y="26" width="34" height="24" rx="4"/><path d="M18 26v-6h22v6M46 32h8v12h-8M12 34H6v8h6"/><path class="smoke" d="M22 18c-4-4 2-7-2-11M32 16c-4-4 2-7-2-11M42 18c-4-4 2-7-2-11"/></svg><span>Engine blown</span>'
                : '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4l6 16 16-8-8 16 16 6-16 6 8 16-16-8-6 16-6-16-16 8 8-16-16-6 16-6-8-16 16 8z"/></svg><span>Accident</span>';
            title.before(badge);
        }
        overlay.querySelectorAll('.results-table tbody tr').forEach(row => {
            if (row.cells[1]?.textContent === 'You') row.classList.add('is-player');
        });
        const place = racing && outcome === 'finish' ? race.position : 0;
        const extras = document.createElement('div');
        extras.className = 'result-extras';
        if (place) {
            const medal = document.createElement('div');
            medal.className = 'result-medal'; medal.dataset.place = String(place);
            medal.textContent = ['', '1st', '2nd', '3rd', '4th'][place];
            title.before(medal);
        }
        if (place === 1 && !motionPreference.matches) {
            const confetti = document.createElement('div'); confetti.className = 'confetti'; confetti.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < 36; i++) {
                const piece = document.createElement('i');
                piece.style.setProperty('--x', `${Math.random() * 100}%`); piece.style.setProperty('--d', `${Math.random() * .8}s`);
                piece.style.setProperty('--c', ['#ffc928', '#ff3b47', '#2f8cff', '#00e676', '#ff8a1f'][i % 5]);
                confetti.append(piece);
            }
            overlay.append(confetti);
        }
        extras.innerHTML = '<a class="rl-btn rl-btn--orange rl-btn--small" href="frontend/garage/index.html">Garage</a><a class="rl-btn rl-btn--dark rl-btn--small" href="frontend/index.html">Home</a>';
        const restart = document.getElementById('restart-btn');
        if (restart) { restart.classList.add('rl-btn', 'rl-btn--yellow'); restart.after(extras); restart.focus({ preventScroll: true }); }
        else overlay.append(extras);
    }).observe(overlay, { childList: true });

    // ---------- Settings tabs ----------
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    function selectTab(tab) {
        for (const other of tabs) {
            const selected = other === tab;
            other.setAttribute('aria-selected', String(selected)); other.tabIndex = selected ? 0 : -1;
            document.getElementById(other.getAttribute('aria-controls')).hidden = !selected;
        }
    }
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => selectTab(tab));
        tab.addEventListener('keydown', event => {
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            const next = tabs[(index + step + tabs.length) % tabs.length];
            selectTab(next); next.focus();
        });
    });

    // Held buttons get the pressed look from pointer state (keyboard uses :active).
    for (const id of ['btn-left', 'btn-right', 'btn-brake', 'btn-drift-left', 'btn-drift-right']) {
        const button = document.getElementById(id);
        const held = value => () => { button.dataset.held = String(value); };
        button.addEventListener('pointerdown', held(true));
        for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(type, held(false));
    }

    // ---------- Ground-locked skid marks ----------
    // game.js scrolls its skid marks at paint speed; here they stay where they were laid.
    const groundSkids = [], seenSkids = new WeakSet(), SKID_LIFE = 4;
    function trackSkids(ground, simDt) {
        for (const mark of skidMarks) {
            if (seenSkids.has(mark)) continue;
            seenSkids.add(mark);
            groundSkids.push({ x: mark.x, at: mark.y - ground, angle: mark.angle, age: 0 });
        }
        for (let i = groundSkids.length - 1; i >= 0; i--) {
            const mark = groundSkids[i]; mark.age += simDt;
            if (mark.age > SKID_LIFE || mark.at + ground > car.y + 900) groundSkids.splice(i, 1);
        }
        if (groundSkids.length > 240) groundSkids.splice(0, groundSkids.length - 240);
        return groundSkids.map(mark => ({ x: mark.x, y: mark.at + ground, angle: mark.angle, life: 1.4 * (1 - mark.age / SKID_LIFE) }));
    }

    // ---------- Rewards: coins for every race, stars / gems / points for career rounds ----------
    function showRewards() {
        if (rewarded || !raceEnabled) return;
        if (mp) { rewarded = true; showMpWaiting(); mp.finish(); return; }
        rewarded = true;
        const finished = race.finished, place = race.position;
        const block = document.createElement('div'); block.className = 'rewards';
        let html = '', next = null;
        if (careerMap) {
            const result = career.record({ map: careerMap, difficulty: careerDifficulty, place, finished, driftPoints: Math.round(driftPoints),
                score: Math.floor(score), clean: bumps === 0, time: race.time }, garage);
            html += `<div class="reward-stars" aria-label="${result.stars} of 3 stars">${[1, 2, 3].map(n => `<i class="${n <= result.stars ? 'on' : ''}" style="--d:${n * 0.18}s"></i>`).join('')}</div>`;
            if (careerMap.type === 'drift') html += `<p class="reward-line">Drift points: <b>${Math.round(driftPoints)}</b> (target ${careerMap.driftTarget} per star)</p>`;
            html += `<p class="reward-line">${result.coins ? `<span><i class="coin"></i>+${result.coins.toLocaleString('en-US')}</span>` : ''}${result.gems ? `<span><i class="gem"></i>+${result.gems}</span>` : ''}${result.points ? `<span>+${result.points.toLocaleString('en-US')} pts</span>` : ''}</p>`;
            if (!result.stars) html += `<p class="reward-line muted">${finished ? (careerMap.type === 'drift' ? 'Drift more to earn a star.' : 'Finish 1st or 2nd to earn stars.') : 'Finish the race to earn stars.'}</p>`;
            next = revRegionMaps(careerMap.region)[careerMap.index + 1];
            if (next && !career.isMapOpen(next)) next = null;
        } else {
            const coins = revRaceCoins({ place, finished, difficulty, career: false });
            if (coins) { garage.earn(coins); html += `<p class="reward-line"><span><i class="coin"></i>+${coins.toLocaleString('en-US')}</span></p>`; }
        }
        block.innerHTML = html;
        const overlay = document.getElementById('overlay');
        (overlay.querySelector('p') || overlay.querySelector('h1'))?.after(block);
        if (careerMap) {
            const links = document.createElement('div'); links.className = 'result-extras career-links';
            links.innerHTML = `${next ? `<a class="rl-btn rl-btn--green rl-btn--small" href="frontend/race/index.html?map=${next.id}&difficulty=${careerDifficulty}">Next round ›</a>` : ''}<a class="rl-btn rl-btn--orange rl-btn--small" href="frontend/career/index.html">Career map</a>`;
            (overlay.querySelector('#restart-btn') || block).after(links);
        }
    }

    // ---------- Multiplayer results ----------
    function showMpWaiting() {
        const block = document.createElement('div'); block.className = 'rewards mp-wait'; block.id = 'mp-results';
        block.innerHTML = '<p class="reward-line">Waiting for the other players to finish…</p>';
        (overlay.querySelector('p') || overlay.querySelector('h1'))?.after(block);
        if (mp.lobby.state.results?.round === mp.round) showMpResults(mp.lobby.state.results);
    }
    function showMpResults(results) {
        const me = mp.lobby.me, mine = results.order.find(r => r.id === me), members = Object.fromEntries(mp.members().map(m => [m.id, m.profile]));
        if (!mp.recorded) {
            mp.recorded = true;
            const stats = mp.profile.recordRace({ place: mine?.place || results.order.length, players: results.order.length, time: mine?.time || 0, finished: Boolean(mine && !mine.out) });
            revNet.submitScore('wins', stats.wins);
            const coins = revRaceCoins({ place: mine?.place || 4, finished: Boolean(mine && !mine.out), difficulty: mp.settings.difficulty, career: false });
            if (coins) garage.earn(coins);
            mp.coins = coins;
        }
        const rows = results.order.map(r => {
            const p = members[r.id] || { name: r.name };
            return `<li class="${r.id === me ? 'me' : ''}"><b>${r.place}</b>${revAvatarHTML(p, 30)}<span>${revFlag(p.country)} ${revEscape(p.name || r.name || 'Racer')}</span><em>${r.out ? 'Out' : r.time ? revRaceTime(r.time) : `${r.distance || 0} m`}</em></li>`;
        }).join('');
        const html = `<p class="reward-line"><span>${mine?.place === 1 ? 'You won!' : `You finished ${mine?.place || '–'}${['st', 'nd', 'rd'][(mine?.place || 4) - 1] || 'th'}`}</span>${mp.coins ? `<span><i class="coin"></i>+${mp.coins.toLocaleString('en-US')}</span>` : ''}</p>
            <ol class="mp-results">${rows}</ol>
            <div class="result-extras mp-actions">${mp.lobby.isHost ? '<button type="button" class="rl-btn rl-btn--green rl-btn--small" id="mp-next">Next round</button>' : '<span class="mp-note">The host starts the next round.</span>'}
            <a class="rl-btn rl-btn--orange rl-btn--small" href="frontend/multiplayer/index.html" id="mp-lobby">Lobby</a></div>`;
        let block = document.getElementById('mp-results');
        if (!block) { block = document.createElement('div'); block.className = 'rewards'; block.id = 'mp-results'; (overlay.querySelector('p') || overlay.querySelector('h1'))?.after(block); }
        block.className = 'rewards'; block.innerHTML = html;
        document.getElementById('mp-next')?.addEventListener('click', () => mp.lobby.start(Object.values(REV_MAPS)));
        // Host: returning to the lobby takes everyone there.
        document.getElementById('mp-lobby').addEventListener('click', event => { if (mp.lobby.isHost) { event.preventDefault(); mp.lobby.backToLobby(); } });
    }
    if (mp) mp.onResults = results => { if (rewarded) showMpResults(results); };

    // ---------- Frame ----------
    let scroll = 0, odometer = 0, lastDistance = road.distance, lastSim = simulationTime, lastFrame = 0;
    let lastGear = gear, wasOver = isGameOver, soundBuild = '';
    const seenImpacts = new WeakSet();
    // Phone sounds and impact bursts follow what game.js decided this frame.
    function soundEvents(build, simulating) {
        const key = JSON.stringify(build);
        if (key !== soundBuild) { soundBuild = key; sfx.setBuild(revComposeSound(build)); }
        if (gear !== lastGear) {
            if (lastGear > 0 && gear > lastGear) { sfx.clunk(); sfx.blowOff(); }
            else if (lastGear > 1 && gear > 0 && gear < lastGear) { sfx.clunk(); sfx.pops(1); }
            else if (simulating) sfx.clunk();   // N ↔ D
            lastGear = gear;
        }
        for (const hit of impacts) {
            if (seenImpacts.has(hit)) continue;
            seenImpacts.add(hit);
            renderer.addImpact(hit.x, hit.y, hit.kind); sfx.bang(); bumps++;
        }
        sfx.whistle({ active: simulating && gear > 0 && !isGameOver, rpm: currentRpm, press: virtualButtonPress });
        // Engine, tyres and surface: alive until a crash or a blown engine ends the run.
        if (!isGameOver || (raceEnabled && race.finished)) sfx.drive({
            rpm: currentRpm, press: virtualButtonPress, gear, running: simulating && !isGameOver, limiting: Boolean(driveFeedback.limiting),
            speed: car.speedKmh, drifting: road.drifting, surface: revCourse?.surface || 'tarmac', offRoad: road.offRoad
        });
        if (isGameOver && !wasOver) {
            showRewards();
            if (driveFeedback.engineFailed) sfx.ending('engine');
            else if (!(raceEnabled && race.finished)) sfx.ending('crash');
            else sfx.silenceWhistle();
        }
        wasOver = isGameOver;
    }
    function frame(now) {
        requestAnimationFrame(frame);
        const frameDt = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 1 / 60;
        lastFrame = now;
        let simDt = (simulationTime - lastSim) / 1000, moved = road.distance - lastDistance;
        if (simDt < 0) { simDt = 0; moved = 0; scroll = 0; odometer = 0; groundSkids.length = 0; }   // resetGame() started a new run
        else if (moved < 0) moved += ROAD_PERIOD;
        if (moved > 2000) moved = 0;
        lastSim = simulationTime; lastDistance = road.distance;
        scroll += moved; odometer += moved / PX_PER_METER;
        const ground = scroll * CURVE_RATE;
        const anchorY = car.y + car.height / 2;

        const build = playerBuild(), visual = revBuildVisual(build), pose = playerPose();
        const simulating = simDt > 0, still = motionPreference.matches;
        if (careerMap?.type === 'drift' && simulating && road.drifting && !road.offRoad) driftPoints += car.speedKmh / 30 * simDt * 5;
        let shakeX = simulating && !still && currentRpm > 3 && car.speedKmh === 0 ? (Math.random() - .5) * 2.2 : 0;
        if (driveFeedback.limiting && !still) shakeX += Math.sin(simulationTime * .14) * 1.3;
        const coasting = gear > 0 && car.speedKmh > 3 && virtualButtonPress <= .08;
        const view = {
            road, scroll: ground, dt: simDt, speedRatio: car.speedKmh / 197,
            shake: driveFeedback.limiting && simulating ? Math.sin(simulationTime * .21) * .8 : 0,
            player: { x: pose.x, y: pose.y, h: car.height, angle: pose.angle, speedKmh: car.speedKmh, shakeX,
                art: { id: garage.car.id, style: garage.car.style || garage.car.id, color: garage.car.color, player: true, exhaust: visual.tips },
                braking: isBraking ? 1 : coasting ? .35 : 0, flame: exhaustFlash / .12, flameColor: visual.flame },
            vehicles: [
                ...enemies.map(enemy => {
                    const p = vehiclePose(enemy);
                    return { x: p.x, y: p.y, angle: p.angle, traffic: true, art: { style: 'traffic', color: enemy.color } };
                }),
                ...(raceEnabled ? race.rivals.map((rival, i) => {
                    const p = vehiclePose(rival);
                    // Other players drive their own car's art; AI rivals keep the numbered rival look.
                    if (rival.remote) return { x: p.x, y: p.y, angle: p.angle, name: rival.name, color: rival.color, art: { id: rival.carId, style: rival.style || 'rival', color: rival.color, player: Boolean(rival.carId) } };
                    return { x: p.x, y: p.y, angle: p.angle, name: rival.name, color: rival.color, art: { style: 'rival', color: rival.color, number: i + 2 } };
                }) : [])
            ],
            skidMarks: trackSkids(ground, simDt), tireSmoke: tireSmokeParticles, exhaust: exhaustParticles,
            // Start and finish are fixed points of the ground (where this run began, and race length further on).
            startY: raceEnabled ? car.y - 16 + ground : null,
            finishY: raceEnabled ? car.y - 16 + ground - race.length * GROUND_PX_PER_METER : null,
            offRoad: road.offRoad, offRoadSide: car.x < REV_WORLD.roadLeft ? -1 : 1, limiting: driveFeedback.limiting,
            course: revCourse ? {
                obstacles: revCourse.obstaclesNear(race.distance, car.y, y => road.offsetAt(y), REV_LANE_X),
                hills: revCourse.hills.map(h => ({ top: car.y - (h.to - race.distance) * GROUND_PX_PER_METER, bottom: car.y - (h.from - race.distance) * GROUND_PX_PER_METER, maxGear: h.maxGear }))
            } : null
        };
        renderer.render(view, frameDt);
        soundEvents(build, simulating);
        if (mp && simulating) mp.frame(simDt);
        hud.update({
            racing: raceEnabled, race, gear, rpm: currentRpm, speed: car.speedKmh, voice: virtualButtonPress, score,
            time: raceEnabled ? race.time : simulationTime / 1000, odometer, curved: road.curved,
            shiftReady: driveFeedback.shiftReady, limiting: driveFeedback.limiting, redlineTime: driveFeedback.redlineTime,
            running: running && !settingsPaused, gameOver: isGameOver, inputMode: voiceInput.mode, manual: controlMode === 'manual',
            offRoad: road.offRoad, drifting: road.drifting, playerColor: garage.car.color, reducedMotion: still,
            groundPxPerMetre: GROUND_PX_PER_METER, playerMetres: ground / GROUND_PX_PER_METER,
            hillGear: revCourse?.lugging ? revCourse.hill.maxGear : 0, driftPoints: careerMap?.type === 'drift' ? driftPoints : null,
            skin: REV_METER_SKINS[career.state.skin] || REV_METER_SKINS.classic,
            // The course repeats every ROAD_PERIOD; free drive laps four repeats of it.
            mapLength: raceEnabled ? race.length : 4 * ROAD_PERIOD / PX_PER_METER,
            // Road centre offset at `metres` from the start line (backend curve, fixed on the ground).
            courseOffset: metres => road.offsetAt(anchorY - (metres - ground / GROUND_PX_PER_METER) * GROUND_PX_PER_METER)
        }, frameDt);
    }

    document.getElementById('race-enabled').checked = racing;
    if (courseMap) {
        // Configure the round without overwriting the player's quick-race preferences.
        let saved = null;
        try { saved = localStorage.getItem('revline-course-v1'); } catch {}
        document.getElementById('traffic-enabled').checked = courseMap.traffic;
        document.getElementById('curves-enabled').checked = courseMap.curves > 0;
        document.getElementById('race-distance').value = String(courseMap.distance);
        document.getElementById('difficulty').value = mp ? mp.settings.difficulty : careerDifficulty;
        for (const id of ['traffic-enabled', 'curves-enabled', 'race-enabled', 'race-distance', 'difficulty']) document.getElementById(id).disabled = true;
        road.curveScale = courseMap.curves || 1;
        revCourse = new RevCourse({ surface: courseMap.surface, hills: courseMap.hills, obstacles: courseMap.obstacles });
        applyCourseSettings();
        try { if (saved !== null) localStorage.setItem('revline-course-v1', saved); } catch {}
    } else applyCourseSettings();
    showLobby();
    requestAnimationFrame(frame);
})();
