if (window.REVLINE_IOS) {
    document.body.classList.add('ios-app');
}
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const tachoCanvas = document.getElementById('tachoCanvas');
const tCtx = tachoCanvas.getContext('2d');
const speedoCanvas = document.getElementById('speedoCanvas');
const sCtx = speedoCanvas.getContext('2d');

let isGameOver = false;
let frames = 0;
let score = 0;
let roadOffset = 0;
let sceneryDistance = 0;
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

// Road Dimensions (4 Lanes)
const roadLeft = 95;
const roadWidth = 350;
const laneWidth = roadWidth / 4;

// Player car and estimated transmission (N, 1..6; 197 km/h scale).
let car = { 
    x: roadLeft + laneWidth * 2 + (laneWidth - 46) / 2, 
    y: 580, 
    width: 46, 
    height: 86, 
    speedKmh: 0,
    worldSpeed: 0
};

let gear = 0; // 0 = 'N', 1..6 = Driving Gears
// Approximate speed ranges for the Carrera GT simulation.
const gearTopSpeeds = [0, 48, 76, 102, 134, 166, 197];
const gearMinSpeeds = REV_GEAR_MIN_SPEEDS;

let currentRpm = 1.0;        // 1.0 to 10.0 (x1000 RPM)
let virtualButtonPress = 0;  // 0.0 to 1.0 (0% to 100% press of the accelerator button)
let enemies = [];
let tireSmokeParticles = [];
let exhaustParticles = [];
let exhaustFlash = 0;

// Controls
let moveLeft = false;
let moveRight = false;
let isBraking = false;
let driftLeft = false, driftRight = false;
// Control mode (user request): 'voice' = your rev drives the car; 'manual' = the throttle
// revs by itself and you change gear with CLUTCH (hold) + ▲ / ▼, so no microphone is needed.
const REV_CONTROL_KEY = 'revline-control-v1';
let controlMode = (() => { try { return localStorage.getItem(REV_CONTROL_KEY) === 'manual' ? 'manual' : 'voice'; } catch { return 'voice'; } })();
let clutchHeld = false, manualPress = 0, clutchRpm = 0;
let skidMarks = [], skidClock = 0;
let impacts = [];   // side bumps and hits from behind: sparks and sound, never a crash
let revCourse = null;   // career map features (driving-course.js); null = plain race
const road = new RevRoadScene();
const race = new RevRace();
let difficulty = 'normal';
let trafficEnabled = false, raceEnabled = false, raceLength = 1000, trafficSpawnDistance = 0;
let settingsPaused = false, settingsResumeReference = false;
const settingsDialog = document.getElementById('settings-dialog');
const gameStorage = (() => { try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } }; } })();

const garage = new RevGarage(gameStorage);
let shopPreviewTimer = 0, previewTracks = [];

const referenceVideo = document.getElementById('reference-video');
const voiceInput = new RevPersonalVoiceInput(referenceVideo);
const { model: audioModel, ai: voiceAI, transmission, upshift: voiceUpshift,
    cut: voiceCut, downshift: voiceDownshift, autoNeutral } = voiceInput;
const driveFeedback = new RevDriveFeedback();
const exhaustFeedback = new RevExhaustFeedback();
const testStatus = document.getElementById('test-status');
let running = false;
let microphoneStarting = false;
let lastFrameTime = 0;
let simulationTime = 0;
let runRows = [];
let lastLogTime = -1;
let objectUrl;
function getSoundProfile() { return voiceInput.profile; }
function getVoiceCalibration() { return voiceInput.calibration; }

// Gear Shift Dip State Machine
let shiftDipActive = false;
let lastShiftTime = 0;
let shiftAlertTimer = 0;

// UI Sliders
document.getElementById('sens-slider').addEventListener('input', e => {
    voiceInput.sensitivity = parseInt(e.target.value, 10) / 10;
    document.getElementById('sens-val').innerText = voiceInput.sensitivity.toFixed(1);
});
document.getElementById('gate-slider').addEventListener('input', e => {
    voiceInput.gate = Number(e.target.value) / 100;
    document.getElementById('gate-val').innerText = e.target.value;
});


function setStatus(message, error = false) {
    testStatus.textContent = message;
    testStatus.classList.toggle('error', error);
    document.querySelectorAll('[data-input-status]').forEach(output => {
        output.textContent = message;
        output.classList.toggle('error', error);
    });
    document.getElementById('use-mic').setAttribute('aria-pressed', String(voiceInput.mode === 'mic'));
    document.getElementById('use-recording').setAttribute('aria-pressed', String(voiceInput.mode === 'reference' && !referenceVideo.paused));
}

function clearHeldControls() {
    moveLeft = moveRight = isBraking = driftLeft = driftRight = clutchHeld = false;
    document.getElementById('btn-clutch')?.setAttribute('aria-pressed', 'false');
    for (const id of ['btn-drift-left', 'btn-drift-right']) document.getElementById(id).setAttribute('aria-pressed', 'false');
}
function openSettings() {
    if (settingsDialog.open) return;
    clearHeldControls(); settingsPaused = true;
    voiceUpshift.reset(); voiceCut.reset(); voiceDownshift.reset(); voiceAI.reset(); exhaustFeedback.reset(); shiftDipActive = false;
    settingsResumeReference = voiceInput.mode === 'reference' && !referenceVideo.paused;
    if (settingsResumeReference) referenceVideo.pause();
    renderLeaderboard(); settingsDialog.showModal();
}
function closeSettings() { if (settingsDialog.open) settingsDialog.close(); }
settingsDialog.addEventListener('close', () => {
    stopGaragePreview();
    settingsPaused = gameMenuOpen;
    const resume = settingsResumeReference; settingsResumeReference = false;
    if (resume && voiceInput.mode === 'reference' && referenceVideo.paused && !isGameOver) referenceVideo.play().catch(() => setStatus('Tap Play sound test to start again.', true));
    if (voiceInput.mode !== 'none' && !isGameOver && !running) startLoop();
});
settingsDialog.addEventListener('click', event => {
    const rect = settingsDialog.getBoundingClientRect();
    if (event.target === settingsDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeSettings();
});

function courseKey() {
    const base = `${Number(trafficEnabled)}:${Number(road.curved)}:${raceLength}`;
    return difficulty === 'normal' && garage.key === 'gt:stock:off' ? base : `${base}|${difficulty}|0|${garage.key}`;
}
function renderLeaderboard() {
    const rows = revReadLeaderboard(gameStorage).filter(r => r.course === courseKey()).sort((a, b) => a.time - b.time || b.score - a.score).slice(0, 10);
    const body = document.getElementById('leaderboard-rows'); body.replaceChildren();
    rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        for (const value of [i + 1, `${row.place}/4`, revRaceTime(row.time), Math.round(row.score)]) {
            const td = document.createElement('td'); td.textContent = value; tr.append(td);
        }
        body.append(tr);
    });
    document.getElementById('leaderboard-note').textContent = rows.length ? 'Best times for this distance and course. Saved on this device.' : 'Complete a race to save your result on this device.';
}
function applyCourseSettings(reset = true) {
    difficulty = Object.hasOwn(REV_DIFFICULTIES, document.getElementById('difficulty').value) ? document.getElementById('difficulty').value : 'normal';
    trafficEnabled = document.getElementById('traffic-enabled').checked;
    road.curved = document.getElementById('curves-enabled').checked;
    raceEnabled = document.getElementById('race-enabled').checked;
    const steering = document.getElementById('steering-mode')?.value;
    road.assist = REV_STEERING.includes(steering) ? steering : 'normal';
    const distance = Number(document.getElementById('race-distance').value);
    raceLength = [1000, 3000, 5000].includes(distance) ? distance : 1000;
    document.getElementById('race-menu-detail').textContent = `${raceLength / 1000} km · 3 opponents`;
    document.getElementById('race-distance').disabled = !raceEnabled;
    document.getElementById('course-label').textContent = [raceEnabled ? `Race · ${raceLength / 1000} km · 3 rivals` : '', road.curved ? 'Curved roads' : 'Straight road', trafficEnabled ? 'Traffic on' : 'No traffic', difficulty, `${road.assist} steering`].filter(Boolean).join(' · ');
    try { gameStorage.setItem('revline-course-v1', JSON.stringify({ traffic: trafficEnabled, curves: road.curved, race: raceEnabled, distance: raceLength, difficulty, steering: road.assist })); } catch {}
    if (reset) {
        resetGame();
        if (voiceInput.mode === 'reference' && referenceVideo.currentTime > 0) referenceVideo.currentTime = 0;
        setStatus('Course updated · tap N ↔ D to start a new run.');
    }
    renderLeaderboard(); draw();
}
for (const id of ['traffic-enabled', 'curves-enabled', 'race-enabled', 'race-distance', 'difficulty', 'steering-mode']) document.getElementById(id)?.addEventListener('change', () => applyCourseSettings());


function renderRaceHUD() {
    document.getElementById('race-hud').hidden = !raceEnabled;
    if (!raceEnabled) return;
    document.getElementById('race-position').textContent = `${race.position} / 4`;
    document.getElementById('race-distance-label').textContent = `${(race.distance / 1000).toFixed(2)} / ${(race.length / 1000).toFixed(2)} km`;
    document.getElementById('race-progress').style.transform = `scaleX(${race.distance / race.length})`;
    document.querySelectorAll('.rival-dot').forEach((dot, i) => { dot.style.left = `${Math.min(1, race.rivals[i].distance / race.length) * 100}%`; dot.style.background = race.rivals[i].color; });
    document.getElementById('rival-gaps').textContent = race.rivals.map(r => `${r.name} ${r.distance >= race.distance ? '+' : '−'}${Math.round(Math.abs(r.distance - race.distance))}m`).join(' · ');
}

function startLoop() {
    if (voiceInput.mode === 'none' && controlMode !== 'manual') {
        setStatus('Choose Microphone or Recording before starting the race.', true);
        return;
    }
    closeSettings(); hideGameMenu();
    document.getElementById('overlay').style.display = 'none';
    if (!running) { running = true; lastFrameTime = 0; requestAnimationFrame(update); }
}



function resetGame() {
    isGameOver = false;
    frames = 0;
    roadOffset = 0;
    sceneryDistance = 0;
    score = 0;
    road.reset(); race.reset(raceEnabled, raceLength); trafficSpawnDistance = 0;
    for (const rival of race.rivals) rival.pace *= REV_DIFFICULTIES[difficulty].rivalPace;
    for (const rival of race.rivals) rival.y = car.y - rival.distance * 4.5;
    skidMarks = []; skidClock = 0; impacts = []; revCourse?.reset(); clearHeldControls();
    gear = 0;
    car.speedKmh = 0;
    car.worldSpeed = 0;
    currentRpm = 1.0;
    virtualButtonPress = 0;
    car.x = roadLeft + laneWidth * 2 + (laneWidth - car.width) / 2;
    enemies = [];
    tireSmokeParticles = [];
    exhaustParticles = []; exhaustFlash = 0; exhaustFeedback.reset();
    voiceUpshift.reset(); voiceCut.reset();
    voiceDownshift.reset(); autoNeutral.reset();
    driveFeedback.reset();
    shiftDipActive = false;
    lastShiftTime = -1000;
    simulationTime = 0;
    audioModel.reset();
    voiceInput.blend.reset();
    voiceAI.reset();
    transmission.reset();
    runRows = [];
    lastLogTime = -1;
    document.getElementById('export-test').disabled = true;
    document.getElementById('score').textContent = '0';
    document.getElementById('pitch-hz').textContent = '0 Hz';
    document.getElementById('signal-state').textContent = `Input: ${voiceInput.mode} · Waiting for sound`;
    document.getElementById('gear-alert').style.display = 'none';
    clearTimeout(shiftAlertTimer);


    updateGearDisplay();
    updateVirtualButtonUI(0);
    if (trafficEnabled) { spawnEnemy(60); spawnEnemy(280); spawnEnemy(-180); }
    renderRaceHUD();
}

// The microphone is already open and delivering sound.
function microphoneLive() {
    return voiceInput.mode === 'mic' && (Boolean(voiceInput.nativeCapture) || Boolean(voiceInput.stream?.getTracks().some(track => track.readyState === 'live')));
}
// The Start button: manual control needs no microphone, and an open microphone is not
// reopened (reopening took a moment on iPhone, which felt like Start needed 2–3 taps).
function startDriving() {
    if (controlMode === 'manual' || microphoneLive()) { startLoop(); return; }
    useMicrophone();
}
function setControlMode(mode) {
    controlMode = mode === 'manual' ? 'manual' : 'voice';
    try { localStorage.setItem(REV_CONTROL_KEY, controlMode); } catch {}
    document.body.dataset.control = controlMode;
    clutchHeld = false; manualPress = 0;
    const select = document.getElementById('control-mode');
    if (select) select.value = controlMode;
    window.dispatchEvent(new CustomEvent('revline:control', { detail: controlMode }));
}

async function useMicrophone() {
    if (microphoneStarting) return;
    microphoneStarting = true;
    const buttons = document.querySelectorAll('#use-mic, [onclick="useMicrophone()"], [onclick="startDriving()"]');
    // Visible progress, so a slow permission prompt does not look like a missed tap.
    const labels = [...buttons].map(button => button.querySelector?.('span'));
    const words = labels.map(label => label?.textContent);
    buttons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
    labels.forEach(label => { if (label) label.textContent = 'Opening microphone'; });
    try {
        const opening = voiceInput.startMicrophone();
        setStatus('Opening microphone… Allow access if asked.');
        if (!await opening) {
            if (voiceInput.mode === 'none') setStatus('Microphone startup was interrupted. Try Microphone again.', true);
            return;
        }
        if (voiceInput.mode !== 'mic') return;
        applySoundProfile(getSoundProfile() === 'engine'
            ? voiceInput.personalCalibration ? 'voice-personal' : 'voice-custom'
            : document.getElementById('input-profile').value);
        startLoop();
        setStatus('Microphone on · start revving.');
    } catch (error) {
        reportMicrophoneError(error);
    } finally {
        microphoneStarting = false;
        buttons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); });
        labels.forEach((label, i) => { if (label && label.isConnected) label.textContent = words[i]; });
    }
}

function reportMicrophoneError(error) {
    const hints = {
        NotAllowedError: 'Microphone access is blocked. Allow RevLine in Privacy & Security → Microphone, then retry.',
        NotFoundError: 'No microphone was found. Connect or enable an input device, then retry.',
        NotReadableError: 'The microphone could not be opened. Check your sound input and other recording apps, then retry.',
        TimeoutError: 'Microphone startup timed out. Check the permission prompt, then retry.'
    };
    const detail = [error?.name, error?.message].filter(Boolean).join(': ');
    setStatus(`${hints[error?.name] || 'Microphone could not start. Try again.'}${detail ? ` (${detail})` : ''}`, true);
}
window.addEventListener('revline:microphone-error', event => {
    reportMicrophoneError(event.detail);
    openSettings();
    document.getElementById('tab-input')?.click();
});

function toggleMicrophone() {
    if (voiceInput.mode === 'mic') {
        voiceInput.stopMicrophone(); voiceInput.mode = 'none';
        if (voiceInput.context) voiceInput.context.suspend();
        setStatus('Microphone off · tap Microphone to turn it back on.');
    } else useMicrophone();
}

async function playReference(restart = false) {
    try {
        if (voiceInput.profileKey === 'voice-personal') applySoundProfile('voice-custom');
        // A MediaElementSource can only be created once for this video element.
        if (!await voiceInput.prepareReference()) return;
        const generation = voiceInput.generation;
        if (restart || referenceVideo.ended) { referenceVideo.currentTime = 0; resetGame(); }
        if (!running || isGameOver) resetGame();
        await referenceVideo.play();
        if (generation !== voiceInput.generation) return;
        startLoop();
    } catch (error) { setStatus('The video cannot play. Open the app from a local server and try again, or load another video.', true); }
}

function toggleReference() {
    if (voiceInput.mode === 'reference' && !referenceVideo.paused) referenceVideo.pause();
    else playReference();
}
referenceVideo.addEventListener('play', async () => {
    try {
        if (referenceVideo.paused) return;
        if (voiceInput.mode !== 'reference') { if (!await voiceInput.prepareReference()) return; resetGame(); }
        startLoop();
        document.getElementById('play-reference').textContent = 'Pause sound test';
        setStatus('Playing · recording → detector → app.');
    } catch (error) { referenceVideo.pause(); setStatus('Audio input could not start. Tap Play sound test again.', true); }
});
referenceVideo.addEventListener('pause', () => {
    voiceUpshift.reset(); voiceCut.reset(); shiftDipActive = false;
    voiceDownshift.reset(); autoNeutral.returnTime = 0;
    exhaustFeedback.reset();
    document.getElementById('play-reference').textContent = 'Play sound test';
    if (voiceInput.mode === 'reference' && !referenceVideo.ended) setStatus('Paused · the video and the race are both stopped.');
});
let continuousRaceLoop = false;
referenceVideo.addEventListener('seeking', () => { if (voiceInput.mode === 'reference' && !continuousRaceLoop) resetGame(); });
referenceVideo.addEventListener('seeked', () => { continuousRaceLoop = false; });
referenceVideo.addEventListener('ended', () => {
    if (voiceInput.mode !== 'reference' || isGameOver) return;
    if (document.getElementById('loop-reference').checked && raceEnabled && race.started && !race.finished) {
        continuousRaceLoop = true; referenceVideo.currentTime = 0; referenceVideo.play().catch(() => {});
    } else if (document.getElementById('loop-reference').checked) playReference(true);
    else setStatus('Test complete · use Export run CSV or Replay from start.');
});
referenceVideo.addEventListener('error', () => setStatus('The reference could not load. Choose a playable video or audio file with Load another video.', true));
document.getElementById('reference-file').addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|mov|webm|m4a|mp3|wav|ogg)$/i.test(file.name)) {
        setStatus('Choose a video or audio file.', true); return;
    }
    ++voiceInput.generation;
    referenceVideo.pause();
    voiceInput.stopMicrophone();
    voiceInput.mode = 'none';
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    referenceVideo.classList.remove('audio-reference');
    referenceVideo.poster = '';
    document.getElementById('reference-source').value = 'upload';
    referenceVideo.src = objectUrl;
    referenceVideo.load();
    resetGame();
    setStatus(file.name + ' loaded · tap Play sound test. Adjust calibration for other engines.');
});
document.getElementById('rpm-scale').addEventListener('input', event => {
    document.getElementById('rpm-scale-val').textContent = Number(event.target.value).toFixed(1);
});
function renderVoiceAIStatus() {
    const output = document.getElementById('voice-ai-status');
    const enabled = document.getElementById('voice-ai').checked;
    const profile = getSoundProfile();
    const mixed = profile === 'voice' && enabled && document.getElementById('voice-blend').checked;
    document.getElementById('voice-blend').disabled = profile !== 'voice' || !enabled;
    document.getElementById('voice-downshift').disabled = profile !== 'voice' || !enabled;
    const engineControl = document.getElementById('engine-calibration');
    const voiceControl = document.getElementById('voice-range');
    if (engineControl.hidden !== (profile !== 'engine')) engineControl.hidden = profile !== 'engine';
    if (voiceControl.hidden !== (profile === 'engine')) voiceControl.hidden = profile === 'engine';
    const rangeOutput = document.getElementById('voice-range-val');
    const rangeLabel = mixed ? `${Math.round(voiceInput.blend.pitchLowHz)}–${Math.round(voiceInput.blend.pitchHighHz)} Hz · mix`
        : getVoiceCalibration() ? `${Math.round(getVoiceCalibration().pitchLowHz)}–${Math.round(getVoiceCalibration().pitchHighHz)} Hz` : 'Standard range';
    if (rangeOutput.textContent !== rangeLabel) rangeOutput.textContent = rangeLabel;
    const messages = {
        idle: 'AI voice pitch · ready to load locally.',
        loading: 'Loading AI voice pitch… Standard detector works while loading.',
        ready: mixed ? 'Pitch + volume trial · 50/50 mix. Your rev range adapts during this run.'
            : 'AI voice pitch ready · audio stays on this device. Unclear pitch uses the standard detector.',
        error: 'AI unavailable · standard detector active. Turn AI off and on to retry.'
    };
    const message = profile !== 'voice' ? 'Porsche engine detector stays standard. AI is used only in Voice mode.'
        : !enabled ? 'AI off · standard voice detector active.' : messages[voiceAI.state];
    if (output.textContent !== message) output.textContent = message;
}

function ensureVoiceAI() {
    voiceInput.ensureAI(document.getElementById('voice-ai').checked).catch(() => {}).finally(renderVoiceAIStatus);
    renderVoiceAIStatus();
}
document.getElementById('voice-ai').addEventListener('change', ensureVoiceAI);
document.getElementById('voice-downshift').addEventListener('change', () => voiceDownshift.reset());
document.getElementById('voice-blend').addEventListener('change', () => {
    resetGame(); renderVoiceAIStatus();
    setStatus(document.getElementById('voice-blend').checked ? 'Pitch + volume mix trial on · rev to test it.' : 'Previous voice control restored · pitch + volume trial off.');
});
function applySoundProfile(value) {
    if (value === 'voice-personal' && voiceInput.mode === 'reference') {
        value = 'voice-custom';
        setStatus('Your personal profile is for microphone driving. The reference keeps its original calibration.');
    }
    document.getElementById('input-profile').value = value;
    voiceInput.setProfile(value);
    document.getElementById('sens-slider').value = voiceInput.sensitivity * 10;
    document.getElementById('sens-val').textContent = voiceInput.sensitivity.toFixed(1);
    document.getElementById('gate-slider').value = voiceInput.gate * 100;
    document.getElementById('gate-val').textContent = (voiceInput.gate * 100).toFixed(1);
    resetGame();
    ensureVoiceAI();
}
document.getElementById('input-profile').addEventListener('change', event => applySoundProfile(event.target.value));
document.getElementById('reference-source').addEventListener('change', event => {
    const trial = event.target.value === 'downshift';
    const custom = event.target.value === 'custom' || trial;
    const recording = trial ? '3314' : '3313';
    ++voiceInput.generation;
    referenceVideo.pause();
    voiceInput.stopMicrophone();
    voiceInput.mode = 'none';
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    referenceVideo.classList.toggle('audio-reference', custom);
    referenceVideo.poster = custom ? `assets/rev-voice-${recording}-wave.png` : '';
    referenceVideo.src = custom ? `assets/rev-voice-${recording}.m4a` : 'assets/porsche-carrera-gt.mp4';
    referenceVideo.setAttribute('aria-label', custom ? `IMG_${recording} rev recording` : 'Porsche Carrera GT reference video');
    if (custom) document.getElementById('voice-downshift').checked = true;
    referenceVideo.load();
    applySoundProfile(custom ? 'voice-custom' : 'engine');
    setStatus(trial ? 'IMG_3314 loaded · voice downshift on. Press N ↔ D to drive.' : custom ? 'Your rev recording loaded · voice downshift on.' : 'Porsche reference loaded · original engine settings active.');
});
document.getElementById('export-test').addEventListener('click', () => {
    const csv = 'time_s,input,profile,band_hz,rms,estimated_rpm,throttle_pct,estimated_gear,estimated_kmh,pitch_source\n' + runRows.map(row => row.join(',')).join('\n');
    if (window.REVLINE_IOS && window.webkit?.messageHandlers?.exportRun) {
        window.webkit.messageHandlers.exportRun.postMessage(csv); return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'revline-sound-test.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('pagehide', () => { stopGaragePreview(); voiceInput.stop(); if (objectUrl) URL.revokeObjectURL(objectUrl); });
window.revlineSuspendForBackground = () => {
    stopGaragePreview();
    settingsResumeReference = false; clearHeldControls();
    voiceInput.stop();
    virtualButtonPress = 0; exhaustFeedback.reset(); exhaustFlash = 0; exhaustParticles = [];
    voiceUpshift.reset(); voiceCut.reset(); voiceDownshift.reset(); voiceAI.reset();
    if (voiceInput.context) voiceInput.context.suspend();
    updateVirtualButtonUI(0);
    setStatus('Paused · when you return, tap Microphone to start again.');
};


function updateGearDisplay() {
    const neutralButton = document.getElementById('gear-lcd-circle');
    neutralButton.textContent = gear === 0 ? 'N' : gear.toString();
    neutralButton.setAttribute('aria-pressed', String(gear === 0));
    neutralButton.title = gear === 0 ? 'Neutral selected — press to resume in a suitable gear (N)' : 'Select neutral (N)';
    updateTestTelemetry();
}

function updateTestTelemetry() {
    document.getElementById('test-rpm').textContent = Math.round(currentRpm * 1000).toLocaleString('en-US');
    document.getElementById('test-gear').textContent = gear || 'N';
    document.getElementById('test-speed').textContent = Math.round(car.speedKmh);
}

function toggleNeutral() {
    gear = gear === 0 ? autoNeutral.gearForSpeed(car.speedKmh) : 0;
    transmission.reset();
    voiceUpshift.reset(); voiceCut.reset();
    voiceDownshift.reset(); autoNeutral.reset();
    driveFeedback.reset();
    shiftDipActive = false;
    lastShiftTime = simulationTime;
    document.getElementById('gear-alert').style.display = 'none';
    updateGearDisplay();
}

function setAutomaticGear(nextGear) {
    gear = nextGear;
    transmission.reset();
    voiceUpshift.reset(); voiceCut.reset(); voiceDownshift.reset();
    driveFeedback.reset();
    shiftDipActive = false;
    lastShiftTime = simulationTime;
    document.getElementById('gear-alert').style.display = 'none';
    updateGearDisplay();
}

function showShiftFeedback(direction, rpm) {
    const alertEl = document.getElementById('gear-alert');
    const timing = revShiftTiming(rpm);
    alertEl.dataset.grade = direction === 'up' ? timing.grade : 'down';
    alertEl.textContent = direction === 'up' ? `${timing.label}\nGEAR ${gear} ▲` : `GEAR ${gear} ▼`;
    alertEl.style.display = 'block';
    clearTimeout(shiftAlertTimer);
    shiftAlertTimer = setTimeout(() => { alertEl.style.display = 'none'; }, 1000);
}

function shiftGearUp() {
    if (gear > 0 && gear < 6) {
        const shiftRpm = currentRpm;
        gear++;
        transmission.noteShift();

        // Voice simulation drops RPM on an upshift; engine profile follows measured pitch.
        if (gear > 1) {
            currentRpm = Math.max(4.5, currentRpm - 2.2);
        }
        updateGearDisplay();

        showShiftFeedback('up', shiftRpm);

        voiceUpshift.reset(); voiceCut.reset();
        voiceDownshift.reset();
        driveFeedback.reset();
        shiftDipActive = false;
        lastShiftTime = simulationTime;
    }
}

function shiftGearDown() {
    if (gear > 1) {
        gear--;
        transmission.noteShift();
        voiceUpshift.reset(); voiceCut.reset();
        voiceDownshift.reset();
        driveFeedback.reset();
        shiftDipActive = false;
        const pop = exhaustFeedback.downshift();
        if (pop) { spawnExhaustPuff(pop, true); exhaustFlash = 0.12; }
        if (gear > 0) {
            currentRpm = Math.min(9.2, currentRpm + 1.5);
        }
        updateGearDisplay();
        showShiftFeedback('down', currentRpm);
        lastShiftTime = simulationTime;
    }
}

// Bind UI Buttons
function bindHoldButton(id, setter) {
    const el = document.getElementById(id);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); setter(true); });
    el.addEventListener('pointerup', () => setter(false));
    el.addEventListener('pointercancel', () => setter(false));
    el.addEventListener('lostpointercapture', () => setter(false));
    el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setter(true); } });
    el.addEventListener('keyup', () => setter(false));
    el.addEventListener('blur', () => setter(false));
}
bindHoldButton('btn-left', val => moveLeft = val);
bindHoldButton('btn-right', val => moveRight = val);
bindHoldButton('btn-brake', val => isBraking = val);
if (document.getElementById('btn-clutch')) {
    bindHoldButton('btn-clutch', setClutch);
    // Shift on finger-down (not click), so a shift lands the instant it is pressed.
    for (const [id, direction] of [['btn-shift-up', 1], ['btn-shift-down', -1]]) {
        const button = document.getElementById(id);
        button.addEventListener('pointerdown', e => { e.preventDefault(); button.dataset.held = 'true'; manualShift(direction); });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, () => { button.dataset.held = 'false'; });
        button.addEventListener('click', e => { if (e.detail === 0) manualShift(direction); });   // keyboard / assistive
        button.addEventListener('contextmenu', e => e.preventDefault());
    }
}
document.body.dataset.control = controlMode;
bindHoldButton('btn-drift-left', val => { driftLeft = val; document.getElementById('btn-drift-left').setAttribute('aria-pressed', String(val)); });
bindHoldButton('btn-drift-right', val => { driftRight = val; document.getElementById('btn-drift-right').setAttribute('aria-pressed', String(val)); });

function nudgeCar(direction) {
    // Easy: a pointer tap already moved one lane through the held steering; only keyboard /
    // assistive clicks (detail 0) request a lane here. Hard: a tap moves about a third of a lane.
    if (road.assist === 'easy') { if (!window.event || window.event.detail === 0) road.requestLane(car, direction); return; }
    const step = road.assist === 'hard' ? 28 : 5.2;
    car.x = Math.max(roadLeft + 6, Math.min(roadLeft + roadWidth - car.width - 6, car.x + direction * step));
}

// Assistive activation can dispatch click without pointer/keyboard hold events.
function tapDrift(direction, event) {
    if (event.detail !== 0 || settingsPaused || gear === 0 || car.speedKmh < 25) return;
    road.lateralVelocity += direction * 70; road.yaw = direction * 0.25;
    spawnTireSmoke();
}

window.addEventListener('keydown', e => {
    if (gameMenuOpen || e.target.closest('input, select, video, dialog') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('button') && [' ', 'Enter'].includes(e.key)) return;
    if (['ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft = true;
    if (e.key === 'ArrowRight' || e.key === 'd') moveRight = true;
    if (e.key.toLowerCase() === 'q') { driftLeft = true; document.getElementById('btn-drift-left').setAttribute('aria-pressed', 'true'); }
    if (e.key.toLowerCase() === 'e') { driftRight = true; document.getElementById('btn-drift-right').setAttribute('aria-pressed', 'true'); }
    if (e.key === ' ') isBraking = true;
    if (e.key.toLowerCase() === 'n' && controlMode !== 'manual') toggleNeutral();
    if (e.key.toLowerCase() === 'c') setClutch(true);
    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') { e.preventDefault(); manualShift(1); }
    if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') { e.preventDefault(); manualShift(-1); }
});
window.addEventListener('blur', clearHeldControls);
window.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') moveLeft = false;
    if (e.key === 'ArrowRight' || e.key === 'd') moveRight = false;
    if (e.key.toLowerCase() === 'q') { driftLeft = false; document.getElementById('btn-drift-left').setAttribute('aria-pressed', 'false'); }
    if (e.key.toLowerCase() === 'e') { driftRight = false; document.getElementById('btn-drift-right').setAttribute('aria-pressed', 'false'); }
    if (e.key === ' ') isBraking = false;
    if (e.key.toLowerCase() === 'c') setClutch(false);
});

// Update the visual Accelerator Button & White Touch Dot (0% to 100%)
function updateVirtualButtonUI(pressAmount) {
    const pct = Math.round(pressAmount * 100);
    document.getElementById('press-pct').textContent = pct + '%';
    document.getElementById('voice-level').textContent = pct + '%';
    document.getElementById('voice-fill').style.transform = `scaleX(${pressAmount})`;
}

function processVoiceShift(now, dt, signal) {
    const { direction, releasing } = voiceInput.detectShift(signal, virtualButtonPress, gear, dt, (now - lastShiftTime) / 1000, {
        downshiftEnabled: document.getElementById('voice-downshift').checked,
        aiEnabled: document.getElementById('voice-ai').checked,
        rpm: currentRpm
    });
    shiftDipActive = releasing;
    if (direction) car.voiceShiftAt = now;   // voice shifts outrank the speed-matched gearbox below
    if (direction === 'down') shiftGearDown();
    else if (direction === 'up') shiftGearUp();
}

// Manual control: CLUTCH (hold) + ▲ / ▼. Shifting without the clutch grinds and does nothing.
// From neutral, clutch + ▲ selects 1st; from 1st, clutch + ▼ selects neutral.
function manualShift(direction) {
    if (controlMode !== 'manual' || settingsPaused || isGameOver) return;
    const alertEl = document.getElementById('gear-alert');
    if (!clutchHeld) {
        alertEl.dataset.grade = 'down'; alertEl.textContent = 'HOLD CLUTCH\nTO SHIFT'; alertEl.style.display = 'block';
        clearTimeout(shiftAlertTimer); shiftAlertTimer = setTimeout(() => { alertEl.style.display = 'none'; }, 900);
        window.dispatchEvent(new CustomEvent('revline:grind'));
        return;
    }
    if (direction > 0) {
        if (gear === 0) { setAutomaticGear(1); showShiftFeedback('down', currentRpm); alertEl.textContent = 'GEAR 1'; }
        else { currentRpm = Math.max(currentRpm, clutchRpm); shiftGearUp(); }
    } else if (gear === 1) { setAutomaticGear(0); alertEl.textContent = 'NEUTRAL'; alertEl.style.display = 'block'; }
    else shiftGearDown();
}
function setClutch(held) {
    if (held && !clutchHeld) clutchRpm = currentRpm;   // the shift is graded at the RPM where the clutch went in
    clutchHeld = held;
    document.getElementById('btn-clutch')?.setAttribute('aria-pressed', String(held));
}

// The throttle revs by itself from low to high; the clutch disconnects the drive while held.
// In 6th it holds just under the redline so cruising never blows the engine; in lower gears
// you must shift in time (same timing grades and 3-second engine failure as voice driving).
function processManualDrive(dt) {
    const step = dt * 60;
    const progress = gear > 0 ? (car.speedKmh - gearMinSpeeds[gear]) / Math.max(1, gearTopSpeeds[gear] - gearMinSpeeds[gear]) : 0;
    // Neutral idles gently, so pulling away in 1st starts low and builds to high.
    const want = isBraking || clutchHeld ? 0 : gear === 0 ? 0.15 : gear === 6 && progress > 0.85 ? 0.62 : 1;
    // The pedal builds up steadily (about 2 s to full) after every clutch release, and lifts at once.
    manualPress = want > manualPress ? Math.min(want, manualPress + 0.5 * dt) : manualPress + (want - manualPress) * (1 - Math.exp(-dt / 0.08));
    virtualButtonPress = manualPress;
    updateVirtualButtonUI(virtualButtonPress);
    const driving = gear > 0 && !clutchHeld;
    const hasSound = manualPress > 0.08;
    const puff = exhaustFeedback.update({ active: hasSound, rms: 0.04 + manualPress * 0.2, gate: 0.02, press: manualPress, pitchHz: 90 + currentRpm * 22 }, dt);
    if (puff) spawnExhaustPuff(puff);
    driveFeedback.update(gear, currentRpm, virtualButtonPress, hasSound, isBraking || clutchHeld, dt);
    if (driveFeedback.engineFailed) {
        car.speedKmh = car.worldSpeed = 0; currentRpm = virtualButtonPress = manualPress = 0;
        updateVirtualButtonUI(0); updateTestTelemetry();
        showRunEnd(true, 'engine');
        return;
    }
    if (!driving) {
        // Neutral or clutch in: the car rolls on; the engine falls back towards idle.
        car.speedKmh = Math.max(0, car.speedKmh - (isBraking ? 50 : 4) * dt);
        const targetRpm = gear === 0 ? 1.1 + manualPress * 0.6 : Math.max(1.2, currentRpm - 3);
        currentRpm += (targetRpm - currentRpm) * (1 - Math.exp(-dt / 0.25));
    } else if (isBraking || manualPress <= 0.08) {
        car.speedKmh = Math.max(0, car.speedKmh - (isBraking ? 50 : 12) * dt);
        const rollingRpm = 0.9 + (car.speedKmh / gearTopSpeeds[gear]) * 8.7;
        const targetRpm = car.speedKmh < 1.5 ? 1 : Math.max(1, Math.min(9.6, rollingRpm));
        currentRpm += (targetRpm - currentRpm) * (1 - Math.exp(-dt / 0.12));
    } else {
        // Same gear physics as voice driving, with the automatic throttle as the pedal.
        const minSpeed = gearMinSpeeds[gear], maxSpeed = gearTopSpeeds[gear];
        const targetSpeed = minSpeed + (maxSpeed - minSpeed) * Math.min(1, manualPress * 1.12);
        if (car.speedKmh < targetSpeed) {
            // Too high a gear for the speed bogs down (pulling away in 4th is slow).
            const lugging = car.speedKmh < minSpeed ? 0.35 : 1;
            const acceleration = (0.42 + manualPress * 0.65) * (1.15 - gear * 0.11) * garage.power * lugging;
            const power = driveFeedback.limiting ? (driveFeedback.cutting ? 0 : 0.45) : 1;
            car.speedKmh = Math.min(maxSpeed, car.speedKmh + acceleration * power * step);
        } else car.speedKmh = Math.max(0, car.speedKmh - 0.22 * step);
        const p = Math.max(0, (car.speedKmh - minSpeed) / Math.max(1, maxSpeed - minSpeed));
        const overrev = manualPress >= 0.97 ? Math.max(0, (p - 0.9) / 0.1) * 0.5 : 0;
        const targetRpm = driveFeedback.limiting && manualPress >= 0.97 ? 10 : 3.6 + p * 4.4 + manualPress * 1.5 + overrev;
        currentRpm += (Math.min(10, targetRpm) - currentRpm) * (1 - 0.75 ** step);
    }
    if (driveFeedback.cutting) car.speedKmh = Math.max(0, car.speedKmh - 10 * dt);
    if (gear === 1 && currentRpm > 5.5 && car.speedKmh < 35 && driving) spawnTireSmoke();
    car.worldSpeed = (car.speedKmh / 197) * 20.0;
    updateTestTelemetry();
}

function processReverseEngineeredAudio(dt) {
    const signal = voiceInput.analyze(dt, {
        aiEnabled: document.getElementById('voice-ai').checked,
        blendEnabled: document.getElementById('voice-blend').checked,
        rpmPerHz: Number(document.getElementById('rpm-scale').value)
    });
    if (!signal) return;
    const now = simulationTime;
    const step = dt * 60;
    const profile = getSoundProfile();
    const activityRms = signal.activityRms;
    virtualButtonPress = signal.press;
    document.getElementById('pitch-hz').textContent = Math.round(signal.pitchHz) + ' Hz';
    updateVirtualButtonUI(virtualButtonPress);

    const hasSound = signal.active;
    const puff = exhaustFeedback.update({ active: hasSound, rms: activityRms, gate: voiceInput.gate,
        press: virtualButtonPress, pitchHz: signal.pitchHz }, dt);
    if (puff) spawnExhaustPuff(puff);
    const nextAutomaticGear = autoNeutral.update(hasSound, virtualButtonPress, gear, car.speedKmh, dt);
    if (nextAutomaticGear !== null) setAutomaticGear(nextAutomaticGear);
    if (profile === 'voice' && gear > 0 && !isBraking) processVoiceShift(now, dt, signal);
    else { voiceUpshift.reset(); voiceCut.reset(); voiceDownshift.reset(); shiftDipActive = false; }
    driveFeedback.update(gear, currentRpm, virtualButtonPress, hasSound, isBraking, dt);
    if (driveFeedback.engineFailed) {
        car.speedKmh = car.worldSpeed = 0;
        currentRpm = virtualButtonPress = 0;
        updateVirtualButtonUI(0); updateTestTelemetry();
        showRunEnd(true, 'engine');
        return;
    }

    if (gear === 0) {
        // Neutral disconnects drive; sound can freely rev the engine.
        car.speedKmh = Math.max(0, car.speedKmh - (isBraking ? 50 : 12) * dt);
        const targetRpm = profile === 'engine' ? signal.rpm / 1000 : 1 + virtualButtonPress * 8.8;
        currentRpm += (targetRpm - currentRpm) * (1 - Math.exp(-dt / 0.07));
    } else if (isBraking || !hasSound || virtualButtonPress <= 0.08) {
        // No sound releases the pedal immediately, while momentum drains gradually.
        car.speedKmh = Math.max(0, car.speedKmh - (isBraking ? 50 : 12) * dt);
        const rollingRpm = 0.9 + (car.speedKmh / gearTopSpeeds[gear]) * 8.7;
        const targetRpm = car.speedKmh < 1.5 ? 1 : Math.max(1, Math.min(9.6, rollingRpm));
        currentRpm += (targetRpm - currentRpm) * (1 - Math.exp(-dt / 0.12));
    } else if (profile === 'engine') {
        const nextGear = transmission.update(signal.rpm, gear, dt);
        if (nextGear > gear) shiftGearUp();
        const targetSpeed = gearTopSpeeds[gear] * Math.max(0, (signal.rpm - 900) / 8700);
        car.speedKmh += (targetSpeed - car.speedKmh) * (1 - Math.exp(-dt / 0.35));
        currentRpm = signal.rpm / 1000;
    } else {
        // Preserve voice throttle and the existing upshift sweep in driving gears.
        const minSpeed = gearMinSpeeds[gear];
        const maxSpeed = gearTopSpeeds[gear];
        const targetSpeed = minSpeed + (maxSpeed - minSpeed) * Math.min(1, virtualButtonPress * 1.12);
        if (car.speedKmh < targetSpeed) {
            const acceleration = (0.42 + virtualButtonPress * 0.65) * (1.15 - gear * 0.11) * garage.power;
            const power = driveFeedback.limiting ? (driveFeedback.cutting ? 0 : 0.45) : 1;
            car.speedKmh = Math.min(maxSpeed, car.speedKmh + acceleration * power * step);
        } else if (!shiftDipActive) car.speedKmh = Math.max(minSpeed, car.speedKmh - 0.22 * step);
        const progress = (car.speedKmh - minSpeed) / Math.max(1, maxSpeed - minSpeed);
        const overrev = virtualButtonPress >= 0.97 ? Math.max(0, (progress - 0.9) / 0.1) * 0.5 : 0;
        const targetRpm = driveFeedback.limiting && virtualButtonPress >= 0.97 ? 10
            : 3.6 + progress * 4.4 + virtualButtonPress * 1.5 + overrev - (shiftDipActive ? 1.6 : 0);
        currentRpm += (Math.min(10, targetRpm) - currentRpm) * (1 - 0.75 ** step);
    }
    if (driveFeedback.cutting) car.speedKmh = Math.max(0, car.speedKmh - 10 * dt);
    if (gear === 1 && currentRpm > 5.5 && car.speedKmh < 35 && hasSound) spawnTireSmoke();
    if (transmission.shouldDownshift(gear, car.speedKmh, dt, (now - lastShiftTime) / 1000, !hasSound)) {
        shiftGearDown();
    }
    // Speed-matched gearbox (user request): while sound continues, a car that has settled in the
    // bottom fifth of its gear's speed range for a second, not speeding up, drops one gear.
    // The voice has priority: it waits while a gesture is being judged and for 4 s after a voice
    // shift. Silence keeps the rule above; the engine reference keeps its own transmission.
    const lowSpeed = gearMinSpeeds[gear] + (gearTopSpeeds[gear] - gearMinSpeeds[gear]) * 0.2;
    if (profile === 'engine' || gear < 2 || !hasSound || car.speedKmh >= lowSpeed) car.lowZone = null;
    else if (!car.lowZone || car.lowZone.since > now || car.speedKmh > car.lowZone.speed + 1) car.lowZone = { since: now, speed: car.speedKmh };   // entered, new run, or speeding up again
    const sinceVoiceShift = now - (car.voiceShiftAt ?? -Infinity);   // negative: left over from a previous run
    const voiceFirst = voiceInput.direction?.busy || (sinceVoiceShift >= 0 && sinceVoiceShift < 4000);
    if (car.lowZone && !voiceFirst && now - car.lowZone.since >= 1000 && (now - lastShiftTime) / 1000 >= 1.5) { car.lowZone = null; shiftGearDown(); }
    updateTestTelemetry();
    renderVoiceAIStatus();
    document.getElementById('signal-state').textContent = `Input: ${voiceInput.mode} · ${signal.pitchSource} · RMS ${(signal.rms * 100).toFixed(1)}% · ${signal.active ? 'signal detected' : 'pedal released'}`;
    const logTime = voiceInput.mode === 'reference' && !raceEnabled ? referenceVideo.currentTime : now / 1000;
    if (logTime - lastLogTime >= 0.1) {
        runRows.push([logTime.toFixed(2), voiceInput.mode, document.getElementById('input-profile').value, signal.pitchHz.toFixed(1), signal.rms.toFixed(4), Math.round(currentRpm * 1000), Math.round(virtualButtonPress * 100), gear || 'N', car.speedKmh.toFixed(1), signal.pitchSource]);
        if (runRows.length > 18000) runRows.shift();
        lastLogTime = logTime;
        document.getElementById('export-test').disabled = false;
    }

    // Convert km/h (0 - 197) to 2D Road Scroll Speed
    car.worldSpeed = (car.speedKmh / 197) * 20.0;


}

// Draw the Blue 0-10 Tachometer + Yellow & Red Shift Lights from the Reference Video
function drawBlueTachometer() {
    const w = tachoCanvas.width;
    const h = tachoCanvas.height;
    const cx = w / 2;
    const cy = h / 2 + 8;
    const radius = 78;

    tCtx.clearRect(0, 0, w, h);

    // 1. Yellow Warning Shift Light (Top Left of Gauge - Lights up when RPM >= 7.8)
    const yellowOn = currentRpm >= 7.8;
    tCtx.beginPath();
    tCtx.arc(cx - 68, cy - 64, 9, 0, Math.PI * 2);
    tCtx.fillStyle = yellowOn ? '#ffea00' : '#4a3500';
    if (yellowOn) {
        tCtx.shadowColor = '#ffea00';
        tCtx.shadowBlur = 18;
    }
    tCtx.fill();
    tCtx.shadowBlur = 0;
    tCtx.strokeStyle = '#888';
    tCtx.lineWidth = 2;
    tCtx.stroke();

    // 2. Red Redline Light (Top Right of Gauge - Lights up when RPM >= 9.0)
    const redOn = currentRpm >= 9.0;
    tCtx.beginPath();
    tCtx.arc(cx + 68, cy - 64, 9, 0, Math.PI * 2);
    tCtx.fillStyle = redOn ? '#ff1744' : '#4a0000';
    if (redOn) {
        tCtx.shadowColor = '#ff1744';
        tCtx.shadowBlur = 20;
    }
    tCtx.fill();
    tCtx.shadowBlur = 0;
    tCtx.strokeStyle = '#888';
    tCtx.lineWidth = 2;
    tCtx.stroke();

    // 3. Metallic bezel and blue face inspired by the reference.
    tCtx.beginPath();
    tCtx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
    tCtx.fillStyle = '#777';
    tCtx.fill();

    const grad = tCtx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    grad.addColorStop(0, '#0d1b3e');
    grad.addColorStop(0.75, '#152c69');
    grad.addColorStop(1, '#081026');
    tCtx.beginPath();
    tCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    tCtx.fillStyle = grad;
    tCtx.fill();

    // Angle range for 0 to 10 (0 at bottom-left ~135 deg, 10 at bottom-right ~45 deg)
    const startAng = 0.75 * Math.PI;
    const endAng = 2.15 * Math.PI;

    // Redline Zone (9 to 10)
    const ang9 = startAng + (9 / 10) * (endAng - startAng);
    tCtx.strokeStyle = '#ff1744';
    tCtx.lineWidth = 6;
    tCtx.beginPath();
    tCtx.arc(cx, cy, radius - 5, ang9, endAng);
    tCtx.stroke();

    // Numbers 0 to 10
    tCtx.fillStyle = '#fff';
    tCtx.font = 'italic bold 13px Arial';
    tCtx.textAlign = 'center';
    tCtx.textBaseline = 'middle';

    for (let n = 0; n <= 10; n++) {
        let ang = startAng + (n / 10) * (endAng - startAng);
        let nx = cx + Math.cos(ang) * (radius - 20);
        let ny = cy + Math.sin(ang) * (radius - 20);
        tCtx.fillText(n.toString(), nx, ny);

        // Major Tick
        tCtx.strokeStyle = '#fff';
        tCtx.lineWidth = 2;
        tCtx.beginPath();
        tCtx.moveTo(cx + Math.cos(ang) * (radius - 9), cy + Math.sin(ang) * (radius - 9));
        tCtx.lineTo(cx + Math.cos(ang) * (radius - 2), cy + Math.sin(ang) * (radius - 2));
        tCtx.stroke();
    }

    // RPM X1000 Text
    tCtx.fillStyle = '#ddd';
    tCtx.font = 'bold 11px Arial';
    tCtx.fillText('RPM', cx, cy - 22);
    tCtx.font = '9px Arial';
    tCtx.fillText('X1000', cx, cy - 11);

    // Digital LCD Speed Box inside Gauge (0 to 197)
    tCtx.fillStyle = '#9ead9e';
    tCtx.beginPath();
    tCtx.roundRect(cx - 26, cy + 16, 52, 22, 4);
    tCtx.fill();
    tCtx.strokeStyle = '#222';
    tCtx.lineWidth = 1.5;
    tCtx.stroke();

    tCtx.fillStyle = '#111';
    tCtx.font = 'bold 16px "Courier New", monospace';
    tCtx.fillText(Math.round(car.speedKmh).toString(), cx, cy + 28);

    // Red RPM Needle
    let clamped = Math.max(0, Math.min(10, currentRpm));
    if (driveFeedback.limiting && !motionPreference.matches) clamped = Math.max(0, Math.min(10, clamped + Math.sin(simulationTime * 0.14) * 0.18));
    let needleAng = startAng + (clamped / 10) * (endAng - startAng);

    tCtx.save();
    tCtx.translate(cx, cy);
    tCtx.rotate(needleAng);
    tCtx.strokeStyle = '#ff1744';
    tCtx.lineWidth = 3;
    tCtx.beginPath();
    tCtx.moveTo(-10, 0);
    tCtx.lineTo(radius - 10, 0);
    tCtx.stroke();
    tCtx.restore();

    // Center Cap
    tCtx.fillStyle = '#222';
    tCtx.beginPath();
    tCtx.arc(cx, cy, 8, 0, Math.PI * 2);
    tCtx.fill();

    // Progressive shift lights and an up-chevron: symbols, never a text prompt.
    const lamps = gear > 0 ? Math.max(0, Math.min(5, Math.floor((currentRpm - 6.8) / 0.45))) : 0;
    for (let i = 0; i < 5; i++) {
        tCtx.fillStyle = i < lamps ? (i < 2 ? '#00e676' : i < 4 ? '#ffea00' : '#ff1744') : '#303943';
        tCtx.beginPath(); tCtx.roundRect(cx - 31 + i * 13, 6, 10, 5, 2); tCtx.fill();
    }
    if (driveFeedback.shiftReady) {
        tCtx.strokeStyle = currentRpm > 9.5 ? '#ff8585' : currentRpm >= 8.5 ? '#00e676' : '#ffea00';
        tCtx.lineWidth = 3;
        for (let y = cy - 48; y <= cy - 40; y += 8) {
            tCtx.beginPath(); tCtx.moveTo(cx - 7, y + 5); tCtx.lineTo(cx, y); tCtx.lineTo(cx + 7, y + 5); tCtx.stroke();
        }
    }
    const meterLabel = driveFeedback.limiting ? 'Rev limiter active. Shift up if a higher gear is available.'
        : driveFeedback.shiftReady ? `${revShiftTiming(currentRpm).label} window. Up arrow illuminated.` : 'RPM and speed meter';
    if (tachoCanvas.getAttribute('aria-label') !== meterLabel) tachoCanvas.setAttribute('aria-label', meterLabel);
    drawSpeedometer();
}

function drawSpeedometer() {
    const cx = 80, cy = 80, radius = 70;
    const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    const speed = Math.max(0, Math.min(200, car.speedKmh));
    sCtx.clearRect(0, 0, speedoCanvas.width, speedoCanvas.height);

    const bezel = sCtx.createLinearGradient(0, 4, 0, 156);
    bezel.addColorStop(0, '#b8bec5'); bezel.addColorStop(0.5, '#454b52'); bezel.addColorStop(1, '#7d8792');
    sCtx.fillStyle = bezel;
    sCtx.beginPath(); sCtx.arc(cx, cy, radius + 6, 0, Math.PI * 2); sCtx.fill();
    const face = sCtx.createRadialGradient(cx, cy - 15, 8, cx, cy, radius);
    face.addColorStop(0, '#152c69'); face.addColorStop(1, '#081026');
    sCtx.fillStyle = face;
    sCtx.beginPath(); sCtx.arc(cx, cy, radius, 0, Math.PI * 2); sCtx.fill();

    sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle';
    sCtx.font = 'bold 10px "Courier New", monospace';
    for (let value = 0; value <= 200; value += 10) {
        const angle = start + value / 200 * sweep;
        const major = value % 40 === 0;
        sCtx.strokeStyle = major ? '#edf0f3' : '#7d91bd'; sCtx.lineWidth = major ? 2 : 1;
        sCtx.beginPath();
        sCtx.moveTo(cx + Math.cos(angle) * (radius - (major ? 10 : 6)), cy + Math.sin(angle) * (radius - (major ? 10 : 6)));
        sCtx.lineTo(cx + Math.cos(angle) * (radius - 3), cy + Math.sin(angle) * (radius - 3)); sCtx.stroke();
        if (major) {
            sCtx.fillStyle = '#edf0f3';
            sCtx.fillText(String(value), cx + Math.cos(angle) * (radius - 22), cy + Math.sin(angle) * (radius - 22));
        }
    }

    const angle = start + speed / 200 * sweep;
    sCtx.strokeStyle = '#ff1744'; sCtx.lineWidth = 3;
    sCtx.beginPath(); sCtx.moveTo(cx - Math.cos(angle) * 8, cy - Math.sin(angle) * 8);
    sCtx.lineTo(cx + Math.cos(angle) * (radius - 13), cy + Math.sin(angle) * (radius - 13)); sCtx.stroke();
    sCtx.fillStyle = '#222'; sCtx.beginPath(); sCtx.arc(cx, cy, 6, 0, Math.PI * 2); sCtx.fill();

    sCtx.fillStyle = '#edf0f3'; sCtx.font = 'bold 22px "Courier New", monospace';
    sCtx.fillText(String(Math.round(car.speedKmh)), cx, cy + 24);
    sCtx.fillStyle = '#b6bec7'; sCtx.font = 'bold 10px "Courier New", monospace';
    sCtx.fillText('KM/H', cx, cy + 41);
    const label = `Estimated speed: ${Math.round(car.speedKmh)} kilometers per hour`;
    if (speedoCanvas.getAttribute('aria-label') !== label) speedoCanvas.setAttribute('aria-label', label);
}

function spawnTireSmoke() {
    if (tireSmokeParticles.length >= 80) return;
    for (const side of [-1, 1]) {
        const point = playerPoint(side * (car.width / 2 - 2), car.height / 2 - 14);
        tireSmokeParticles.push({ x: point.x + (Math.random() - 0.5) * 6, y: point.y,
            r: 5 + Math.random() * 5, alpha: 0.55 });
    }
}

function spawnExhaustPuff(strength, bang = false) {
    const count = bang ? 8 : Math.ceil(2 + strength * 4);
    for (let i = 0; i < count; i++) {
        const point = playerPoint(i % 2 ? 8 : -8, car.height / 2 + 2);
        exhaustParticles.push({ x: point.x, y: point.y,
        vx: (Math.random() - 0.5) * (14 + strength * 20), vy: 35 + strength * 65 + car.speedKmh * 0.35,
        r: 2 + strength * 2, life: 0.4 + strength * 0.28, age: 0, strength, bang
    });
    }
    if (exhaustParticles.length > 100) exhaustParticles.splice(0, exhaustParticles.length - 100);
}

function spawnEnemy(yPos = -120) {
    let lane = Math.floor(Math.random() * 4);
    let ex = roadLeft + (lane * laneWidth) + (laneWidth - 46) / 2;
    
    for (let e of enemies) {
        if (Math.abs(e.y - yPos) < 175 && e.lane === lane) return;
    }

    const colors = ['#d500f9', '#ff1744', '#ff9100', '#00bfa5'];
    let color = colors[Math.floor(Math.random() * colors.length)];
    let enemySpeed = 45 + Math.random() * 40;

    enemies.push({ x: ex, y: yPos, width: 46, height: 86, speedKmh: enemySpeed, lane: lane, color: color });
}

function drawRoundedCar(x, y, w, h, bodyColor, isPlayer, angle = 0, context = ctx) {
    const ctx = context;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate(angle); x = -w / 2; y = -h / 2;
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 6, w, h, 12);
    ctx.fill();

    // Tires
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 3, y + 12, 4, 18);
    ctx.fillRect(x + w - 1, y + 12, 4, 18);
    ctx.fillRect(x - 3, y + h - 28, 4, 18);
    ctx.fillRect(x + w - 1, y + h - 28, 4, 18);

    // Body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();

    // Yellow Stripes for Player
    if (isPlayer) {
        ctx.fillStyle = '#ffca28';
        ctx.fillRect(x + w / 2 - 6, y + 2, 4, h - 4);
        ctx.fillRect(x + w / 2 + 2, y + 2, 4, h - 4);
    }

    // Glass
    ctx.fillStyle = '#1a237e';
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 20, w - 12, h - 42, 6);
    ctx.fill();

    // Roof
    ctx.fillStyle = bodyColor;
    ctx.fillRect(x + 8, y + 34, w - 16, 22);

    // Headlights
    ctx.fillStyle = '#fff9c4';
    ctx.beginPath();
    ctx.arc(x + 8, y + 5, 4, 0, Math.PI * 2);
    ctx.arc(x + w - 8, y + 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // A short backfire belongs to a voiced downshift, rather than high RPM alone.
    if (isPlayer) {
        for (const offset of [-8, 8]) {
            ctx.fillStyle = '#222'; ctx.fillRect(x + w / 2 + offset - 3, y + h - 2, 6, 5);
            if (exhaustFlash > 0) {
                const length = 12 + exhaustFlash / 0.12 * 16;
                ctx.fillStyle = '#ff9100'; ctx.beginPath();
                ctx.moveTo(x + w / 2 + offset - 4, y + h + 2);
                ctx.lineTo(x + w / 2 + offset + 4, y + h + 2);
                ctx.lineTo(x + w / 2 + offset, y + h + length); ctx.fill();
                ctx.fillStyle = '#fff3b0'; ctx.fillRect(x + w / 2 + offset - 1, y + h + 2, 2, length * 0.4);
            }
        }
    }

    ctx.restore();
}

function playerPose() {
    return { x: car.x + road.offsetAt(car.y + car.height / 2), y: car.y, angle: road.headingAt(car.y + car.height / 2) + road.yaw };
}
function playerPoint(localX, localY) {
    const pose = playerPose(), cosine = Math.cos(pose.angle), sine = Math.sin(pose.angle);
    return { x: pose.x + car.width / 2 + localX * cosine - localY * sine,
        y: car.y + car.height / 2 + localX * sine + localY * cosine };
}
function vehiclePose(vehicle) {
    return { x: vehicle.x + road.offsetAt(vehicle.y + vehicle.height / 2), y: vehicle.y, angle: road.headingAt(vehicle.y + vehicle.height / 2) };
}
// Two ways a run ends early: an accident (our front into the back of a car) or a blown engine.
function showRunEnd(crashed, reason = 'accident', vehicle = null) {
    if (isGameOver) return;
    clearHeldControls(); isGameOver = true; settingsResumeReference = false;
    if (voiceInput.mode === 'reference') referenceVideo.pause();
    if (!crashed && raceEnabled) {
        score += [0, 1000, 600, 300, 100][race.position];
        renderGarage();
        const saved = revSaveRace(gameStorage, { course: courseKey(), time: race.time, score: Math.round(score), place: race.position });
        renderLeaderboard();
        if (!saved) document.getElementById('leaderboard-note').textContent = 'Result shown here; device storage is unavailable.';
    }
    document.getElementById('score').textContent = Math.floor(score);
    // A driver who is out ranks behind everyone still running, whatever their distance.
    const standings = raceEnabled ? race.standings() : [];
    if (crashed && standings.length) standings.push(...standings.splice(standings.findIndex(r => r.player), 1));
    const rows = raceEnabled ? `<table class="results-table"><thead><tr><th>Place</th><th>Driver</th><th>${crashed ? 'Distance' : 'Finish'}</th></tr></thead><tbody>${standings.map((r, i) => `<tr><td>${i + 1}</td><td>${r.name}</td><td>${r.player && crashed ? 'Out · ' : ''}${r.finishTime !== null ? revRaceTime(r.finishTime) : (r.distance / 1000).toFixed(2) + ' km'}</td></tr>`).join('')}</tbody></table>` : '';
    const overlay = document.getElementById('overlay');
    const engineFailure = crashed && reason === 'engine';
    const hit = vehicle?.name || 'a traffic car';
    overlay.innerHTML = `<h1>${engineFailure ? 'Engine blown' : crashed ? 'Accident' : 'Race finished'}</h1><p>${engineFailure ? 'Held at the 10k redline for more than 3 seconds.<br>Shift up in time, or ease off the throttle.<br>' : crashed ? `You hit the back of ${hit}.<br>Side contact is allowed; never hit a car from behind.<br>` : ''}${raceEnabled ? `${race.distance.toFixed(0)} / ${race.length} m · ${revRaceTime(race.time)}<br>` : ''}Score: <b>${Math.floor(score)}</b>${!crashed ? `<br>Position: <b>${race.position} / 4</b>` : ''}</p>${rows}<button class="action-btn" id="restart-btn">${raceEnabled ? 'RACE AGAIN' : 'TRY AGAIN'}</button>`;
    overlay.style.display = 'flex';
    document.getElementById('restart-btn').addEventListener('click', () => {
        resetGame(); startLoop();
        if (voiceInput.mode === 'reference' && referenceVideo.paused) referenceVideo.play().catch(() => {});
    });
}
// Side contact, or a car running into us from behind: sparks and a little lost speed, no crash.
function bumpVehicle(vehicle, contact, player, other) {
    if (simulationTime - (vehicle.bumpedAt ?? -Infinity) < 350) return;
    vehicle.bumpedAt = simulationTime;
    if (contact.kind === 'side') {
        const away = (player.left + player.right) / 2 < (other.left + other.right) / 2 ? -1 : 1;
        car.x += away * (contact.overlapX + 3);
        road.lateralVelocity = away * 70;
        car.speedKmh = Math.max(0, car.speedKmh - 8);
    } else if (vehicle.name) {   // a rival ran into us: it loses its run-up
        vehicle.speedKmh = Math.min(vehicle.speedKmh, car.speedKmh * 0.9);
        vehicle.distance -= (contact.overlapY + 4) / 4.5;
    } else {
        vehicle.speedKmh = Math.max(0, Math.min(vehicle.speedKmh, car.speedKmh - 6));
        vehicle.y += contact.overlapY + 4;
    }
    impacts.push({ x: (Math.max(player.left, other.left) + Math.min(player.right, other.right)) / 2,
        y: (Math.max(player.top, other.top) + Math.min(player.bottom, other.bottom)) / 2, kind: contact.kind, time: simulationTime });
    if (impacts.length > 12) impacts.shift();
}
function stepDrivingScene(dt) {
    const frameStep = dt * 60;
    const scroll = car.worldSpeed * 1.9 * frameStep;
    road.distance = (road.distance + scroll) % (Math.PI * 400 * 2 / 0.45);
    road.step(car, Number(moveRight) - Number(moveLeft), gear > 0 ? Number(driftRight) - Number(driftLeft) : 0, dt);
    if (revCourse) revCourse.apply({ car, road, gear, metres: race.distance, dt });
    car.worldSpeed = car.speedKmh / 197 * 20;
    if (car.worldSpeed > 0.05) {
        roadOffset = (roadOffset + scroll) % 70;
        sceneryDistance = (sceneryDistance + scroll) % 1440;
        score += car.worldSpeed * 0.06 * frameStep;
        if (road.drifting && !road.offRoad) score += car.speedKmh / 30 * dt;
        trafficSpawnDistance += car.speedKmh / 3.6 * dt;
        if (trafficEnabled && trafficSpawnDistance >= REV_DIFFICULTIES[difficulty].trafficSpacing) { trafficSpawnDistance %= REV_DIFFICULTIES[difficulty].trafficSpacing; spawnEnemy(-120); }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
        enemies[i].y += (car.speedKmh - enemies[i].speedKmh) / 3.6 * 4.5 * dt;
        if (enemies[i].y > canvas.height + 130 || enemies[i].y < -1500) enemies.splice(i, 1);
    }
    const finished = race.update(dt, car.speedKmh, gear > 0, road.bendAt(car.y));
    for (const rival of (raceEnabled ? race.rivals : [])) {
        rival.y = car.y - (rival.distance - race.distance) * 4.5;
        rival.blockedSpeed = null;
        // Another player's car follows its own steering (network), not the rival lane logic.
        if (rival.remote) { if (Number.isFinite(rival.netX)) rival.x += (rival.netX - rival.x) * (1 - Math.exp(-dt / 0.12)); continue; }
        if (trafficEnabled && rival.y > -120 && rival.y < canvas.height + 120) {
            const obstacle = enemies.find(e => e.lane === rival.lane && e.y < rival.y && rival.y - e.y < 180);
            if (obstacle) {
                const lane = [rival.lane - 1, rival.lane + 1].find(l => l >= 0 && l < 4
                    && !enemies.some(e => e.lane === l && Math.abs(e.y - rival.y) < 190)
                    && !race.rivals.some(r => r !== rival && r.lane === l && Math.abs(r.y - rival.y) < 130));
                if (lane !== undefined) rival.lane = lane;
                else rival.blockedSpeed = obstacle.speedKmh;
            }
        }
        const target = roadLeft + rival.lane * laneWidth + (laneWidth - rival.width) / 2;
        rival.x += (target - rival.x) * (1 - Math.exp(-dt / 0.45));
    }
    document.getElementById('score').textContent = Math.floor(score);
    renderRaceHUD(); updateTestTelemetry();
    if (finished) { showRunEnd(false); return false; }
    const player = playerPose();
    const bounds = RevRoadScene.bounds(player.x, player.y, car.width, car.height, player.angle);
    // Other players' cars arrive with network delay, so they never cause contact.
    const vehicles = [...enemies, ...(raceEnabled && race.started ? race.rivals.filter(r => !r.remote) : [])];
    for (const vehicle of vehicles) {
        if (Math.abs(vehicle.y - car.y) > 150) continue;
        const pose = vehiclePose(vehicle);
        const other = RevRoadScene.bounds(pose.x, pose.y, vehicle.width, vehicle.height, pose.angle);
        if (!RevRoadScene.overlaps(bounds, other)) continue;
        const contact = RevRoadScene.contact(bounds, other);
        if (contact.kind === 'rear-end') { showRunEnd(true, 'accident', vehicle); return false; }
        bumpVehicle(vehicle, contact, bounds, other);
    }
    // Career obstacles cost speed (and throw sparks); they never end the run.
    if (revCourse) for (const entry of revCourse.obstaclesNear(race.distance, car.y, y => road.offsetAt(y), REV_LANE_X)) {
        if (!RevRoadScene.overlaps(bounds, entry.bounds)) continue;
        if (revCourse.hit(entry, car, dt)) impacts.push({ x: entry.x + entry.width / 2, y: entry.y + entry.height / 2, kind: 'obstacle', time: simulationTime });
    }
    for (let i = skidMarks.length - 1; i >= 0; i--) {
        const mark = skidMarks[i]; mark.y += scroll; mark.life -= dt;
        if (mark.life <= 0 || mark.y > canvas.height + 30) skidMarks.splice(i, 1);
    }
    skidClock += dt;
    if (road.drifting && skidClock >= 0.06) {
        skidClock = 0; spawnTireSmoke();
        for (const side of [-1, 1]) {
            const point = playerPoint(side * (car.width / 2 - 2), car.height / 2 - 14);
            skidMarks.push({ x: point.x - road.offsetAt(point.y), y: point.y, angle: player.angle, life: 1.4 });
        }
        if (skidMarks.length > 90) skidMarks.splice(0, skidMarks.length - 90);
    }
    return true;
}

function update(timestamp) {
    if (isGameOver) { running = false; return; }
    requestAnimationFrame(update);
    const dt = lastFrameTime ? Math.min(0.05, (timestamp - lastFrameTime) / 1000) : 1 / 60;
    lastFrameTime = timestamp;
    if (settingsPaused || (voiceInput.mode === 'none' && controlMode !== 'manual') || (controlMode !== 'manual' && voiceInput.mode === 'reference' && (referenceVideo.paused || referenceVideo.seeking || referenceVideo.readyState < 3))) {

        drawBlueTachometer(); draw(); return;
    }
    const frameStep = dt * 60;
    simulationTime += dt * 1000;
    frames++;
    if (controlMode === 'manual') processManualDrive(dt);
    else processReverseEngineeredAudio(dt);
    if (isGameOver) { drawBlueTachometer(); draw(); return; }

    if (!stepDrivingScene(dt)) { drawBlueTachometer(); draw(); return; }
    drawBlueTachometer();

    for (let i = tireSmokeParticles.length - 1; i >= 0; i--) {
        const p = tireSmokeParticles[i];
        p.y += 2 * frameStep;
        p.r += 0.6 * frameStep;
        p.alpha -= 0.025 * frameStep;
        if (p.alpha <= 0) tireSmokeParticles.splice(i, 1);
    }
    exhaustFlash = Math.max(0, exhaustFlash - dt);
    for (let i = exhaustParticles.length - 1; i >= 0; i--) {
        const p = exhaustParticles[i]; p.age += dt;
        if (p.age >= p.life) { exhaustParticles.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += (motionPreference.matches ? 7 : 14) * dt;
    }
    draw();
}

function drawRoadside() {
    // Long, staggered spacing avoids the repeating lane marks' high-speed aliasing.
    for (let side = 0; side < 2; side++) {
        for (let i = 0; i < 9; i++) {
            const y = ((i * 160 + side * 77 + sceneryDistance) % 1440) - 100;
            const x = (side === 0 ? 31 + (i % 3) * 13 : canvas.width - 31 - (i % 3) * 13) + road.offsetAt(y);
            const size = 19 + (i % 3) * 3;
            const trail = motionPreference.matches ? 0 : Math.max(0, car.speedKmh - 55) * 0.22;
            if (trail > 0) {
                const fade = ctx.createLinearGradient(0, y - size - trail, 0, y + size);
                fade.addColorStop(0, 'rgba(24, 65, 29, 0)'); fade.addColorStop(1, 'rgba(24, 65, 29, 0.22)');
                ctx.fillStyle = fade; ctx.beginPath();
                ctx.roundRect(x - size * 0.65, y - size - trail, size * 1.3, size * 2 + trail, size * 0.65); ctx.fill();
            }
            ctx.fillStyle = 'rgba(12, 29, 19, 0.3)';
            ctx.beginPath(); ctx.ellipse(x + 7, y + 10, size, size * 0.8, 0.3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#62462d'; ctx.fillRect(x - 4, y, 8, size + 5);
            for (const [dx, dy, scale, color] of [[0, 0, 1, '#183e27'], [-7, -4, 0.72, '#256139'], [7, -8, 0.68, '#327c43'], [-2, -13, 0.58, '#44914d']]) {
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + dx, y + dy, size * scale, 0, Math.PI * 2); ctx.fill();
            }
            const postX = (side === 0 ? roadLeft - 15 : roadLeft + roadWidth + 9) + road.offsetAt(y + 45);
            ctx.fillStyle = '#e0e0d5'; ctx.fillRect(postX, y + 45, 6, 14);
            ctx.fillStyle = '#26302d'; ctx.fillRect(postX, y + 47, 6, 5);
        }
    }
}

function draw() {
    // 1. Grass
    ctx.fillStyle = '#558b2f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#4b7c29';
    for (let i = -70; i < canvas.height; i += 70) {
        ctx.fillRect(0, i + roadOffset, canvas.width, 35);
    }
    drawRoadside();

    // Road, curbs and lane marks all follow the same sampled curve.
    ctx.fillStyle = '#2b2b2b'; ctx.beginPath();
    for (let y = -36; y <= canvas.height + 36; y += 12) {
        const x = roadLeft + road.offsetAt(y); if (y === -36) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let y = canvas.height + 36; y >= -36; y -= 12) ctx.lineTo(roadLeft + roadWidth + road.offsetAt(y), y);
    ctx.closePath(); ctx.fill();
    for (const [base, color, width] of [[roadLeft - 3, '#bdbdbd', 6], [roadLeft + roadWidth + 3, '#bdbdbd', 6], [roadLeft + roadWidth / 2, '#fbc02d', 6]]) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
        for (let y = -36; y <= canvas.height + 36; y += 12) { const x = base + road.offsetAt(y); if (y === -36) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
    }
    ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 4;
    for (let y = -70; y < canvas.height; y += 70) for (const lane of [1, 3]) {
        const base = roadLeft + laneWidth * lane, start = y + roadOffset;
        ctx.beginPath(); ctx.moveTo(base + road.offsetAt(start), start);
        for (let step = 10; step <= 40; step += 10) ctx.lineTo(base + road.offsetAt(start + step), start + step);
        ctx.stroke();
    }
    if (raceEnabled) {
        const finishY = car.y - (race.length - race.distance) * 4.5;
        if (finishY > -30 && finishY < canvas.height + 30) for (let row = 0; row < 2; row++) for (let col = 0; col < 20; col++) {
            ctx.fillStyle = (row + col) % 2 ? '#edf0f3' : '#101318';
            ctx.fillRect(roadLeft + road.offsetAt(finishY + row * 9) + col * roadWidth / 20, finishY + row * 9, roadWidth / 20 + 0.5, 9);
        }
    }
    for (const mark of skidMarks) {
        ctx.strokeStyle = `rgba(8, 10, 12, ${mark.life / 1.4 * 0.6})`; ctx.lineWidth = 4;
        const endY = mark.y + Math.cos(mark.angle) * 16;
        ctx.beginPath(); ctx.moveTo(mark.x + road.offsetAt(mark.y), mark.y);
        ctx.lineTo(mark.x - Math.sin(mark.angle) * 16 + road.offsetAt(endY), endY); ctx.stroke();
    }

    // 5. Tire Smoke Particles (Burnout in Gear 1)
    for (let i = tireSmokeParticles.length - 1; i >= 0; i--) {
        let p = tireSmokeParticles[i];
        ctx.fillStyle = `rgba(220, 220, 220, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }

    // 6. Traffic Cars
    for (const p of exhaustParticles) {
        ctx.fillStyle = `rgba(${p.bang ? '137, 142, 149' : '205, 212, 218'}, ${(1 - p.age / p.life) * (0.16 + p.strength * 0.28)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    for (const vehicle of [...enemies, ...(raceEnabled ? race.rivals : [])]) {
        if (vehicle.y < -100 || vehicle.y > canvas.height + 100) continue;
        const pose = vehiclePose(vehicle);
        drawRoundedCar(pose.x, pose.y, vehicle.width, vehicle.height, vehicle.color, false, pose.angle);
        if (vehicle.name) {
            ctx.fillStyle = '#111a22'; ctx.fillRect(pose.x - 3, pose.y - 18, 52, 15);
            ctx.fillStyle = vehicle.color; ctx.font = 'bold 10px "Courier New", monospace'; ctx.textAlign = 'center';
            ctx.fillText(vehicle.name, pose.x + 23, pose.y - 7);
        }
    }

    const pose = playerPose();
    let shakeX = (!motionPreference.matches && currentRpm > 3.0 && car.speedKmh === 0) ? (Math.random() - 0.5) * 2.2 : 0;
    if (driveFeedback.limiting && !motionPreference.matches) shakeX += Math.sin(simulationTime * 0.14) * 1.3;
    drawRoundedCar(pose.x + shakeX, pose.y, car.width, car.height, garage.car.color, true, pose.angle);
    // Side bumps and hits from behind throw a short spark burst.
    for (const hit of impacts) {
        const age = (simulationTime - hit.time) / 450;
        if (age < 0 || age > 1) continue;
        ctx.strokeStyle = `rgba(255, ${200 - age * 120}, 60, ${1 - age})`; ctx.lineWidth = 3;
        for (let ray = 0; ray < 10; ray++) {
            const angle = ray / 10 * Math.PI * 2, inner = 6 + age * 18, outer = 14 + age * 34;
            ctx.beginPath(); ctx.moveTo(hit.x + Math.cos(angle) * inner, hit.y + Math.sin(angle) * inner);
            ctx.lineTo(hit.x + Math.cos(angle) * outer, hit.y + Math.sin(angle) * outer); ctx.stroke();
        }
    }

}
try {
    const saved = JSON.parse(gameStorage.getItem('revline-course-v1') || '{}');
    if (Object.hasOwn(REV_DIFFICULTIES, saved.difficulty)) document.getElementById('difficulty').value = saved.difficulty;
    document.getElementById('traffic-enabled').checked = saved.traffic === true;
    document.getElementById('curves-enabled').checked = saved.curves === true;
    document.getElementById('race-enabled').checked = saved.race === true;
    if ([1000, 3000, 5000].includes(saved.distance)) document.getElementById('race-distance').value = saved.distance;
    if (REV_STEERING.includes(saved.steering) && document.getElementById('steering-mode')) document.getElementById('steering-mode').value = saved.steering;
} catch {}
applyCourseSettings(false);
resetGame(); renderGarage(); renderStore(); ensureVoiceAI(); drawBlueTachometer(); draw(); showGameMenu('home', false);
document.getElementById('garage-audio').addEventListener('ended', stopGaragePreview);
