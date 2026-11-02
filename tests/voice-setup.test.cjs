const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { RevVoiceCalibration, RevPersonalVoiceInput, RevVoiceInput, REV_VOICE_3313 } = require('../voice-input.js');

function measure({ low = 100, high = 220, loudness = 0.04, noise = 0.001, clear = true } = {}) {
    const measurement = new RevVoiceCalibration();
    for (let i = 0; i < 60; i++) measurement.observe('quiet', { activityRms: noise }, 0.05);
    for (let i = 0; i < 100; i++) measurement.observe('rev', {
        activityRms: loudness * (0.7 + i / 300), pitchHz: low + (high - low) * i / 99,
        confidence: 0.9, pitchSource: clear ? 'AI voice' : 'standard'
    }, 0.05);
    return measurement;
}
for (const options of [{}, { low: 240, high: 460, loudness: 0.15 }, { low: 80, high: 170, loudness: 0.018, noise: 0.0003 }]) {
    const result = measure(options).fit(); assert(!result.error);
    assert.equal(RevVoiceCalibration.validate(result.profile), null, 'Unpractised profiles cannot load as completed');
    const profile = { ...result.profile, practice: { up: 2, down: 2 } };
    const input = new RevPersonalVoiceInput(); assert(input instanceof RevVoiceInput);
    assert(input.usePersonalProfile(profile));
    assert.equal(input.calibration.pitchLowHz, profile.pitchLowHz);
    assert.equal(input.calibration.pitchHighHz, profile.pitchHighHz);
    assert.equal(input.gate, profile.gate);
    input.blend.reset(); assert.equal(input.blend.pitchLowHz, profile.pitchLowHz);
    assert(input.calibration.cut.returnRms < profile.fullRms, 'Quiet voices can recover the cut below the old absolute floor');
    for (const direction of ['up', 'down']) for (const fps of [30, 60, 120]) {
        const probe = new RevPersonalVoiceInput(), spectrum = new Float32Array(4096).fill(-120), events = [];
        probe.usePersonalProfile(profile);
        let gear = 4, last = -10;
        for (let frame = 0; frame < fps * 2; frame++) {
            const time = frame / fps, quiet = direction === 'up' && time >= 0.8 && time < 0.9;
            const hz = time < 0.8 ? profile.pitchHighHz : profile.pitchLowHz;
            const rms = quiet ? 0 : profile.fullRms;
            let signal = { ...probe.model.update(spectrum, rms, 48000, 8192, 1 / fps, {
                profile: 'voice', gate: probe.gate, sensitivity: probe.sensitivity, voiceCalibration: probe.calibration,
                activityRms: rms, voicePitch: { hz, confidence: 0.9 }
            }), activityRms: rms };
            signal = probe.blend.update(signal, 1 / fps, probe.gate, probe.sensitivity);
            const result = probe.detectShift(signal, signal.press, gear, 1 / fps, time - last, { rpm: 8.8 });
            if (result.direction) {
                events.push(result.direction); gear += result.direction === 'up' ? 1 : -1; last = time;
                probe.cut.reset(); probe.downshift.reset();
            }
        }
        assert.deepEqual(events, [direction], 'The saved personal profile drives the real gesture detector');
    }
    input.setProfile('voice-custom'); assert.equal(input.calibration, REV_VOICE_3313);
    input.blend.reset(); assert.equal(input.blend.pitchLowHz, REV_VOICE_3313.pitchLowHz);
    input.setProfile('engine'); assert.equal(input.calibration, null);
}
assert(measure({ clear: false }).fit().error);
assert(measure({ high: 110 }).fit().error);
assert(measure({ noise: 0.02, loudness: 0.04 }).fit().error);
assert(new RevVoiceCalibration().fit().error);
const good = { ...measure().fit().profile, practice: { up: 2, down: 2 } };
for (const changed of [{ gate: 0 }, { fullRms: Infinity }, { pitchLowHz: NaN }, { pitchHighHz: 5000 }, { version: 9 }, { practice: { up: 2, down: 1 } }]) {
    assert.equal(RevVoiceCalibration.validate({ ...good, ...changed }), null);
}

function ui({ stored = null, writeFails = false, seen = true } = {}) {
    const data = new Map(seen ? [['revline-voice-setup-seen-v1', '1']] : []);
    if (stored) data.set('revline-voice-profile-v1', stored);
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, classList: { toggle() {} }, open: false,
            addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; } });
        return elements.get(id);
    };
    const input = new RevPersonalVoiceInput();
    const handlers = {};
    const state = {
        RevVoiceCalibration, voiceInput: input, console, setTimeout, clearTimeout,
        requestAnimationFrame: () => 1, cancelAnimationFrame() {}, settingsResumeReference: false,
        gameStorage: { getItem: key => data.get(key) ?? null, setItem(key, value) { if (writeFails) throw Error('Storage full'); data.set(key, value); } },
        document: { hidden: false, getElementById: element, addEventListener(name, callback) { handlers[name] = callback; } },
        applySoundProfile: key => input.setProfile(key), setStatus(message) { state.status = message; },
        closeSettings() {}, stopGaragePreview() {}, clearHeldControls() {}, showGameMenu() {}, resetGame() {}
    };
    vm.createContext(state); vm.runInContext(fs.readFileSync(require.resolve('../voice-setup.js'), 'utf8') + '\nglobalThis.controller = voiceSetup;', state);
    return { controller: state.controller, input, data, state, element, handlers };
}
const firstLaunch = ui({ seen: false }); assert(firstLaunch.controller.dialog.open);
firstLaunch.controller.close(); assert.equal(firstLaunch.data.get('revline-voice-setup-seen-v1'), '1');
const session = ui(); const setup = session.controller;
setup.open(); assert(setup.dialog.open);
setup.measurement = measure(); setup.step = 'rev'; setup.finish(null);
assert.equal(setup.step, 'up'); assert(session.input.personalCalibration);
setup.finish('up'); assert.equal(setup.counts.up, 1);
setup.finish('down'); assert.equal(setup.counts.up, 0, 'A wrong direction resets consecutive practice successes');
setup.save(); assert(!session.data.has('revline-voice-profile-v1'));
setup.finish('up'); setup.finish('up'); assert.equal(setup.step, 'down');
setup.finish('down'); setup.finish('down'); assert.equal(setup.step, 'ready');
setup.save(); assert(!setup.dialog.open);
assert(RevVoiceCalibration.validate(JSON.parse(session.data.get('revline-voice-profile-v1'))));
assert.equal(session.input.profileKey, 'voice-personal');

const returning = ui({ stored: JSON.stringify(good) });
assert.equal(returning.input.profileKey, 'voice-personal'); assert(!returning.controller.dialog.open);
const original = returning.input.personalCalibration;
returning.controller.open(); returning.controller.measurement = measure({ low: 250, high: 450 });
returning.controller.step = 'rev'; returning.controller.finish(null);
returning.controller.close();
assert.equal(returning.input.personalCalibration, original, 'Cancel restores the previous personal profile');
assert.equal(JSON.parse(returning.data.get('revline-voice-profile-v1')).pitchLowHz, good.pitchLowHz);
assert.equal(ui({ stored: '{bad' }).input.personalCalibration, null, 'Corrupt storage falls back safely');

const bridge = ui({ stored: JSON.stringify(good) });
bridge.state.ensureVoiceAI = () => {};
const gameSource = fs.readFileSync(require.resolve('../game.js'), 'utf8');
const profileStart = gameSource.indexOf('function applySoundProfile(');
vm.runInContext(gameSource.slice(profileStart, gameSource.indexOf('\n}', profileStart) + 2), bridge.state);
bridge.input.mode = 'reference'; bridge.state.applySoundProfile('voice-personal');
assert.equal(bridge.input.profileKey, 'voice-custom', 'Personal voice cannot replace the active reference calibration');
assert.equal(bridge.element('input-profile').value, 'voice-custom');
bridge.input.mode = 'mic'; bridge.state.applySoundProfile('voice-personal');
assert.equal(bridge.input.profileKey, 'voice-personal');

const full = ui({ writeFails: true });
full.controller.open(); full.controller.candidate = good; full.controller.counts = { up: 2, down: 2 }; full.controller.step = 'ready';
full.controller.save(); assert(full.controller.dialog.open && full.controller.sessionOnly);
full.controller.save(); assert(full.controller.accepted && !full.controller.dialog.open);
assert(full.state.status.includes('this session'));

(async () => {
    const denied = ui(); denied.controller.open(); denied.input.startMicrophone = async () => { throw Error('Permission denied'); };
    await denied.controller.next(); assert(!denied.controller.busy);
    assert(denied.controller.feedback.textContent.includes('Permission denied'));
    assert(!denied.data.has('revline-voice-profile-v1'));

    const pending = ui(); pending.controller.open(); let grant;
    pending.input.startMicrophone = () => new Promise(resolve => { grant = resolve; });
    const opening = pending.controller.next(); pending.controller.close(); grant(true); await opening;
    assert(!pending.controller.dialog.open && pending.controller.step === 'welcome', 'Late permission cannot advance a dismissed setup');

    const hung = ui(); hung.controller.open(); let expire;
    hung.state.setTimeout = callback => { expire = callback; return 1; }; hung.state.clearTimeout = () => {};
    hung.input.startMicrophone = () => new Promise(() => {});
    const waiting = hung.controller.next(); expire(); await waiting;
    assert(!hung.controller.busy && hung.controller.feedback.textContent.includes('Allow microphone access'));

    const hidden = ui({ stored: JSON.stringify(good) }); hidden.controller.open();
    hidden.controller.step = 'up'; hidden.controller.busy = true;
    hidden.state.document.hidden = true; hidden.handlers.visibilitychange();
    assert.equal(hidden.input.mode, 'none'); assert.equal(hidden.controller.step, 'welcome');
    assert(!hidden.controller.busy && hidden.data.has('revline-voice-profile-v1'));
    console.log('Voice setup passed: personal ranges/noise, quiet voices, protected presets, validated practice, cancel/reload, storage failure, permission denial and stale capture.');
})().catch(error => { console.error(error); process.exitCode = 1; });
