const assert = require('node:assert/strict');
const { RevAudioModel, RevVoiceCut } = require('../voice-input.js');
const { REV_VOICE_3313: preset } = require('../voice-input.js');
const recording = require('./fixtures/rev-3313-features.json');

const spectrum = new Float32Array(4096).fill(-120);
function options(pitch) {
    return { profile: 'voice', gate: preset.gate, sensitivity: preset.sensitivity,
        voiceCalibration: preset, voicePitch: { hz: pitch, confidence: 0.9 } };
}
for (const [pitch, expected] of [[150, 0.2], [225, 0.6], [300, 1]]) {
    const model = new RevAudioModel();
    let signal;
    for (let i = 0; i < 60; i++) signal = model.update(spectrum, preset.fullRms, 48000, 8192, 1 / 60, options(pitch));
    assert.ok(Math.abs(signal.press - expected) < 0.01, `Calibrated ${pitch} Hz produces ${expected} throttle`);
}

const model = new RevAudioModel();
const upshift = new RevVoiceCut();
const allCutDetector = new RevVoiceCut();
let clearPitch = null;
let gear = 1; // Explicit manual engagement for this replay check.
let lastShift = -10;
const shifts = [];
const allCuts = [];
let lastCut = -10;
const presses = [];
for (const [time, rms, recent, hz, confidence, fallback] of recording.frames) {
    if (confidence >= 0.65) clearPitch = { hz, confidence, at: time };
    if (recent <= preset.gate) clearPitch = null;
    spectrum.fill(-120);
    spectrum[Math.round(fallback / (48000 / 8192))] = -15;
    const opts = options(hz);
    opts.voicePitch = clearPitch && time - clearPitch.at <= 0.3 ? clearPitch : null;
    opts.activityRms = recent;
    const signal = model.update(spectrum, rms, 48000, 8192, 0.05, opts);
    if (recent <= preset.gate) assert.equal(signal.press, 0, 'Recorded quiet intervals release the pedal');
    const cutSignal = { press: signal.press, rms: recent, pitchHz: signal.pitchHz,
        pitchSource: signal.pitchSource, gate: preset.gate };
    if (allCutDetector.update(cutSignal, 1, 0.05, time - lastCut, preset.cut)) {
        allCuts.push(time);
        lastCut = time;
    }
    if (upshift.update(cutSignal, gear, 0.05, time - lastShift, preset.cut)) {
        shifts.push(time);
        gear++;
        lastShift = time;
    }
    presses.push(signal.press);
}
assert.ok(Math.max(...presses) > 0.95, 'This actual recording can reach full rev response');
assert.equal(shifts.length, 5, 'The recording must shift from first through sixth on its short cuts');
const expectedCuts = [[2.9, 3.3], [6.5, 6.95], [12.25, 12.75], [19.9, 20.4], [22.7, 23.5], [26.6, 27], [28.6, 29]];
assert.equal(allCuts.length, expectedCuts.length, 'All observed short recording cuts are recognized once');
expectedCuts.forEach(([start, end], i) => assert.ok(allCuts[i] >= start && allCuts[i] <= end,
    `Recording cut ${i + 1} should be recognized near ${start}s, got ${allCuts[i]}s`));
assert.ok(allCuts.every(time => time < 15 || time > 16.5), 'The long stop must not become an upshift');
for (const [start, end] of [[0.5, 2.8], [4.2, 6.3], [7.4, 11.8], [16.3, 19.7], [24, 26.4]]) {
    assert.ok(shifts.every(time => time < start || time > end), 'Rising recorded revs must not request an upshift');
}

const monotonicModel = new RevAudioModel();
const monotonicShift = new RevVoiceCut();
for (let i = 0; i < 180; i++) {
    const rms = 0.03 + i * 0.001;
    const signal = monotonicModel.update(spectrum, rms, 48000, 8192, 1 / 60, options(150 + i));
    assert.equal(monotonicShift.update({ press: signal.press, rms, pitchHz: signal.pitchHz,
        pitchSource: signal.pitchSource, gate: preset.gate }, 1, 1 / 60, 2, preset.cut), false,
        'The cut detector still rejects continuously rising sound');
}

for (const fps of [30, 60, 120]) {
    const detector = new RevVoiceCut();
    let count = 0;
    function hold(rms, pitch, seconds, press = 1, gear = 1) {
        for (let i = 0; i < Math.round(seconds * fps); i++) {
            if (detector.update({ press, rms, pitchHz: pitch, pitchSource: 'AI voice', gate: preset.gate },
                gear, 1 / fps, 2, preset.cut)) count++;
        }
    }
    hold(0.3, 300, 0.5);
    hold(0.3, 180, 0.2);
    assert.equal(count, 0, 'Pitch-only changes cannot upshift');
    detector.reset();
    hold(0.3, 250, 0.5);
    hold(0.08, 280, 0.08);
    hold(0.3, 300, 0.15);
    assert.equal(count, 0, 'Volume fluctuations during a rising rev cannot upshift');
    detector.reset();
    hold(0.3, 300, 0.5);
    hold(0.1, 200, 0.08); // The pedal can still be smoothed high during the real sound cut.
    hold(0.1, 200, 0.3);
    assert.equal(count, 1, `A very short voiced reset counts exactly once at ${fps} FPS`);
    detector.reset();
    hold(0.3, 300, 0.5);
    hold(0, 0, 0.6, 0);
    hold(0.3, 300, 0.2);
    assert.equal(count, 1, 'A long pause must not upshift on return');
    detector.reset();
    hold(0.3, 300, 0.5);
    hold(0, 0, 0.06, 0);
    hold(0.3, 300, 0.2);
    assert.equal(count, 2, 'A short actual gap shifts when the sound returns');
    if (fps >= 60) {
        detector.reset();
        hold(0.3, 300, 0.5);
        hold(0, 0, 1 / fps, 0);
        hold(0.3, 300, 0.05);
        hold(0, 0, 1 / fps, 0);
        hold(0.3, 300, 0.2);
        assert.equal(count, 2, 'Separate tiny noise blips must not accumulate into a cut');
    }
    detector.reset();
    hold(0.3, 300, 0.5, 1, 0);
    hold(0, 0, 0.06, 0, 0);
    hold(0.3, 300, 0.2, 1, 0);
    assert.equal(count, 2, 'Neutral remains manual');
}
console.log('Custom recording checks passed: all 7 short cuts, 1→6 sequence, rising-rev rejection and long-pause rejection.');
