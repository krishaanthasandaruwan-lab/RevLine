// Sound-tuning parts for the Garage. Data and pure helpers only; no DOM.
// `backend` maps a part to an existing RevGarage id (garage.js). Parts without it are
// frontend-only sound data until the backend gains these categories.
// Sound fields: gain ×, low/high shelf dB, lowpass Hz, rasp 0–1, pops 0–1, pitch ×,
// intake peak (dB, Hz, Q), turbo whistle (level, Hz, spool lag s, twin) and blow-off type.
const REV_PART_CATEGORIES = [
    { id: 'exhaust', name: 'Exhaust', detail: 'Silencer & pipes' },
    { id: 'turbo', name: 'Turbo', detail: 'Spool & whistle' },
    { id: 'bov', name: 'Blow-off', detail: 'Lift-off valve sound', needsTurbo: true },
    { id: 'intake', name: 'Intake', detail: 'Induction roar' }
];

const REV_PARTS = {
    exhaust: [
        { id: 'stock', name: 'Stock silencer', blurb: 'Factory muffler. Smooth, quiet and polite.', tags: ['Quiet', 'Smooth'],
            sound: { gain: .8, low: 1, high: -6, lowpass: 4200, rasp: 0, pops: 0, pitch: 1 }, visual: { tips: 'twin', flame: 'orange' } },
        { id: 'sport', name: 'Sport silencer', blurb: 'Freer-flowing back box with a deeper burble.', tags: ['Deep', 'Burble'],
            sound: { gain: 1, low: 5, high: -2, lowpass: 7000, rasp: .12, pops: .15, pitch: .98 }, visual: { tips: 'twin', flame: 'orange' } },
        { id: 'resonator', name: 'Resonator delete', blurb: 'Middle box removed. Raspy mid-range and a little drone.', tags: ['Rasp', 'Loud'],
            sound: { gain: 1.15, low: 3, high: 2, lowpass: 10000, rasp: .35, pops: .3, pitch: 1 }, visual: { tips: 'quad', flame: 'orange' } },
        { id: 'straight', name: 'Straight pipe', blurb: 'No silencer at all. Loudest and angriest, crackles on lift-off.', tags: ['Loudest', 'Crackle'],
            sound: { gain: 1.35, low: 6, high: 4, lowpass: 14000, rasp: .6, pops: .85, pitch: 1.01 }, visual: { tips: 'center', flame: 'orange' } },
        { id: 'titanium', name: 'Titanium race can', blurb: 'Thin-wall titanium. High-pitched scream and blue flames.', tags: ['Scream', 'High'],
            sound: { gain: 1.2, low: -2, high: 7, lowpass: 16000, rasp: .4, pops: .55, pitch: 1.06 }, visual: { tips: 'burnt', flame: 'blue' } }
    ],
    turbo: [
        { id: 'none', backend: 'off', name: 'Naturally aspirated', blurb: 'No turbo. Pure engine sound.', tags: ['NA'],
            sound: { whistle: 0, whistleFreq: 0, lag: 0, twin: false, low: 0 } },
        { id: 'street', backend: 'street', name: 'Street turbo', blurb: 'Small, quick-spooling turbo with a light whistle.', tags: ['Whistle', '+12% accel'],
            sound: { whistle: .05, whistleFreq: 3400, lag: .5, twin: false, low: -1 } },
        { id: 'bigsingle', backend: 'street', name: 'Big single', blurb: 'Large turbo. Slow to spool, then a loud siren whistle.', tags: ['Siren', '+12% accel'],
            sound: { whistle: .09, whistleFreq: 2500, lag: 1.2, twin: false, low: -2 } },
        { id: 'twin', backend: 'street', name: 'Twin turbo', blurb: 'Two small turbos. Smooth double whistle across the revs.', tags: ['Twin whistle', '+12% accel'],
            sound: { whistle: .065, whistleFreq: 3900, lag: .35, twin: true, low: -1 } }
    ],
    bov: [
        { id: 'none', name: 'No valve', blurb: 'Pressure bleeds off quietly.', tags: ['Silent'], sound: { bov: 'none', bovLevel: 0 } },
        { id: 'recirc', name: 'Recirculating', blurb: 'Factory valve. A soft, quiet sigh.', tags: ['Soft'], sound: { bov: 'recirc', bovLevel: .3 } },
        { id: 'atmos', name: 'Atmospheric BOV', blurb: 'Vents to the air. Big PSSHH when you lift off.', tags: ['PSSHH', 'Loud'], sound: { bov: 'atmos', bovLevel: .75 } },
        { id: 'flutter', name: 'Flutter / surge', blurb: 'Compressor flutter. Stu-tu-tu-tu on lift-off.', tags: ['Stututu'], sound: { bov: 'flutter', bovLevel: .65 } }
    ],
    intake: [
        { id: 'airbox', name: 'Stock airbox', blurb: 'Quiet factory intake.', tags: ['Quiet'], sound: { intakeGain: 0, intakeFreq: 900, intakeQ: 1, gain: 1 } },
        { id: 'cai', name: 'Cold-air intake', blurb: 'Open cone filter. Deeper induction growl.', tags: ['Growl'], sound: { intakeGain: 5, intakeFreq: 650, intakeQ: 1.2, gain: 1.05 } },
        { id: 'itb', name: 'Velocity stacks', blurb: 'Individual throttle bodies. Sharp, hollow intake honk.', tags: ['Honk', 'Sharp'], sound: { intakeGain: 8, intakeFreq: 1500, intakeQ: 2.2, gain: 1.1 } }
    ]
};

const REV_STOCK_BUILD = Object.freeze({ exhaust: 'stock', turbo: 'none', bov: 'none', intake: 'airbox' });

function revPart(category, id) {
    const parts = REV_PARTS[category] || [];
    return parts.find(part => part.id === id) || parts[0];
}

function revComposeSound(build) {
    const exhaust = revPart('exhaust', build.exhaust).sound, turbo = revPart('turbo', build.turbo).sound;
    const bov = revPart('bov', build.bov).sound, intake = revPart('intake', build.intake).sound;
    const turbocharged = build.turbo !== 'none';
    return {
        pitch: exhaust.pitch, gain: exhaust.gain * intake.gain, low: exhaust.low + turbo.low, high: exhaust.high,
        lowpass: exhaust.lowpass, rasp: exhaust.rasp, pops: exhaust.pops,
        intakeGain: intake.intakeGain, intakeFreq: intake.intakeFreq, intakeQ: intake.intakeQ,
        whistle: turbo.whistle, whistleFreq: turbo.whistleFreq, lag: turbo.lag, twin: turbo.twin,
        bov: turbocharged ? bov.bov : 'none', bovLevel: turbocharged ? bov.bovLevel : 0
    };
}

// 0–1 values for the Garage sound sheet.
function revSoundStats(sound) {
    const unit = value => Math.max(0, Math.min(1, value));
    return {
        loudness: unit((sound.gain - .7) / .8),
        tone: unit((sound.high - sound.low + 12) / 22),
        rasp: unit(sound.rasp),
        whistle: unit(sound.whistle / .09),
        crackle: unit(sound.pops),
        induction: unit(sound.intakeGain / 8)
    };
}

function revBuildVisual(build) { return revPart('exhaust', build.exhaust).visual; }
