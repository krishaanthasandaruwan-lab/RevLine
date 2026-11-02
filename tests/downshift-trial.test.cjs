const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { RevVoiceInput, RevVoiceDownshift, RevAutoNeutral, REV_VOICE_3313: preset } = require('../voice-input.js');
const checkpoint = require('../.checkpoints/shift-up-perfect-before-IMG_3314-2026-10-25.json');

function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
const voiceSource = fs.readFileSync(require.resolve('../voice-input.js'), 'utf8');
for (const [file, exports] of Object.entries({
    'audio-model.js': 'RevAudioModel, RevVoiceUpshift, RevVoiceCut, RevTransmission',
    'voice-preset.js': 'REV_VOICE_3313',
    'voice-ai.js': 'prepareVoiceFrame, decodeVoicePitch, RevVoicePitch'
})) {
    const body = voiceSource.split(`// BEGIN ${file}\n`)[1]?.split(`// END ${file}`)[0];
    assert(body, file + ' is preserved in the voice module');
    const original = body + `if (typeof module !== 'undefined') module.exports = { ${exports} };\n`;
    assert.equal(sha256(original), checkpoint.files[file],
        `${file} algorithms must remain identical to the approved upshift version`);
}

function replay(recording, trial, initialGear = 1) {
    const input = new RevVoiceInput();
    const spectrum = new Float32Array(4096);
    let clearPitch = null, gear = initialGear, lastShift = -10;
    const events = [];
    for (const [time, rms, recent, hz, confidence, fallback] of recording.frames) {
        if (confidence >= 0.65) clearPitch = { hz, confidence, at: time };
        if (recent <= preset.gate) clearPitch = null;
        spectrum.fill(-120);
        spectrum[Math.round(fallback / (48000 / 8192))] = -15;
        const signal = input.model.update(spectrum, rms, 48000, 8192, 0.05, {
            profile: 'voice', gate: preset.gate, sensitivity: preset.sensitivity, voiceCalibration: preset,
            activityRms: recent, voicePitch: clearPitch && time - clearPitch.at <= 0.3 ? clearPitch : null
        });
        const { direction } = input.detectShift({ ...signal, activityRms: recent }, signal.press,
            gear, 0.05, time - lastShift, { downshiftEnabled: trial });
        if (direction) {
            gear += direction === 'up' ? 1 : -1;
            events.push({ time, direction, gear });
            lastShift = time;
            input.cut.reset(); input.downshift.reset();
        }
    }
    return events;
}

const previous = require('./fixtures/rev-3313-features.json');
const original = replay(previous, false);
assert.deepEqual(original.map(e => e.gear), [2, 3, 4, 5, 6]);
const oldWithTrial = replay(previous, true);
assert.deepEqual(oldWithTrial.filter(e => e.direction === 'up').map(e => e.time), [3, 6.650667, 12.4, 20, 23.101333],
    'Every established IMG_3313 upshift remains at the original feature-frame time');
assert.deepEqual(oldWithTrial.filter(e => e.direction === 'up').map(e => e.gear), [2, 3, 4, 5, 6],
    'The earlier upshift sequence must stay intact when the trial is enabled');
original.forEach((event, i) => assert.ok(Math.abs(event.time - oldWithTrial[i].time) <= 0.1,
    'Earlier upshift cues stay at their original cuts'));

const events = replay(require('./fixtures/rev-3314-features.json'), true);
assert.deepEqual(events.filter(e => e.direction === 'up').map(e => e.time),
    [5.850667, 9.152, 13.501333, 17.4, 21.8, 40.352, 44.6, 67.850667],
    'Every established IMG_3314 upshift remains at the original feature-frame time');
// Approximate user annotations are assertions only; the live detector never receives them.
for (const [direction, start, end] of [
    ['down', 29.8, 31.1], ['down', 36.6, 38], ['up', 39, 40.8],
    ['down', 61, 62], ['up', 66.7, 68.2]
]) {
    assert.equal(events.filter(e => e.direction === direction && e.time >= start && e.time <= end).length, 1,
        `One ${direction} cue near ${start}–${end}s`);
}
assert.deepEqual(events.filter(e => e.time < 29.8).map(e => e.direction), Array(5).fill('up'),
    'Normal early upshift sweeps must not be misread as downshifts');

for (const fps of [30, 60, 120]) {
    const idle = new RevAutoNeutral([0, 0, 32, 54, 78, 108, 138]);
    for (let frame = 0; frame < fps * 3; frame++) assert.equal(idle.update(false, 0, 4, 70, 1 / fps), null);
    assert.equal(idle.update(false, 0, 4, 70, 1 / fps), 0, 'Only more than three seconds of silence selects N');
    assert.equal(idle.update(true, 0.6, 0, 70, 1 / fps), null, 'One noise frame must not re-engage');
    idle.update(false, 0, 0, 70, 1 / fps);
    let resumed = null;
    for (let frame = 0; frame < Math.ceil(fps * 0.15); frame++) resumed = idle.update(true, 0.6, 0, 70, 1 / fps) ?? resumed;
    assert.equal(resumed, 3, 'Returning voice selects the third gear at 70 km/h');
    for (const [speed, expected] of [[0, 1], [31, 1], [32, 2], [54, 3], [78, 4], [108, 5], [138, 6]]) {
        assert.equal(idle.gearForSpeed(speed), expected);
    }
    idle.reset(); // Manual N / replay / source changes clear automatic re-engagement.
    for (let frame = 0; frame < fps; frame++) assert.equal(idle.update(true, 1, 0, 0, 1 / fps), null,
        'Manually selected neutral permits free revs');

    const direction = new RevVoiceDownshift();
    for (let frame = 0; frame < fps; frame++) {
        assert.equal(direction.update({ active: true, press: 1, rms: 0.1, gate: 0.008,
            pitchHz: 150 + frame * 120 / fps, pitchSource: 'AI voice' }, 3, 1 / fps, 2), null,
            'Rising voice alone never downshifts');
    }
    assert.equal(direction.update({ active: false }, 1, 1 / fps, 2, true), 'up',
        'First-gear upshifts bypass the direction trial');

    const blip = new RevVoiceDownshift();
    for (let frame = 0; frame < fps / 2; frame++) blip.update({ active: true, press: 0.2,
        rms: 0.15, gate: 0.008, pitchHz: 145, pitchSource: 'AI voice' }, 4, 1 / fps, 2);
    // AI pitch arrives after the raw volume peak, as in the real-time recording.
    blip.update({ active: true, press: 0.45, rms: 0.06, gate: 0.008,
        pitchHz: 225, pitchSource: 'AI voice' }, 4, 1 / fps, 2);
    assert.equal(blip.update({ active: true, press: 0.4, rms: 0.08, gate: 0.008,
        pitchHz: 180, pitchSource: 'AI voice' }, 4, 1 / fps, 2, true), 'down',
        'A returning rev blip wins over an ambiguous up request despite AI/volume latency');

    for (const target of [220, 150]) for (const abrupt of [false, true]) {
        const pitchDown = new RevVoiceDownshift();
        const shifts = [];
        let time = 0, last = -10;
        for (let frame = 0; frame < fps * 1.8; frame++) {
            time += 1 / fps;
            const hz = time <= 0.6 ? 300 : abrupt ? target : Math.max(target, 300 - (time - 0.6) * 100);
            const result = pitchDown.update({ active: true, press: 0.9, rms: 0.1, gate: 0.008,
                pitchHz: hz, pitchSource: 'AI voice' }, 4, 1 / fps, time - last);
            if (result) { shifts.push(result); last = time; }
        }
        assert.deepEqual(shifts, ['down'], `A ${abrupt ? 'step' : 'gradual'} pitch drop at constant loudness downshifts once at ${fps} FPS`);
    }
    const glitch = new RevVoiceDownshift();
    for (let frame = 0; frame < fps * 1.5; frame++) assert.equal(glitch.update({ active: true,
        press: 0.8, rms: 0.1, gate: 0.008, pitchSource: 'AI voice', pitchHz: frame === fps / 2 ? 500 : 250 },
        4, 1 / fps, 2), null, 'One octave-estimation spike must not cause a downshift');

    const recoveringPitch = new RevVoiceDownshift();
    const recovered = [];
    for (let frame = 0; frame < fps * 1.8; frame++) {
        const time = frame / fps;
        const unclear = time >= 0.7 && time < 0.9;
        const result = recoveringPitch.update({ active: true, press: 0.8, rms: 0.1, gate: 0.008,
            pitchSource: unclear ? 'standard' : 'AI voice', pitchHz: time < 0.9 ? 300 : 150 }, 4, 1 / fps, 2);
        if (result) recovered.push(result);
        if (unclear) assert.equal(result, null, 'Uncertain pitch cannot request a downshift');
    }
    assert.deepEqual(recovered, ['down'], 'A brief AI-confidence gap must not erase the preceding steady tone');
}
console.log('Downshift trial passed: nearby recorded cues, protected upshift files, 3-second N, speed-matched return and manual N.');
