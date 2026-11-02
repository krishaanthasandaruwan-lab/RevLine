// Painted top-down scenery for the career map and round sheets, in the race track's cartoon
// style. Used until generated region art (frontend/shared/art: region-<id>) is imported.
const REV_SCENE_LOOKS = {
    grass: { ground: ['#5bbb47', '#4aa63a'], speck: 'rgba(30,90,25,.28)', tree: 'round', leaves: ['#2f8a3a', '#3b9a3f', '#46a743'], water: '#3fb6e8', extra: 'flowers' },
    coast: { ground: ['#66c457', '#58b54c'], speck: 'rgba(30,90,25,.22)', tree: 'palm', leaves: ['#2f9a4a', '#3fb05a', '#56c06a'], water: '#2fa8e0', sea: true, extra: 'sand' },
    autumn: { ground: ['#9aab45', '#879a3a'], speck: 'rgba(110,70,20,.3)', tree: 'round', leaves: ['#d9622b', '#e8902f', '#c4452a'], water: '#4aa3c8', extra: 'leaves' },
    gravel: { ground: ['#9b978d', '#8a867c'], speck: 'rgba(40,40,40,.25)', tree: 'round', leaves: ['#4f8a3a', '#5e9a44', '#3f7a32'], extra: 'rocks' },
    desert: { ground: ['#efc77b', '#e2b66a'], speck: 'rgba(160,110,40,.3)', tree: 'cactus', leaves: ['#3d9a4f'], extra: 'dunes' },
    snow: { ground: ['#f2f7fd', '#e3edf8'], speck: 'rgba(120,150,190,.25)', tree: 'pine', leaves: ['#1f5a3a', '#2e7650', '#3f8f63'], water: '#bfe3f5', ice: true },
    city: { ground: ['#3a4250', '#323946'], speck: 'rgba(0,0,0,.3)', tree: 'round', leaves: ['#256a45', '#2f7d52', '#1f5a3c'], extra: 'buildings' },
    jungle: { ground: ['#2f7a3a', '#286d33'], speck: 'rgba(10,50,20,.35)', tree: 'round', leaves: ['#1f6b34', '#2a8040', '#3a9a4a'], water: '#3c9a8a', extra: 'ferns' },
    canyon: { ground: ['#d47a45', '#c66a38'], speck: 'rgba(120,50,20,.3)', tree: 'cactus', leaves: ['#4f9a4f'], extra: 'mesas' },
    volcano: { ground: ['#3d3539', '#332c30'], speck: 'rgba(0,0,0,.35)', tree: 'dead', leaves: ['#4a4038'], lava: true, extra: 'rocks' },
    arena: { ground: ['#8f5d2e', '#7d5027'], speck: 'rgba(50,25,8,.35)', tree: 'none', leaves: [], extra: 'stadium' },
    dirt: { ground: ['#7f9a3e', '#6f8a35'], speck: 'rgba(70,60,20,.3)', tree: 'round', leaves: ['#2f8a3a', '#3b9a3f', '#46a743'], extra: 'rocks' }
};
const REV_SCENE_INK = '#0f1724';

function revSceneRandom(seed) {
    let state = 0;
    for (const char of String(seed)) state = (state * 31 + char.charCodeAt(0)) >>> 0;
    return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

// Paints a w × h scene. `avoid` = [{x, y, r}] spots (the round buttons) kept clear of big props.
function revPaintRegionScene(ctx, w, h, theme, seed, avoid = []) {
    const look = REV_SCENE_LOOKS[theme] || REV_SCENE_LOOKS.grass, rand = revSceneRandom(seed);
    const clear = (x, y, r) => avoid.every(a => Math.hypot(a.x - x, a.y - y) > a.r + r);
    const ground = ctx.createLinearGradient(0, 0, 0, h);
    ground.addColorStop(0, look.ground[1]); ground.addColorStop(1, look.ground[0]);
    ctx.fillStyle = ground; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = look.speck;
    for (let i = 0; i < w * h / 260; i++) ctx.fillRect(rand() * w, rand() * h, 1.5 + rand() * 2, 1.5 + rand() * 2);

    const blob = (x, y, r, fill, wobble = 0.18, points = 9) => {
        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
            const a = i / points * Math.PI * 2, d = r * (1 - wobble / 2 + rand() * wobble);
            i ? ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8) : ctx.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8);
        }
        ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = REV_SCENE_INK; ctx.stroke();
    };

    // Water: a sea along one edge, or a lake/pond, frozen lake or lava river.
    if (look.sea) {
        const side = rand() < 0.5 ? 0 : 1, x0 = side ? w * 0.86 : w * 0.14;
        ctx.beginPath(); ctx.moveTo(side ? w : 0, 0);
        for (let y = 0; y <= h; y += 20) ctx.lineTo(x0 + Math.sin(y / 46) * 10, y);
        ctx.lineTo(side ? w : 0, h); ctx.closePath();
        ctx.fillStyle = '#f4e2b0'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(side ? w : 0, 0);
        for (let y = 0; y <= h; y += 20) ctx.lineTo(x0 + (side ? 16 : -16) + Math.sin(y / 46) * 10, y);
        ctx.lineTo(side ? w : 0, h); ctx.closePath();
        ctx.fillStyle = look.water; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = REV_SCENE_INK; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) { const y = rand() * h, x = side ? w - 12 - rand() * w * 0.08 : 12 + rand() * w * 0.08; ctx.beginPath(); ctx.arc(x, y, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    } else if (look.lava) {
        ctx.lineCap = 'round';
        for (const [width, color] of [[26, REV_SCENE_INK], [20, '#ff6a1f'], [8, '#ffd23a']]) {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
            const x = w * (0.1 + rand() * 0.15);
            ctx.moveTo(x, 0); ctx.bezierCurveTo(x + w * 0.5, h * 0.3, x - w * 0.1, h * 0.6, x + w * 0.4, h);
            ctx.stroke(); rand(); rand();
        }
    } else if (look.water) {
        for (let i = 0; i < 2; i++) {
            const x = rand() < 0.5 ? w * 0.08 + rand() * w * 0.1 : w * 0.82 + rand() * w * 0.1, y = h * (0.2 + rand() * 0.6), r = 26 + rand() * 18;
            blob(x, y, r, look.water, 0.25, 12);
            ctx.fillStyle = look.ice ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.35)';
            ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.35, r * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Theme extras.
    const count = Math.round(w * h / 9000);
    for (let i = 0; i < count; i++) {
        const x = rand() * w, y = rand() * h;
        if (look.extra === 'rocks' && clear(x, y, 14)) blob(x, y, 7 + rand() * 9, rand() < 0.5 ? '#8b8f97' : '#6f737b', 0.35, 7);
        if (look.extra === 'flowers') { ctx.fillStyle = ['#ffffff', '#ffd23a', '#ff7ab8'][i % 3]; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
        if (look.extra === 'leaves') { ctx.fillStyle = look.leaves[i % 3]; ctx.beginPath(); ctx.ellipse(x, y, 4, 2.4, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
        if (look.extra === 'dunes' || look.extra === 'mesas') {
            if (!clear(x, y, 34)) continue;
            if (look.extra === 'mesas') blob(x, y, 20 + rand() * 18, '#b85a2e', 0.2, 8);
            else { ctx.strokeStyle = 'rgba(160,110,40,.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 22, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
        }
        if (look.extra === 'ferns' && clear(x, y, 10)) { ctx.fillStyle = '#1d5a2a'; ctx.beginPath(); ctx.ellipse(x, y, 9, 4, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
        if (look.extra === 'buildings' && clear(x, y, 34)) {
            const bw = 26 + rand() * 30, bh = 22 + rand() * 30;
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 5, y + 6, bw, bh);
            ctx.fillStyle = ['#5a5f7a', '#4a5068', '#6b5a7a'][i % 3]; ctx.fillRect(x, y, bw, bh);
            ctx.lineWidth = 3; ctx.strokeStyle = REV_SCENE_INK; ctx.strokeRect(x, y, bw, bh);
            ctx.fillStyle = ['#ff7ce5', '#38e1ff', '#ffd23a'][i % 3];
            for (let wx = x + 5; wx < x + bw - 5; wx += 8) for (let wy = y + 5; wy < y + bh - 5; wy += 8) if (rand() < 0.45) ctx.fillRect(wx, wy, 3, 3);
        }
    }
    if (look.extra === 'stadium') {
        // Grandstand ring with a crowd, and dirt mounds in the middle.
        ctx.lineWidth = 22; ctx.strokeStyle = '#3b424c'; ctx.strokeRect(11, 11, w - 22, h - 22);
        for (let i = 0; i < (w + h) * 1.4; i++) {
            const t = rand(), edge = Math.floor(rand() * 4), p = edge % 2 ? [edge === 1 ? w - 11 : 11, t * h] : [t * w, edge === 0 ? 11 : h - 11];
            ctx.fillStyle = ['#ffd23a', '#ff3b47', '#38e1ff', '#ffffff', '#00e676'][i % 5]; ctx.fillRect(p[0] - 6 + rand() * 12, p[1] - 6 + rand() * 12, 3, 3);
        }
        ctx.lineWidth = 3; ctx.strokeStyle = REV_SCENE_INK; ctx.strokeRect(22, 22, w - 44, h - 44);
        for (let i = 0; i < 7; i++) { const x = 40 + rand() * (w - 80), y = 40 + rand() * (h - 80); if (clear(x, y, 30)) blob(x, y, 20 + rand() * 14, '#a06a35', 0.2, 10); }
    }

    // Trees (or palms, pines, cacti, dead stumps) in clusters near the edges.
    if (look.tree !== 'none') {
        const trees = Math.round(w * h / 5200);
        for (let i = 0; i < trees; i++) {
            const edgeBias = rand() < 0.65, x = edgeBias ? (rand() < 0.5 ? rand() * w * 0.16 : w - rand() * w * 0.16) : rand() * w, y = rand() * h, r = 10 + rand() * 9;
            if (!clear(x, y, r + 8)) continue;
            revPaintSceneTree(ctx, x, y, r, look, i, rand);
        }
    }

    // Soft vignette so the road and buttons read clearly.
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(4,10,20,.45)');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
}

function revPaintSceneTree(ctx, x, y, r, look, i, rand) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 5, r, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = REV_SCENE_INK;
    if (look.tree === 'pine') {
        for (let layer = 0; layer < 3; layer++) {
            const lr = r * (1 - layer * 0.28);
            ctx.beginPath();
            for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + layer, d = k % 2 ? lr * 0.6 : lr; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
            ctx.closePath(); ctx.fillStyle = look.leaves[layer]; ctx.fill(); if (!layer) ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.24, 0, Math.PI * 2); ctx.fill();
    } else if (look.tree === 'cactus') {
        for (const [dx, dy, cr] of [[0, 0, r * 0.5], [r * 0.5, -r * 0.2, r * 0.3], [-r * 0.45, r * 0.25, r * 0.28]]) {
            ctx.beginPath(); ctx.arc(x + dx, y + dy, cr, 0, Math.PI * 2); ctx.fillStyle = look.leaves[0]; ctx.fill(); ctx.stroke();
        }
    } else if (look.tree === 'dead') {
        ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 3;
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + rand(); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.stroke(); }
        ctx.fillStyle = '#4a4038'; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
    } else if (look.tree === 'palm') {
        for (let k = 0; k < 6; k++) {
            const a = k / 6 * Math.PI * 2 + rand() * 0.4;
            ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.6, r * 0.22, a, 0, Math.PI * 2);
            ctx.fillStyle = look.leaves[k % 3]; ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#8b5a2b'; ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, Math.PI * 2); ctx.fill();
    } else {
        const lobes = Array.from({ length: 5 }, (_, k) => { const a = k / 5 * Math.PI * 2 + i; return [x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * (0.5 + rand() * 0.15)]; });
        lobes.push([x, y, r * 0.6]);
        ctx.fillStyle = REV_SCENE_INK; for (const [lx, ly, lr] of lobes) { ctx.beginPath(); ctx.arc(lx, ly, lr + 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = look.leaves[i % look.leaves.length]; for (const [lx, ly, lr] of lobes) { ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,255,255,.22)'; for (const [lx, ly, lr] of lobes) { ctx.beginPath(); ctx.arc(lx - lr * 0.3, ly - lr * 0.3, lr * 0.4, 0, Math.PI * 2); ctx.fill(); }
    }
}
