// Cartoon circuit renderer. Draws the backend world (540 × 900, RevRoadScene geometry)
// through a following camera. It only reads state: physics, steering, rivals and
// collisions stay in game.js / driving-scene.js. Cosmetic particles advance with the
// simulation clock, so they freeze whenever the race is paused.
const REV_WORLD = { width: 540, height: 900, roadLeft: 95, roadWidth: 350, laneWidth: 87.5 };
const REV_CURB = 13, REV_BLOCK = 18, REV_DASH_PERIOD = 70, REV_PROP_SLOT = 120;
// Region looks. Regions without their own look yet borrow the closest one.
const REV_THEMES = {
    grass: { ground: '#4fae3c', blades: ['rgba(30,90,25,.35)', 'rgba(150,220,110,.35)'], road: '#3c4049', speck: ['rgba(255,255,255,.07)', 'rgba(0,0,0,.14)'],
        runoff: '#ecd096', runoffDot: ['rgba(160,110,40,.22)', 'rgba(255,255,255,.3)'], curb: ['#f5f5f0', '#e8372f'], dashes: .92, ruts: .08, tree: 'tree' },
    dirt: { ground: '#7f9a3e', blades: ['rgba(70,60,20,.35)', 'rgba(190,210,120,.3)'], road: '#86613a', speck: ['rgba(255,230,190,.14)', 'rgba(40,25,10,.25)'],
        runoff: '#a8794a', runoffDot: ['rgba(60,35,15,.3)', 'rgba(255,230,190,.25)'], curb: ['#f2d06b', '#3b424c'], dashes: 0, ruts: .22, tree: 'tree' },
    gravel: { ground: '#8faa55', blades: ['rgba(50,70,25,.35)', 'rgba(200,220,150,.3)'], road: '#8b867c', speck: ['rgba(255,255,255,.2)', 'rgba(0,0,0,.22)'],
        runoff: '#b7b1a6', runoffDot: ['rgba(60,55,50,.3)', 'rgba(255,255,255,.35)'], curb: ['#f5f5f0', '#2f6fe0'], dashes: .45, ruts: .15, tree: 'tree' },
    snow: { ground: '#eef4fb', blades: ['rgba(150,180,210,.35)', 'rgba(255,255,255,.7)'], road: '#c3d0dd', speck: ['rgba(255,255,255,.55)', 'rgba(80,110,140,.2)'],
        runoff: '#ffffff', runoffDot: ['rgba(150,180,210,.3)', 'rgba(255,255,255,.6)'], curb: ['#ffffff', '#2f6fe0'], dashes: .55, ruts: .14, tree: 'pine' },
    desert: { ground: '#e7c27a', blades: ['rgba(160,110,40,.3)', 'rgba(255,240,200,.45)'], road: '#7d6a55', speck: ['rgba(255,235,200,.14)', 'rgba(40,25,10,.2)'],
        runoff: '#f3d9a2', runoffDot: ['rgba(160,110,40,.25)', 'rgba(255,255,255,.35)'], curb: ['#f5f5f0', '#e8372f'], dashes: .7, ruts: .12, tree: 'cactus' }
};
// Region looks built on the five base themes; `leaves` recolours the round trees.
Object.assign(REV_THEMES, {
    coast: { ...REV_THEMES.grass, ground: '#5cbf52', runoff: '#f4e2b0', curb: ['#ffffff', '#1fa3d6'], leaves: ['#2f9a4a', '#3fb05a', '#56c06a', 'rgba(170,240,150,.55)'] },
    autumn: { ...REV_THEMES.grass, ground: '#8fa83e', blades: ['rgba(110,70,20,.35)', 'rgba(230,190,90,.35)'], curb: ['#f5f5f0', '#e07b2d'],
        leaves: ['#d9622b', '#e8902f', '#c4452a', 'rgba(255,210,120,.55)'] },
    city: { ...REV_THEMES.grass, ground: '#3c4452', blades: ['rgba(0,0,0,.25)', 'rgba(140,160,190,.2)'], road: '#2b2f38', runoff: '#6b7280',
        runoffDot: ['rgba(0,0,0,.25)', 'rgba(255,255,255,.18)'], curb: ['#f2f2f2', '#b07cff'], leaves: ['#256a45', '#2f7d52', '#1f5a3c', 'rgba(120,220,160,.35)'] },
    jungle: { ...REV_THEMES.dirt, ground: '#2f7a3a', blades: ['rgba(10,50,20,.4)', 'rgba(120,200,90,.3)'], leaves: ['#1f6b34', '#2a8040', '#17592b', 'rgba(140,230,110,.45)'] },
    canyon: { ...REV_THEMES.desert, ground: '#d0743f', blades: ['rgba(120,50,20,.3)', 'rgba(255,200,150,.35)'], road: '#6e4a36', runoff: '#e4a26a' },
    volcano: { ...REV_THEMES.gravel, ground: '#3a3236', blades: ['rgba(255,90,30,.28)', 'rgba(0,0,0,.35)'], road: '#24201f', runoff: '#5a4a46',
        runoffDot: ['rgba(255,120,40,.35)', 'rgba(0,0,0,.3)'], curb: ['#ffc928', '#2a2a2a'], leaves: ['#4a4038', '#5a4d42', '#3b322b', 'rgba(255,140,60,.35)'] },
    arena: { ...REV_THEMES.dirt, ground: '#8b5a2b', blades: ['rgba(60,30,10,.35)', 'rgba(220,170,110,.3)'], runoff: '#6b4423', curb: ['#ffc928', '#e8372f'] }
});

function revHash(a, b = 0) {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function revPositiveMod(value, period) { return ((value % period) + period) % period; }

function revSpriteCanvas(width, height, scale, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    paint(ctx);
    return { canvas, width, height };
}

class RevTrackRenderer {
    constructor(canvas, { reducedMotion = () => false, anchor = .56, scale = width => width / REV_WORLD.width, theme = 'grass' } = {}) {
        this.look = REV_THEMES[theme] || REV_THEMES.grass;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.reducedMotion = reducedMotion;
        this.anchor = anchor;   // player car height on screen (0 top – 1 bottom)
        this.baseScale = scale; // (cssWidth, cssHeight) → world-to-screen scale before zoom
        this.camX = 270; this.zoom = .95; this.time = 0;
        this.width = 1; this.height = 1; this.dpr = 1;
        this.sparks = []; this.speedLines = []; this.stars = [];
        this.buildArt();
        if (document.fonts) document.fonts.ready.then(() => this.buildArt());
        this.resize();
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.dpr = Math.min(2, window.devicePixelRatio || 1);
        this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
        this.canvas.width = Math.round(this.width * this.dpr);
        this.canvas.height = Math.round(this.height * this.dpr);
        this.vignette = revSpriteCanvas(this.width, this.height, 1, ctx => {
            const glow = ctx.createRadialGradient(this.width / 2, this.height * .55, this.height * .25, this.width / 2, this.height * .55, this.height * .8);
            glow.addColorStop(0, 'rgba(0,0,0,0)'); glow.addColorStop(1, 'rgba(4,10,20,.42)');
            ctx.fillStyle = glow; ctx.fillRect(0, 0, this.width, this.height);
        });
    }

    // ---------- Art (procedural; bitmap overrides via revCarArt.props) ----------
    setTheme(theme) { this.look = REV_THEMES[theme] || REV_THEMES.grass; this.buildArt(); }

    buildArt() {
        const scale = 2, look = this.look;
        const tile = (size, paint) => {
            const sprite = revSpriteCanvas(size, size, scale, paint);
            const pattern = this.ctx.createPattern(sprite.canvas, 'repeat');
            return { pattern, size };
        };
        this.grass = tile(96, ctx => {
            ctx.fillStyle = look.ground; ctx.fillRect(0, 0, 96, 96);
            for (let i = 0; i < 70; i++) {
                const x = revHash(i, 1) * 96, y = revHash(i, 2) * 96;
                ctx.strokeStyle = i % 3 ? look.blades[0] : look.blades[1]; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (revHash(i, 3) - .5) * 3, y - 3 - revHash(i, 4) * 3); ctx.stroke();
            }
        });
        this.asphalt = tile(128, ctx => {
            ctx.fillStyle = look.road; ctx.fillRect(0, 0, 128, 128);
            for (let i = 0; i < 260; i++) {
                ctx.fillStyle = i % 2 ? look.speck[0] : look.speck[1];
                ctx.fillRect(revHash(i, 5) * 128, revHash(i, 6) * 128, 1 + revHash(i, 7) * 1.6, 1 + revHash(i, 8) * 1.6);
            }
        });
        this.sand = tile(64, ctx => {
            ctx.fillStyle = look.runoff; ctx.fillRect(0, 0, 64, 64);
            for (let i = 0; i < 80; i++) {
                ctx.fillStyle = i % 2 ? look.runoffDot[0] : look.runoffDot[1];
                ctx.beginPath(); ctx.arc(revHash(i, 9) * 64, revHash(i, 10) * 64, .6 + revHash(i, 11), 0, Math.PI * 2); ctx.fill();
            }
        });
        const paintTree = look.tree === 'pine' ? this.paintPine : look.tree === 'cactus' ? this.paintCactus : this.paintTree;
        this.trees = [0, 1, 2].map(v => revSpriteCanvas(64, 64, scale, ctx => paintTree.call(this, ctx, 32, 32, 22, v, look.leaves)));
        this.bushes = [0, 1].map(v => revSpriteCanvas(34, 34, scale, ctx => this.paintTree(ctx, 17, 17, 11, v + 3, look.leaves)));
        this.tents = ['#2f6fe0', '#e53935', '#f2f2f2', '#ffc928'].map(color => revSpriteCanvas(46, 46, scale, ctx => this.paintTent(ctx, color)));
        this.tire = revSpriteCanvas(14, 14, scale, ctx => {
            ctx.fillStyle = '#16181c'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.arc(7, 7, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#59606b'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(7, 7, 3.6, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = '#0a0b0d'; ctx.beginPath(); ctx.arc(7, 7, 2.2, 0, Math.PI * 2); ctx.fill();
        });
        const stands = [['#e53935', '#ffffff', 'FAST'], ['#2f6fe0', '#ffffff', 'GO!'], ['#ffc928', '#1d2636', 'REVLINE']];
        const boards = [['#2f6fe0', '#ff8a1f', 'FAST'], ['#1f2a3d', '#ffc928', 'GO!'], ['#e53935', '#ffffff', 'REVLINE'], ['#00b85c', '#ffffff', 'VOICE']];
        this.stands = { [-1]: stands.map((s, i) => revSpriteCanvas(80, 116, scale, ctx => this.paintGrandstand(ctx, -1, s, i))),
            [1]: stands.map((s, i) => revSpriteCanvas(80, 116, scale, ctx => this.paintGrandstand(ctx, 1, s, i))) };
        this.boards = { [-1]: boards.map(b => revSpriteCanvas(22, 74, scale, ctx => this.paintBillboard(ctx, -1, b))),
            [1]: boards.map(b => revSpriteCanvas(22, 74, scale, ctx => this.paintBillboard(ctx, 1, b))) };
    }

    paintTree(ctx, cx, cy, radius, variant, leaves = null) {
        const lobes = [];
        for (let i = 0; i < 6; i++) {
            const angle = i / 6 * Math.PI * 2 + variant;
            lobes.push([cx + Math.cos(angle) * radius * .55, cy + Math.sin(angle) * radius * .55, radius * (.48 + revHash(i, variant) * .14)]);
        }
        lobes.push([cx, cy, radius * .62]);
        ctx.fillStyle = 'rgba(10,40,20,.32)';
        for (const [x, y, r] of lobes) { ctx.beginPath(); ctx.arc(x + 5, y + 7, r, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = REV_INK;
        for (const [x, y, r] of lobes) { ctx.beginPath(); ctx.arc(x, y, r + 2.2, 0, Math.PI * 2); ctx.fill(); }
        const base = leaves ? leaves[variant % 3] : ['#2f8a3a', '#3b9a3f', '#2a7a45', '#46a743', '#3a9440'][variant % 5];
        ctx.fillStyle = base;
        for (const [x, y, r] of lobes) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = leaves ? leaves[3] : 'rgba(140,220,100,.55)';
        for (const [x, y, r] of lobes) { ctx.beginPath(); ctx.arc(x - r * .28, y - r * .3, r * .45, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(0,40,10,.25)';
        for (const [x, y, r] of lobes) { ctx.beginPath(); ctx.arc(x + r * .35, y + r * .35, r * .3, 0, Math.PI * 2); ctx.fill(); }
    }

    // Snow regions: layered pines with snowy tips.
    paintPine(ctx, cx, cy, radius, variant) {
        ctx.fillStyle = 'rgba(30,50,80,.25)'; ctx.beginPath(); ctx.ellipse(cx + 5, cy + 7, radius, radius * .9, 0, 0, Math.PI * 2); ctx.fill();
        for (let layer = 0; layer < 3; layer++) {
            const r = radius * (1 - layer * 0.28);
            ctx.fillStyle = REV_INK; ctx.beginPath();
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + variant + layer, d = i % 2 ? r * .62 : r + 2; ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = ['#1f5a3a', '#2e7650', '#3f8f63'][layer]; ctx.beginPath();
            for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + variant + layer, d = i % 2 ? r * .55 : r; ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
            ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx - radius * .15, cy - radius * .15, radius * .25, 0, Math.PI * 2); ctx.fill();
    }

    // Desert regions: a round cactus with arms, seen from above.
    paintCactus(ctx, cx, cy, radius, variant) {
        ctx.fillStyle = 'rgba(120,80,30,.28)'; ctx.beginPath(); ctx.ellipse(cx + 5, cy + 7, radius * .8, radius * .6, 0, 0, Math.PI * 2); ctx.fill();
        const arms = [[0, 0, radius * .5], [radius * .55, -radius * .2 - variant * 2, radius * .3], [-radius * .5, radius * .25, radius * .28]];
        ctx.fillStyle = REV_INK;
        for (const [dx, dy, r] of arms) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r + 2.2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#3d9a4f';
        for (const [dx, dy, r] of arms) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#ffd1e8'; ctx.beginPath(); ctx.arc(cx, cy, radius * .14, 0, Math.PI * 2); ctx.fill();
    }

    paintTent(ctx, color) {
        const s = 38, o = 4, c = o + s / 2;
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(o + 5, o + 7, s, s);
        const faces = [[[o, o], [o + s, o], .32], [[o + s, o], [o + s, o + s], 0], [[o + s, o + s], [o, o + s], -.28], [[o, o + s], [o, o], .12]];
        ctx.strokeStyle = REV_INK; ctx.lineWidth = 2;
        for (const [[ax, ay], [bx, by], light] of faces) {
            ctx.fillStyle = color.startsWith('#f2') && light < 0 ? '#c9ced6' : revShade(color, light);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(c, c); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(c, c, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // Built for a stand facing the road: side -1 sits left of the road, +1 right.
    paintGrandstand(ctx, side, [color, textColor, text], variant) {
        const width = 78, height = 112, top = 2;
        ctx.save();
        if (side > 0) { ctx.translate(80, 0); ctx.scale(-1, 1); }
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(6, top + 7, width - 2, height);
        ctx.fillStyle = '#8f99a5'; ctx.fillRect(0, top, width, height);
        for (let i = 0; i < height; i += 12) { ctx.fillStyle = (i / 12) % 2 ? '#ffffff' : color; ctx.fillRect(0, top + i, 18, Math.min(12, height - i)); }
        const skins = ['#ffcf9e', '#c98b5a', '#8d5524', '#f1c27d', '#e0ac69'];
        const shirts = ['#e53935', '#2f6fe0', '#ffc928', '#00b85c', '#ff8a1f', '#b07cff', '#ffffff', '#1d2636'];
        for (let row = 0; row < 5; row++) {
            const x = 20 + row * 9;
            ctx.fillStyle = row % 2 ? '#a5aeb9' : '#b8c0ca'; ctx.fillRect(x, top, 9, height);
            for (let y = 4; y < height - 2; y += 6.4) {
                const h = revHash(row * 97 + Math.round(y * 3), variant + 11);
                if (h < .12) continue;
                ctx.fillStyle = shirts[Math.floor(h * 97) % shirts.length];
                ctx.beginPath(); ctx.arc(x + 3.6, top + y, 3.1, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = skins[Math.floor(h * 31) % skins.length];
                ctx.beginPath(); ctx.arc(x + 5.6, top + y, 2, 0, Math.PI * 2); ctx.fill();
                if (h > .86) { ctx.fillRect(x + 6.5, top + y - 3.5, 2.4, 1.6); ctx.fillRect(x + 6.5, top + y + 2, 2.4, 1.6); }
            }
        }
        ctx.fillStyle = color; ctx.fillRect(65, top, 13, height);
        ctx.strokeStyle = REV_INK; ctx.lineWidth = 2.4; ctx.strokeRect(0, top, width, height);
        ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(18, top); ctx.lineTo(18, top + height); ctx.moveTo(65, top); ctx.lineTo(65, top + height); ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.translate(side > 0 ? 80 - 71.5 : 71.5, top + height / 2); ctx.rotate(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.font = '11px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 2.5; ctx.strokeStyle = REV_INK;
        for (const offset of [-34, 34]) { ctx.strokeText(text, offset, 1); ctx.fillStyle = textColor; ctx.fillText(text, offset, 1); }
        ctx.restore();
    }

    paintBillboard(ctx, side, [background, textColor, text]) {
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(9, 9, 12, 62);
        ctx.fillStyle = '#5b6470'; ctx.fillRect(side < 0 ? 2 : 14, 14, 5, 6); ctx.fillRect(side < 0 ? 2 : 14, 52, 5, 6);
        ctx.fillStyle = background; ctx.strokeStyle = REV_INK; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.roundRect(5, 3, 12, 66, 3); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(11, 36); ctx.rotate(side < 0 ? -Math.PI / 2 : Math.PI / 2);
        ctx.font = '10px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 2.4; ctx.strokeStyle = REV_INK; ctx.strokeText(text, 0, 1); ctx.fillStyle = textColor; ctx.fillText(text, 0, 1);
        ctx.restore();
    }

    // ---------- Frame ----------
    render(v, frameDt) {
        const { ctx, width: W, height: H, dpr } = this;
        this.time += frameDt;
        const road = this.road = v.road, anchorY = v.player.y + v.player.h / 2;
        const ease = seconds => 1 - Math.exp(-frameDt / seconds);
        this.zoom += (.96 - Math.min(1, v.speedRatio) * .09 - this.zoom) * ease(.4);
        this.camX += (270 + road.offsetAt(anchorY) * .72 - this.camX) * ease(.28);
        const s = this.baseScale(W, H) * this.zoom, screenAnchor = H * this.anchor;
        const shake = this.reducedMotion() ? 0 : (v.shake || 0);
        const view = this.viewRect = {
            x0: this.camX - W / 2 / s - 4, x1: this.camX + W / 2 / s + 4,
            y0: anchorY - screenAnchor / s - 4, y1: anchorY + (H - screenAnchor) / s + 4, T: v.scroll
        };
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - (this.camX - shake) * s), dpr * (screenAnchor - anchorY * s));
        const samples = this.sampleRoad(road, view);
        this.drawGround(view);
        this.drawRunoff(samples, view, -1); this.drawRunoff(samples, view, 1);
        this.drawProps(road, view);
        this.drawRoad(samples, view);
        if (v.startY !== null) this.drawChecker(road, v.startY, false);
        if (v.finishY !== null) this.drawChecker(road, v.finishY, true);
        if (v.course) this.drawCourse(v.course);
        this.drawSkids(road, v.skidMarks);
        this.drawSmoke(v.tireSmoke, v.exhaust);
        this.drawVehicles(v, s * dpr);
        this.updateSparks(v);
        this.drawSparks();
        if (v.finishY !== null) this.drawGantry(road, v.finishY);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawSpeedLines(v, W, H);
        ctx.drawImage(this.vignette.canvas, 0, 0, W, H);
        if (v.limiting && !this.reducedMotion()) {
            ctx.fillStyle = `rgba(255,40,60,${.12 + Math.sin(this.time * 18) * .08})`;
            ctx.fillRect(0, 0, W, 10); ctx.fillRect(0, H - 10, W, 10);
        }
    }

    sampleRoad(road, view) {
        // Sample points ride with the ground, so outlines never shimmer as the road scrolls.
        const step = 12, ys = [], offsets = [], extras = { [-1]: [], [1]: [] };
        for (let y = view.y0 - 60 - revPositiveMod(view.y0 - 60 - view.T, step); y <= view.y1 + 60; y += step) {
            ys.push(y); offsets.push(road.offsetAt(y));
            extras[-1].push(this.bendExtra(road, y, -1)); extras[1].push(this.bendExtra(road, y, 1));
        }
        return { ys, offsets, extras };
    }
    // Extra run-off on the outside of a bend (0–40). Outside = the side the backend pushes cars to.
    bendExtra(road, y, side) { return Math.min(40, Math.max(0, -side * road.bendAt(y) * 55000)); }
    edge(offset, side) { return side < 0 ? REV_WORLD.roadLeft + offset : REV_WORLD.roadLeft + REV_WORLD.roadWidth + offset; }
    barrierDistance(extra) { return REV_CURB + 25 + extra * .85; }

    drawGround(view) {
        const { ctx } = this;
        this.grass.pattern.setTransform(new DOMMatrix().translate(0, revPositiveMod(view.T, 96)).scale(.5));
        ctx.fillStyle = this.grass.pattern;
        ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        const start = view.y0 - revPositiveMod(view.y0 - view.T, 140);
        for (let y = start; y < view.y1; y += 140) ctx.fillRect(view.x0, y, view.x1 - view.x0, 70);
    }

    drawRunoff({ ys, offsets, extras }, view, side) {
        const { ctx } = this;
        const outer = [], barrier = [];
        for (let i = 0; i < ys.length; i++) {
            const extra = extras[side][i], edge = this.edge(offsets[i], side);
            const wobble = 3 * Math.sin((ys[i] - view.T) / 41 + side) + 3;
            outer.push(edge + side * (REV_CURB + 8 + extra * .85 + wobble));
            barrier.push(edge + side * this.barrierDistance(extra));
        }
        this.sand.pattern.setTransform(new DOMMatrix().translate(0, revPositiveMod(view.T, 64)).scale(.5));
        ctx.fillStyle = this.sand.pattern;
        ctx.beginPath();
        ys.forEach((y, i) => (i ? ctx.lineTo(outer[i], y) : ctx.moveTo(outer[i], y)));
        for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(this.edge(offsets[i], side), ys[i]);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(150,100,40,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ys.forEach((y, i) => (i ? ctx.lineTo(outer[i], y) : ctx.moveTo(outer[i], y))); ctx.stroke();

        // Tyre walls guard the outside of bends. Like trees, each tyre is placed from the road at
        // its own ground position, so the walls stay fixed on the map.
        const road = this.road;
        const tireStart = view.y0 - 20 - revPositiveMod(view.y0 - 20 - view.T, 11);
        for (let y = tireStart; y < view.y1 + 20; y += 11) {
            const extra = this.bendExtra(road, y, side);
            if (extra < 12) continue;
            const base = this.edge(road.offsetAt(y), side) + side * (this.barrierDistance(extra) - 8);
            ctx.drawImage(this.tire.canvas, base - 7, y - 7, 14, 14);
            if (extra > 24) ctx.drawImage(this.tire.canvas, base - side * 11 - 7, y - 1.5, 14, 14);
        }
        const line = (width, color) => {
            ctx.strokeStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ys.forEach((y, i) => (i ? ctx.lineTo(barrier[i], y) : ctx.moveTo(barrier[i], y))); ctx.stroke();
        };
        line(8, REV_INK); line(4.5, '#dfe4ea'); line(1.2, '#8f99a5');
        ctx.fillStyle = REV_INK;
        const postStart = view.y0 - revPositiveMod(view.y0 - view.T, 26);
        for (let y = postStart; y < view.y1; y += 26) {
            const x = this.edge(road.offsetAt(y), side) + side * (this.barrierDistance(this.bendExtra(road, y, side)) + 3);
            ctx.fillRect(x - 2, y - 2, 4, 4);
        }
    }

    drawProps(road, view) {
        const first = Math.ceil((view.T - view.y1 - 200) / REV_PROP_SLOT), last = Math.floor((view.T - view.y0 + 200) / REV_PROP_SLOT);
        const queue = [];
        for (let k = first; k <= last; k++) for (const side of [-1, 1]) {
            const y = view.T - k * REV_PROP_SLOT;
            const extra = Math.min(40, Math.max(0, road.bendAt(y) * 55000 * -side));
            const base = this.edge(road.offsetAt(y), side) + side * (this.barrierDistance(extra) + 14);
            const zone = revHash(Math.floor(k / 5), side + 7), r = revHash(k, side * 31 + 3), slot = revPositiveMod(k, 5);
            const heading = road.headingAt(y);
            if (zone < .3) {
                if (slot < 4) queue.push({ kind: 'stand', x: base, y, side, variant: Math.floor(zone * 10) % 3, heading });
                else queue.push({ kind: 'tent', x: base + side * 6, y: y - 18, variant: Math.floor(r * 4) });
            } else if (zone < .56) {
                queue.push({ kind: 'tree', x: base + side * (12 + r * 26), y: y - r * 50, variant: Math.floor(r * 3), size: 46 + r * 18 });
                queue.push({ kind: 'tree', x: base + side * (58 + r * 30), y: y + 30 - r * 30, variant: revPositiveMod(k + 1, 3), size: 54 + r * 14 });
                if (r > .5) queue.push({ kind: 'bush', x: base + side * 4, y: y + 40, variant: revPositiveMod(k, 2) });
            } else if (zone < .8) {
                queue.push({ kind: 'tent', x: base + side * 8, y, variant: Math.floor(r * 4) });
                queue.push({ kind: 'tent', x: base + side * 56, y: y + 34, variant: (Math.floor(r * 4) + 1) % 4 });
                if (r > .55) queue.push({ kind: 'board', x: base, y: y - 52, side, variant: Math.floor(r * 4), heading });
            } else {
                queue.push({ kind: r > .45 ? 'board' : 'bush', x: base, y, side, variant: Math.floor(r * 4) % (r > .45 ? 4 : 2), heading });
                queue.push({ kind: 'tree', x: base + side * (44 + r * 40), y: y - 40, variant: revPositiveMod(k, 3), size: 50 + r * 16 });
            }
            // Far woodland for wide screens; culled in drawProp when off-screen.
            const far = revHash(k, side * 13 + 5);
            queue.push({ kind: 'tree', x: base + side * (150 + far * 80), y: y - far * 60, variant: revPositiveMod(k, 3), size: 58 + far * 20 });
            queue.push({ kind: far > .5 ? 'tree' : 'bush', x: base + side * (250 + far * 140), y: y + 30, variant: revPositiveMod(k + 1, 2), size: 66 });
        }
        queue.sort((a, b) => a.y - b.y);
        for (const prop of queue) this.drawProp(prop);
    }

    drawProp(p) {
        const { ctx } = this, art = revCarArt.props;
        if (p.x < this.viewRect.x0 - 90 || p.x > this.viewRect.x1 + 90) return;
        const place = (image, w, h, x, y, rotation = 0, flip = false) => {
            ctx.save(); ctx.translate(x, y); if (rotation) ctx.rotate(rotation); if (flip) ctx.scale(-1, 1);
            ctx.drawImage(image, -w / 2, -h / 2, w, h); ctx.restore();
        };
        // Tree art follows the theme: tree (grass), pine (snow) or cactus (desert).
        if (p.kind === 'tree') place(art[this.look.tree] || this.trees[p.variant].canvas, p.size, p.size, p.x, p.y);
        if (p.kind === 'bush') place(art.bush || this.bushes[p.variant].canvas, 30, 30, p.x, p.y);
        if (p.kind === 'tent') place(art.tent || this.tents[p.variant].canvas, 44, 44, p.x, p.y);
        if (p.kind === 'stand') {
            const image = art.grandstand || this.stands[p.side][p.variant].canvas;
            place(image, 80, 116, p.x + p.side * 40, p.y, p.heading, Boolean(art.grandstand) && p.side > 0);
        }
        if (p.kind === 'board') place(art.billboard || this.boards[p.side][p.variant].canvas, 22, 74, p.x + p.side * 8, p.y, p.heading, Boolean(art.billboard) && p.side > 0);
    }

    drawRoad({ ys, offsets }, view) {
        const { ctx } = this, left = REV_WORLD.roadLeft, right = left + REV_WORLD.roadWidth;
        const path = () => {
            ctx.beginPath();
            ys.forEach((y, i) => (i ? ctx.lineTo(left + offsets[i], y) : ctx.moveTo(left + offsets[i], y)));
            for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(right + offsets[i], ys[i]);
            ctx.closePath();
        };
        this.asphalt.pattern.setTransform(new DOMMatrix().translate(0, revPositiveMod(view.T, 128)).scale(.5));
        ctx.fillStyle = this.asphalt.pattern; path(); ctx.fill();
        ctx.save(); path(); ctx.clip();
        const polyline = (x, width, color) => {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
            ys.forEach((y, i) => (i ? ctx.lineTo(x + offsets[i], y) : ctx.moveTo(x + offsets[i], y))); ctx.stroke();
        };
        polyline(left, 16, 'rgba(0,0,0,.2)'); polyline(right, 16, 'rgba(0,0,0,.2)');
        for (let lane = 0; lane < 4; lane++) for (const track of [-13, 13]) polyline(left + REV_WORLD.laneWidth * (lane + .5) + track, 7, `rgba(0,0,0,${this.look.ruts})`);
        ctx.restore();

        // Lane dashes move with the backend's paint scroll.
        const start = view.y0 - 40 - revPositiveMod(view.y0 - 40 - view.T, REV_DASH_PERIOD);
        ctx.strokeStyle = `rgba(250,250,245,${this.look.dashes})`; ctx.lineCap = 'butt';
        for (let y = start; y < view.y1 + 40; y += REV_DASH_PERIOD) for (const lane of [1, 2, 3]) {
            const x = left + REV_WORLD.laneWidth * lane;
            ctx.lineWidth = lane === 2 ? 5 : 4;
            ctx.beginPath(); ctx.moveTo(x + this.offset(y), y);
            for (let step = 12; step <= 36; step += 12) ctx.lineTo(x + this.offset(y + step), y + step);
            ctx.stroke();
        }
        ctx.lineCap = 'round';

        // Red / white curbs on both edges.
        const blockStart = view.y0 - 40 - revPositiveMod(view.y0 - 40 - view.T, REV_BLOCK);
        for (const side of [-1, 1]) {
            for (let y = blockStart; y < view.y1 + 40; y += REV_BLOCK) {
                const a = this.edge(this.offset(y), side), b = this.edge(this.offset(y + REV_BLOCK), side);
                const parity = revPositiveMod(Math.round((y - view.T) / REV_BLOCK), 2);
                ctx.fillStyle = parity ? this.look.curb[0] : this.look.curb[1];
                ctx.beginPath(); ctx.moveTo(a - side, y); ctx.lineTo(a + side * REV_CURB, y);
                ctx.lineTo(b + side * REV_CURB, y + REV_BLOCK); ctx.lineTo(b - side, y + REV_BLOCK); ctx.closePath(); ctx.fill();
            }
            ctx.strokeStyle = REV_INK; ctx.lineWidth = 2;
            ctx.beginPath();
            ys.forEach((y, i) => { const x = this.edge(offsets[i], side) + side * REV_CURB; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            ys.forEach((y, i) => { const x = this.edge(offsets[i], side); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
            ctx.stroke();
        }
    }
    offset(y) { return this.road.offsetAt(y); }

    drawChecker(road, y, finish) {
        if (y < this.viewRect.y0 - 30 || y > this.viewRect.y1 + 30) return;
        const { ctx } = this, cell = REV_WORLD.roadWidth / 20;
        for (let row = 0; row < (finish ? 3 : 2); row++) for (let col = 0; col < 20; col++) {
            ctx.fillStyle = (row + col) % 2 ? '#f5f6f8' : '#11151b';
            ctx.fillRect(REV_WORLD.roadLeft + road.offsetAt(y + row * 9) + col * cell, y + row * 9, cell + .5, 9.5);
        }
        if (!finish) {
            ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
            for (let lane = 0; lane < 4; lane++) {
                const x = REV_WORLD.roadLeft + road.offsetAt(y + 40) + REV_WORLD.laneWidth * lane + 14;
                ctx.strokeRect(x, y + 28, REV_WORLD.laneWidth - 28, 58);
            }
        }
    }

    drawGantry(road, y) {
        if (y < this.viewRect.y0 - 60 || y > this.viewRect.y1 + 60) return;
        const { ctx } = this, offset = road.offsetAt(y);
        const left = REV_WORLD.roadLeft + offset - 34, right = REV_WORLD.roadLeft + REV_WORLD.roadWidth + offset + 34;
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(left + 14, y - 4, right - left, 20);
        ctx.fillStyle = '#e8372f'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.roundRect(left, y - 22, right - left, 20, 5); ctx.fill(); ctx.stroke();
        for (const x of [left, right - 18]) {
            for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#11151b'; ctx.fillRect(x + (i % 3) * 6, y - 22 + Math.floor(i / 3) * 10, 6, 10); }
        }
        ctx.font = '17px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeText('FINISH', (left + right) / 2, y - 11); ctx.fillStyle = '#fff'; ctx.fillText('FINISH', (left + right) / 2, y - 11);
    }

    // Career features: hill climbs (shaded band, gear limit) and obstacles, in world px.
    drawCourse({ hills = [], obstacles = [] }) {
        const { ctx } = this, art = revCarArt.props, left = REV_WORLD.roadLeft, width = REV_WORLD.roadWidth;
        for (const hill of hills) {
            if (hill.bottom < this.viewRect.y0 || hill.top > this.viewRect.y1) continue;
            ctx.fillStyle = 'rgba(80,45,15,.28)';
            ctx.beginPath();
            for (let y = hill.top; y <= hill.bottom; y += 12) ctx.lineTo(left + this.road.offsetAt(y) - 10, y);
            for (let y = hill.bottom; y >= hill.top; y -= 12) ctx.lineTo(left + width + this.road.offsetAt(y) + 10, y);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
            for (let y = hill.top + 30; y < hill.bottom - 10; y += 60) {
                const cx = left + width / 2 + this.road.offsetAt(y);
                for (const dx of [-90, 0, 90]) { ctx.beginPath(); ctx.moveTo(cx + dx - 16, y + 10); ctx.lineTo(cx + dx, y - 6); ctx.lineTo(cx + dx + 16, y + 10); ctx.stroke(); }
            }
            const labelY = Math.min(Math.max(hill.top + 18, this.viewRect.y0 + 160), hill.bottom - 18);
            ctx.font = '16px "Lilita One", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 4; ctx.strokeStyle = REV_INK; const label = `HILL · GEAR ${hill.maxGear} OR LOWER`;
            ctx.strokeText(label, left + width / 2 + this.road.offsetAt(labelY), labelY); ctx.fillStyle = '#ffc928'; ctx.fillText(label, left + width / 2 + this.road.offsetAt(labelY), labelY);
        }
        for (const o of obstacles) {
            if (o.y > this.viewRect.y1 + 40 || o.y + o.height < this.viewRect.y0 - 40) continue;
            const cx = o.x + o.width / 2, cy = o.y + o.height / 2, image = art[`obstacle-${o.kind}`];
            if (image) { ctx.drawImage(image, o.x, o.y, o.width, o.height); continue; }
            ctx.lineWidth = 2; ctx.strokeStyle = REV_INK;
            if (o.kind === 'mud') {
                ctx.fillStyle = 'rgba(70,45,20,.85)'; ctx.beginPath(); ctx.ellipse(cx, cy, o.width / 2, o.height / 2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(140,100,60,.6)'; ctx.beginPath(); ctx.ellipse(cx - 8, cy - 6, o.width / 5, o.height / 6, 0, 0, Math.PI * 2); ctx.fill();
            } else if (o.kind === 'cone') {
                ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.arc(cx, cy, o.width / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(cx, cy, o.width / 4, 0, Math.PI * 2); ctx.stroke();
            } else if (o.kind === 'barrel') {
                ctx.fillStyle = o.obstacle.at % 2 < 1 ? '#2f6fe0' : '#e53935'; ctx.beginPath(); ctx.arc(cx, cy, o.width / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, o.width / 3, 0, Math.PI * 2); ctx.stroke();
            } else {
                ctx.fillStyle = '#8b8f97'; ctx.beginPath();
                for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, d = (o.width / 2) * (0.75 + revHash(i, Math.round(o.obstacle.at)) * 0.3); ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85); }
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(cx - 5, cy - 5, o.width / 6, 0, Math.PI * 2); ctx.fill();
            }
        }
    }

    drawSkids(road, marks) {
        const { ctx } = this;
        ctx.lineWidth = 4.5;
        for (const mark of marks) {
            const endY = mark.y + Math.cos(mark.angle) * 16;
            ctx.strokeStyle = `rgba(18,18,24,${mark.life / 1.4 * .55})`;
            ctx.beginPath(); ctx.moveTo(mark.x + road.offsetAt(mark.y), mark.y);
            ctx.lineTo(mark.x - Math.sin(mark.angle) * 16 + road.offsetAt(endY), endY); ctx.stroke();
        }
    }

    drawSmoke(tireSmoke, exhaust) {
        const { ctx } = this;
        for (const p of tireSmoke) {
            ctx.fillStyle = `rgba(120,128,140,${p.alpha * .35})`;
            ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, p.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(244,246,250,${p.alpha})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,${p.alpha * .8})`;
            ctx.beginPath(); ctx.arc(p.x - p.r * .3, p.y - p.r * .3, p.r * .45, 0, Math.PI * 2); ctx.fill();
        }
        for (const p of exhaust) {
            const fade = 1 - p.age / p.life;
            ctx.fillStyle = p.bang ? `rgba(90,96,106,${fade * .55})` : `rgba(226,231,236,${fade * (.25 + p.strength * .35)})`;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.15, 0, Math.PI * 2); ctx.fill();
        }
    }

    drawVehicles(v, pixelScale) {
        const { ctx } = this, spriteScale = pixelScale > 2.2 ? 3 : 2;
        const all = [...v.vehicles.map(vehicle => ({ ...vehicle, player: false })), { ...v.player, player: true }].sort((a, b) => a.y - b.y);
        for (const car of all) {
            if (car.y < this.viewRect.y0 - 110 || car.y > this.viewRect.y1 + 110) continue;
            const cx = car.x + REV_CAR_W / 2, cy = car.y + REV_CAR_H / 2;
            ctx.save();
            if (car.traffic) ctx.globalAlpha = Math.max(0, Math.min(1, (car.y + 150) / 60));
            ctx.translate(cx + (car.shakeX || 0), cy);
            ctx.rotate(car.angle);
            if (car.player) this.drawSpeedTrail(v);
            revDrawCarShadow(ctx);
            revDrawCar(ctx, car.art, spriteScale);
            revDrawCarFx(ctx, { braking: car.braking || 0, flame: car.flame || 0, flameColor: car.flameColor, exhaust: car.art.exhaust, time: this.time });
            ctx.restore();
            if (car.name) this.drawNameTag(car.name, car.color, cx, car.y - 16);
        }
    }

    drawSpeedTrail(v) {
        if (v.speedRatio < .5 || this.reducedMotion()) return;
        const { ctx } = this, strength = Math.min(1, (v.speedRatio - .5) / .4);
        const length = 40 + strength * 110, top = REV_CAR_H / 2 - 4;
        const trail = ctx.createLinearGradient(0, top, 0, top + length);
        trail.addColorStop(0, `rgba(255,214,70,${.55 * strength})`); trail.addColorStop(.4, `rgba(255,140,30,${.28 * strength})`); trail.addColorStop(1, 'rgba(255,120,20,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = trail;
        ctx.beginPath(); ctx.moveTo(-17, top); ctx.quadraticCurveTo(-8, top + length * .6, Math.sin(this.time * 9) * 3, top + length);
        ctx.quadraticCurveTo(8, top + length * .6, 17, top); ctx.closePath(); ctx.fill(); ctx.restore();
    }

    drawNameTag(name, color, x, y) {
        const { ctx } = this;
        ctx.font = '11px "Lilita One", sans-serif';
        const width = ctx.measureText(name).width + 16;
        ctx.fillStyle = REV_INK; ctx.beginPath(); ctx.roundRect(x - width / 2 - 1.5, y - 9.5, width + 3, 19, 9.5); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - width / 2, y - 8, width, 16, 8); ctx.fill();
        ctx.fillStyle = REV_INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, x, y + .5);
    }

    // Side bumps and hits from behind: a spark spray plus coloured "firecracker" stars.
    addImpact(x, y, kind) {
        if (this.reducedMotion()) return;
        for (let i = 0; i < 26; i++) {
            const angle = Math.random() * Math.PI * 2, speed = 120 + Math.random() * 260;
            this.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.25 + Math.random() * 0.35, age: 0 });
        }
        const colors = ['#ffc928', '#ff3b47', '#38e1ff', '#00e676', '#ffffff', '#b07cff'];
        for (let i = 0; i < (kind === 'side' ? 10 : 7); i++) {
            const angle = Math.random() * Math.PI * 2, speed = 60 + Math.random() * 140;
            this.stars.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40, life: 0.6 + Math.random() * 0.4, age: 0,
                color: colors[i % colors.length], size: 4 + Math.random() * 4, spin: Math.random() * 6 });
        }
        if (this.sparks.length > 160) this.sparks.splice(0, this.sparks.length - 160);
        if (this.stars.length > 60) this.stars.splice(0, this.stars.length - 60);
    }

    updateSparks(v) {
        const dt = v.dt;
        for (let i = this.stars.length - 1; i >= 0; i--) {
            const star = this.stars[i]; star.age += dt;
            if (star.age >= star.life) { this.stars.splice(i, 1); continue; }
            star.x += star.vx * dt; star.y += star.vy * dt; star.vy += 220 * dt; star.vx *= 0.97;
        }
        if (dt > 0 && v.offRoad && v.player.speedKmh > 15 && !this.reducedMotion() && this.sparks.length < 90) {
            const p = v.player, cos = Math.cos(p.angle), sin = Math.sin(p.angle);
            for (let i = 0; i < 3; i++) {
                const localX = v.offRoadSide * (REV_CAR_W / 2 + 1), localY = 10 + Math.random() * 28;
                this.sparks.push({ x: p.x + REV_CAR_W / 2 + localX * cos - localY * sin, y: p.y + REV_CAR_H / 2 + localX * sin + localY * cos,
                    vx: v.offRoadSide * (40 + Math.random() * 90), vy: 60 + Math.random() * 160 + p.speedKmh, life: .25 + Math.random() * .3, age: 0 });
            }
        }
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const spark = this.sparks[i]; spark.age += dt;
            if (spark.age >= spark.life) { this.sparks.splice(i, 1); continue; }
            spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.vx *= .96;
        }
    }

    drawSparks() {
        const { ctx } = this;
        for (const star of this.stars) {
            const fade = 1 - star.age / star.life, r = star.size * (0.6 + fade * 0.4);
            ctx.save(); ctx.translate(star.x, star.y); ctx.rotate(star.age * star.spin);
            ctx.globalAlpha = fade; ctx.fillStyle = star.color; ctx.strokeStyle = REV_INK; ctx.lineWidth = 1.2;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, d = i % 2 ? r * 0.45 : r; ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
            ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
        for (const spark of this.sparks) {
            const fade = 1 - spark.age / spark.life;
            ctx.strokeStyle = `rgba(255,${180 + fade * 60},70,${fade})`;
            ctx.beginPath(); ctx.moveTo(spark.x, spark.y); ctx.lineTo(spark.x - spark.vx * .03, spark.y - spark.vy * .03); ctx.stroke();
        }
        ctx.restore();
    }

    drawSpeedLines(v, W, H) {
        if (this.reducedMotion()) { this.speedLines = []; return; }
        const strength = Math.max(0, (v.speedRatio - .55) / .45);
        if (v.dt > 0) {
            while (this.speedLines.length < Math.round(strength * 18)) {
                const edge = Math.random() < .5 ? Math.random() * W * .2 : W - Math.random() * W * .2;
                this.speedLines.push({ x: edge, y: -60 - Math.random() * H * .5, length: 40 + Math.random() * 80 });
            }
            for (let i = this.speedLines.length - 1; i >= 0; i--) {
                const line = this.speedLines[i]; line.y += v.dt * (900 + strength * 900);
                if (line.y > H + 100) this.speedLines.splice(i, 1);
            }
        }
        if (!strength) return;
        const { ctx } = this;
        ctx.strokeStyle = `rgba(255,255,255,${.22 * strength})`; ctx.lineWidth = 2;
        for (const line of this.speedLines) { ctx.beginPath(); ctx.moveTo(line.x, line.y); ctx.lineTo(line.x, line.y + line.length); ctx.stroke(); }
    }
}
