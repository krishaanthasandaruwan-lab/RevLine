const assert = require('node:assert/strict');
const { RevVoiceInput } = require('../voice-input.js');

// Exercise capture/source races without a microphone or browser permission prompt.
class AudioNode {
    connect() {} disconnect() {}
}
class AudioContext {
    constructor() { this.sampleRate = 48000; this.destination = {}; this.mediaSources = 0; this.level = 0.1; this.recentLevel = 0.1; }
    resume() { return Promise.resolve(); }
    suspend() { this.suspended = true; }
    createBiquadFilter() { return Object.assign(new AudioNode(), { frequency: { value: 0 } }); }
    createGain() { return Object.assign(new AudioNode(), { gain: { value: 1 } }); }
    createMediaStreamSource() { return new AudioNode(); }
    createMediaElementSource() { this.mediaSources++; return new AudioNode(); }
    createAnalyser() {
        const context = this;
        return Object.assign(new AudioNode(), {
            get frequencyBinCount() { return 4096; },
            getFloatFrequencyData(data) { data.fill(-120); data[Math.round(220 / (48000 / 8192))] = -15; },
            getFloatTimeDomainData(data) { data.fill(context.level); data.fill(context.recentLevel, data.length - 1024); }
        });
    }
}
const reference = () => ({ pause() { this.paused = true; } });
const stream = () => ({ stopped: 0, getTracks() { return [{ stop: () => this.stopped++ }]; } });
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
let capture;
Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext } });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: options => {
    assert.deepEqual(options.audio, { echoCancellation: false, noiseSuppression: false, autoGainControl: false });
    return capture();
} } } });

(async () => {
    // The blended rev meter can be in the shift window while the old gesture
    // envelope is still below 48%. A real cut must work across 7–10k RPM.
    for (const rpm of [7, 7.8, 8.8, 9.8, 10]) for (const fps of [30, 60, 120]) {
        const voice = new RevVoiceInput(); voice.initAudio();
        let hz = 200, gear = 3, last = -10;
        voice.ai.sample = () => {}; voice.ai.current = () => ({ hz, confidence: 0.9 });
        const shifts = [];
        for (let frame = 0; frame < fps * 1.5; frame++) {
            const time = frame / fps;
            hz = time < 0.8 ? 200 : 150;
            voice.context.level = voice.context.recentLevel = time >= 0.7 && time < 0.8 ? 0 : 0.075;
            const signal = voice.analyze(1 / fps, { blendEnabled: true, now: time * 1000 });
            const { direction } = voice.detectShift(signal, signal.press, gear, 1 / fps, time - last, { rpm });
            if (direction) {
                shifts.push(direction); gear += direction === 'up' ? 1 : -1; last = time;
                voice.cut.reset(); voice.downshift.reset();
            }
        }
        assert.deepEqual(shifts, ['up'], `A real low-envelope cut must upshift at ${rpm}k RPM / ${fps} FPS`);
    }
    // A continuously voiced down gesture may briefly lose volume as pitch changes.
    // Replay it through analysis and arbitration, not just the individual detector.
    for (const fps of [30, 60, 120]) for (const valley of [0, 0.02, 0.04, 0.06]) {
        const voice = new RevVoiceInput(); voice.initAudio();
        let hz = 300, gear = 4, lastShift = -10;
        voice.ai.sample = () => {};
        voice.ai.current = () => ({ hz, confidence: 0.9 });
        const shifts = [];
        for (let frame = 0; frame < fps * 2; frame++) {
            const time = frame / fps;
            hz = time < 0.7 ? 300 : 180;
            voice.context.level = voice.context.recentLevel = time >= 0.7 && time < 0.78 ? valley : 0.1;
            const signal = voice.analyze(1 / fps, { now: time * 1000 });
            const { direction } = voice.detectShift(signal, signal.press, gear, 1 / fps, time - lastShift);
            if (direction) {
                shifts.push(direction); gear += direction === 'up' ? 1 : -1; lastShift = time;
                voice.cut.reset(); voice.downshift.reset();
            }
        }
        assert.deepEqual(shifts, [valley === 0 ? 'up' : 'down'],
            `A ${valley === 0 ? 'short quiet cut' : 'voiced pitch step with a ' + valley + ' volume valley'} must keep its direction at ${fps} FPS`);
    }
    for (const rpm of [7, 8.8, 10]) for (const fps of [30, 60, 120]) {
        const voice = new RevVoiceInput(); voice.initAudio();
        let hz = 200, gear = 4, last = -10;
        voice.ai.sample = () => {}; voice.ai.current = () => ({ hz, confidence: 0.9 });
        const shifts = [];
        for (let frame = 0; frame < fps * 2; frame++) {
            const time = frame / fps; hz = time < 0.7 ? 200 : 140;
            voice.context.level = voice.context.recentLevel = time >= 0.7 && time < 0.78 ? 0.02 : 0.075;
            const signal = voice.analyze(1 / fps, { blendEnabled: true, now: time * 1000 });
            const { direction } = voice.detectShift(signal, signal.press, gear, 1 / fps, time - last, { rpm });
            if (direction) {
                shifts.push(direction); gear += direction === 'up' ? 1 : -1; last = time;
                voice.cut.reset(); voice.downshift.reset();
            }
        }
        assert.deepEqual(shifts, ['down'], 'Widening upshift arming must not turn a lower voiced register into an upshift');
    }
    for (const fps of [30, 60, 120]) {
        const voice = new RevVoiceInput(); voice.initAudio();
        voice.ai.sample = () => {}; voice.ai.current = () => ({ hz: 200, confidence: 0.9 });
        let gear = 6, last = -10; const shifts = [];
        for (let frame = 0; frame < fps * 1.5; frame++) {
            const time = frame / fps;
            voice.context.level = voice.context.recentLevel = time < 0.7 ? 0.075 : time < 0.8 ? 0 : 0.04;
            const signal = voice.analyze(1 / fps, { blendEnabled: true, now: time * 1000 });
            const { direction } = voice.detectShift(signal, signal.press, gear, 1 / fps, time - last, { rpm: 8 });
            if (direction) { shifts.push(direction); gear--; last = time; voice.cut.reset(); voice.downshift.reset(); }
        }
        assert.deepEqual(shifts, ['down'], 'A quieter same-pitch return still downshifts a low-envelope sixth gear');
    }
    const input = new RevVoiceInput(reference());
    assert.equal(input.analyze(1 / 60), null);
    input.sensitivity = 3; input.gate = 0.02;
    input.setProfile('engine'); assert.equal(input.sensitivity, 2);
    input.setProfile('voice-custom'); assert.equal(input.sensitivity, 3); assert.equal(input.gate, 0.02);
    assert.equal(new RevVoiceInput().gate, 0.008, 'Each input owns its calibration settings');
    assert.throws(() => input.setProfile('__proto__'), RangeError);

    const mic = stream(); capture = async () => mic;
    assert.equal(await input.startMicrophone(), true); assert.equal(input.mode, 'mic');
    const context = input.context;
    assert.equal(input.inputFilter.frequency.value, 45);
    assert.equal(input.analyser.fftSize, 8192);
    assert.equal(await input.prepareReference(), true); assert.equal(mic.stopped, 1);
    await input.prepareReference();
    assert.equal(input.context, context); assert.equal(context.mediaSources, 1, 'A reference uses only one MediaElementSource');

    let finish;
    capture = () => new Promise(resolve => { finish = resolve; });
    const opening = input.startMicrophone();
    await Promise.resolve();
    await input.prepareReference();
    const stale = stream(); finish(stale);
    assert.equal(await opening, false); assert.equal(stale.stopped, 1);
    assert.equal(input.mode, 'reference', 'A late permission result cannot replace the newer source');

    let fail;
    capture = () => new Promise((_, reject) => { fail = reject; });
    const cancelled = input.startMicrophone(); await Promise.resolve();
    input.stop(); fail(new Error('Cancelled permission'));
    assert.equal(await cancelled, false); assert.equal(input.mode, 'none'); assert(context.suspended);
    capture = async () => { throw new Error('Permission denied'); };
    await assert.rejects(input.startMicrophone(), /Permission denied/);
    await assert.rejects(new RevVoiceInput().prepareReference(), /No reference/);

    let aiSamples = 0;
    input.ai.sample = () => aiSamples++;
    input.ai.current = () => ({ hz: 220, confidence: 0.9 });
    assert.equal(input.analyze(0.05).pitchSource, 'AI voice');
    assert.equal(input.analyze(0.05, { aiEnabled: false }).pitchSource, 'standard');
    assert.equal(aiSamples, 1, 'AI off bypasses inference');
    input.setProfile('engine'); input.analyze(0.05); assert.equal(aiSamples, 1, 'Engine analysis bypasses voice AI');
    let loads = 0; input.ai.load = async () => loads++;
    await input.ensureAI(true); assert.equal(loads, 0);
    input.setProfile('voice-custom'); await input.ensureAI(false); assert.equal(loads, 0);
    await input.ensureAI(true); assert.equal(loads, 1);
    context.recentLevel = 0;
    const quiet = input.analyze(0.05);
    assert(quiet.rms > input.gate); assert.equal(quiet.activityRms, 0);
    assert.equal(quiet.active, false); assert.equal(quiet.press, 0, 'Recent silence releases throttle despite older loud samples');
    console.log('Voice input passed: calibration, capture cancellation, reference reuse, AI routing and immediate quiet release.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor); else delete globalThis.navigator;
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor); else delete globalThis.window;
});
