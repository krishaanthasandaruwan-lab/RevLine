const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { RevDriveFeedback, revShiftTiming } = require('../driving-feedback.js');
const { RevVoiceInput, REV_GEAR_MIN_SPEEDS } = require('../voice-input.js');
const source = fs.readFileSync(require.resolve('../game.js'), 'utf8');
function routine(name) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
function game() {
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) elements.set(id, { style: {}, dataset: {}, textContent: '', innerHTML: '', checked: true,
            value: id === 'rpm-scale' ? '12.5' : 'voice-custom', addEventListener() {} });
        return elements.get(id);
    }
    const voice = new RevVoiceInput();
    voice.analyze = () => ({ active: true, press: 1, gesturePress: 1, rms: 0.1, activityRms: 0.1, pitchHz: 300, pitchSource: 'AI voice' });
    const state = {
        gear: 3, currentRpm: 9.3, virtualButtonPress: 1, car: { speedKmh: 102, worldSpeed: 0 },
        gearTopSpeeds: [0, 48, 76, 102, 134, 166, 197], gearMinSpeeds: REV_GEAR_MIN_SPEEDS,
        simulationTime: 0, lastShiftTime: -1000, shiftDipActive: false, shiftAlertTimer: 0,
        voiceInput: voice, voiceUpshift: voice.upshift, voiceCut: voice.cut, voiceDownshift: voice.downshift,
        autoNeutral: voice.autoNeutral, transmission: voice.transmission, driveFeedback: new RevDriveFeedback(),
        exhaustFeedback: { update: () => null, downshift: () => null }, garage: { power: 1 }, isBraking: false,
        exhaustFlash: 0, isGameOver: false, settingsResumeReference: false, score: 0, raceEnabled: false,
        runRows: [], lastLogTime: -1, document: { getElementById: element }, revShiftTiming,
        clearTimeout() {}, setTimeout: () => 1, updateGearDisplay() {}, updateTestTelemetry() {},
        updateVirtualButtonUI(press) { state.lastDisplayedPress = press; },
        getSoundProfile: () => 'voice', renderVoiceAIStatus() {}, clearHeldControls() {},
        spawnExhaustPuff() {}, spawnTireSmoke() {}, renderGarage() {}, renderLeaderboard() {},
        revSaveRace() { throw Error('Engine failure must not save a finish'); }
    };
    vm.createContext(state);
    vm.runInContext(['showShiftFeedback','shiftGearUp','shiftGearDown','setAutomaticGear','processVoiceShift',
        'processReverseEngineeredAudio','showRunEnd'].map(routine).join('\n'), state);
    return { state, element };
}

for (const [rpm, grade] of [[7, 'early'], [8, 'early'], [8.5, 'perfect'], [9.5, 'perfect'], [9.8, 'late']]) {
    const { state, element } = game(); state.currentRpm = rpm;
    state.shiftGearUp();
    assert.equal(state.gear, 4);
    assert.equal(element('gear-alert').dataset.grade, grade, 'Grade is based on RPM before the shift drop');
    assert(element('gear-alert').textContent.includes('GEAR 4 ▲'));
    assert.equal(state.driveFeedback.redlineTime, 0);
    state.shiftGearDown();
    assert.equal(state.gear, 3);
    assert.equal(element('gear-alert').textContent, 'GEAR 3 ▼', 'A recognised downshift has visible feedback too');
}

for (const fps of [30, 60, 120]) {
    const probe = game().state;
    probe.currentRpm = 7.5; probe.car.speedKmh = 50;
    probe.voiceInput.analyze = () => {
        const time = probe.simulationTime / 1000, quiet = time >= 0.7 && time < 0.8;
        return { active: !quiet, press: quiet ? 0 : time < 0.8 ? 0.8 : 0.6,
            gesturePress: quiet ? 0 : time < 0.8 ? 0.3 : 0.2, rms: quiet ? 0 : 0.075,
            activityRms: quiet ? 0 : 0.075, pitchHz: time < 0.8 ? 200 : 150, pitchSource: 'AI voice' };
    };
    for (let frame = 0; frame < fps * 1.2; frame++) {
        probe.simulationTime = frame / fps * 1000;
        probe.processReverseEngineeredAudio(1 / fps);
    }
    assert.equal(probe.gear, 4, 'The real game bridge must pass displayed RPM, so a low-envelope sound cut is not lost');

    const { state, element } = game();
    let elapsed = 0, reachedTen = false;
    while (!state.isGameOver && elapsed < 6) {
        elapsed += 1 / fps; state.simulationTime = elapsed * 1000;
        state.processReverseEngineeredAudio(1 / fps);
        if (state.currentRpm >= 9.8) reachedTen = true;
    }
    assert(reachedTen, 'Holding full revs through the limiter must actually reach the 10 marker');
    assert(elapsed > 3 && elapsed < 6, 'Engine failure occurs after a continuous over-rev, not immediately');
    assert.equal(state.gear, 3, 'RPM by itself never shifts the gear');
    assert(state.driveFeedback.engineFailed && state.isGameOver);
    assert.equal(state.car.speedKmh, 0); assert.equal(state.currentRpm, 0); assert.equal(state.lastDisplayedPress, 0);
    assert(element('overlay').innerHTML.includes('<h1>Engine blown</h1>'), 'Over-revving ends as a blown engine');
    assert(!element('overlay').innerHTML.includes('<h1>Accident</h1>'), 'A blown engine is not reported as an accident');
    const handlers = {};
    state.voiceInput.mode = 'reference'; state.raceEnabled = true;
    state.race = { started: true, finished: false }; state.continuousRaceLoop = false;
    state.referenceVideo = { addEventListener(name, callback) { handlers[name] = callback; },
        play() { throw Error('A failed engine must not restart from a queued media-end event'); } };
    const start = source.indexOf("referenceVideo.addEventListener('ended'");
    const end = source.indexOf("referenceVideo.addEventListener('error'", start);
    vm.runInContext(source.slice(start, end), state);
    handlers.ended();
}
console.log('Shift-window integration passed: pre-shift grades, downshift feedback, reachable 10k, no RPM-only shifts and engine-failure run termination.');
