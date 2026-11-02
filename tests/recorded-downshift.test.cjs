const assert = require('node:assert/strict');
const { RevVoiceInput } = require('../voice-input.js');
const recording = require('./fixtures/rev-3315-features.json');

// Timestamps label test recordings only. Live code never receives cue times.
function replay(start, end, initialGear, fps, pitchScale = 1) {
    const input = new RevVoiceInput(), spectrum = new Float32Array(4096).fill(-120), events = [];
    const rows = recording.frames;
    let index = rows.findIndex(r => r[0] >= start), next = index;
    let pitch = null, gear = initialGear, lastShift = -10;
    for (let time = rows[index][0]; time <= end; time += 1 / fps) {
        while (next < rows.length && rows[next][0] <= time + 1e-6) {
            const [at, , , hz, confidence] = rows[next];
            if ((recording.startFrameIndex + next) % 2 === 0 && confidence >= 0.65) {
                pitch = { hz: hz * pitchScale, confidence, at };
            }
            index = next++;
        }
        const [, rms, activityRms, , , fallback] = rows[index];
        if (activityRms <= input.gate) pitch = null;
        spectrum.fill(-120);
        if (fallback) spectrum[Math.round(fallback / (48000 / 8192))] = -15;
        let signal = { ...input.model.update(spectrum, rms, 48000, 8192, 1 / fps, {
            profile: 'voice', gate: input.gate, sensitivity: input.sensitivity, voiceCalibration: input.calibration,
            activityRms, voicePitch: pitch && time - pitch.at <= 0.3 ? pitch : null
        }), activityRms };
        signal = input.blend.update(signal, 1 / fps, input.gate, input.sensitivity);
        const { direction } = input.detectShift(signal, signal.press, gear, 1 / fps, time - lastShift, { rpm: 8.5 });
        if (direction) {
            gear += direction === 'up' ? 1 : -1;
            events.push({ time, direction, gear }); lastShift = time;
            input.cut.reset(); input.downshift.reset();
        }
    }
    return events;
}

for (const fps of [30, 60, 120]) {
    // The photographed 1:12 popup follows this continuous rounded rev return.
    // Raising its register exposes the old pedal-dependent down/up mismatch.
    for (const pitchScale of [1, 1.25, 1.5, 1.75, 2]) {
        const events = replay(70.65, 72.45, 5, fps, pitchScale);
        assert.deepEqual(events.map(e => [e.direction, e.gear]), [['down', 4]],
            `The confirmed down cue stays down at ${fps} FPS and pitch scale ${pitchScale}`);
        assert(events[0].time >= 71.3 && events[0].time <= 71.7);
    }
    const preceding = replay(68, 71, 6, fps);
    assert.deepEqual(preceding.map(e => [e.direction, e.gear]), [['down', 5]],
        'Preserve the preceding downshift marked correct at 1:10.95');
    assert(Math.abs(preceding[0].time - 70.487) < 0.07);
    const descending = replay(79, 86, 6, fps);
    assert.deepEqual(descending.map(e => [e.direction, e.gear]),
        [['down', 5], ['down', 4], ['down', 3], ['down', 2]],
        'Preserve the recorded descending run around the three confirmed correct marks');
    [81.071, 82.387, 83.887, 85.054].forEach((time, i) => assert(Math.abs(descending[i].time - time) < 0.08));
}

// Preserve the whole previous camera-feature replay as a compatibility check;
// this is not a claim that its simulated gears match every photographed gear.
const compatibility = replay(recording.frames[0][0], recording.frames.at(-1)[0] + 1e-6, 1, 20);
assert.deepEqual(compatibility.map(e => [e.direction, e.gear]), recording.compatibilityBaseline.map(e => e.slice(1)));
compatibility.forEach((event, i) => assert(Math.abs(event.time - recording.compatibilityBaseline[i][0]) < 0.1));

// Same short probe runs in the native WKWebView self-check. Sharp pitch resets
// and truly quiet cuts must retain their original upshift direction.
for (const fps of [30, 60, 120]) for (const kind of ['rounded', 'sharp', 'quiet', 'old-spike', 'rebound', 'deep-release']) {
    const curve = [[185, .065], [185, .065], [185, .065], [201, .115], [228, .15],
        [216, .072], [205, .075], [196, .085], [188, .06]];
    const input = new RevVoiceInput(), spectrum = new Float32Array(4096).fill(-120), events = [];
    let gear = 5, lastShift = -10;
    for (let frame = 0; frame < fps * 2; frame++) {
        const time = frame / fps;
        let [hz, rms] = curve[Math.min(curve.length - 1, Math.floor(time * 10))];
        if (kind === 'old-spike' && time >= 0.03 && time < 0.06) hz = 370;
        if (kind === 'rebound' || kind === 'deep-release') {
            hz = time < 0.2 ? 180 : time < 0.8 ? 180 + (time - 0.2) / 0.6 * 120 : 300;
            rms = 0.12;
            if (kind === 'rebound') {
                if (time >= 0.85 && time < 1) { hz = 274; rms = 0.055; }
                if (time >= 1 && time < 1.15) { hz = 291; rms = 0.1; }
                if (time >= 1.15 && time < 1.25) { hz = 260; rms = 0.045; }
                if (time >= 1.25) { hz = 240; rms = 0.09; }
            } else {
                if (time >= 0.85 && time < 1) { hz = 280; rms = 0.06; }
                if (time >= 1 && time < 1.15) { hz = 270; rms = 0.02; }
                if (time >= 1.15) { hz = 250; rms = 0.07; }
            }
        }
        if (kind === 'sharp' && time >= 0.5) { hz = 160; rms = 0.045; }
        if (kind === 'quiet' && time >= 0.5) { hz = 160; rms = time < 0.6 ? 0 : 0.07; }
        let signal = { ...input.model.update(spectrum, rms, 48000, 8192, 1 / fps, {
            profile: 'voice', gate: input.gate, sensitivity: input.sensitivity, voiceCalibration: input.calibration,
            activityRms: rms, voicePitch: { hz, confidence: 0.9 }
        }), activityRms: rms };
        signal = input.blend.update(signal, 1 / fps, input.gate, input.sensitivity);
        const { direction } = input.detectShift(signal, signal.press, gear, 1 / fps, time - lastShift, { rpm: 8.5 });
        if (direction) {
            events.push(direction); gear += direction === 'up' ? 1 : -1; lastShift = time;
            input.cut.reset(); input.downshift.reset();
        }
    }
    assert.deepEqual(events, [kind === 'rounded' || kind === 'old-spike' ? 'down' : 'up'], kind + ' keeps its intended direction');
}
console.log('Direction checks passed: IMG_3315 cues, voice registers, descending sequence, pitch rebounds, deep cuts and stale pitch spikes at 30/60/120 FPS.');
