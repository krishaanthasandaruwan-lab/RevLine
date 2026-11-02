const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { RevDriveFeedback, revShiftTiming } = require('../driving-feedback.js');
const { RevVoiceInput, REV_GEAR_MIN_SPEEDS } = require('../voice-input.js');
const source = fs.readFileSync(require.resolve('../game.js'), 'utf8');
const routine = name => { const start = source.indexOf('function ' + name + '('); return source.slice(start, source.indexOf('\n}', start) + 2); };

// Runs the real game.js sound-to-car routine with a steady voice: no gesture, only a held throttle.
function drive({ gear, speed, press, seconds, fps = 60, braking = false, profile = 'voice', voiceShiftAt }) {
    const elements = new Map(), element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, dataset: {}, textContent: '', checked: true, value: id === 'rpm-scale' ? '12.5' : 'voice-custom', addEventListener() {} });
        return elements.get(id);
    };
    const voice = new RevVoiceInput();
    voice.analyze = () => ({ active: true, press, gesturePress: press, rms: 0.06, activityRms: 0.06, pitchHz: 180, pitchSource: 'AI voice', rpm: 6000 });
    const shifts = [];
    const state = {
        gear, currentRpm: 6, virtualButtonPress: press, car: { speedKmh: speed, worldSpeed: 0, voiceShiftAt },
        gearTopSpeeds: [0, 48, 76, 102, 134, 166, 197], gearMinSpeeds: REV_GEAR_MIN_SPEEDS,
        simulationTime: 0, lastShiftTime: -1000, shiftDipActive: false, shiftAlertTimer: 0,
        voiceInput: voice, voiceUpshift: voice.upshift, voiceCut: voice.cut, voiceDownshift: voice.downshift,
        autoNeutral: voice.autoNeutral, transmission: voice.transmission, driveFeedback: new RevDriveFeedback(),
        exhaustFeedback: { update: () => null, downshift: () => null }, garage: { power: 1 }, isBraking: braking,
        exhaustFlash: 0, isGameOver: false, score: 0, raceEnabled: false, runRows: [], lastLogTime: -1,
        document: { getElementById: element }, revShiftTiming, clearTimeout() {}, setTimeout: () => 1,
        updateGearDisplay() {}, updateTestTelemetry() {}, updateVirtualButtonUI() {}, getSoundProfile: () => profile,
        renderVoiceAIStatus() {}, clearHeldControls() {}, spawnExhaustPuff() {}, spawnTireSmoke() {},
        showRunEnd() { throw Error('A held voice must not end the run'); }
    };
    vm.createContext(state);
    vm.runInContext(['showShiftFeedback', 'shiftGearUp', 'shiftGearDown', 'setAutomaticGear', 'processVoiceShift', 'processReverseEngineeredAudio'].map(routine).join('\n'), state);
    for (let frame = 0; frame < seconds * fps; frame++) {
        const before = state.gear;
        state.simulationTime += 1000 / fps;
        state.processReverseEngineeredAudio(1 / fps);
        if (state.gear !== before) shifts.push({ time: state.simulationTime / 1000, from: before, to: state.gear, speed: state.car.speedKmh });
    }
    return { shifts, gear: state.gear, speed: state.car.speedKmh };
}

for (const fps of [30, 60, 120]) {
    // A light, steady rev lets the car slow; each gear is left once the speed settles at its bottom.
    const light = drive({ gear: 5, speed: 150, press: 0.1, seconds: 30, fps });
    assert(light.shifts.length >= 3, `${fps} FPS: a light rev steps down as the car slows`);
    assert(light.shifts.every(s => s.to === s.from - 1), `${fps} FPS: one gear at a time, never up`);
    light.shifts.forEach((s, i) => {
        assert(s.speed < REV_GEAR_MIN_SPEEDS[s.from] + ([0, 48, 76, 102, 134, 166, 197][s.from] - REV_GEAR_MIN_SPEEDS[s.from]) * 0.2 + 1e-6, `${fps} FPS: shift ${i + 1} only at the bottom of its gear`);
        if (i) assert(s.time - light.shifts[i - 1].time >= 1.5, `${fps} FPS: speed-matched shifts are at least 1.5 s apart`);
        assert(s.speed < [0, 48, 76, 102, 134, 166, 197][s.to], `${fps} FPS: the lower gear can carry that speed`);
    });
    assert(light.gear >= 1);

    // A medium or strong steady rev keeps its gear: cruising is not a downshift.
    for (const [gear, speed, press] of [[4, 110, 0.5], [3, 80, 0.8], [5, 140, 0.45]]) {
        assert.deepEqual(drive({ gear, speed, press, seconds: 12, fps }).shifts, [], `${fps} FPS: steady ${press} throttle holds gear ${gear}`);
    }

    // Braking while still revving falls through the gears as the speed drops.
    const braking = drive({ gear: 5, speed: 140, press: 0.4, seconds: 6, fps, braking: true });
    assert(braking.shifts.length >= 2 && braking.shifts.every(s => s.to === s.from - 1), `${fps} FPS: braking with sound downshifts`);

    // The voice has priority: right after a voice shift the gearbox leaves that gear alone for 4 s.
    const afterVoice = drive({ gear: 5, speed: 112, press: 0.1, seconds: 6, fps, voiceShiftAt: 0 });
    assert(afterVoice.shifts.length && afterVoice.shifts[0].time >= 4, `${fps} FPS: a voice shift is not undone by the gearbox for 4 s`);
    const staleRun = drive({ gear: 5, speed: 112, press: 0.1, seconds: 3, fps, voiceShiftAt: 999999 });
    assert(staleRun.shifts.length && staleRun.shifts[0].time < 2, `${fps} FPS: a voice shift from a previous run does not block the gearbox`);

    // The Porsche engine reference keeps its own transmission.
    assert.deepEqual(drive({ gear: 5, speed: 112, press: 0.1, seconds: 6, fps, profile: 'engine' }).shifts.filter(s => s.to < s.from), [],
        `${fps} FPS: engine reference is not speed-matched by this rule`);
}
console.log('Speed-matched gearbox passed: light revs step down at the bottom of each gear, steady revs hold, braking falls through gears, engine reference unchanged.');
