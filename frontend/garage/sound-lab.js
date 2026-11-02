// Garage sound preview: an engine reference excerpt played through a Web Audio chain
// built from the fitted parts. Preview only; it never touches race input (voice-input.js).
//   source → intake peak → low shelf → high shelf → lowpass ─┬─ dry ──┐
//                                                             └─ rasp ─┴→ master → compressor → analyser
//   + turbo whistle/hiss while on throttle, blow-off and exhaust pops at lift-off.
class RevSoundLab {
    constructor() {
        this.context = null;
        this.buffers = new Map();
        this.sources = [];
        this.timers = [];
        this.token = 0;
        this.onEvent = () => {};
        this.samples = null;
    }

    ensureContext() {
        if (!this.context) {
            const context = this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = context.createAnalyser();
            this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = .72;
            this.output = context.createDynamicsCompressor();
            this.output.threshold.value = -14; this.output.ratio.value = 4;
            this.output.connect(this.analyser); this.analyser.connect(context.destination);
            this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
            const data = this.noise.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            this.samples = new Uint8Array(this.analyser.fftSize);
        }
        if (this.context.state === 'suspended') this.context.resume();
        return this.context;
    }

    async load(soundId) {
        if (!this.buffers.has(soundId)) {
            const request = fetch(`assets/engines/${soundId}.m4a`)
                .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.arrayBuffer(); })
                .then(data => this.context.decodeAudioData(data));
            this.buffers.set(soundId, request);
            request.catch(() => this.buffers.delete(soundId));
        }
        return this.buffers.get(soundId);
    }

    get playing() { return this.sources.length > 0; }

    stop() {
        this.token++;
        for (const source of this.sources) { try { source.stop(); } catch {} }
        for (const timer of this.timers) clearTimeout(timer);
        this.sources = []; this.timers = [];
    }

    // Resolves true when playback finished, false when stopped or replaced.
    async play(soundId, sound) {
        this.stop();
        const context = this.ensureContext(), token = this.token;
        const buffer = await this.load(soundId);
        if (token !== this.token) return false;
        const t0 = context.currentTime + .03;
        const duration = Math.min(3.6, buffer.duration / sound.pitch);
        const lift = t0 + duration - .35;
        const filter = (type, frequency, q = .7, gain = 0) => {
            const node = context.createBiquadFilter();
            node.type = type; node.frequency.value = frequency; node.Q.value = q; node.gain.value = gain;
            return node;
        };
        const gainNode = value => { const node = context.createGain(); node.gain.value = value; return node; };

        const source = context.createBufferSource();
        source.buffer = buffer; source.playbackRate.value = sound.pitch;
        const tone = [filter('peaking', sound.intakeFreq, sound.intakeQ, sound.intakeGain), filter('lowshelf', 160, .7, sound.low),
            filter('highshelf', 2800, .7, sound.high), filter('lowpass', sound.lowpass, .7)];
        const master = gainNode(0);
        master.gain.setValueAtTime(0, t0);
        master.gain.linearRampToValueAtTime(sound.gain * .9, t0 + .05);
        master.gain.setValueAtTime(sound.gain * .9, t0 + duration - .25);
        master.gain.linearRampToValueAtTime(0, t0 + duration);
        source.connect(tone[0]); tone.reduce((from, to) => { from.connect(to); return to; });
        const dry = gainNode(1 - sound.rasp * .45);
        tone[3].connect(dry); dry.connect(master);
        if (sound.rasp > 0) {
            const shaper = context.createWaveShaper(), k = sound.rasp * 80, curve = new Float32Array(1024);
            for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = (3 + k) * x * 20 * Math.PI / 180 / (Math.PI + k * Math.abs(x)); }
            shaper.curve = curve; shaper.oversample = '4x';
            const wet = gainNode(sound.rasp * .9), band = filter('bandpass', 1700, .9);
            tone[3].connect(shaper); shaper.connect(band); band.connect(wet); wet.connect(master);
        }
        master.connect(this.output);
        source.start(t0); source.stop(t0 + duration + .05);
        this.sources.push(source);

        if (sound.whistle > 0) this.whistle(context, sound, t0, lift);
        if (sound.bov !== 'none') this.blowOff(context, sound, lift);
        if (sound.pops > 0) this.pops(context, sound, lift);

        return new Promise(resolve => {
            this.timers.push(setTimeout(() => { if (token === this.token) { this.sources = []; resolve(true); } else resolve(false); }, (duration + .7) * 1000));
        });
    }

    noiseSource(context, start, stop) {
        const noise = context.createBufferSource();
        noise.buffer = this.noise; noise.loop = true;
        noise.start(start, Math.random() * .9); noise.stop(stop);
        this.sources.push(noise);
        return noise;
    }

    schedule(context, name, at) {
        const token = this.token;
        this.timers.push(setTimeout(() => { if (token === this.token) this.onEvent(name); }, Math.max(0, at - context.currentTime) * 1000));
    }

    whistle(context, sound, t0, lift) {
        const spooled = t0 + sound.lag + .35;
        for (const ratio of sound.twin ? [1, 1.13] : [1]) {
            const oscillator = context.createOscillator(), level = context.createGain();
            const target = sound.whistleFreq * ratio;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(target * .35, t0);
            oscillator.frequency.exponentialRampToValueAtTime(target, Math.min(lift, spooled));
            oscillator.frequency.exponentialRampToValueAtTime(target * .6, lift + .2);
            const vibrato = context.createOscillator(), depth = context.createGain();
            vibrato.frequency.value = 7; depth.gain.value = target * .012;
            vibrato.connect(depth); depth.connect(oscillator.frequency);
            level.gain.setValueAtTime(0, t0);
            level.gain.linearRampToValueAtTime(sound.whistle / (sound.twin ? 1.5 : 1), Math.min(lift - .01, spooled));
            level.gain.setValueAtTime(sound.whistle / (sound.twin ? 1.5 : 1), lift);
            level.gain.linearRampToValueAtTime(0, lift + .12);
            oscillator.connect(level); level.connect(this.output);
            for (const node of [oscillator, vibrato]) { node.start(t0); node.stop(lift + .3); this.sources.push(node); }
        }
        const hiss = this.noiseSource(context, t0, lift + .2), band = context.createBiquadFilter(), level = context.createGain();
        band.type = 'bandpass'; band.frequency.value = sound.whistleFreq * 1.7; band.Q.value = 2.5;
        level.gain.setValueAtTime(0, t0);
        level.gain.linearRampToValueAtTime(sound.whistle * .5, Math.min(lift - .01, spooled));
        level.gain.linearRampToValueAtTime(0, lift + .1);
        hiss.connect(band); band.connect(level); level.connect(this.output);
    }

    blowOff(context, sound, lift) {
        const end = lift + .7, noise = this.noiseSource(context, lift, end);
        const shape = context.createBiquadFilter(), envelope = context.createGain();
        envelope.gain.setValueAtTime(0, lift);
        if (sound.bov === 'atmos') {
            shape.type = 'bandpass'; shape.Q.value = .9;
            shape.frequency.setValueAtTime(2800, lift); shape.frequency.exponentialRampToValueAtTime(1000, lift + .45);
            envelope.gain.linearRampToValueAtTime(sound.bovLevel, lift + .012);
            envelope.gain.exponentialRampToValueAtTime(.001, lift + .55);
            noise.connect(shape); shape.connect(envelope);
        } else if (sound.bov === 'recirc') {
            shape.type = 'lowpass'; shape.frequency.value = 900;
            envelope.gain.linearRampToValueAtTime(sound.bovLevel * .6, lift + .05);
            envelope.gain.linearRampToValueAtTime(0, lift + .35);
            noise.connect(shape); shape.connect(envelope);
        } else {
            shape.type = 'bandpass'; shape.frequency.value = 650; shape.Q.value = 1.3;
            const flutter = context.createGain(), lfo = context.createOscillator(), depth = context.createGain();
            flutter.gain.value = .5; lfo.type = 'square'; lfo.frequency.value = 17; depth.gain.value = .5;
            lfo.connect(depth); depth.connect(flutter.gain); lfo.start(lift); lfo.stop(end); this.sources.push(lfo);
            envelope.gain.linearRampToValueAtTime(sound.bovLevel, lift + .015);
            envelope.gain.exponentialRampToValueAtTime(.001, lift + .6);
            noise.connect(shape); shape.connect(flutter); flutter.connect(envelope);
        }
        envelope.connect(this.output);
        this.schedule(context, `bov:${sound.bov}`, lift);
    }

    pops(context, sound, lift) {
        const count = Math.round(sound.pops * 7);
        let at = lift + .08;
        for (let i = 0; i < count; i++) {
            at += .06 + Math.random() * .1;
            const strength = (.5 + Math.random() * .5) * sound.pops;
            const crack = this.noiseSource(context, at, at + .1), tone = context.createBiquadFilter(), envelope = context.createGain();
            tone.type = 'lowpass'; tone.frequency.value = 900 + Math.random() * 1700;
            envelope.gain.setValueAtTime(0, at);
            envelope.gain.linearRampToValueAtTime(strength * .9, at + .004);
            envelope.gain.exponentialRampToValueAtTime(.001, at + .07);
            crack.connect(tone); tone.connect(envelope); envelope.connect(this.output);
            const thump = context.createOscillator(), body = context.createGain();
            thump.frequency.value = 70 + Math.random() * 40;
            body.gain.setValueAtTime(strength * .6, at); body.gain.exponentialRampToValueAtTime(.001, at + .09);
            thump.connect(body); body.connect(this.output); thump.start(at); thump.stop(at + .1); this.sources.push(thump);
            this.schedule(context, 'pop', at);
        }
    }

    // 0–1 loudness of what is playing now.
    level() {
        if (!this.samples) return 0;
        this.analyser.getByteTimeDomainData(this.samples);
        let sum = 0;
        for (const value of this.samples) sum += ((value - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / this.samples.length) * 3.2);
    }
}
