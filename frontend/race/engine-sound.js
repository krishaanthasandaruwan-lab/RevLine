// The selected car's engine, synthesised live: firing pulses from its real layout (cylinders
// or rotors), shaped by the Garage parts, following RPM, throttle (your voice), gear changes
// and the limiter. Plus a per-car bank of effect variations so pops, blow-offs, squeals and
// impacts never repeat exactly. Plays only with echo cancellation on, so the microphone keeps
// hearing just your voice (race Settings → Engine sound).

// Layout character. fires = firing pulses per crank (or e-shaft) revolution.
//   lope: low-rpm irregular burble · half: sub-harmonic weight · scream: high harmonics at the top
//   rasp: noisy exhaust edge · body: lowpass base (Hz) · rpmScale: game RPM → real RPM · clatter: diesel knock
const REV_ENGINE_LAYOUTS = {
    inline4: { label: 'Inline-4', fires: 2, lope: .05, half: .08, scream: .45, rasp: .35, body: 900, rpmScale: 1, clatter: 0 },
    inline4turbo: { label: 'Turbo inline-4', fires: 2, lope: .04, half: .1, scream: .3, rasp: .4, body: 800, rpmScale: .85, clatter: 0 },
    vtec: { label: 'VTEC inline-4', fires: 2, lope: .03, half: .05, scream: .75, rasp: .3, body: 1100, rpmScale: 1.05, clatter: 0 },
    boxer4: { label: 'Flat-4 boxer', fires: 2, lope: .35, half: .45, scream: .25, rasp: .35, body: 750, rpmScale: .85, clatter: 0 },
    inline6: { label: 'Straight-6', fires: 3, lope: 0, half: .04, scream: .55, rasp: .2, body: 1000, rpmScale: .9, clatter: 0 },
    v6turbo: { label: 'Twin-turbo V6', fires: 3, lope: .1, half: .15, scream: .35, rasp: .3, body: 850, rpmScale: .85, clatter: 0 },
    flat6: { label: 'Flat-6', fires: 3, lope: .08, half: .12, scream: .6, rasp: .35, body: 1000, rpmScale: .9, clatter: 0 },
    v8cross: { label: 'Crossplane V8', fires: 4, lope: .55, half: .6, scream: .2, rasp: .3, body: 650, rpmScale: .75, clatter: 0 },
    v8flat: { label: 'Flat-plane V8', fires: 4, lope: .08, half: .12, scream: .6, rasp: .45, body: 1000, rpmScale: .9, clatter: 0 },
    v10: { label: 'V10', fires: 5, lope: .05, half: .08, scream: .85, rasp: .3, body: 1300, rpmScale: .9, clatter: 0 },
    v12: { label: 'V12', fires: 6, lope: 0, half: .04, scream: .9, rasp: .2, body: 1500, rpmScale: .85, clatter: 0 },
    rotary2: { label: '2-rotor', fires: 2, lope: .7, half: .5, scream: .5, rasp: .65, body: 1100, rpmScale: .9, clatter: 0 },
    rotary3: { label: '3-rotor', fires: 3, lope: .5, half: .35, scream: .65, rasp: .6, body: 1200, rpmScale: .9, clatter: 0 },
    rotary4: { label: '4-rotor', fires: 4, lope: .35, half: .25, scream: .9, rasp: .55, body: 1500, rpmScale: .95, clatter: 0 },
    diesel4: { label: 'Turbo-diesel', fires: 2, lope: .25, half: .4, scream: 0, rasp: .2, body: 450, rpmScale: .45, clatter: .55 },
    f1v6: { label: 'F1 V6 hybrid', fires: 3, lope: 0, half: .05, scream: 1, rasp: .25, body: 1800, rpmScale: 1.3, clatter: 0 }
};
// Backend engine ids (garage.js REV_SHOP.engine) → layout.
const REV_ENGINE_FOR = {
    stock: 'v10', sport: 'v10', v10: 'v10', huracan: 'v10', dodge37: 'v10',
    rotary: 'rotary2', veilside: 'rotary2', rx7gpu: 'rotary2', p1: 'rotary3', mazda787b: 'rotary4',
    twojz: 'inline6', rb26: 'inline6', s180sx: 'inline6', a90: 'inline6', e92jz: 'inline6', m4gts: 'inline6', supra30: 'inline6', brz: 'inline6',
    v8: 'v8cross', challenger: 'v8cross', silverado: 'v8cross', cls63: 'v8cross', camaro: 'v8cross', c8: 'v8flat', e92m3: 'v8flat',
    f22c: 'vtec', civicek: 'vtec', ae86: 'inline4', k20: 'inline4turbo', fl5: 'inline4turbo', s240sx: 'inline4turbo', evox: 'inline4turbo',
    evo9: 'inline4turbo', satria: 'inline4turbo', wira: 'inline4turbo', wrx: 'boxer4', g35: 'v6turbo', r35: 'v6turbo',
    rwb993: 'flat6', r34v12: 'v12', suprav12: 'v12', hilux: 'diesel4', apx: 'f1v6'
};

// Small seeded random source, so a car always sounds like itself.
function revSoundSeed(text) {
    let state = 2166136261;
    for (const char of String(text)) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
    return () => { state = Math.imul(state ^ (state >>> 15), 2246822519) + 0x9e3779b9 >>> 0; return state / 4294967296; };
}

// Everything that makes this car + engine + parts sound like itself.
function revEngineVoice(carId, engineId, sound) {
    const layoutId = REV_ENGINE_FOR[engineId] || REV_ENGINE_FOR[carId] || 'inline4', layout = REV_ENGINE_LAYOUTS[layoutId];
    const rand = revSoundSeed(`${carId}:${engineId}`);
    const vary = (value, spread) => value * (1 - spread + rand() * spread * 2);
    return {
        layoutId, label: layout.label, fires: layout.fires,
        lope: Math.min(1, vary(layout.lope, .25) + sound.pops * .15), half: vary(layout.half, .2),
        scream: Math.min(1, vary(layout.scream, .2) + Math.max(0, sound.high) * .03),
        rasp: Math.min(1, vary(layout.rasp, .2) + sound.rasp * .6), body: vary(layout.body, .15) * (sound.lowpass / 7000) ** .35,
        rpmScale: layout.rpmScale, clatter: layout.clatter, detune: (rand() - .5) * 14,
        gain: sound.gain, low: sound.low, high: sound.high, pitch: sound.pitch,
        intakeGain: sound.intakeGain, intakeFreq: sound.intakeFreq, intakeQ: sound.intakeQ,
        lopeRate: 2.5 + rand() * 3, drive: 1.5 + layout.rasp * 3 + sound.rasp * 4
    };
}

// Per-car effect bank: every list holds distinct variants; together more than 100 per car.
const REV_SFX_BANK_SIZES = { pops: 16, backfire: 10, blowOff: 10, clunk: 8, squeal: 10, impact: 10, limiter: 6, crash: 6, blown: 6, surface: 12, beep: 4, flutter: 6 };
function revBuildSfxBank(carId, sound) {
    const rand = revSoundSeed(`bank:${carId}:${sound.bov}:${sound.pops}:${sound.rasp}`);
    const range = (a, b) => a + rand() * (b - a);
    const list = (key, make) => Array.from({ length: REV_SFX_BANK_SIZES[key] }, (_, i) => make(i));
    const bank = {
        pops: list('pops', () => ({ count: Math.round(range(2, 7)), gap: range(.04, .12), pitch: range(600, 2600), thump: range(55, 120), length: range(.05, .1) })),
        backfire: list('backfire', () => ({ pitch: range(900, 2200), thump: range(45, 90), tail: range(.15, .4) })),
        blowOff: list('blowOff', () => ({ length: range(.3, .6), from: range(2200, 3400), to: range(650, 1200), pulses: Math.round(range(5, 9)), gap: range(.045, .07), flutter: range(500, 800) })),
        clunk: list('clunk', () => ({ thump: range(70, 130), click: range(1800, 3200), length: range(.06, .12) })),
        squeal: list('squeal', () => ({ pitch: range(900, 1800), wobble: range(4, 11), q: range(4, 10) })),
        impact: list('impact', () => ({ from: range(1400, 2600), to: range(300, 600), thump: range(100, 180), metal: Math.round(range(1, 4)) })),
        limiter: list('limiter', () => ({ rate: range(12, 22), depth: range(.45, .8) })),
        crash: list('crash', () => ({ from: range(2400, 3600), glass: Math.round(range(4, 9)), thump: range(60, 100) })),
        blown: list('blown', () => ({ thump: range(40, 70), hiss: range(900, 1600), length: range(1, 1.8) })),
        surface: list('surface', i => ({ kind: ['gravel', 'dirt', 'sand', 'snow'][i % 4], cutoff: range(500, 2400), grain: range(.3, 1) })),
        beep: list('beep', () => ({ pitch: range(600, 720), go: range(940, 1040), wave: rand() < .5 ? 'square' : 'triangle' })),
        flutter: list('flutter', () => ({ rate: range(14, 22), pitch: range(450, 800) }))
    };
    bank.count = Object.values(REV_SFX_BANK_SIZES).reduce((a, b) => a + b, 0);
    return bank;
}

class RevEngineSound {
    constructor() { this.context = null; this.voice = null; this.level = 0; this.limiterPhase = 0; }

    // Builds the synth graph on `context`, feeding `destination`.
    attach(context, destination, noise) {
        this.stop();
        this.context = context;
        const c = context;
        this.out = c.createGain(); this.out.gain.value = 0;
        this.fire = c.createOscillator(); this.fire.type = 'sawtooth';
        this.sub = c.createOscillator(); this.sub.type = 'square';
        this.top = c.createOscillator(); this.top.type = 'sine';
        this.lfo = c.createOscillator(); this.lfo.type = 'sine';
        this.lfoDepth = c.createGain(); this.lfo.connect(this.lfoDepth); this.lfoDepth.connect(this.fire.detune); this.lfoDepth.connect(this.sub.detune);
        this.fireGain = c.createGain(); this.subGain = c.createGain(); this.topGain = c.createGain();
        this.fire.connect(this.fireGain); this.sub.connect(this.subGain); this.top.connect(this.topGain);
        // Combustion texture: noise pulsed at the firing rate.
        this.noise = c.createBufferSource(); this.noise.buffer = noise; this.noise.loop = true;
        this.raspFilter = c.createBiquadFilter(); this.raspFilter.type = 'bandpass'; this.raspFilter.Q.value = 1.2;
        this.pulse = c.createGain(); this.pulse.gain.value = .5;
        this.pulseDepth = c.createGain(); this.pulseDepth.gain.value = .5; this.fire.connect(this.pulseDepth); this.pulseDepth.connect(this.pulse.gain);
        this.raspGain = c.createGain();
        this.noise.connect(this.raspFilter); this.raspFilter.connect(this.pulse); this.pulse.connect(this.raspGain);
        // Intake roar.
        this.intake = c.createBiquadFilter(); this.intake.type = 'bandpass';
        this.intakeGain = c.createGain(); this.noise.connect(this.intake); this.intake.connect(this.intakeGain);
        // Mix → drive → tone → out.
        this.mix = c.createGain();
        for (const source of [this.fireGain, this.subGain, this.topGain, this.raspGain, this.intakeGain]) source.connect(this.mix);
        this.drive = c.createWaveShaper(); this.drive.oversample = '2x';
        this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.Q.value = .9;
        this.lowShelf = c.createBiquadFilter(); this.lowShelf.type = 'lowshelf'; this.lowShelf.frequency.value = 180;
        this.highShelf = c.createBiquadFilter(); this.highShelf.type = 'highshelf'; this.highShelf.frequency.value = 3000;
        this.mix.connect(this.drive); this.drive.connect(this.tone); this.tone.connect(this.lowShelf); this.lowShelf.connect(this.highShelf); this.highShelf.connect(this.out);
        this.out.connect(destination);
        for (const source of [this.fire, this.sub, this.top, this.lfo, this.noise]) source.start();
        if (this.voice) this.setVoice(this.voice);
    }

    setVoice(voice) {
        this.voice = voice;
        if (!this.context) return;
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * voice.drive) / Math.tanh(voice.drive); }
        this.drive.curve = curve;
        this.lowShelf.gain.value = voice.low; this.highShelf.gain.value = voice.high;
        this.intake.frequency.value = voice.intakeFreq; this.intake.Q.value = voice.intakeQ;
        this.lfo.frequency.value = voice.lopeRate;
    }

    // Called every frame. rpm 0–10 (thousands, as the gauge), press 0–1 (voice throttle).
    update({ rpm, press, gear, running, volume, limiting }) {
        if (!this.context || !this.voice) return;
        const v = this.voice, now = this.context.currentTime, t = .035;
        const shown = Math.max(.9, rpm || 0), real = shown * 1000 * v.rpmScale * v.pitch, n = Math.min(1, shown / 10);
        const f = real / 60 * v.fires;
        this.fire.frequency.setTargetAtTime(f, now, t);
        this.sub.frequency.setTargetAtTime(f / 2, now, t);
        this.top.frequency.setTargetAtTime(f * 2, now, t); this.top.detune.setTargetAtTime(v.detune, now, t);
        this.raspFilter.frequency.setTargetAtTime(Math.min(9000, f * 3 + 400), now, t);
        this.lfoDepth.gain.setTargetAtTime(v.lope * 60 * (1 - n) ** 2, now, .1);
        const load = Math.max(0, Math.min(1, press));
        this.fireGain.gain.setTargetAtTime(.55, now, t);
        this.subGain.gain.setTargetAtTime(v.half * (1 - n * .6) * .5, now, t);
        this.topGain.gain.setTargetAtTime(v.scream * n * n * .35, now, t);
        this.raspGain.gain.setTargetAtTime((v.rasp * .9 + v.clatter) * (.35 + load * .65), now, t);
        this.intakeGain.gain.setTargetAtTime(Math.pow(10, v.intakeGain / 20) * .05 * load * (.3 + n), now, t);
        this.tone.frequency.setTargetAtTime(Math.min(16000, v.body * (1 + n * 2.2) * (.6 + load * .6)), now, t);
        // Loudness: idle murmur, louder on throttle; the limiter bounces it.
        let level = running ? (.16 + load * .7) * (.55 + n * .45) : .1;
        if (limiting) { this.limiterPhase += 1; level *= this.limiterPhase % 4 < 2 ? 1 : .35; }
        this.level = level * volume * v.gain * .5;
        this.out.gain.setTargetAtTime(this.level, now, limiting ? .008 : .05);
    }

    // A gear change cuts the ignition for a moment.
    shiftCut() {
        if (!this.context) return;
        const g = this.out.gain, now = this.context.currentTime;
        g.cancelScheduledValues(now); g.setValueAtTime(this.level, now);
        g.linearRampToValueAtTime(this.level * .12, now + .04); g.linearRampToValueAtTime(this.level, now + .2);
    }

    fade(seconds = .4) { if (this.context) this.out.gain.setTargetAtTime(0, this.context.currentTime, seconds / 3); }

    stop() {
        if (!this.context) return;
        for (const source of [this.fire, this.sub, this.top, this.lfo, this.noise]) { try { source.stop(); } catch {} }
        try { this.out.disconnect(); } catch {}
        this.context = null;
    }
}

if (typeof module !== 'undefined') module.exports = { REV_ENGINE_LAYOUTS, REV_ENGINE_FOR, REV_SFX_BANK_SIZES, revEngineVoice, revBuildSfxBank, revSoundSeed, RevEngineSound };
