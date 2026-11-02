// Voice input owns capture, calibration, signal analysis, shift cues and local AI.
// It returns sound data and requested shifts; the game owns physics, UI and rendering.

// BEGIN audio-model.js
// Engine recordings and live voice share this detector. No reference timestamps drive it.
const REV_GEAR_MIN_SPEEDS = [0, 0, 32, 54, 78, 108, 138];

class RevAudioModel {
    constructor() { this.reset(); }

    reset() {
        this.pitchHz = 0;
        this.rpm = 1000;
        this.press = 0;
        this.confidence = 0;
    }

    update(spectrum, rms, sampleRate, fftSize, dt, options = {}) {
        const { gate = 0.01, sensitivity = 2, rpmPerHz = 12, profile = 'engine', activityRms = rms } = options;
        const active = activityRms > gate;
        const voicePitch = options.voicePitch;
        const useVoiceAI = profile === 'voice' && active && voicePitch?.confidence >= 0.65
            && Number.isFinite(voicePitch.hz) && voicePitch.hz >= 50 && voicePitch.hz <= 2000;
        dt = Math.max(0, Math.min(0.1, dt));
        const binHz = sampleRate / fftSize;
        const amplitude = hz => {
            const bin = Math.round(hz / binHz);
            let peak = 0;
            for (let i = Math.max(1, bin - 1); i <= Math.min(spectrum.length - 1, bin + 1); i++) {
                peak = Math.max(peak, 10 ** (spectrum[i] / 20));
            }
            return peak;
        };
        let pitch = useVoiceAI ? voicePitch.hz : 0;
        let best = 0;
        if (active && !useVoiceAI) {
            const minHz = profile === 'engine' ? 75 : 90;
            const maxHz = profile === 'engine' ? 10000 / rpmPerHz : 1000;
            for (let hz = minHz; hz <= maxHz; hz += Math.max(3, binHz / 2)) {
                // Carrera GT's dominant firing band and supporting engine harmonics.
                // ponytail: this harmonic profile is V10-specific; add profiles when other cars are supplied.
                let strength = amplitude(hz);
                if (profile === 'engine') {
                    strength += amplitude(hz * 0.6) * 0.7 + amplitude(hz * 0.5) * 0.6
                        + amplitude(hz * 0.3) * 0.5 + amplitude(hz * 0.4) * 0.3;
                }
                if (strength > best) { best = strength; pitch = hz; }
            }
        }
        const smoothing = 1 - Math.exp(-dt / 0.07);
        this.pitchHz = pitch;
        // Detector signal score; it is not a probability of correct gear or RPM.
        this.confidence = useVoiceAI ? voicePitch.confidence : active ? Math.min(1, best / Math.max(0.015, rms * 2)) : 0;
        const previousRpm = this.rpm;
        const targetRpm = pitch ? Math.max(900, Math.min(9800, pitch * rpmPerHz)) : 1000;
        this.rpm += (targetRpm - this.rpm) * smoothing;
        const volume = Math.max(0, Math.min(1, (rms - gate) * sensitivity * 3));
        const rev = Math.max(0, Math.min(1, (this.rpm - 1000) / 8500));
        const rising = dt > 0 && (this.rpm - previousRpm) / dt > 900;
        let targetPress = profile === 'engine'
            ? (pitch ? Math.min(1, volume * 0.5 + rev * (rising ? 0.7 : 0.4)) : 0)
            : Math.min(1, volume * (0.68 + Math.max(0, (pitch - 150) / 850) * 0.45));
        const calibration = options.voiceCalibration;
        if (profile === 'voice' && calibration && useVoiceAI) {
            const pitchPosition = Math.max(0, Math.min(1,
                (pitch - calibration.pitchLowHz) / (calibration.pitchHighHz - calibration.pitchLowHz)));
            const level = Math.max(0, Math.min(1,
                (activityRms - gate) / (calibration.fullRms - gate) * (sensitivity / calibration.sensitivity)));
            targetPress = level ** calibration.volumeExponent
                * (calibration.pitchFloor + (1 - calibration.pitchFloor) * pitchPosition);
        }
        this.press += (targetPress - this.press) * (1 - Math.exp(-dt / (targetPress > this.press ? 0.055 : 0.1)));
        if (!active || this.press < 0.005) this.press = 0;
        return { pitchHz: this.pitchHz, rpm: this.rpm, press: this.press, confidence: this.confidence, rms, active,
            pitchSource: useVoiceAI ? 'AI voice' : 'standard' };
    }
}

class RevVoiceUpshift {
    constructor() { this.reset(); }

    reset() {
        this.peakPress = 0;
        this.peakRms = 0;
        this.dip = null;
    }

    get releasing() { return this.dip !== null && this.dip.lowTime >= 0.1; }

    update(press, rms, gear, dt, secondsSinceShift) {
        if (gear < 1 || gear >= 6 || secondsSinceShift < 0.75) { this.reset(); return false; }
        // Follow recent input; a loud rev earlier in the gear must not arm later fluctuations.
        const decay = Math.exp(-dt / 0.4);
        this.peakPress = Math.max(press, this.peakPress * decay);
        this.peakRms = Math.max(rms, this.peakRms * decay);
        if (!this.dip && this.peakPress > 0.48 && press <= this.peakPress * 0.6 && rms <= this.peakRms * 0.45) {
            this.dip = { press: this.peakPress, rms: this.peakRms, elapsed: 0, lowTime: 0, recoveryTime: 0 };
        }
        if (!this.dip) return false;
        const dip = this.dip;
        dip.elapsed += dt;
        if (dip.elapsed > 0.7) { this.reset(); return false; }
        const released = press <= dip.press * 0.6 && rms <= dip.rms * 0.45;
        if (dip.lowTime < 0.1) {
            if (!released) { this.dip = null; return false; }
            dip.lowTime += dt;
            return false;
        }
        // A higher absolute reading is not recovery: it must rise above the release valley.
        const recovered = press >= Math.max(0.35, dip.press * 0.7) && rms >= dip.rms * 0.7;
        dip.recoveryTime = recovered ? dip.recoveryTime + dt : 0;
        if (dip.recoveryTime < 0.06) return false;
        this.reset();
        return true;
    }
}

class RevVoiceCut {
    constructor() { this.reset(); }

    reset() { this.time = 0; this.history = []; this.cut = null; }

    update(signal, gear, dt, secondsSinceShift, settings) {
        if (gear < 1 || gear >= 6 || secondsSinceShift < 0.75) { this.reset(); return false; }
        this.time += dt;
        const { press, rms, pitchHz, pitchSource, gate } = signal;
        const voiced = pitchSource === 'AI voice' && pitchHz > 0;
        this.history.push({ time: this.time, rms, press, pitch: voiced ? pitchHz : 0 });
        this.history = this.history.filter(point => this.time - point.time <= 0.25);
        const peakRms = Math.max(...this.history.map(point => point.rms));
        const peakPitch = Math.max(...this.history.map(point => point.pitch));
        const peakPress = Math.max(...this.history.map(point => point.press));
        if (!this.cut && peakPress > 0.48 && peakRms > gate * 3 && rms <= peakRms * settings.volumeDropRatio) {
            this.cut = { elapsed: 0, rms: peakRms, pitch: peakPitch,
                lowTime: 0, lowRun: 0, quietTime: 0, quietRun: 0, returnTime: 0 };
        }
        if (!this.cut) return false;
        const cut = this.cut;
        cut.elapsed += dt;
        if (cut.elapsed > settings.maximumSeconds) { this.cut = null; return false; }
        cut.lowRun = rms <= cut.rms * settings.volumeDropRatio ? cut.lowRun + dt : 0;
        cut.quietRun = rms <= gate ? cut.quietRun + dt : 0;
        cut.lowTime = Math.max(cut.lowTime, cut.lowRun);
        cut.quietTime = Math.max(cut.quietTime, cut.quietRun);
        // Detect the recorded acoustic break before the smoothed pedal/AI can hide it.
        // Pitch-only changes and uninterrupted rising revs cannot create a cut.
        const pitchReset = voiced && cut.pitch > 0 && pitchHz <= cut.pitch * settings.pitchDropRatio;
        const shortGapReturned = cut.quietTime >= settings.minimumSeconds;
        const returned = rms >= Math.max(settings.returnRms, gate * 1.5) && (pitchReset || shortGapReturned);
        cut.returnTime = returned ? cut.returnTime + dt : 0;
        if (cut.lowTime < settings.minimumSeconds || cut.returnTime < settings.minimumSeconds) return false;
        this.reset();
        return true;
    }
}

class RevTransmission {
    constructor() { this.reset(); }

    reset() {
        this.history = [];
        this.dip = null;
        this.time = 0;
        this.lastShift = -10;
        this.silenceTime = 0;
    }

    noteShift() {
        this.lastShift = this.time;
        this.history = [];
        this.dip = null;
    }

    shouldDownshift(gear, speedKmh, dt, secondsSinceShift, silent) {
        this.silenceTime = silent ? this.silenceTime + dt : 0;
        // Leave short upshift/rev pauses alone. Neutral is always selected manually.
        return gear > 1 && this.silenceTime >= 1.2 && secondsSinceShift >= 0.9
            && speedKmh <= REV_GEAR_MIN_SPEEDS[gear];
    }

    update(rpm, gear, dt) {
        this.time += dt;
        this.history.push({ time: this.time, rpm });
        this.history = this.history.filter(point => this.time - point.time < 0.45);
        if (gear === 0 || gear >= 6 || this.time - this.lastShift < 0.9) { this.dip = null; return gear; }
        // Approximate audible RPM ratios for this recording's transmission.
        const expectedRatio = [0.6, 0.65, 0.75, 0.77, 0.88, 0.9][gear];
        const recoveryMargin = [300, 250, 200, 150, 80, 50][gear];
        const peak = Math.max(...this.history.map(point => point.rpm));
        const shiftFloor = [9000, 7800, 8000, 8000, 8000, 8800][gear];
        if (!this.dip && peak > shiftFloor
            && rpm < peak * (1 - (1 - expectedRatio) * 0.65)) {
            this.dip = { start: this.time, peak, low: rpm, recovery: 0, gear };
        }
        if (this.dip) {
            const dip = this.dip;
            dip.low = Math.min(dip.low, rpm);
            dip.recovery = rpm > dip.low + recoveryMargin ? dip.recovery + dt : 0;
            if (this.time - dip.start > 1.6 || dip.gear !== gear) this.dip = null;
            else if (dip.recovery >= 0.08) {
                const ratio = dip.low / dip.peak;
                this.dip = null;
                if (Math.abs(ratio - expectedRatio) < (gear === 0 ? 0.14 : 0.06)) {
                    this.noteShift();
                    return gear + 1;
                }
            }
        }
        return gear;
    }
}

// END audio-model.js

// BEGIN voice-ai.js
// CREPE pitch estimation, running locally. See assets/voice-pitch/provenance.json.
function prepareVoiceFrame(samples, sampleRate) {
    const frame = new Float32Array(1024);
    const step = sampleRate / 16000;
    const start = samples.length - 1024 * step;
    if (start < 0) throw new Error('Not enough audio for a voice frame');
    let mean = 0;
    for (let i = 0; i < frame.length; i++) {
        const position = start + i * step;
        const left = Math.floor(position);
        const fraction = position - left;
        frame[i] = samples[left] * (1 - fraction) + samples[Math.min(left + 1, samples.length - 1)] * fraction;
        mean += frame[i];
    }
    mean /= frame.length;
    let variance = 0;
    for (let i = 0; i < frame.length; i++) {
        frame[i] -= mean;
        variance += frame[i] * frame[i];
    }
    const scale = Math.max(1e-8, Math.sqrt(variance / frame.length));
    for (let i = 0; i < frame.length; i++) frame[i] /= scale;
    return frame;
}

function decodeVoicePitch(activation) {
    let center = 0;
    for (let i = 1; i < activation.length; i++) if (activation[i] > activation[center]) center = i;
    let weighted = 0;
    let weight = 0;
    for (let i = Math.max(0, center - 4); i < Math.min(360, center + 5); i++) {
        weighted += activation[i] * (1997.3794084376191 + i * 20);
        weight += activation[i];
    }
    return { hz: weight ? 10 * 2 ** (weighted / weight / 1200) : 0, confidence: activation[center] || 0 };
}

class RevVoicePitch {
    constructor() {
        this.state = 'idle';
        this.model = null;
        this.loading = null;
        this.busy = false;
        this.lastStart = -Infinity;
        this.epoch = 0;
        this.result = null;
    }

    reset() { this.epoch++; this.result = null; }

    async load() {
        if (this.state === 'ready') return;
        if (this.loading) return this.loading;
        this.state = 'loading';
        this.loading = (async () => {
            try {
                if (!globalThis.tf) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        const timeout = setTimeout(() => { script.remove(); reject(new Error('AI runtime timed out')); }, 15000);
                        script.src = 'assets/vendor/tf-4.22.0.min.js';
                        script.onload = () => { clearTimeout(timeout); resolve(); };
                        script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('AI runtime unavailable')); };
                        document.head.append(script);
                    });
                }
                await tf.ready();
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000);
                try {
                    if (this.model) this.model.dispose();
                    this.model = await tf.loadLayersModel('assets/voice-pitch/model.json', { requestInit: { signal: controller.signal } });
                } finally { clearTimeout(timeout); }
                const warmup = tf.tidy(() => this.model.predict(tf.zeros([1, 1024])));
                try { await warmup.data(); } finally { warmup.dispose(); }
                this.state = 'ready';
            } catch (error) {
                this.state = 'error';
                this.reset();
                throw error;
            } finally { this.loading = null; }
        })();
        return this.loading;
    }

    async predictFrame(frame) {
        const output = tf.tidy(() => this.model.predict(tf.tensor2d(frame, [1, 1024])));
        try { return decodeVoicePitch(await output.data()); }
        finally { output.dispose(); }
    }

    sample(samples, sampleRate, now, active) {
        if (!active) { this.reset(); return; }
        if (this.state !== 'ready' || this.busy || now - this.lastStart < 100) return;
        this.lastStart = now;
        const epoch = this.epoch;
        let frame;
        try { frame = prepareVoiceFrame(samples, sampleRate); }
        catch { this.state = 'error'; this.reset(); return; }
        this.busy = true;
        // Inference is single-flight; stale source/quiet results never replace current input.
        this.predictFrame(frame).then(result => {
            // Bridge short unclear frames with the last clear pitch, still capped at 300 ms.
            if (epoch === this.epoch && result.confidence >= 0.65) this.result = { ...result, at: now };
        }).catch(() => {
            this.state = 'error';
            this.reset();
        }).finally(() => { this.busy = false; });
    }

    current(now) {
        return this.result && now - this.result.at <= 300 && this.result.confidence >= 0.65 ? this.result : null;
    }
}

// END voice-ai.js

// BEGIN voice-preset.js
// Calibrated from IMG_3313.MOV; these are sound controls, never a timed vehicle script.
const REV_VOICE_3313 = Object.freeze({
    label: 'My rev · IMG_3313',
    sensitivity: 2,
    gate: 0.008,
    pitchLowHz: 150,
    pitchHighHz: 300,
    fullRms: 0.075,
    volumeExponent: 0.35,
    pitchFloor: 0.2,
    cut: Object.freeze({
        minimumSeconds: 0.025,
        maximumSeconds: 0.45,
        volumeDropRatio: 0.55,
        pitchDropRatio: 0.85,
        returnRms: 0.02
    })
});

// END voice-preset.js

// BEGIN experimental-downshift.js
// Direction cues complement the approved upshift detector above.
// ponytail: calibrated voice heuristics; broader voices need more labeled recordings.
class RevVoiceDownshift {
    constructor() { this.reset(); }

    reset() {
        this.time = 0;
        this.history = [];
        this.gap = null;
        this.lastVoice = null;
        this.blip = null;
        this.pendingUp = null;
        this.pitchFallTime = 0;
        this.glideBlockedUntil = 0;
        this.loweredPitch = null;
        this.softFallTime = 0;
    }

    softDownshift(signal, voiced, dt) {
        const recent = this.history.filter(p => this.time - p.time <= 0.7);
        let pairedFall = false;
        if (voiced && this.time >= this.glideBlockedUntil && recent.length >= 3) {
            const peak = recent.reduce((best, p) => p.pitch >= best.pitch ? p : best);
            const rising = recent.filter(p => peak.time - p.time >= 0.08);
            const beforePeak = rising[rising.length - 1];
            const peakRms = Math.max(signal.rms, ...recent.map(p => p.rms));
            // Require an established rising rev, then two signals falling together.
            // A sharp/quiet acoustic cut remains the approved upshift gesture.
            pairedFall = beforePeak && peak.time - recent[0].time >= 0.15
                && beforePeak.pitch >= recent[0].pitch * 1.04 && peak.pitch <= beforePeak.pitch * 1.2
                && this.time - peak.time <= 0.35
                && signal.pitchHz <= peak.pitch * 0.94 && signal.pitchHz >= peak.pitch * 0.6
                && signal.rms <= peakRms * 0.9 && signal.rms > Math.max(signal.gate * 1.5, peakRms * 0.55)
                && recent.filter(p => p.time >= peak.time).every(p => p.rms > Math.max(signal.gate, peakRms * 0.55));
        }
        this.softFallTime = pairedFall ? this.softFallTime + dt : 0;
        return this.softFallTime >= 0.12 - 1e-6;
    }

    update(signal, gear, dt, secondsSinceShift, upRequested = false) {
        this.time += dt;
        const voiced = signal.active && signal.pitchSource === 'AI voice' && signal.pitchHz > 0;
        const quiet = !signal.active;
        let down = false;
        let defer = false;

        if (gear < 2) {
            this.reset();
            return upRequested ? 'up' : null;
        }
        if (upRequested && signal.preserveUp) { this.reset(); return 'up'; }
        if (upRequested) this.softFallTime = 0;
        else if (this.softDownshift(signal, voiced, dt)) down = true;

        // A lower voiced register can briefly lose volume without being an upshift cut.
        // Arm only before an acoustic release, after the preceding pitch was established.
        if (voiced && !this.loweredPitch && !this.gap && !this.blip && this.lastVoice
            && this.time >= this.glideBlockedUntil && signal.pitchHz <= this.lastVoice.pitch * 0.86
            && signal.rms > signal.gate * 1.5
            && this.history.some(p => this.time - p.time <= 0.25 && (p.press > 0.48 || signal.shiftWindow) && signal.rms < p.rms * 0.55)) {
            const plateau = this.history.filter(p => p.pitch >= this.lastVoice.pitch * 0.96);
            if (plateau.length && this.lastVoice.time - plateau[0].time >= 0.15) {
                this.loweredPitch = { pitch: this.lastVoice.pitch, start: this.time, held: 0 };
            }
        }
        if (this.loweredPitch) {
            const lower = this.loweredPitch;
            if (quiet || this.time - lower.start > 0.65 || (voiced && signal.pitchHz > lower.pitch * 0.9)) {
                this.loweredPitch = null;
            } else {
                defer = true;
                if (voiced && signal.pitchHz <= lower.pitch * 0.86) lower.held += dt;
                if (voiced && lower.held >= 0.16) down = true;
            }
        }

        if (quiet) {
            this.pitchFallTime = 0;
            if (!this.gap && this.lastVoice && this.time - this.lastVoice.time < 0.25) {
                this.gap = { pitch: this.lastVoice.pitch, press: Math.max(...this.history.map(p => p.press), 0),
                    rms: Math.max(...this.history.map(p => p.rms), signal.rms),
                    elapsed: 0, quietTime: 0, flatTime: 0 };
            }
            this.history = [];
        }
        if (this.gap) {
            const gap = this.gap;
            gap.elapsed += dt;
            if (quiet) gap.quietTime += dt;
            if (gap.elapsed > 0.5) this.gap = null;
            else if (!quiet && gap.quietTime >= 0.06 && (gap.press > 0.48 || signal.shiftWindow)) {
                defer = true;
                if (voiced) {
                    const ratio = signal.pitchHz / gap.pitch;
                    if (ratio < 0.9 || ratio > 1.1) { this.gap = null; defer = false; }
                    else {
                        const lowerReturn = signal.rms < gap.rms * 0.9 && signal.rms > signal.gate * 2;
                        gap.flatTime = lowerReturn ? gap.flatTime + dt : 0;
                        if (gap.flatTime >= 0.06) down = true;
                    }
                }
            }
        }

        if (voiced) {
            // Reserve acoustic cuts for the approved upshift gesture, even in sixth.
            const envelope = this.history.filter(p => this.time - p.time <= 0.25);
            if (Math.max(0, ...envelope.map(p => p.press)) > 0.48
                && signal.rms < Math.max(0, ...envelope.map(p => p.rms)) * 0.55) {
                this.glideBlockedUntil = this.time + 0.65;
            }
            // A quick low-rev blip returns within half a second; a continuing rise expires it.
            const rise = this.lastVoice ? signal.pitchHz / this.lastVoice.pitch : 1;
            if (rise > 1.25 && rise < 1.8 && this.lastVoice.press < 0.35 && this.history.length
                && this.time - this.history[0].time >= 0.2) {
                this.blip = { time: this.time, peak: signal.pitchHz,
                    rms: Math.max(signal.rms, ...this.history.filter(p => this.time - p.time <= 0.2).map(p => p.rms)) };
            }
            if (this.blip) {
                if (this.time - this.blip.time > 0.5) this.blip = null;
                else {
                    this.blip.peak = Math.max(this.blip.peak, signal.pitchHz);
                    this.blip.rms = Math.max(this.blip.rms, signal.rms);
                    if (signal.pitchHz < this.blip.peak * 0.85 && signal.rms < this.blip.rms * 0.85) down = true;
                    defer = true;
                }
            }
            // Discard abrupt falling resets: those belong to the existing upshift detector.
            if (this.lastVoice && signal.pitchHz < this.lastVoice.pitch * 0.85
                && this.time < this.glideBlockedUntil) this.history = [];
            this.history.push({ time: this.time, pitch: signal.pitchHz, rms: signal.rms, press: signal.press });
            this.history = this.history.filter(p => this.time - p.time <= 1.8);
            const peak = this.history.reduce((best, p) => p.pitch > best.pitch ? p : best);
            // Judge the current rev locally; an older pitch spike must not mask it.
            const rev = this.history.filter(p => this.time - p.time <= 0.7);
            const revPeak = rev.reduce((best, p) => p.pitch > best.pitch ? p : best);
            const beforePeak = rev.filter(p => revPeak.time - p.time >= 0.08).at(-1);
            const descent = rev.filter(p => p.time >= revPeak.time);
            // A rounded rev returning through intermediate pitches is a down gesture
            // even above the old pedal cutoff. Require multiple downward steps,
            // no pitch rebound, and no deep acoustic release along that descent.
            const roundedReturn = beforePeak && revPeak.time - rev[0].time >= 0.2
                && this.time - revPeak.time >= 0.35 && this.time - revPeak.time <= 0.6
                && revPeak.pitch >= rev[0].pitch * 1.12
                && beforePeak.pitch >= rev[0].pitch * 1.04 && revPeak.pitch <= beforePeak.pitch * 1.2
                && signal.pitchHz <= revPeak.pitch * 0.88 && signal.rms <= revPeak.rms * 0.85
                && descent.filter((p, i) => i && p.pitch < descent[i - 1].pitch * 0.98).length >= 2
                && descent.every((p, i) => p.rms > Math.max(signal.gate * 2, revPeak.rms * 0.25)
                    && (!i || (p.time - descent[i - 1].time <= 0.12
                        && p.pitch >= descent[i - 1].pitch * 0.86 && p.pitch <= descent[i - 1].pitch * 1.02)));
            if (roundedReturn) down = true;
            if (peak.time - this.history[0].time >= 0.2 && this.time - peak.time >= 0.4
                && peak.press > 0.2 && peak.press < 0.48 && signal.pitchHz <= peak.pitch * 0.88
                && signal.rms <= peak.rms * 0.85 && signal.rms > signal.gate * 2) down = true;
            // Lowering a steady voiced pitch must work without lowering its volume.
            const plateau = this.history.filter(p => p.pitch >= peak.pitch * 0.96);
            const plateauEnd = plateau[plateau.length - 1];
            const fallingPitch = this.time >= this.glideBlockedUntil && this.time - plateauEnd.time >= 0.35
                && plateauEnd.time - plateau[0].time >= 0.15
                && plateauEnd.time - this.history[0].time >= 0.2 && signal.pitchHz <= peak.pitch * 0.86
                && signal.rms > signal.gate * 1.5;
            this.pitchFallTime = fallingPitch ? this.pitchFallTime + dt : 0;
            if (this.pitchFallTime >= 0.16 && !upRequested) down = true;
            this.lastVoice = { time: this.time, pitch: signal.pitchHz, press: signal.press };
        } else if (!quiet) {
            this.pitchFallTime = 0;
            // A register change can briefly lose AI confidence. Never shift on fallback,
            // but keep its preceding steady tone long enough to confirm the new pitch.
            if (!this.lastVoice || this.time - this.lastVoice.time > 0.35) this.history = [];
        }

        if (secondsSinceShift < 0.9) return upRequested && !this.loweredPitch ? 'up' : null;
        if (down && gear > 1) { this.reset(); return 'down'; }
        if (upRequested) {
            if (defer) this.pendingUp = this.time;
            else { this.reset(); return 'up'; }
        }
        if (this.pendingUp !== null && (!defer || this.time - this.pendingUp > 0.25)) {
            this.reset();
            return 'up';
        }
        return null;
    }
}

class RevAutoNeutral {
    constructor(minimumSpeeds) { this.minimumSpeeds = minimumSpeeds; this.reset(); }

    reset() { this.silenceTime = 0; this.returnTime = 0; this.automatic = false; }

    gearForSpeed(speedKmh) {
        for (let gear = this.minimumSpeeds.length - 1; gear > 1; gear--) {
            if (speedKmh >= this.minimumSpeeds[gear]) return gear;
        }
        return 1;
    }

    update(active, press, gear, speedKmh, dt) {
        if (!active) {
            this.silenceTime += dt;
            this.returnTime = 0;
            if (gear > 0 && this.silenceTime > 3 + 1e-6) { this.automatic = true; return 0; }
        } else {
            this.silenceTime = 0;
            this.returnTime = gear === 0 && this.automatic && press > 0.08 ? this.returnTime + dt : 0;
            if (this.returnTime >= 0.12) {
                this.automatic = false;
                this.returnTime = 0;
                return this.gearForSpeed(speedKmh);
            }
        }
        return null;
    }
}

// END experimental-downshift.js

// Optional trial: normalize pitch and loudness before giving each equal weight.
// The preceding locked detectors remain the previous-control path.
class RevVoiceBlend {
    constructor() { this.reset(); }

    reset() {
        this.press = 0; this.time = 0; this.sampleTime = 0; this.samples = [];
        this.pitchLowHz = REV_VOICE_3313.pitchLowHz;
        this.pitchHighHz = REV_VOICE_3313.pitchHighHz;
        this.fullRms = REV_VOICE_3313.fullRms;
    }

    update(signal, dt, gate, sensitivity) {
        dt = Math.max(0, Math.min(0.1, dt));
        this.time += dt;
        if (!signal.active) { this.press = 0; return { ...signal, press: 0 }; }
        if (signal.pitchSource !== 'AI voice') { this.press = signal.press; return signal; }
        this.sampleTime += dt;
        if (this.sampleTime >= 0.1) {
            this.sampleTime %= 0.1;
            this.samples.push({ time: this.time, hz: signal.pitchHz, rms: signal.activityRms });
        }
        this.samples = this.samples.filter(p => this.time - p.time <= 8);
        if (this.samples.length >= 12) {
            const pitches = this.samples.map(p => p.hz).sort((a, b) => a - b);
            const levels = this.samples.map(p => p.rms).sort((a, b) => a - b);
            const low = pitches[Math.floor((pitches.length - 1) * 0.1)];
            const high = pitches[Math.floor((pitches.length - 1) * 0.9)];
            const adapt = 1 - Math.exp(-dt / 4);
            // Percentiles keep a single octave mistake or loud spike out of calibration.
            if (high - low >= 60) {
                this.pitchLowHz += (Math.max(70, Math.min(600, low)) - this.pitchLowHz) * adapt;
                this.pitchHighHz += (Math.max(this.pitchLowHz + 60, Math.min(1000, high)) - this.pitchHighHz) * adapt;
            }
            const full = Math.max(gate * 4, Math.min(0.3, levels[Math.floor((levels.length - 1) * 0.9)]));
            this.fullRms += (full - this.fullRms) * adapt;
        }
        const pitch = Math.max(0, Math.min(1, (signal.pitchHz - this.pitchLowHz) / (this.pitchHighHz - this.pitchLowHz)));
        const volume = Math.sqrt(Math.max(0, Math.min(1,
            (signal.activityRms - gate) / Math.max(0.001, this.fullRms - gate) * sensitivity / REV_VOICE_3313.sensitivity)));
        const target = (pitch + volume) / 2;
        this.press += (target - this.press) * (1 - Math.exp(-dt / (target > this.press ? 0.055 : 0.1)));
        return { ...signal, press: this.press, gesturePress: signal.press, mix: { pitch, volume } };
    }
}

class RevVoiceInput {
    constructor(reference = null) {
        this.reference = reference;
        this.context = null;
        this.analyser = null;
        this.microphone = null;
        this.stream = null;
        this.mediaSource = null;
        this.mediaConnected = false;
        this.mode = 'none';
        this.generation = 0;
        this.model = new RevAudioModel();
        this.ai = new RevVoicePitch();
        this.transmission = new RevTransmission();
        this.upshift = new RevVoiceUpshift();
        this.cut = new RevVoiceCut();
        this.downshift = new RevVoiceDownshift();
        this.autoNeutral = new RevAutoNeutral(REV_GEAR_MIN_SPEEDS);
        this.blend = new RevVoiceBlend();
        this.profileKey = 'voice-custom';
        this.settings = {
            engine: { sensitivity: 2, gate: 0.01 },
            voice: { sensitivity: 2, gate: 0.01 },
            'voice-custom': { sensitivity: REV_VOICE_3313.sensitivity, gate: REV_VOICE_3313.gate }
        };
    }

    get profile() { return this.profileKey === 'engine' ? 'engine' : 'voice'; }
    get calibration() { return this.profileKey === 'voice-custom' ? REV_VOICE_3313 : null; }
    get sensitivity() { return this.settings[this.profileKey].sensitivity; }
    set sensitivity(value) { this.settings[this.profileKey].sensitivity = value; }
    get gate() { return this.settings[this.profileKey].gate; }
    set gate(value) { this.settings[this.profileKey].gate = value; }

    setProfile(key) {
        if (!Object.hasOwn(this.settings, key)) throw new RangeError('Unknown sound profile');
        this.profileKey = key;
    }

    ensureAI(enabled = true) {
        if (this.profile === 'voice' && enabled) return this.ai.load();
        this.ai.reset();
        return Promise.resolve();
    }

    initAudio() {
        if (this.context) return;
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 8192;
        this.analyser.smoothingTimeConstant = 0;
        this.freqData = new Float32Array(this.analyser.frequencyBinCount);
        this.timeData = new Float32Array(this.analyser.fftSize);
        this.inputFilter = this.context.createBiquadFilter();
        this.inputFilter.type = 'highpass';
        this.inputFilter.frequency.value = 45;
        this.inputFilter.connect(this.analyser);
        // Reference playback has its own audible connection. Analysis stays silent.
        const silent = this.context.createGain();
        silent.gain.value = 0;
        this.analyser.connect(silent);
        silent.connect(this.context.destination);
    }

    stopMicrophone() {
        const native = this.nativeCapture;
        this.nativeCapture = null;
        if (native) {
            clearTimeout(native.timer);
            for (const source of native.sources) { source.stop(); source.disconnect(); }
            native.bridge.postMessage({ action: 'stop', id: native.id }).catch(() => {});
        }
        if (this.microphone) this.microphone.disconnect();
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());
        this.microphone = null;
        this.stream = null;
    }

    async startMicrophone() {
        return this.openMicrophone(false);
    }

    async openMicrophone(echoCancellation) {
        const generation = ++this.generation;
        this.reference?.pause();
        this.stopMicrophone();
        if (this.mediaConnected) { this.mediaSource.disconnect(this.inputFilter); this.mediaConnected = false; }
        this.mode = 'none';
        let timeout;
        const capture = async () => {
            // Ask the native host before WebKit/audio startup can stall the permission prompt.
            const permission = window.webkit?.messageHandlers?.microphonePermission;
            if (permission && !await permission.postMessage({})) {
                throw new DOMException('Allow RevLine in Privacy & Security → Microphone, then try again.', 'NotAllowedError');
            }
            if (generation !== this.generation) return false;
            if (!navigator.mediaDevices?.getUserMedia) {
                if (window.webkit?.messageHandlers?.microphoneCapture) return this.startNativeMicrophone(generation, echoCancellation);
                throw new DOMException('Microphone capture is unavailable in this app window.', 'NotSupportedError');
            }
            this.initAudio();
            // Capture first: a suspended AudioContext must not block the system permission request.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                echoCancellation, noiseSuppression: false, autoGainControl: false
            }});
            if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return false; }
            this.stream = stream;
            await this.context.resume();
            if (generation !== this.generation) return false;
            this.microphone = this.context.createMediaStreamSource(stream);
            this.microphone.connect(this.inputFilter);
            this.mode = 'mic';
            return true;
        };
        try {
            return await Promise.race([capture(), new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new DOMException('Microphone startup timed out. Check the permission prompt, then try again.', 'TimeoutError')), 30000);
            })]);
        } catch (error) {
            if (generation !== this.generation) return false;
            ++this.generation; // Late permission/capture results must not restart a failed attempt.
            this.stopMicrophone();
            this.mode = 'none';
            throw error;
        } finally { clearTimeout(timeout); }
    }

    async startNativeMicrophone(generation, echoCancellation) {
        this.initAudio();
        const native = { bridge: window.webkit.messageHandlers.microphoneCapture,
            id: `${Date.now()}-${generation}-${Math.random()}`, sources: new Set(), timer: null, nextTime: 0 };
        this.nativeCapture = native;
        await native.bridge.postMessage({ action: 'start', id: native.id, echoCancellation });
        if (generation !== this.generation) {
            await native.bridge.postMessage({ action: 'stop', id: native.id });
            return false;
        }
        await this.context.resume();
        if (generation !== this.generation) return false;
        this.mode = 'mic';
        const current = () => this.nativeCapture === native && generation === this.generation;
        const poll = async () => {
            if (!current()) return;
            try {
                const frame = await native.bridge.postMessage({ action: 'read', id: native.id });
                if (!current()) return;
                if (frame.samples) {
                    if (this.context.state !== 'running' || native.sources.size >= 16) {
                        throw new DOMException('The audio engine stopped playing microphone input. Try Microphone again.', 'NotReadableError');
                    }
                    const bytes = Uint8Array.from(atob(frame.samples), character => character.charCodeAt(0));
                    if (bytes.byteLength > 8192 * 4 || bytes.byteLength % 4 || !Number.isFinite(frame.sampleRate)) {
                        throw new Error('Invalid microphone audio frame.');
                    }
                    const samples = new Float32Array(bytes.buffer);
                    const buffer = this.context.createBuffer(1, samples.length, frame.sampleRate);
                    buffer.copyToChannel(samples, 0);
                    const source = this.context.createBufferSource();
                    source.buffer = buffer; source.connect(this.inputFilter);
                    // A short queue absorbs IPC jitter; bound it so old voice never builds up.
                    const now = this.context.currentTime;
                    if (native.nextTime > now + 0.25) native.nextTime = now;
                    native.nextTime = Math.max(now + 0.02, native.nextTime);
                    native.sources.add(source);
                    source.onended = () => { source.disconnect(); native.sources.delete(source); };
                    source.start(native.nextTime); native.nextTime += buffer.duration;
                }
            } catch (error) {
                if (current()) {
                    this.stopMicrophone(); this.mode = 'none';
                    window.dispatchEvent(new CustomEvent('revline:microphone-error', { detail: { name: error.name, message: error.message } }));
                }
                return;
            }
            if (current()) native.timer = setTimeout(poll, 20);
        };
        poll();
        return true;
    }

    async prepareReference() {
        if (!this.reference) throw new Error('No reference recording attached');
        const generation = ++this.generation;
        this.initAudio();
        await this.context.resume();
        if (generation !== this.generation) return false;
        this.stopMicrophone();
        if (!this.mediaSource) {
            this.mediaSource = this.context.createMediaElementSource(this.reference);
            this.mediaSource.connect(this.context.destination);
        }
        if (!this.mediaConnected) { this.mediaSource.connect(this.inputFilter); this.mediaConnected = true; }
        this.mode = 'reference';
        return true;
    }

    stop() {
        ++this.generation;
        this.reference?.pause();
        this.stopMicrophone();
        this.mode = 'none';
        if (this.context) this.context.suspend();
    }

    analyze(dt, { aiEnabled = true, blendEnabled = false, rpmPerHz = 12.5, now = performance.now() } = {}) {
        if (!this.analyser) return null;
        this.analyser.getFloatFrequencyData(this.freqData);
        this.analyser.getFloatTimeDomainData(this.timeData);
        let sum = 0;
        for (const sample of this.timeData) sum += sample * sample;
        let recentSum = 0;
        for (let i = this.timeData.length - 1024; i < this.timeData.length; i++) recentSum += this.timeData[i] * this.timeData[i];
        const activityRms = Math.sqrt(recentSum / 1024);
        aiEnabled = this.profile === 'voice' && aiEnabled;
        if (aiEnabled) this.ai.sample(this.timeData, this.context.sampleRate, now, activityRms > this.gate);
        const signal = this.model.update(this.freqData, Math.sqrt(sum / this.timeData.length), this.context.sampleRate, this.analyser.fftSize, dt, {
            gate: this.gate, sensitivity: this.sensitivity, profile: this.profile, activityRms,
            voicePitch: aiEnabled ? this.ai.current(now) : null, rpmPerHz, voiceCalibration: this.calibration
        });
        const result = { ...signal, activityRms };
        return blendEnabled && this.profile === 'voice'
            ? this.blend.update(result, dt, this.gate, this.sensitivity) : result;
    }

    detectShift(signal, press, gear, dt, secondsSinceShift, { downshiftEnabled = true, aiEnabled = true, rpm } = {}) {
        // The trial changes rev/throttle feel; keep calibrated shift cuts on their original envelope.
        press = signal.gesturePress ?? press;
        const calibration = this.calibration;
        // Same scale as the tachometer: 7 means 7,000 RPM.
        const shiftWindow = Number.isFinite(rpm) && rpm >= 7 && gear > 0;
        const upArmed = shiftWindow && gear < 6;
        let upshift, releasing = false;
        if (calibration?.cut) {
            const gain = this.sensitivity / calibration.sensitivity;
            const cutPress = upArmed && signal.active ? Math.max(0.5, press) : press;
            upshift = this.cut.update({ press: cutPress, rms: signal.activityRms * gain,
                pitchHz: signal.pitchHz, pitchSource: signal.pitchSource, gate: this.gate * gain },
                gear, dt, secondsSinceShift, calibration.cut);
        } else {
            const recovered = signal.activityRms >= Math.max(this.gate * 3, this.upshift.peakRms * 0.7);
            const upPress = upArmed && signal.active && recovered ? Math.max(0.5, press) : press;
            upshift = this.upshift.update(upPress, signal.activityRms, gear, dt, secondsSinceShift);
            releasing = this.upshift.releasing;
        }
        let direction = upshift ? 'up' : null;
        if (downshiftEnabled && aiEnabled) {
            const gain = calibration ? this.sensitivity / calibration.sensitivity : 1;
            direction = this.downshift.update({ press, rms: signal.activityRms * gain,
                pitchHz: signal.pitchHz, pitchSource: signal.pitchSource, active: signal.active, gate: this.gate * gain,
                preserveUp: !calibration, shiftWindow }, gear, dt, secondsSinceShift, upshift);
        } else this.downshift.reset();
        return { direction, releasing };
    }
}

if (typeof module !== 'undefined') module.exports = { REV_GEAR_MIN_SPEEDS, RevAudioModel, RevVoiceUpshift, RevVoiceCut, RevTransmission, prepareVoiceFrame, decodeVoicePitch, RevVoicePitch, REV_VOICE_3313, RevVoiceDownshift, RevAutoNeutral, RevVoiceBlend, RevVoiceInput };

// Personal setup extends the frozen input path; the original detectors above stay intact.
class RevVoiceCalibration {
    constructor() { this.frames = { quiet: [], rev: [] }; }

    observe(step, signal, dt) {
        if (!this.frames[step] || !Number.isFinite(signal?.activityRms) || signal.activityRms < 0) return;
        if (this.frames[step].length >= 1200) return;
        this.frames[step].push({ rms: signal.activityRms, hz: signal.pitchHz,
            clear: signal.pitchSource === 'AI voice' && signal.confidence >= 0.65,
            dt: Math.max(0, Math.min(0.1, dt)) });
    }

    fit() {
        const quantile = (values, fraction) => values.sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
        const quiet = this.frames.quiet, voiced = this.frames.rev.filter(p => p.clear && p.hz >= 50 && p.hz <= 1000);
        if (quiet.reduce((s, p) => s + p.dt, 0) < 1.5 || voiced.reduce((s, p) => s + p.dt, 0) < 1.2) {
            return { error: 'We need a clearer rev. Rev from low to high in a normal voice.' };
        }
        const roomNoise = quantile(quiet.map(p => p.rms), 0.95);
        const gate = Math.max(0.001, Math.min(0.05, roomNoise * 2.5));
        const fullRms = quantile(voiced.map(p => p.rms), 0.9);
        const pitchLowHz = quantile(voiced.map(p => p.hz), 0.1), pitchHighHz = quantile(voiced.map(p => p.hz), 0.9);
        if (roomNoise > 0.02 || fullRms <= gate * 3 || fullRms > 0.5) return { error: 'Background noise is too close to your voice. Move somewhere quieter, closer to the microphone, and try again.' };
        if (pitchHighHz - pitchLowHz < 35) return { error: 'Try a wider rev range. Go from a low pitch to a high pitch without getting louder.' };
        return { profile: { version: 1, pitchLowHz, pitchHighHz, fullRms, gate, practice: { up: 0, down: 0 } } };
    }

    static validate(value, requirePractice = true) {
        if (!value || value.version !== 1 || !['pitchLowHz', 'pitchHighHz', 'fullRms', 'gate'].every(k => Number.isFinite(value[k]))) return null;
        if (value.pitchLowHz < 50 || value.pitchHighHz > 1000 || value.pitchHighHz - value.pitchLowHz < 35
            || value.gate < 0.001 || value.gate > 0.05 || value.fullRms <= value.gate * 3 || value.fullRms > 0.5) return null;
        if (requirePractice && (value.practice?.up !== 2 || value.practice?.down !== 2)) return null;
        return { version: 1, pitchLowHz: value.pitchLowHz, pitchHighHz: value.pitchHighHz,
            fullRms: value.fullRms, gate: value.gate,
            practice: { up: value.practice?.up === 2 ? 2 : 0, down: value.practice?.down === 2 ? 2 : 0 } };
    }
}

class RevPersonalVoiceInput extends RevVoiceInput {
    constructor(reference = null) {
        super(reference);
        this.personalCalibration = null;
        this.settings['voice-personal'] = { sensitivity: 2, gate: 0.008 };
        const resetBlend = this.blend.reset.bind(this.blend);
        this.blend.reset = () => {
            resetBlend();
            if (this.profileKey === 'voice-personal' && this.personalCalibration) {
                Object.assign(this.blend, { pitchLowHz: this.personalCalibration.pitchLowHz,
                    pitchHighHz: this.personalCalibration.pitchHighHz, fullRms: this.personalCalibration.fullRms });
            }
        };
        this.direction = new RevDirectionGuard();
        this.echoCancellation = true;
    }

    // Echo cancellation (user request): like a video call, the microphone keeps the player's
    // voice and removes what this device plays, such as the race sound effects. Noise
    // suppression and gain control stay off so the rev envelope keeps its shape. Off = the
    // original raw input path, unchanged.
    async startMicrophone() {
        return this.openMicrophone(this.echoCancellation);
    }

    // The original detectors run unchanged; the guard then judges each gesture by what follows it.
    detectShift(signal, press, gear, dt, secondsSinceShift, options = {}) {
        const result = super.detectShift(signal, press, gear, dt, secondsSinceShift, options);
        return { ...result, direction: this.direction.update(signal, result.direction, gear, dt) };
    }

    get calibration() {
        return this.profileKey === 'voice-personal' && this.personalCalibration ? this.personalCalibration : super.calibration;
    }

    usePersonalProfile(value, requirePractice = true) {
        const profile = RevVoiceCalibration.validate(value, requirePractice);
        if (!profile) return false;
        this.personalCalibration = Object.freeze({ ...REV_VOICE_3313, label: 'Your voice',
            pitchLowHz: profile.pitchLowHz, pitchHighHz: profile.pitchHighHz, fullRms: profile.fullRms,
            gate: profile.gate, cut: Object.freeze({ ...REV_VOICE_3313.cut,
                returnRms: Math.max(profile.gate * 1.5, Math.min(0.02, profile.fullRms * 0.25)) }) });
        this.settings['voice-personal'] = { sensitivity: REV_VOICE_3313.sensitivity, gate: profile.gate };
        this.setProfile('voice-personal'); this.blend.reset();
        this.model.reset(); this.cut.reset(); this.downshift.reset(); this.upshift.reset();
        return true;
    }
}

// BEGIN direction-guard.js — user-authorized update from the IMG_3317 notes (3-second hold removed on request).
// The original detectors above still run unchanged; this layer judges each gesture
// by what surrounds it:
//   break (quiet, or loudness < 30% of the recent peak), return  → upshift, immediately
//   volume cut whose pitch falls > 25% (now or within 0.4 s)     → upshift (rev resetting into the next gear)
//   other drop without a break (cut, or > 25% within 0.6 s)      → wait ≤ 0.9 s: rev rebuilds → upshift;
//                                                                   stays flat → any downshift the rules asked for
//   small rev (≥ 8%, 0.15–0.6 s) from a steady level, falling back → one gear down (also right after an up)
//   a constant rev, in any gear                                  → nothing (cruising; no timed downshift)
//   within 1.5 s of an upshift                                   → no downshift except a blip
//   within 0.75 s of the guard's previous shift                   → no shift
// While the voice continues, a sudden ×2 jump is folded back: the pitch model can
// report double a low voice (IMG_3317, 22.5 s).
class RevDirectionGuard {
    constructor() {
        this.time = 0; this.points = []; this.levels = []; this.reference = 0; this.gear = null;
        this.breakAt = -Infinity; this.lostVoice = 0; this.lastUpAt = -Infinity; this.lastShiftAt = -Infinity; this.burst = null;
        this.restart();
    }

    // Any gear change (voice, silence, N ↔ D, new run): any pending up or blip starts over.
    restart() { this.pending = null; this.burst = null; }

    // A gesture is still being judged; the game's automatic gearbox waits for the voice.
    get busy() { return Boolean(this.pending || this.burst); }

    fold(hz) {
        const ratio = this.reference ? hz / this.reference : 1;
        const folded = ratio > 1.8 && ratio < 2.2 ? hz / 2 : hz;
        this.reference = folded;
        return folded;
    }

    recent(seconds) { return this.points.filter(p => this.time - p.time <= seconds).map(p => p.pitch); }

    // A blip rises ≥ 8% from a flat-or-falling level (or straight out of a break), stays up at least
    // 0.15 s and falls most of the way back within 0.6 s. A held voice wobbles ≤ 1% and a slow rise
    // never falls back (IMG_3315/3317), so even small revs are safe. A rev that keeps rising into a
    // drop is an upshift, so its base is not "flat".
    trackBlip(pitch) {
        const level = this.points.filter(p => this.time - p.time >= 0.15 && this.time - p.time <= 0.75).map(p => p.pitch);
        const base = level.length ? Math.min(...level) : 0;
        const flat = level.length >= 4 && level.at(-1) <= base * 1.05 && Math.max(...level) <= base * 1.12;
        const fromBreak = level.length > 0 && this.time - this.breakAt <= 0.3;
        if (!this.burst && base && (flat || fromBreak) && pitch >= base * 1.08) this.burst = { start: this.time, peak: pitch, base };
        if (!this.burst) return false;
        this.burst.peak = Math.max(this.burst.peak, pitch);
        if (pitch > this.burst.base + (this.burst.peak - this.burst.base) * 0.4) {
            if (this.time - this.burst.start > 0.6) this.burst.held = true;   // stayed up: a rev, not a blip
            return false;
        }
        // Falling by almost exactly half means the "burst" was a doubled pitch reading, not a blip.
        // Dropping well below where it started is a rev resetting into the next gear, not a blip.
        const ratio = this.burst.peak / pitch, misread = ratio > 1.8 && ratio < 2.2;
        const blip = !this.burst.held && !misread && pitch >= this.burst.base * 0.92 && this.time - this.burst.start >= 0.15 - 1e-6;
        this.burst = null;
        return blip;
    }

    update(signal, direction, gear, dt) {
        this.time += dt;
        if (gear !== this.gear) { this.restart(); this.gear = gear; }
        const voiced = signal.active && signal.pitchSource === 'AI voice' && signal.pitchHz > 0;
        let pitch = 0, blip = false, dropped = false, peak = Math.max(0, ...this.recent(0.6));
        // A break is silence or a deep dip; a loud sound the pitch model briefly loses is not.
        this.levels.push({ time: this.time, rms: signal.activityRms || 0 });
        this.levels = this.levels.filter(l => this.time - l.time <= 0.6);
        if (signal.activityRms < Math.max(...this.levels.map(l => l.rms)) * 0.3) this.breakAt = this.time;
        // Silence is a break (an upshift gesture), so it also ends any small rev in progress.
        if (!signal.active) { this.breakAt = this.time; this.lostVoice = 0; this.reference = 0; this.pending = null; this.burst = null; }
        else if (!voiced) {
            this.lostVoice += dt;
            if (this.lostVoice >= 0.1) this.reference = 0;
        } else {
            this.lostVoice = 0;
            pitch = this.fold(signal.pitchHz);
            // Readings near double the current pitch were misread; the real level before them counts.
            const before = this.recent(0.6).filter(p => Math.abs(p / (2 * pitch) - 1) > 0.1);
            peak = Math.max(0, ...before);
            dropped = before.length > 0 && pitch <= peak * 0.75;
            blip = this.trackBlip(pitch);
            this.points.push({ time: this.time, pitch });
            this.points = this.points.filter(p => this.time - p.time <= 1.2);
        }

        // One gesture, one shift: the tail of a gesture must not shift again.
        if (this.time - this.lastShiftAt < 0.75) return null;
        // A blip ends in a big drop too, so it is judged first.
        if (blip && gear > 1) direction = 'down';
        else if (direction === 'up' && (this.time - this.breakAt <= 0.5 || dropped)) return this.accept('up');
        else if ((direction === 'up' || dropped) && !this.pending) {
            // A drop with no break: decided by what follows.
            this.pending = { at: this.time, low: pitch || Infinity, peak, cut: direction === 'up', down: false };
            if (direction === 'up') direction = null;
        } else if (direction === 'up') { this.pending.cut = true; direction = null; }
        if (direction === 'down' && this.pending && !blip) { this.pending.down = true; direction = null; }
        if (direction === 'down' && (blip || this.time - this.lastUpAt >= 1.5)) return this.accept('down');
        if (this.pending) {
            if (voiced) this.pending.low = Math.min(this.pending.low, pitch);
            const resetDeep = this.pending.cut && this.time - this.pending.at <= 0.4 && pitch <= this.pending.peak * 0.75;
            const rebuilt = this.time - this.pending.at >= 0.1 && pitch >= this.pending.low * 1.03;
            if (voiced && gear < 6 && (resetDeep || rebuilt)) return this.accept('up');
            if (this.time - this.pending.at > 0.9) {
                // Stayed flat or fell: not an upshift. A downshift asked for meanwhile goes ahead.
                const down = this.pending.down && gear > 1 && this.time - this.lastUpAt >= 1.5;
                this.pending = null;
                if (down) return this.accept('down');
            }
        }

        return null;
    }

    accept(direction) {
        if (direction === 'up') this.lastUpAt = this.time;
        this.lastShiftAt = this.time;
        this.restart();
        return direction;
    }
}
// END direction-guard.js

if (typeof module !== 'undefined') Object.assign(module.exports, { RevVoiceCalibration, RevPersonalVoiceInput, RevDirectionGuard });
