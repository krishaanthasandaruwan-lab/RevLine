const assert = require('node:assert/strict');
const fs = require('node:fs'), crypto = require('node:crypto');
const { RevVoiceInput } = require('../voice-input.js');
const source = fs.readFileSync(require.resolve('../voice-input.js'), 'utf8');
const inputClass = source.slice(source.indexOf('class RevVoiceInput {'), source.indexOf("if (typeof module !== 'undefined') module.exports", source.indexOf('class RevVoiceInput {')));
// Capture startup was explicitly repaired on 27 Oct; all other class code stays protected.
const captureStart = inputClass.indexOf('    stopMicrophone() {');
const captureEnd = inputClass.indexOf('    async prepareReference()', captureStart);
const protectedInput = inputClass.slice(0, captureStart) + inputClass.slice(captureEnd);
assert.equal(crypto.createHash('sha256').update(protectedInput).digest('hex'), '3bbde913fef5d76f5c8b34fbdd0f2da10a2901f866eb12cc509956fd13d5cf97',
    'The user-approved upshift/RPM coordinator, blend integration and analysis stay unchanged');

function replay({ fps = 60, mixed = true, pitchRatio = 0.92, volumeRatio = 0.85,
    loudness = 0.1, lag = 0, kind = 'soft', initialGear = 4 } = {}) {
    const input = new RevVoiceInput(), spectrum = new Float32Array(4096).fill(-120), events = [];
    let gear = initialGear, lastShift = -10;
    for (let frame = 0; frame < fps * 2; frame++) {
        const time = frame / fps, pitchTime = time - lag;
        let hz = pitchTime < 0.2 ? 180 : pitchTime < 0.8 ? 180 + (pitchTime - 0.2) / 0.6 * 120 : 300;
        if (kind === 'flowing' && pitchTime < 0.9) hz = pitchTime < 0.2 ? 180 : 180 + (pitchTime - 0.2) / 0.7 * 120;
        let rms = loudness;
        const low = kind === 'jitter' ? Math.abs(time - 0.9) < 0.5 / fps : time >= 0.9 && time < 1.25;
        const lowPitch = kind === 'jitter' ? low : pitchTime >= 0.9 && pitchTime < 1.25;
        if (lowPitch && kind !== 'volume-only' && kind !== 'rising') hz = 300 * pitchRatio;
        if (low && kind !== 'pitch-only') rms *= kind === 'cut' ? 0 : volumeRatio;
        if (kind === 'gradual' && lowPitch) hz = 300 * (1 - (1 - pitchRatio) * Math.min(1, (pitchTime - 0.9) / 0.12));
        if (kind === 'gradual' && low) rms = loudness * (1 - (1 - volumeRatio) * Math.min(1, (time - 0.9) / 0.12));
        if (kind === 'rising') hz = 180 + time * 80;
        const ai = kind !== 'unclear' || !lowPitch;
        const signal = { ...input.model.update(spectrum, rms, 48000, 8192, 1 / fps, {
            profile: 'voice', gate: input.gate, sensitivity: input.sensitivity, voiceCalibration: input.calibration,
            activityRms: rms, voicePitch: ai ? { hz, confidence: 0.9 } : null
        }), activityRms: rms };
        const result = mixed ? input.blend.update(signal, 1 / fps, input.gate, input.sensitivity) : signal;
        const { direction } = input.detectShift(result, result.press, gear, 1 / fps, time - lastShift, { rpm: 8.5 });
        if (direction) {
            events.push({ direction, time }); gear += direction === 'up' ? 1 : -1; lastShift = time;
            input.cut.reset(); input.downshift.reset();
        }
    }
    return events;
}

for (const fps of [30, 60, 120]) for (const mixed of [false, true]) {
    for (const pitchRatio of [0.94, 0.92, 0.88]) for (const volumeRatio of [0.88, 0.8]) {
        const events = replay({ fps, mixed, pitchRatio, volumeRatio });
        assert.deepEqual(events.map(e => e.direction), ['down'], 'A small paired drop during an unbroken rising rev downshifts once');
        assert(events[0].time >= 0.98 && events[0].time <= 1.25, 'Confirm a brief lower tone without waiting for a long falling glide');
    }
    for (const lag of [0.1, 0.2]) assert.deepEqual(replay({ fps, mixed, lag }).map(e => e.direction), ['down'],
        'Pitch inference arriving after the volume dip still detects the paired drop');
    assert.deepEqual(replay({ fps, mixed, loudness: 0.035 }).map(e => e.direction), ['down']);
    for (const kind of ['flowing', 'gradual']) assert.deepEqual(replay({ fps, mixed, kind }).map(e => e.direction), ['down'],
        'A continuing upsweep or a gradual small paired drop does not require a long held pitch');
    for (const kind of ['volume-only', 'pitch-only', 'jitter', 'rising', 'unclear']) {
        assert.deepEqual(replay({ fps, mixed, kind }).map(e => e.direction), [], kind + ' must not be a new soft downshift');
    }
    assert.deepEqual(replay({ fps, mixed, kind: 'cut', pitchRatio: 0.7 }).map(e => e.direction), ['up'],
        'A genuine quiet upshift cut keeps its direction');
    assert.deepEqual(replay({ fps, mixed, pitchRatio: 0.7, volumeRatio: 0.3 }).map(e => e.direction), ['up'],
        'A sharp partial acoustic cut also keeps its existing upshift direction');
    assert.deepEqual(replay({ fps, mixed, initialGear: 6 }).map(e => e.direction), ['down']);
    assert.deepEqual(replay({ fps, mixed, initialGear: 1 }).map(e => e.direction), [], 'Do not downshift below first');
}
console.log('Soft downshift passed: small joint drops, AI latency, quiet voices, jitter rejection, genuine up cuts and protected upshift coordinator.');
