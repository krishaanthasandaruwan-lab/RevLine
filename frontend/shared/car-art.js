// Cartoon top-down car painter shared by Home, Garage and Race.
// Cars face up (-y). The body matches the backend collision box (46 × 86), so the
// drawing never disagrees with collisions. Optional bitmap overrides are listed in
// frontend/shared/art/manifest.json (see frontend/ART-PROMPTS.md).
const REV_CAR_W = 46, REV_CAR_H = 86, REV_CAR_PAD = 16;
const REV_INK = '#0f1724';

// cabin = windshield start (y from car centre), cabinLen = windshield to rear glass end.
const REV_CAR_STYLES = {
    gt: { nose: 15, tail: 11, waist: .9, cabin: -4, cabinLen: 26, wing: 'none', vents: true, stripes: 'twin' },
    rx7: { nose: 19, tail: 15, waist: .92, cabin: -10, cabinLen: 26, wing: 'low', vents: false, stripes: 'twin' },
    supra: { nose: 17, tail: 14, waist: .9, cabin: -10, cabinLen: 27, wing: 'tall', vents: false, stripes: 'twin' },
    r34: { nose: 8, tail: 8, waist: .96, cabin: -12, cabinLen: 28, wing: 'tall', vents: true, stripes: 'side' },
    mustang: { nose: 6, tail: 7, waist: .97, cabin: -6, cabinLen: 28, wing: 'none', vents: true, stripes: 'racing' },
    s2000: { nose: 17, tail: 12, waist: .9, cabin: -4, cabinLen: 20, wing: 'none', vents: false, stripes: 'side', open: true },
    civic: { nose: 12, tail: 6, waist: .95, cabin: -14, cabinLen: 36, wing: 'tall', vents: true, stripes: 'side' },
    lfa: { nose: 13, tail: 10, waist: .88, cabin: -8, cabinLen: 25, wing: 'low', vents: true, stripes: 'twin' },
    traffic: { nose: 11, tail: 10, waist: .97, cabin: -18, cabinLen: 40, wing: 'none', vents: false, stripes: 'none' },
    rival: { nose: 14, tail: 10, waist: .9, cabin: -8, cabinLen: 26, wing: 'low', vents: true, stripes: 'number' }
};
REV_CAR_STYLES.coupe = REV_CAR_STYLES.gt;

// Exhaust tip x positions. Twin matches the backend's exhaust particle origin (±8).
const REV_EXHAUST_TIPS = { twin: [-8, 8], quad: [-11, -6, 6, 11], center: [-3, 3], side: [-15, 15], burnt: [-8, 8] };

const revCarArt = { images: {}, props: {}, videos: {}, ready: Promise.resolve() };
const revCarSpriteCache = new Map();

function revShade(hex, amount) {
    const value = parseInt(hex.slice(1), 16);
    const target = amount < 0 ? 0 : 255, mix = Math.abs(amount);
    const channel = shift => Math.round(((value >> shift) & 255) + (target - ((value >> shift) & 255)) * mix);
    return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
function revLuma(hex) {
    const value = parseInt(hex.slice(1), 16);
    return (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
}

function revBodyPath(ctx, style) {
    const hw = REV_CAR_W / 2, hh = REV_CAR_H / 2, wa = hw * style.waist, n = style.nose, t = style.tail;
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.bezierCurveTo(hw * .6, -hh, hw, -hh + n * .3, hw, -hh + n);
    ctx.lineTo(hw, -hh + 30);
    ctx.quadraticCurveTo(wa, -hh + 36, wa, 0);
    ctx.quadraticCurveTo(wa, hh - 36, hw, hh - 30);
    ctx.lineTo(hw, hh - t);
    ctx.bezierCurveTo(hw, hh - t * .3, hw * .6, hh, 0, hh);
    ctx.bezierCurveTo(-hw * .6, hh, -hw, hh - t * .3, -hw, hh - t);
    ctx.lineTo(-hw, hh - 30);
    ctx.quadraticCurveTo(-wa, hh - 36, -wa, 0);
    ctx.quadraticCurveTo(-wa, -hh + 36, -hw, -hh + 30);
    ctx.lineTo(-hw, -hh + n);
    ctx.bezierCurveTo(-hw, -hh + n * .3, -hw * .6, -hh, 0, -hh);
    ctx.closePath();
}

function revPaintTips(ctx, exhaust) {
    const hh = REV_CAR_H / 2;
    for (const x of REV_EXHAUST_TIPS[exhaust] || REV_EXHAUST_TIPS.twin) {
        let fill = '#a7b0ba';
        if (exhaust === 'burnt') {
            fill = ctx.createLinearGradient(0, hh - 3, 0, hh + 4);
            fill.addColorStop(0, '#d9b56a'); fill.addColorStop(1, '#6d5bd8');
        }
        ctx.fillStyle = fill; ctx.strokeStyle = REV_INK; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(x - 2.7, hh - 3, 5.4, exhaust === 'center' ? 7.5 : 6.5, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0b0d10'; ctx.beginPath(); ctx.ellipse(x, hh + 2.6, 1.6, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    }
}

function revPaintStripes(ctx, kind, color, style) {
    const hh = REV_CAR_H / 2, wa = REV_CAR_W / 2 * style.waist;
    ctx.fillStyle = color;
    if (kind === 'twin') { ctx.fillRect(-7.5, -hh, 4.5, REV_CAR_H); ctx.fillRect(3, -hh, 4.5, REV_CAR_H); }
    if (kind === 'racing') {
        ctx.fillRect(-5.5, -hh, 11, REV_CAR_H);
        ctx.fillStyle = 'rgba(15,23,36,.55)'; ctx.fillRect(-7.5, -hh, 1.2, REV_CAR_H); ctx.fillRect(6.3, -hh, 1.2, REV_CAR_H);
    }
    if (kind === 'side') { ctx.fillRect(-wa + 3, -hh + 24, 3, REV_CAR_H - 44); ctx.fillRect(wa - 6, -hh + 24, 3, REV_CAR_H - 44); }
}

function revPaintCar(ctx, o) {
    const style = REV_CAR_STYLES[o.style] || REV_CAR_STYLES.gt;
    const hw = REV_CAR_W / 2, hh = REV_CAR_H / 2, wa = hw * style.waist;
    const stripeColor = revLuma(o.color) > .62 ? '#1d2636' : '#ffd23f';
    const stripes = style.stripes === 'number' ? 'none' : (o.player ? style.stripes : 'none');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    ctx.fillStyle = '#15181d'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 1.5;
    for (const y of [-hh + 13, hh - 31]) for (const x of [-hw - 2.5, hw - 4.5]) {
        ctx.beginPath(); ctx.roundRect(x, y, 7, 18, 2.5); ctx.fill(); ctx.stroke();
    }
    revPaintTips(ctx, o.exhaust || 'twin');

    revBodyPath(ctx, style); ctx.fillStyle = o.color; ctx.fill();
    ctx.save(); revBodyPath(ctx, style); ctx.clip();
    revPaintStripes(ctx, stripes, stripeColor, style);
    const side = ctx.createLinearGradient(-hw, 0, hw, 0);
    side.addColorStop(0, 'rgba(0,0,0,.32)'); side.addColorStop(.2, 'rgba(255,255,255,.08)');
    side.addColorStop(.4, 'rgba(255,255,255,.24)'); side.addColorStop(.62, 'rgba(255,255,255,0)'); side.addColorStop(1, 'rgba(0,0,0,.36)');
    ctx.fillStyle = side; ctx.fillRect(-hw, -hh, REV_CAR_W, REV_CAR_H);
    const length = ctx.createLinearGradient(0, -hh, 0, hh);
    length.addColorStop(0, 'rgba(255,255,255,.18)'); length.addColorStop(.3, 'rgba(255,255,255,0)'); length.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = length; ctx.fillRect(-hw, -hh, REV_CAR_W, REV_CAR_H);
    if (style.vents) {
        ctx.fillStyle = 'rgba(10,14,22,.55)';
        for (const x of [-7, 3]) { ctx.beginPath(); ctx.roundRect(x, style.cabin - 13, 4, 7, 1.5); ctx.fill(); }
    }
    if (stripes !== 'twin' && stripes !== 'racing') {
        ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -hh + 6); ctx.lineTo(0, style.cabin - 3); ctx.stroke();
    }
    if (style.stripes === 'number' && o.number) {
        ctx.fillStyle = '#f8f9fc'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, -hh + 19, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = REV_INK; ctx.font = 'bold 10px "Lilita One", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(o.number), 0, -hh + 19.5);
    }
    ctx.restore();
    revBodyPath(ctx, style); ctx.strokeStyle = REV_INK; ctx.lineWidth = 2.6; ctx.stroke();

    const c = style.cabin, len = style.cabinLen, gw = wa - 3;
    ctx.fillStyle = o.color; ctx.lineWidth = 1.3;
    for (const sideX of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sideX * (wa + 1.6), c + 4, 2.6, 1.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    const glass = ctx.createLinearGradient(0, c, 0, c + len);
    glass.addColorStop(0, '#46679f'); glass.addColorStop(1, '#13203d');
    ctx.strokeStyle = REV_INK; ctx.lineWidth = 1.6;
    if (style.open) {
        ctx.fillStyle = '#4f6a96';
        ctx.beginPath(); ctx.moveTo(-gw + 2, c - 3); ctx.lineTo(gw - 2, c - 3); ctx.lineTo(gw - 1, c + 1); ctx.lineTo(-gw + 1, c + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1a212d'; ctx.beginPath(); ctx.roundRect(-gw + 1, c + 2, (gw - 1) * 2, len - 2, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c0392b';
        for (const x of [-gw + 3, 1.2]) { ctx.beginPath(); ctx.roundRect(x, c + 7, gw - 4.2, 9, 3); ctx.fill(); ctx.stroke(); }
        ctx.strokeStyle = '#c7ced6'; ctx.lineWidth = 2;
        for (const x of [-gw / 2, gw / 2]) { ctx.beginPath(); ctx.arc(x, c + 18, 4, Math.PI, 0); ctx.stroke(); }
    } else {
        ctx.fillStyle = glass;
        ctx.beginPath(); ctx.moveTo(-gw + 2.5, c); ctx.lineTo(gw - 2.5, c); ctx.lineTo(gw, c + 10); ctx.lineTo(-gw, c + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-gw, c + len - 7); ctx.lineTo(gw, c + len - 7); ctx.lineTo(gw - 3, c + len); ctx.lineTo(-gw + 3, c + len); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.42)';
        ctx.beginPath(); ctx.moveTo(-gw + 5, c + 9); ctx.lineTo(-gw + 9, c + 1); ctx.lineTo(-gw + 12, c + 1); ctx.lineTo(-gw + 8, c + 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = revShade(o.color, .1);
        ctx.beginPath(); ctx.roundRect(-gw + 1, c + 10, (gw - 1) * 2, len - 17, 3); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.roundRect(-gw + 1, c + 10, (gw - 1) * 2, len - 17, 3); ctx.clip();
        revPaintStripes(ctx, stripes === 'side' ? 'none' : stripes, stripeColor, style);
        ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(-gw + 2, c + 11, gw * .7, len - 19);
        ctx.restore();
        ctx.beginPath(); ctx.roundRect(-gw + 1, c + 10, (gw - 1) * 2, len - 17, 3); ctx.stroke();
    }

    ctx.fillStyle = '#fff4b8'; ctx.lineWidth = 1.2;
    for (const sideX of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sideX * (hw - 6.5), -hh + 5.5, 4.4, 2.6, sideX * .35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#ff3344';
    for (const sideX of [-1, 1]) {
        ctx.beginPath(); ctx.roundRect(sideX > 0 ? hw - 14 : -hw + 4, hh - 5.2, 10, 3.4, 1.5); ctx.fill(); ctx.stroke();
    }
    const wingColor = revShade(o.color, -.32);
    if (style.wing === 'low') {
        ctx.fillStyle = wingColor; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.roundRect(-hw + 3.5, hh - 12, REV_CAR_W - 7, 4.6, 2); ctx.fill(); ctx.stroke();
    } else if (style.wing === 'tall') {
        ctx.fillStyle = '#20252e';
        for (const x of [-10, 8]) ctx.fillRect(x, hh - 13, 2, 7);
        ctx.fillStyle = wingColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(-hw - 1.5, hh - 17, REV_CAR_W + 3, 6.2, 2.5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = REV_INK;
        for (const x of [-hw - 2.5, hw]) ctx.fillRect(x, hh - 19, 2.5, 10);
    }
}

function revCarSprite(o, scale) {
    const key = [o.id || o.style, o.color, o.player ? 1 : 0, o.exhaust || 'twin', o.number || '', scale].join('|');
    const cached = revCarSpriteCache.get(key);
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((REV_CAR_W + REV_CAR_PAD * 2) * scale);
    canvas.height = Math.ceil((REV_CAR_H + REV_CAR_PAD * 2) * scale);
    const c = canvas.getContext('2d');
    c.scale(scale, scale);
    c.translate(REV_CAR_W / 2 + REV_CAR_PAD, REV_CAR_H / 2 + REV_CAR_PAD);
    // Generated art is keyed by car id: archive cars share a body style but not a look.
    const image = o.player ? revCarArt.images[o.id || o.style] : null;
    if (image) {
        const width = REV_CAR_W + 6, height = width * image.naturalHeight / image.naturalWidth;
        c.drawImage(image, -width / 2, -height / 2, width, height);
    } else revPaintCar(c, o);
    if (revCarSpriteCache.size > 160) revCarSpriteCache.clear();
    revCarSpriteCache.set(key, canvas);
    return canvas;
}

// Draws at the current origin (car centre), facing up.
function revDrawCar(ctx, o, scale = 2) {
    ctx.drawImage(revCarSprite(o, scale), -REV_CAR_W / 2 - REV_CAR_PAD, -REV_CAR_H / 2 - REV_CAR_PAD,
        REV_CAR_W + REV_CAR_PAD * 2, REV_CAR_H + REV_CAR_PAD * 2);
}

function revDrawCarShadow(ctx, alpha = .34) {
    ctx.fillStyle = `rgba(6,14,10,${alpha})`;
    ctx.beginPath(); ctx.roundRect(-REV_CAR_W / 2 + 4, -REV_CAR_H / 2 + 7, REV_CAR_W + 2, REV_CAR_H, 16); ctx.fill();
}

// Brake glow and cartoon backfire flames, drawn over the sprite in car space.
function revDrawCarFx(ctx, { braking = 0, flame = 0, flameColor = 'orange', exhaust = 'twin', time = 0 }) {
    const hw = REV_CAR_W / 2, hh = REV_CAR_H / 2;
    if (braking > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const x of [-hw + 9, hw - 9]) {
            const glow = ctx.createRadialGradient(x, hh - 3, 1, x, hh - 3, 14);
            glow.addColorStop(0, `rgba(255,70,80,${.85 * braking})`); glow.addColorStop(1, 'rgba(255,40,60,0)');
            ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, hh - 3, 14, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    if (flame > 0) {
        const outer = flameColor === 'blue' ? '#3d8bff' : '#ff6a1a', inner = flameColor === 'blue' ? '#b9e4ff' : '#ffd84a';
        for (const [i, x] of (REV_EXHAUST_TIPS[exhaust] || REV_EXHAUST_TIPS.twin).entries()) {
            const length = 8 + flame * 20 + Math.sin(time * 40 + i * 2) * 3;
            const wobble = Math.sin(time * 33 + i) * 2;
            ctx.strokeStyle = REV_INK; ctx.lineWidth = 1.4;
            ctx.fillStyle = outer;
            ctx.beginPath(); ctx.moveTo(x - 4, hh + 3);
            ctx.quadraticCurveTo(x - 6, hh + 3 + length * .55, x + wobble, hh + 3 + length);
            ctx.quadraticCurveTo(x + 6, hh + 3 + length * .55, x + 4, hh + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = inner;
            ctx.beginPath(); ctx.moveTo(x - 2.2, hh + 3);
            ctx.quadraticCurveTo(x - 3, hh + 3 + length * .4, x + wobble * .6, hh + 3 + length * .7);
            ctx.quadraticCurveTo(x + 3, hh + 3 + length * .4, x + 2.2, hh + 3); ctx.closePath(); ctx.fill();
        }
    }
}

// Generated art loads on demand: reading revCarArt.images[id] or revCarArt.props[name] starts
// that one file (if the manifest lists it) and returns undefined until it has loaded; then the
// sprite cache is cleared and a 'revline:art' event lets the page redraw. Pages never download
// the whole art set, and missing art never causes 404 noise.
const revArtPaths = { cars: {}, props: {} };
function revLazyArt(kind) {
    const loaded = {}, pending = new Set();
    return new Proxy(loaded, {
        get(target, name) {
            if (typeof name !== 'string' || name in target) return target[name];
            const path = revArtPaths[kind][name];
            if (path && !pending.has(name) && typeof Image !== 'undefined') {
                pending.add(name);
                const image = new Image();
                image.onload = () => { target[name] = image; revArtLoaded(); };
                image.src = path;
            }
            return undefined;
        }
    });
}
let revArtTimer = 0;
function revArtLoaded() {
    revCarSpriteCache.clear();
    clearTimeout(revArtTimer);
    revArtTimer = setTimeout(() => document.dispatchEvent(new CustomEvent('revline:art')), 60);
}
revCarArt.images = revLazyArt('cars');
revCarArt.props = revLazyArt('props');
revCarArt.ready = fetch('frontend/shared/art/manifest.json')
    .then(response => response.ok ? response.json() : {})
    .then(manifest => {
        revCarArt.videos = manifest.videos || {};
        Object.assign(revArtPaths.cars, manifest.cars || {});
        Object.assign(revArtPaths.props, manifest.props || {});
        revCarSpriteCache.clear(); revApplyIconArt();
    })
    .catch(() => {});

// Image slot helper: the generated file's URL (for <img> and CSS), or '' while the procedural
// look is used. It does not download anything itself.
const revArtSrc = name => revArtPaths.props[name] || '';
// Coin / gem / star icons are CSS shapes until icon art arrives (see theme.css .rl-art-*).
function revApplyIconArt() {
    if (typeof document === 'undefined') return;
    for (const name of ['coin', 'gem', 'star']) {
        const src = revArtSrc(`icon-${name}`);
        if (!src) continue;
        // Absolute, because a url() inside a custom property resolves against the stylesheet using it.
        document.documentElement.style.setProperty(`--rl-art-${name}`, `url("${new URL(src, document.baseURI).href}")`);
        document.documentElement.classList.add(`rl-art-${name}`);
    }
}
