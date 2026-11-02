// Phone sound effects for the race. The player's voice is the engine; the phone adds what a
// voice cannot: turbo whistle, blow-off, exhaust pops and bangs, gear clunks, countdown beeps
// and contact sounds, shaped by the fitted Garage parts (revComposeSound).
// Effects play through the voice input's own AudioContext when it exists: on iPhone a
// second context is interrupted once the microphone starts, which made the race silent.
// Effects also stay inside the windows where the voice detectors ignore new gestures (pops and
// blow-off only follow a shift; the whistle stops with the voice) in case echo cancel is off.
// The car's own engine (engine-sound.js) and the tyre/surface loops play only with echo
// cancellation on. Each car has its own bank of 100+ effect variations (revBuildSfxBank).
const REV_SFX_KEY = 'revline-sfx-v1';

class RevRaceSfx {
    constructor(storage, sharedContext = () => null) {
        this.storage = storage;
        this.sharedContext = sharedContext;
        this.context = null;
        this.enabled = true;
        this.volume = 0.7;
        this.engineEnabled = true;
        this.engineVolume = 0.6;
        this.engineAllowed = true;      // false while echo cancellation is off
        this.sound = null;
        this.carId = 'gt'; this.engineId = 'stock';
        this.bank = null; this.last = {};
        this.engine = new RevEngineSound();
        try {
            const saved = JSON.parse(storage.getItem(REV_SFX_KEY) || '{}');
            if (typeof saved.enabled === 'boolean') this.enabled = saved.enabled;
            if (Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
            if (typeof saved.engineEnabled === 'boolean') this.engineEnabled = saved.engineEnabled;
            if (Number.isFinite(saved.engineVolume)) this.engineVolume = Math.max(0, Math.min(1, saved.engineVolume));
        } catch {}
    }

    save() {
        try { this.storage.setItem(REV_SFX_KEY, JSON.stringify({ enabled: this.enabled, volume: this.volume, engineEnabled: this.engineEnabled, engineVolume: this.engineVolume })); } catch {}
    }

    // Must run inside a user gesture on iOS the first time.
    unlock() { this.ensure(); }

    // Use the running voice-input context when there is one; rebuild the output on a new context.
    ensure() {
        const context = this.sharedContext() || this.context || (this.ownContext ||= new (window.AudioContext || window.webkitAudioContext)());
        if (context !== this.context) this.build(context);
        if (context.state !== 'running') context.resume().catch(() => {});
        return context.state === 'running';
    }

    build(context) {
        this.silenceWhistle();   // its oscillators belonged to the previous context
        this.engine.stop();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = this.enabled ? this.volume : 0;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -10; limiter.ratio.value = 6;
        this.master.connect(limiter); limiter.connect(context.destination);
        this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        // Engine and loops share their own bus (on only with echo cancellation).
        this.engineBus = context.createGain(); this.engineBus.gain.value = 0;
        this.engineBus.connect(limiter);
        this.engine.attach(context, this.engineBus, this.noise);
        this.loops = ['squeal', 'surface'].reduce((loops, name) => {
            const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
            source.buffer = this.noise; source.loop = true; filter.type = name === 'squeal' ? 'bandpass' : 'lowpass'; gain.gain.value = 0;
            source.connect(filter); filter.connect(gain); gain.connect(this.engineBus); source.start();
            loops[name] = { filter, gain }; return loops;
        }, {});
        this.applyVolume();
    }

    // The selected car (backend ids). Its engine voice and effect bank follow the Garage build.
    setCar(carId, engineId) {
        if (carId === this.carId && engineId === this.engineId) return;
        this.carId = carId; this.engineId = engineId;
        if (this.sound) this.setBuild(this.sound);
    }

    // A different variant each time, never the same one twice in a row.
    pick(kind) {
        const list = this.bank?.[kind];
        if (!list?.length) return null;
        let index = Math.floor(Math.random() * list.length);
        if (index === this.last[kind] && list.length > 1) index = (index + 1) % list.length;
        this.last[kind] = index;
        return list[index];
    }

    setEnabled(enabled) { this.enabled = enabled; this.applyVolume(); this.save(); if (!enabled) this.silenceWhistle(); }
    setVolume(volume) { this.volume = volume; this.applyVolume(); this.save(); }
    setEngineEnabled(enabled) { this.engineEnabled = enabled; this.applyVolume(); this.save(); }
    setEngineVolume(volume) { this.engineVolume = volume; this.applyVolume(); this.save(); }
    setEngineAllowed(allowed) { this.engineAllowed = allowed; this.applyVolume(); }
    get engineOn() { return this.enabled && this.engineEnabled && this.engineAllowed; }
    applyVolume() {
        if (!this.master) return;
        const now = this.context.currentTime;
        this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, now, 0.05);
        this.engineBus.gain.setTargetAtTime(this.engineOn ? this.engineVolume : 0, now, 0.08);
    }
    get ready() { return this.enabled && this.ensure(); }
    setBuild(sound) {
        this.sound = sound; if (!sound.whistle) this.silenceWhistle();
        this.bank = revBuildSfxBank(this.carId, sound);
        this.engine.setVoice(revEngineVoice(this.carId, this.engineId, sound));
    }

    // Every frame: the engine follows RPM and your voice; tyres squeal in drifts; loose
    // surfaces rumble with speed.
    drive({ rpm, press, gear, running, limiting, speed = 0, drifting = false, surface = 'tarmac', offRoad = false }) {
        if (!this.engineOn || !this.ensure()) return;
        this.engine.update({ rpm, press, gear, running, volume: 1, limiting });
        const now = this.context.currentTime, { squeal: tyres, surface: ground } = this.loops;
        const sliding = running && drifting && speed > 25;
        if (sliding && !this.squeal) this.squeal = this.pick('squeal');   // one variant per drift
        if (!sliding) this.squeal = null;
        const squeal = this.squeal;
        if (sliding && squeal) { tyres.filter.frequency.setTargetAtTime(squeal.pitch + Math.sin(now * squeal.wobble) * 120, now, .05); tyres.filter.Q.value = squeal.q; }
        tyres.gain.gain.setTargetAtTime(sliding ? Math.min(.5, speed / 200) : 0, now, sliding ? .08 : .15);
        const loose = surface !== 'tarmac' || offRoad, kind = offRoad && surface === 'tarmac' ? 'dirt' : surface;
        const grain = this.bank.surface.find(s => s.kind === kind) || this.bank.surface[0];
        ground.filter.frequency.setTargetAtTime(grain.cutoff * (kind === 'snow' ? .6 : 1), now, .2);
        ground.gain.gain.setTargetAtTime(running && loose ? Math.min(.45, speed / 220) * grain.grain : 0, now, .15);
    }
    quietEngine() {
        if (!this.loops) return;
        this.engine.fade();
        for (const loop of Object.values(this.loops)) loop.gain.gain.setTargetAtTime(0, this.context.currentTime, .1);
    }

    tone(frequency, start, duration, level, type = 'sine') {
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = type; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain); gain.connect(this.master);
        oscillator.start(start); oscillator.stop(start + duration + 0.02);
        return oscillator;
    }

    burst(start, duration, level, { type = 'lowpass', frequency = 1500, q = 0.8, sweepTo = null } = {}) {
        const source = this.context.createBufferSource(), shape = this.context.createBiquadFilter(), gain = this.context.createGain();
        source.buffer = this.noise; source.loop = true;
        shape.type = type; shape.frequency.setValueAtTime(frequency, start); shape.Q.value = q;
        if (sweepTo) shape.frequency.exponentialRampToValueAtTime(sweepTo, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        source.connect(shape); shape.connect(gain); gain.connect(this.master);
        source.start(start, Math.random() * 0.9); source.stop(start + duration + 0.02);
        return gain;
    }

    beep(go = false) {
        if (!this.ready) return;
        const now = this.context.currentTime;
        const beep = this.bank?.beep[0] || { pitch: 660, go: 988, wave: 'square' };
        this.tone(go ? beep.go : beep.pitch, now, go ? 0.45 : 0.18, 0.35, beep.wave);
    }

    clunk() {
        if (!this.ready) return;
        const now = this.context.currentTime, v = this.pick('clunk') || { thump: 95, click: 2400, length: .09 };
        this.tone(v.thump, now, v.length, 0.4);
        this.burst(now, 0.04, 0.18, { frequency: v.click });
        if (this.engineOn) this.engine.shiftCut();
    }

    // Exhaust pops after a downshift; straight pipes crackle most (Garage exhaust part).
    pops(strength = 1) {
        if (!this.ready || !this.sound) return;
        const v = this.pick('pops'), count = Math.round((0.25 + this.sound.pops) * v.count * strength);
        let at = this.context.currentTime + 0.05;
        for (let i = 0; i < count && at < this.context.currentTime + 0.6; i++) {
            const level = (0.35 + Math.random() * 0.5) * (0.4 + this.sound.pops * 0.6);
            this.burst(at, v.length, level, { frequency: v.pitch * (0.8 + Math.random() * 0.4) });
            this.tone(v.thump * (0.85 + Math.random() * 0.3), at, v.length + 0.02, level * 0.7);
            at += v.gap * (0.7 + Math.random() * 0.6);
        }
        // Straight pipes and race cans sometimes finish with one big backfire.
        if (this.sound.pops > 0.5 && Math.random() < this.sound.pops * 0.5) {
            const b = this.pick('backfire');
            this.burst(at + 0.04, b.tail, 0.75, { frequency: b.pitch, sweepTo: 300 });
            this.tone(b.thump, at + 0.04, 0.16, 0.6, 'triangle');
        }
    }

    // Blow-off valve on an upshift, when a turbo and a valve are fitted.
    blowOff() {
        if (!this.ready || !this.sound || this.sound.bov === 'none') return;
        const now = this.context.currentTime, level = this.sound.bovLevel * 0.9, v = this.pick('blowOff');
        if (this.sound.bov === 'atmos') this.burst(now, v.length, level, { type: 'bandpass', frequency: v.from, sweepTo: v.to, q: 0.9 });
        else if (this.sound.bov === 'recirc') this.burst(now, v.length * 0.65, level * 0.5, { frequency: v.to });
        else for (let i = 0; i < v.pulses; i++) this.burst(now + i * v.gap, 0.04, level * (1 - i / (v.pulses + 2)), { type: 'bandpass', frequency: v.flutter, q: 1.3 });
    }

    // Turbo whistle follows RPM and throttle, and stops the moment the voice does.
    whistle({ active, rpm, press }) {
        if (!this.ready || !this.sound || !this.sound.whistle) return;
        if (!this.spool) {
            this.spool = (this.sound.twin ? [1, 1.13] : [1]).map(ratio => {
                const oscillator = this.context.createOscillator(), gain = this.context.createGain();
                oscillator.type = 'sine'; oscillator.frequency.value = this.sound.whistleFreq * 0.5; gain.gain.value = 0;
                oscillator.connect(gain); gain.connect(this.master); oscillator.start();
                return { oscillator, gain, ratio };
            });
        }
        const now = this.context.currentTime;
        const boost = active ? Math.max(0, Math.min(1, (press - 0.25) / 0.6)) * Math.max(0, Math.min(1, rpm / 10)) : 0;
        for (const part of this.spool) {
            part.oscillator.frequency.setTargetAtTime(this.sound.whistleFreq * part.ratio * (0.45 + 0.55 * rpm / 10), now, 0.08);
            part.gain.gain.setTargetAtTime(boost * this.sound.whistle * 0.6 / this.spool.length, now, active && press > 0.1 ? 0.12 : 0.02);
        }
    }

    silenceWhistle() {
        if (!this.spool) return;
        for (const part of this.spool) { try { part.oscillator.stop(); } catch {} }
        this.spool = null;
    }

    // Side contact or a car running into us.
    bang() {
        if (!this.ready) return;
        const now = this.context.currentTime, v = this.pick('impact') || { from: 1800, to: 400, thump: 140, metal: 1 };
        this.burst(now, 0.18, 0.55, { frequency: v.from, sweepTo: v.to });
        this.tone(v.thump, now, 0.15, 0.4, 'triangle');
        for (let i = 0; i < v.metal; i++) this.tone(1800 + Math.random() * 1600, now + 0.02 + i * 0.03, 0.12, 0.07, 'square');
    }

    // The run ends: a crash, or a blown engine.
    ending(kind) {
        if (!this.ready) return;
        this.silenceWhistle();
        this.quietEngine();
        const now = this.context.currentTime;
        if (kind === 'engine') {
            const v = this.pick('blown') || { thump: 55, hiss: 1200, length: 1.4 };
            this.burst(now, 0.12, 0.8, { frequency: 2600 });
            this.tone(v.thump, now, 0.6, 0.6, 'sawtooth');
            this.burst(now + 0.1, v.length, 0.35, { type: 'bandpass', frequency: v.hiss, sweepTo: 300 });
        } else {
            const v = this.pick('crash') || { from: 3000, glass: 6, thump: 80 };
            this.burst(now, 0.5, 0.9, { frequency: v.from, sweepTo: 300 });
            this.tone(v.thump, now, 0.35, 0.7, 'triangle');
            for (let i = 0; i < v.glass; i++) this.tone(1800 + Math.random() * 2400, now + 0.05 + i * 0.05, 0.12, 0.06, 'square');
        }
    }
}
