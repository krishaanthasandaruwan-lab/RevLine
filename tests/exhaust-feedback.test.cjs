const assert = require('node:assert/strict');
const { RevExhaustFeedback } = require('../exhaust-feedback.js');
for (const fps of [30, 60, 120]) {
    const effect = new RevExhaustFeedback();
    let bursts = 0;
    function hold(active, seconds, pitchHz = 220) {
        for (let i = 0; i < Math.round(seconds * fps); i++) {
            const puff = effect.update({ active, rms: active ? 0.075 : 0, gate: 0.008,
                press: active ? 0.7 : 0, pitchHz: active ? pitchHz : 0 }, 1 / fps);
            if (puff > 0.3) bursts++;
            if (!active) assert.equal(puff, 0, 'Quiet input emits no exhaust');
        }
    }
    for (let rev = 0; rev < 3; rev++) { hold(true, 0.12); hold(false, 0.18); }
    assert.equal(bursts, 3, `Three quick revs create three distinct puffs at ${fps} FPS`);
    hold(true, 0.2);
    assert.ok(effect.downshift() > 0.3, 'A voiced downshift can pop');
    hold(false, 0.5);
    assert.equal(effect.downshift(), 0, 'Silence downshifts must not create a backfire');
    effect.reset(); bursts = 0;
    hold(true, 2);
    assert.equal(bursts, 1, 'A steady rev creates wisps, not repeated full puffs');
}
console.log('Exhaust checks passed: quick rev puffs, quiet release, steady wisps and voiced-only downshift pops.');
