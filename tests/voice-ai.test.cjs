const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepareVoiceFrame, decodeVoicePitch, RevVoicePitch } = require('../voice-input.js');

const modelDirectory = path.join(__dirname, '../assets/voice-pitch');
const provenance = JSON.parse(fs.readFileSync(path.join(modelDirectory, 'provenance.json')));
for (const [name, expected] of Object.entries(provenance.sha256)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(modelDirectory, name))).digest('hex');
    assert.equal(actual, expected, `Bundled model file ${name} matches its recorded hash`);
}

function tone(sampleRate) {
    return Float32Array.from({ length: 8192 }, (_, i) => 0.3 + 0.2 * Math.sin(2 * Math.PI * 180 * i / sampleRate));
}
for (const rate of [16000, 44100, 48000, 96000]) {
    const frame = prepareVoiceFrame(tone(rate), rate);
    assert.equal(frame.length, 1024);
    assert.ok(frame.every(Number.isFinite));
    assert.ok(Math.abs(frame.reduce((a, b) => a + b, 0) / 1024) < 1e-5, 'Frames have no DC offset');
    assert.ok(Math.abs(frame.reduce((a, b) => a + b * b, 0) / 1024 - 1) < 1e-5, 'Frames have unit variance');
}
assert.ok(prepareVoiceFrame(new Float32Array(8192), 48000).every(x => x === 0));
for (const hz of [100, 180, 300, 500]) {
    const activation = new Float32Array(360);
    activation[Math.round((1200 * Math.log2(hz / 10) - 1997.3794084376191) / 20)] = 0.9;
    const prediction = decodeVoicePitch(activation);
    assert.ok(Math.abs(prediction.hz - hz) / hz < 0.01, 'Pitch bins decode to Hz');
}

(async () => {
    const detector = new RevVoicePitch();
    detector.state = 'ready';
    let finish;
    let calls = 0;
    detector.predictFrame = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
    detector.sample(tone(48000), 48000, 100, true);
    detector.sample(tone(48000), 48000, 250, true);
    assert.equal(calls, 1, 'Only one inference can run at a time');
    detector.sample(tone(48000), 48000, 260, false);
    finish({ hz: 180, confidence: 0.9 });
    await new Promise(setImmediate);
    assert.equal(detector.current(270), null, 'Silence invalidates a pending pitch');
    detector.sample(tone(48000), 48000, 400, true);
    finish({ hz: 180, confidence: 0.9 });
    await new Promise(setImmediate);
    assert.equal(detector.current(450).hz, 180);
    detector.sample(tone(48000), 48000, 600, true);
    finish({ hz: 700, confidence: 0.2 });
    await new Promise(setImmediate);
    assert.equal(detector.current(650).hz, 180, 'A brief unclear frame retains the recent clear pitch');
    assert.equal(detector.current(750), null, 'Old predictions expire');
    detector.sample(new Float32Array(100), 192000, 900, true);
    assert.equal(detector.state, 'error', 'Unsupported input falls back without crashing the app');
    console.log('Voice AI checks passed: resampling, normalization, decoding, single-flight inference and stale-result rejection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
