const assert = require('node:assert/strict');
const { RevPersonalVoiceInput, REV_VOICE_3313: preset } = require('../voice-input.js');
const img3317 = require('./fixtures/rev-3317-features.json');
const img3315 = require('./fixtures/rev-3315-features.json');

// Replays recorded features through the input class game.js uses (original detectors + direction guard).
// Timestamps only label the assertions; the live code never receives them.
function replay(recording, start, end, initialGear, fps, pitchScale = 1) {
    const input = new RevPersonalVoiceInput(), spectrum = new Float32Array(4096).fill(-120), events = [];
    const rows = recording.frames;
    let index = rows.findIndex(r => r[0] >= start), next = index;
    let pitch = null, gear = initialGear, lastShift = -10;
    for (let time = rows[index][0]; time <= end; time += 1 / fps) {
        while (next < rows.length && rows[next][0] <= time + 1e-6) {
            const [at, , , hz, confidence] = rows[next];
            if ((recording.startFrameIndex + next) % 2 === 0 && confidence >= 0.65) pitch = { hz: hz * pitchScale, confidence, at };
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
const within = (events, a, b, direction) => events.filter(e => e.time >= a && e.time <= b && (!direction || e.direction === direction));

for (const fps of [30, 60, 120]) {
    // IMG_3317, user's notes (video time).
    const run = replay(img3317, 0, 26.6, 1, fps);
    assert.equal(within(run, 5.8, 6.8, 'up').length, 1, `${fps} FPS: rev reset after the peak at 5.9 s upshifts`);
    assert.equal(within(run, 9.4, 10.5, 'up').length, 1, `${fps} FPS: rev reset at 9.4 s upshifts`);
    assert.equal(within(run, 9.6, 12, 'down').length, 0, `${fps} FPS: 10.75 — a voice rebuilding after an upshift is not a downshift`);
    assert.equal(within(run, 16.9, 17.3, 'up').length, 1, `${fps} FPS: 17.19 — break, then the rev returns: upshift`);
    assert.equal(within(run, 17.3, 19.5).length, 0, `${fps} FPS: 18.20 — no second shift from the end of that burst`);
    assert.equal(within(run, 19.5, 24.5, 'up').length, 0, `${fps} FPS: 21.14 — peak then flat is not an upshift`);
    assert.equal(within(run, 21.5, 24.5).length, 0, `${fps} FPS: holding a steady rev afterwards never shifts by itself`);
    assert.equal(within(run, 24.6, 25.1, 'down').length, 1, `${fps} FPS: 24.77 — a short blip falling back downshifts`);

    // IMG_3315 cues the user confirmed stay as they were.
    for (const scale of [1, 1.25, 1.5, 1.75, 2]) {
        const cue = replay(img3315, 70.65, 72.45, 5, fps, scale);
        assert.deepEqual(cue.map(e => [e.direction, e.gear]), [['down', 4]], `${fps} FPS ×${scale}: 1:12.25 stays a downshift`);
    }
    assert.deepEqual(replay(img3315, 68, 71, 6, fps).map(e => [e.direction, e.gear]), [['down', 5]], `${fps} FPS: 1:10.95 stays a downshift`);
    const descending = replay(img3315, 79, 86, 6, fps);
    assert.deepEqual(descending.map(e => [e.direction, e.gear]), [['down', 5], ['down', 4], ['down', 3], ['down', 2]],
        `${fps} FPS: the confirmed descending run stays intact`);
    // Small-rev detection can confirm a step ~0.1 s earlier, as the rev starts falling back.
    [81.071, 82.387, 83.887, 85.054].forEach((time, i) => assert(Math.abs(descending[i].time - time) < 0.15, `${fps} FPS: descending step ${i + 1} on time`));
}

// Synthetic voices on the IMG_3313 preset: steady revs, a blip from one, a rising rev.
function synthetic(shape, { seconds, fps = 60, gear = 5, rpm = 8 }) {
    const input = new RevPersonalVoiceInput(), spectrum = new Float32Array(4096).fill(-120), events = [];
    let lastShift = -10;
    for (let frame = 0; frame < seconds * fps; frame++) {
        const time = frame / fps, [hz, rms] = shape(time);
        let signal = { ...input.model.update(spectrum, rms, 48000, 8192, 1 / fps, {
            profile: 'voice', gate: input.gate, sensitivity: input.sensitivity, voiceCalibration: preset,
            activityRms: rms, voicePitch: { hz, confidence: 0.9 }
        }), activityRms: rms };
        signal = input.blend.update(signal, 1 / fps, input.gate, input.sensitivity);
        const { direction } = input.detectShift(signal, signal.press, gear, 1 / fps, time - lastShift, { rpm });
        if (direction) { gear += direction === 'up' ? 1 : -1; events.push({ time, direction, gear }); lastShift = time; input.cut.reset(); input.downshift.reset(); }
    }
    return events;
}
for (const fps of [30, 60, 120]) {
    // The user removed the timed downshift: a constant rev is cruising, in any gear.
    for (const gear of [2, 4, 5]) for (const [hz, rms] of [[160, 0.05], [260, 0.09]]) {
        assert.deepEqual(synthetic(() => [hz, rms], { seconds: 10, fps, gear }), [], `${fps} FPS: a constant ${hz} Hz rev in gear ${gear} never shifts`);
    }
    const blip = synthetic(t => [t >= 2 && t < 2.25 ? 200 : 160, 0.05], { seconds: 2.9, fps });
    assert.deepEqual(blip.map(e => e.direction), ['down'], `${fps} FPS: one small rev from a steady rev downshifts`);
    assert(blip[0].time > 2.2 && blip[0].time < 2.5);
    assert.deepEqual(synthetic(t => [160 + t * 22, 0.05], { seconds: 6, fps }), [], `${fps} FPS: a steadily rising rev never shifts by itself`);
    // The smallest rev counts, also low and quiet: +10% for 0.25 s at a low voice.
    for (const [hz, rms] of [[160, 0.05], [120, 0.015]]) {
        const small = synthetic(t => [t >= 2 && t < 2.25 ? hz * 1.1 : hz, rms], { seconds: 2.9, fps });
        assert.deepEqual(small.map(e => e.direction), ['down'], `${fps} FPS: a small +10% rev at ${hz} Hz / ${rms} RMS downshifts`);
    }
    // A held voice wobbles about 1%; even ±3% wobble is not a rev.
    const wobble = synthetic(t => [160 * (1 + 0.03 * Math.sin(t * 9)), 0.05], { seconds: 10, fps });
    assert.deepEqual(wobble, [], `${fps} FPS: a wobbling steady voice never shifts`);
}
console.log('Direction guard passed: IMG_3317 notes, confirmed IMG_3315 cues, constant revs, single-rev downshifts and rising revs at 30/60/120 FPS.');
