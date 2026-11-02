// Manual controls (user request): the throttle revs by itself; gears change only with CLUTCH
// held + ▲ / ▼; shifts are graded like voice shifts; the engine still blows after 3 s at the
// redline; and Start needs no microphone. Runs the real game.js routines against stubs.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { RevDriveFeedback, revShiftTiming } = require('../driving-feedback.js');
const { RevExhaustFeedback } = require('../exhaust-feedback.js');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const routine = name => { const start = source.indexOf('function ' + name + '('); assert(start >= 0, name); return source.slice(start, source.indexOf('\n}', start) + 2); };

function game() {
    const elements = new Map(), element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, dataset: {}, textContent: '', setAttribute(k, v) { this[k] = v; } });
        return elements.get(id);
    };
    const reset = { reset() {} }, events = [];
    const state = {
        Math, CustomEvent: class { constructor(type) { this.type = type; } },
        window: { dispatchEvent: e => events.push(e.type) }, document: { getElementById: element },
        controlMode: 'manual', clutchHeld: false, manualPress: 0, clutchRpm: 0, settingsPaused: false, isGameOver: false, isBraking: false,
        gear: 0, currentRpm: 1, virtualButtonPress: 0, simulationTime: 0, lastShiftTime: 0, shiftDipActive: false, shiftAlertTimer: 0,
        car: { speedKmh: 0, worldSpeed: 0 }, garage: { power: 1 },
        gearTopSpeeds: [0, 48, 76, 102, 134, 166, 197], gearMinSpeeds: [0, 0, 32, 54, 78, 108, 138],
        driveFeedback: new RevDriveFeedback(), exhaustFeedback: new RevExhaustFeedback(), revShiftTiming,
        transmission: { reset() {}, noteShift() {} }, voiceUpshift: reset, voiceCut: reset, voiceDownshift: reset,
        updateGearDisplay() {}, updateTestTelemetry() {}, updateVirtualButtonUI() {}, spawnExhaustPuff() {}, spawnTireSmoke() {},
        setTimeout: () => 0, clearTimeout() {}, endings: [],
        showRunEnd(crash, kind) { state.endings.push(kind); state.isGameOver = true; }
    };
    vm.createContext(state);
    vm.runInContext(['setAutomaticGear', 'showShiftFeedback', 'shiftGearUp', 'shiftGearDown', 'manualShift', 'setClutch', 'processManualDrive'].map(routine).join('\n'), state);
    const drive = (seconds, dt = 1 / 60) => { for (let t = 0; t < seconds && !state.isGameOver; t += dt) { state.simulationTime += dt * 1000; state.processManualDrive(dt); } };
    return { state, drive, alert: () => element('gear-alert'), events };
}

// No clutch: the shift grinds and nothing changes.
const g = game();
g.drive(0.5);
assert.equal(g.state.gear, 0);
assert(g.state.manualPress > 0.1 && g.state.manualPress <= 0.15, 'Neutral idles: the throttle sits low');
assert(g.state.car.speedKmh === 0 && g.state.currentRpm < 2, 'Neutral: the engine revs gently, the car stays put');
g.state.manualShift(1);
assert.equal(g.state.gear, 0, '▲ without the clutch does nothing');
assert.match(g.alert().textContent, /HOLD CLUTCH/);
assert.deepEqual(g.events, ['revline:grind']);

// Clutch + ▲ from neutral selects 1st; release and the car pulls away, RPM low → high.
g.state.setClutch(true); g.state.manualShift(1); g.state.setClutch(false);
assert.equal(g.state.gear, 1);
g.drive(0.6);
assert(g.state.manualPress < 0.5, 'In gear the throttle builds up from low');
const rpmEarly = g.state.currentRpm, speedEarly = g.state.car.speedKmh;
g.drive(0.8);
assert(g.state.manualPress > 0.6);
assert(g.state.car.speedKmh > speedEarly && g.state.currentRpm > rpmEarly, 'Revs climb from low to high in gear');

// Clutch held: drive disconnected, the car rolls and RPM falls; the grade uses the clutch-in RPM.
g.drive(0.4);
const rpmAtClutch = g.state.currentRpm;
g.state.setClutch(true);
const speedClutch = g.state.car.speedKmh;
g.drive(0.5);
assert(g.state.manualPress < 0.1, 'No throttle with the clutch in');
assert(g.state.car.speedKmh <= speedClutch && g.state.car.speedKmh > speedClutch - 5, 'Coasting');
assert(g.state.currentRpm < rpmAtClutch, 'RPM falls with the clutch in');
g.state.manualShift(1);
assert.equal(g.state.gear, 2);
assert.equal(g.alert().dataset.grade, revShiftTiming(rpmAtClutch).grade, 'Graded at the RPM where the clutch went in');
g.state.setClutch(false);

// Clutch + ▼ shifts down; from 1st it selects neutral.
g.state.setClutch(true); g.state.manualShift(-1);
assert.equal(g.state.gear, 1);
g.state.manualShift(-1);
assert.equal(g.state.gear, 0, 'Clutch + ▼ in 1st = neutral');
g.state.setClutch(false);

// Staying in a gear at the redline blows the engine (same 3-second rule as voice driving).
const blow = game();
blow.state.setClutch(true); blow.state.manualShift(1); blow.state.setClutch(false);
blow.drive(12);
assert.deepEqual(blow.state.endings, ['engine'], 'Engine blown after holding the redline');

// Shifting in time never blows it, and 6th cruises under the redline.
const run = game();
run.state.setClutch(true); run.state.manualShift(1); run.state.setClutch(false);
for (let next = 2; next <= 6; next++) {
    for (let t = 0; t < 8 && run.state.currentRpm < 8.6; t += 1 / 60) { run.state.simulationTime += 1000 / 60; run.state.processManualDrive(1 / 60); }
    run.state.setClutch(true); run.state.manualShift(1); run.state.setClutch(false);
    assert.equal(run.state.gear, next);
}
run.drive(20);
assert.deepEqual(run.state.endings, [], 'Good shifts and 6th-gear cruising keep the engine alive');
assert(run.state.currentRpm < 10 && run.state.car.speedKmh > 150, 'Top gear cruises fast, under the limiter');

// Brake: throttle off, the car slows.
run.state.isBraking = true; const before = run.state.car.speedKmh; run.drive(1);
assert(run.state.car.speedKmh < before - 30 && run.state.manualPress < 0.1);

// Wiring: Start works without a microphone; voice mode keeps its rules.
assert(/function startDriving\(\)[\s\S]*controlMode === 'manual' \|\| microphoneLive\(\)/.test(source), 'Manual and an open mic start at once');
assert(/voiceInput\.mode === 'none' && controlMode !== 'manual'/.test(source), 'Manual mode runs without sound input');
assert(/controlMode === 'manual'\) processManualDrive\(dt\);\s*else processReverseEngineeredAudio\(dt\);/.test(source));
const bridge = fs.readFileSync(path.join(root, 'frontend/race/menu-bridge.js'), 'utf8');
assert(/REV_LOBBY_MIC_GRACE = 60000/.test(bridge) && /pagehide/.test(bridge), 'The lobby keeps a live mic for a minute, never after leaving');
const html = fs.readFileSync(path.join(root, 'frontend/race/index.html'), 'utf8');
for (const id of ['btn-clutch', 'btn-shift-up', 'btn-shift-down', 'control-mode']) assert(html.includes(`id="${id}"`), id);
console.log('Manual controls passed: auto throttle low→high, clutch required to shift, clutch-in grading, neutral via ▼, engine failure at the redline, clean 1→6 run, brakes, instant Start and the lobby microphone grace.');
