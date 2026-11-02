const assert = require('node:assert/strict');
const { RevAudioModel, RevVoiceUpshift, RevTransmission } = require('../voice-input.js');

const sampleRate = 48000;
const fftSize = 8192;
function spectrum(hz, harmonics = [[1, 1]]) {
    const data = new Float32Array(fftSize / 2).fill(-120);
    for (const [ratio, amplitude] of harmonics) {
        const bin = Math.round(hz * ratio * fftSize / sampleRate);
        data[bin] = 20 * Math.log10(amplitude);
    }
    return data;
}
function feed(model, data, rms, seconds, fps = 60, options = {}) {
    let result;
    for (let i = 0; i < Math.round(seconds * fps); i++) {
        result = model.update(data, rms, sampleRate, fftSize, 1 / fps, options);
    }
    return result;
}

const engine = new RevAudioModel();
const highRev = spectrum(750, [[1, 1], [0.6, 0.35], [0.5, 0.3], [0.3, 0.2]]);
let result = feed(engine, highRev, 0.35, 1);
assert.ok(Math.abs(result.rpm - 9000) < 200, `Expected ~9000 RPM, got ${result.rpm}`);
assert.ok(result.press > 0.5 && result.press <= 1);

result = engine.update(highRev, 0.35, sampleRate, fftSize, 1 / 60, { activityRms: 0 });
assert.equal(result.press, 0, 'The first silent frame releases throttle despite old FFT energy');
result = feed(engine, highRev, 0.001, 1);
assert.equal(result.pitchHz, 0, 'Below-gate sound must not trigger');
assert.ok(result.rpm < 1010 && result.press === 0, 'Silence returns to idle and releases throttle');

const a = feed(new RevAudioModel(), highRev, 0.35, 0.5, 30);
const b = feed(new RevAudioModel(), highRev, 0.35, 0.5, 120);
assert.ok(Math.abs(a.rpm - b.rpm) < 1, 'RPM smoothing must use elapsed time');
assert.ok(Math.abs(a.press - b.press) < 0.03, 'Throttle must be stable across frame rates');

const calibrated = feed(new RevAudioModel(), highRev, 0.35, 1, 60, { rpmPerHz: 10 });
assert.ok(Math.abs(calibrated.rpm - 7500) < 200, 'Calibration must change RPM/Hz');
const voice = feed(new RevAudioModel(), spectrum(250), 0.2, 1, 60, { profile: 'voice' });
assert.ok(voice.press > 0 && voice.press <= 1, 'Voice profile produces bounded throttle');
const neuralPitch = { hz: 180, confidence: 0.9 };
const neuralVoice = feed(new RevAudioModel(), spectrum(600), 0.2, 1, 60, { profile: 'voice', voicePitch: neuralPitch });
assert.equal(neuralVoice.pitchHz, 180, 'Voice mode uses a clear AI fundamental rather than a louder harmonic');
assert.equal(neuralVoice.pitchSource, 'AI voice');
const unclearVoice = feed(new RevAudioModel(), spectrum(600), 0.2, 1, 60, { profile: 'voice', voicePitch: { hz: 180, confidence: 0.2 } });
assert.equal(unclearVoice.pitchSource, 'standard', 'Unclear AI pitch falls back');
const engineWithoutAI = feed(new RevAudioModel(), highRev, 0.35, 1);
const engineWithAI = feed(new RevAudioModel(), highRev, 0.35, 1, 60, { voicePitch: neuralPitch });
assert.deepEqual(engineWithAI, engineWithoutAI, 'AI must not alter the Porsche engine detector');
const quietAI = new RevAudioModel().update(highRev, 0.35, sampleRate, fftSize, 1 / 60,
    { profile: 'voice', voicePitch: neuralPitch, activityRms: 0 });
assert.equal(quietAI.press, 0, 'A stale AI pitch cannot keep the pedal pressed during silence');
engine.reset();
assert.equal(engine.rpm, 1000);
assert.equal(engine.press, 0);

function drive(transmission, rpm, gear, seconds) {
    for (let i = 0; i < seconds * 60; i++) gear = transmission.update(rpm, gear, 1 / 60);
    return gear;
}
const transmission = new RevTransmission();
assert.equal(drive(transmission, 5000, 0, 5), 0, 'Steady neutral revs must not launch on a timer');
transmission.reset();
let gear = drive(transmission, 9000, 1, 0.5);
gear = drive(transmission, 5900, gear, 0.15);
gear = drive(transmission, 6300, gear, 0.2);
assert.equal(gear, 2, 'A sustained ratio-matched dip and recovery upshifts');
gear = drive(transmission, 7000, gear, 2);
gear = drive(transmission, 6800, gear, 0.1);
gear = drive(transmission, 7100, gear, 0.2);
assert.equal(gear, 2, 'Small RPM fluctuations must not upshift');
transmission.reset();
let neutral = drive(transmission, 9500, 0, 1);
neutral = drive(transmission, 5500, neutral, 0.2);
neutral = drive(transmission, 9000, neutral, 1);
assert.equal(neutral, 0, 'Rev, dip and recovery must never leave neutral automatically');

function silence(seconds, gear, speed, silent = true, sinceShift = 2) {
    let shift = false;
    for (let i = 0; i < seconds * 60; i++) {
        shift = transmission.shouldDownshift(gear, speed, 1 / 60, sinceShift, silent);
    }
    return shift;
}
transmission.reset();
assert.equal(silence(0.6, 6, 120), false, 'Short upshift/rev pauses must not downshift');
assert.equal(silence(0.1, 6, 120, false), false, 'Sound recovery cancels silent timeout');
assert.equal(silence(0.7, 6, 120), false, 'Separate pauses must not accumulate');
assert.equal(silence(0.6, 6, 120), true, 'Sustained silence at low speed downshifts');
transmission.noteShift();
assert.equal(silence(1, 5, 0, true, 0.5), false, 'Cooldown prevents cascading gear drops');
assert.equal(silence(2, 6, 120, false), false, 'Low-speed revving must not fight an upshift');
assert.equal(silence(2, 6, 170), false, 'Coasting at sufficient speed keeps its gear');
assert.equal(silence(2, 0, 0), false, 'Neutral cannot shift below zero');
assert.equal(silence(2, 1, 0), false, 'Stopped first gear stays engaged until manual neutral');

for (const fps of [30, 120]) {
    transmission.reset();
    let currentGear = 6;
    let lastShift = -10;
    const gears = [6];
    for (let frame = 0; frame < fps * 20; frame++) {
        const time = frame / fps;
        const speed = Math.max(0, 170 - time * 12);
        if (transmission.shouldDownshift(currentGear, speed, 1 / fps, time - lastShift, true)) {
            assert.ok(time - lastShift >= 0.9, 'Downshifts respect cooldown');
            currentGear--;
            gears.push(currentGear);
            transmission.noteShift();
            lastShift = time;
        }
    }
    assert.deepEqual(gears, [6, 5, 4, 3, 2, 1], `Silent coasting steps down to first at ${fps} FPS`);
}

for (const fps of [30, 60, 120]) {
    const gesture = new RevVoiceUpshift();
    let count = 0;
    function hold(press, rms, seconds, gear = 1, sinceShift = 2) {
        for (let i = 0; i < Math.round(seconds * fps); i++) {
            if (gesture.update(press, rms, gear, 1 / fps, sinceShift)) count++;
        }
    }
    hold(0.9, 0.3, 1);
    hold(0.65, 0.3, 0.15);
    hold(0.6, 0.3, 0.2);
    assert.equal(count, 0, 'A still-falling pedal must not count as recovery');
    hold(0.9, 0.3, 0.3);
    hold(0.2, 0.3, 0.2);
    hold(0.9, 0.3, 0.2);
    assert.equal(count, 0, 'A pitch-only pedal dip with unchanged volume must not shift');
    hold(0.2, 0.05, 1 / fps);
    hold(0.9, 0.3, 0.2);
    assert.equal(count, 0, 'One-frame noise is not a deliberate release');
    gesture.reset();
    hold(0.9, 0.3, 0.5);
    hold(0.1, 0.02, 0.16);
    hold(0.9, 0.3, 0.2);
    hold(0.9, 0.3, 0.5);
    assert.equal(count, 1, `A clear sustained release and recovery shifts exactly once at ${fps} FPS`);
    gesture.reset();
    hold(0.9, 0.3, 0.5);
    hold(0, 0, 1);
    hold(0.9, 0.3, 0.3);
    assert.equal(count, 1, 'Long silence must not leave a stale upshift armed');
    gesture.reset();
    hold(0.9, 0.3, 0.5, 0);
    hold(0, 0, 0.16, 0);
    hold(0.9, 0.3, 0.2, 0);
    assert.equal(count, 1, 'Neutral stays manual');
}

const risingVoice = new RevAudioModel();
const risingGesture = new RevVoiceUpshift();
let falseUpshifts = 0;
for (let i = 0; i < 300; i++) {
    const rms = 0.1 + i / 300 * 0.3;
    const signal = risingVoice.update(spectrum(900), rms, sampleRate, fftSize, 1 / 60, {
        profile: 'voice', voicePitch: { hz: 120 + i, confidence: Math.floor(i / 30) % 2 ? 0.9 : 0.2 }
    });
    if (risingGesture.update(signal.press, rms, 1, 1 / 60, 2)) falseUpshifts++;
}
assert.equal(falseUpshifts, 0, 'Increasing volume must not upshift when AI/fallback or pitch changes');
console.log('Audio/transmission checks passed, including false-upshift regressions and deliberate release/recovery gestures.');
