const assert = require('node:assert/strict');
const { RevDriveFeedback, revShiftTiming } = require('../driving-feedback.js');

for (const [rpm, grade] of [[7, 'early'], [8, 'early'], [8.49, 'early'], [8.5, 'perfect'], [9.5, 'perfect'], [9.51, 'late'], [10, 'late']]) {
    assert.equal(revShiftTiming(rpm).grade, grade);
}

for (const fps of [30, 60, 120]) {
    const feedback = new RevDriveFeedback();
    for (let i = 0; i < fps; i++) feedback.update(1, 7, 1, true, false, 1 / fps);
    assert.equal(feedback.limiting, false, 'Initial acceleration stays unrestricted');
    feedback.update(3, 8.4, 1, true, false, 1 / fps);
    assert.equal(feedback.shiftReady, true, 'Show the shift symbol before the limiter');
    for (let i = 0; i < fps; i++) feedback.update(3, 9.4, 1, true, false, 1 / fps);
    assert.equal(feedback.limiting, false, 'Perfect-band RPM is not penalised by the late limiter');
    for (let i = 0; i < fps / 2; i++) feedback.update(3, 9.7, 1, true, false, 1 / fps);
    assert.equal(feedback.limiting, false, 'Give time to shift before cutting power');
    const cuts = [];
    for (let i = 0; i < fps; i++) {
        feedback.update(3, 9.7, 1, true, false, 1 / fps);
        cuts.push(feedback.cutting);
    }
    assert.ok(cuts.includes(true) && cuts.includes(false), 'Late shifts cause pulsing power cuts');
    feedback.update(4, 7, 1, true, false, 1 / fps);
    assert.equal(feedback.limiting, false, 'A successful shift clears the limiter');
    assert.equal(feedback.shiftReady, true, 'The widened shift window starts at 7k');
    feedback.update(0, 9.5, 1, true, false, 1 / fps);
    assert.equal(feedback.limiting, false, 'Neutral allows free revs');
    feedback.update(6, 8.5, 1, true, false, 1 / fps);
    assert.equal(feedback.shiftReady, false, 'Sixth cannot request a seventh gear');
    feedback.update(3, 9.5, 0, false, false, 1 / fps);
    assert.equal(feedback.cutting, false, 'Releasing the pedal clears power cuts');

    feedback.reset();
    for (let frame = 0; frame < fps * 3; frame++) {
        feedback.update(3, 10, 1, true, false, 1 / fps);
        assert.equal(feedback.engineFailed, false, 'Exactly three seconds is still recoverable');
    }
    feedback.update(3, 10, 1, true, false, 1 / fps);
    assert.equal(feedback.engineFailed, true, 'More than three continuous seconds at the 10k marker fails the engine');
    feedback.update(3, 7, 0, false, false, 1 / fps);
    assert.equal(feedback.engineFailed, true, 'Failure stays latched until restart');
    for (const recovery of [
        [4, 7, 1, true, false], [3, 9.7, 1, true, false], [3, 10, 0, false, false],
        [3, 10, 1, true, true], [0, 10, 1, true, false]
    ]) {
        feedback.reset();
        for (let frame = 0; frame < fps * 2; frame++) feedback.update(3, 10, 1, true, false, 1 / fps);
        feedback.update(...recovery, 1 / fps);
        assert.equal(feedback.redlineTime, 0, 'Shift, RPM recovery, release, brake or neutral clears the continuous over-rev timer');
        assert.equal(feedback.engineFailed, false);
    }
}
console.log('Drive feedback passed: 7k shift window, timing grades, limiter, continuous 3-second failure, recovery and neutral.');
