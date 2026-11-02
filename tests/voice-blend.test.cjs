const assert = require('node:assert/strict');
const { RevVoiceInput, RevVoiceBlend, REV_VOICE_3313: preset } = require('../voice-input.js');

function signal(hz, rms, press = 0.3) {
    return { pitchHz: hz, rms, activityRms: rms, press, active: rms > preset.gate, pitchSource: 'AI voice' };
}
for (const [hz, level, expected] of [[150, 0.25, 0.25], [225, 0.25, 0.5], [300, 0.25, 0.75], [225, 1, 0.75]]) {
    for (const fps of [30, 60, 120]) {
        const blend = new RevVoiceBlend(); let result;
        for (let frame = 0; frame < fps; frame++) result = blend.update(
            signal(hz, preset.gate + level * (preset.fullRms - preset.gate)), 1 / fps, preset.gate, 2);
        assert(Math.abs(result.press - expected) < 0.005, 'Pitch and normalized volume receive equal weight');
        assert.equal(result.gesturePress, 0.3, 'Existing gesture calibration is independent of the new throttle mix');
        assert.equal(blend.update(signal(300, 0), 1 / fps, preset.gate, 2).press, 0, 'Silence releases throttle immediately');
        const fallback = { ...signal(500, 0.05), pitchSource: 'standard' };
        assert.equal(blend.update(fallback, 1 / fps, preset.gate, 2), fallback, 'AI-off and unclear pitch keep the existing fallback');
    }
}

const personal = new RevVoiceBlend();
for (let i = 0; i < 160; i++) {
    const output = personal.update(signal(300 + 100 * Math.sin(i * 0.08), 0.12), 0.05, preset.gate, 2);
    assert(Number.isFinite(output.press) && output.press >= 0 && output.press <= 1);
}
assert(personal.pitchLowHz > 170 && personal.pitchHighHz > 340, 'A higher voiced rev range is learned during the run');
assert(personal.fullRms > 0.09, 'Personal loudness adjusts without changing sensitivity or the noise gate');
personal.update(signal(2000, 0.9), 0.1, preset.gate, 2);
assert(personal.pitchHighHz < 450 && personal.fullRms < 0.16, 'One pitch/volume spike cannot define the learned range');
personal.reset();
assert.equal(personal.pitchLowHz, preset.pitchLowHz); assert.equal(personal.fullRms, preset.fullRms);

function replay(clip, mixed) {
    const input = new RevVoiceInput(), spectrum = new Float32Array(4096), events = [];
    let pitch = null, gear = 1, last = -10;
    for (const [time, rms, recent, hz, confidence, fallback] of require(`./fixtures/rev-${clip}-features.json`).frames) {
        if (confidence >= 0.65) pitch = { hz, confidence, at: time };
        if (recent <= input.gate) pitch = null;
        spectrum.fill(-120); spectrum[Math.round(fallback / (48000 / 8192))] = -15;
        let result = { ...input.model.update(spectrum, rms, 48000, 8192, 0.05, {
            profile: 'voice', gate: input.gate, sensitivity: input.sensitivity, voiceCalibration: input.calibration,
            activityRms: recent, voicePitch: pitch && time - pitch.at <= 0.3 ? pitch : null
        }), activityRms: recent };
        if (mixed) result = input.blend.update(result, 0.05, input.gate, input.sensitivity);
        const { direction } = input.detectShift(result, result.press, gear, 0.05, time - last);
        if (direction) {
            gear += direction === 'up' ? 1 : -1; last = time;
            events.push({ time, direction, gear }); input.cut.reset(); input.downshift.reset();
        }
    }
    return events;
}
for (const clip of ['3313', '3314']) assert.deepEqual(replay(clip, true), replay(clip, false),
    `Pitch/volume mixing must preserve every established shift in IMG_${clip}`);
console.log('Voice blend passed: equal weighting, personal range, silence/fallback, spike resistance and both unchanged recording shift sequences.');
