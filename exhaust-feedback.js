// Effects follow the input envelope; they never feed the transmission detector.
class RevExhaustFeedback {
    constructor() { this.reset(); }
    reset() { this.level = 0; this.pitch = 0; this.cooldown = 0; this.wispTime = 0; this.hotTime = 0; this.energy = 0; }

    update(signal, dt) {
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.hotTime = Math.max(0, this.hotTime - dt);
        const level = signal.active ? Math.min(1, Math.max(0, (signal.rms - signal.gate) / 0.067)) : 0;
        const pitchRise = this.pitch > 0 && signal.pitchHz > this.pitch * 1.15;
        const onset = level > 0.12 && (level - this.level > 0.16 || pitchRise);
        let puff = 0;
        if (signal.active) {
            this.hotTime = 0.35;
            this.energy = Math.max(level, signal.press);
            if (onset && this.cooldown === 0) {
                puff = Math.min(1, 0.3 + this.energy * 0.7);
                this.cooldown = 0.14;
                this.wispTime = 0;
            } else {
                this.wispTime += dt;
                if (this.wispTime >= 0.3 && this.energy > 0.15) { puff = 0.12 + this.energy * 0.12; this.wispTime = 0; }
            }
        } else this.wispTime = 0;
        this.level += (level - this.level) * (1 - Math.exp(-dt / 0.07));
        this.pitch = signal.active && signal.pitchHz > 0 ? signal.pitchHz : 0;
        return puff;
    }

    downshift() { return this.hotTime > 0 && this.energy > 0.15 ? Math.min(1, 0.35 + this.energy * 0.65) : 0; }
}
if (typeof module !== 'undefined') module.exports = { RevExhaustFeedback };
