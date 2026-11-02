// Driving feedback and consequences; never feeds the microphone or pitch model.
function revShiftTiming(rpm) {
    if (rpm > 9.5) return { grade: 'late', label: 'Late shift' };
    if (rpm >= 8.5) return { grade: 'perfect', label: 'Perfect shift' };
    return { grade: 'early', label: 'Early shift' };
}

class RevDriveFeedback {
    constructor() { this.reset(); }

    reset() {
        this.gear = 0;
        this.highTime = 0;
        this.phase = 0;
        this.shiftReady = false;
        this.limiting = false;
        this.cutting = false;
        this.redlineTime = 0;
        this.engineFailed = false;
    }

    update(gear, rpm, throttle, active, braking, dt) {
        if (this.engineFailed) return;
        if (gear !== this.gear || gear === 0 || !active || braking || throttle <= 0.08) this.reset();
        this.gear = gear;
        this.shiftReady = gear > 0 && gear < 6 && rpm >= 7 && active && !braking && throttle > 0.08;
        if (gear === 0 || !active || braking || throttle <= 0.08) return;
        // The 9.8–10k zone represents the 10 marker despite limiter needle vibration.
        this.redlineTime = rpm >= 9.8 ? this.redlineTime + dt : 0;
        this.engineFailed = this.redlineTime > 3 + 1e-6;
        this.highTime = rpm >= 9.6 ? this.highTime + dt : Math.max(0, this.highTime - dt * 3);
        this.limiting = this.highTime >= 0.65 && rpm >= 9.5;
        this.phase = this.limiting ? this.phase + dt : 0;
        this.cutting = this.limiting && this.phase % 0.18 < 0.1;
    }
}

if (typeof module !== 'undefined') module.exports = { RevDriveFeedback, revShiftTiming };
