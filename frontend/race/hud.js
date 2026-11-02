// Race HUD: reference-style panels, shift lights, gauge, minimap and status banner.
// Display only. Every value comes from the backend state passed to update().
const REV_GAUGE_START = Math.PI * .75, REV_GAUGE_SWEEP = Math.PI * 1.5;
// Gauge zones follow the backend timing grades: shift window from 7k, Perfect 8.5–9.5k, Late above.
const REV_RPM_ZONES = [[0, 7, '#2f8cff'], [7, 8.5, '#ffd54a'], [8.5, 9.5, '#00e676'], [9.5, 10, '#ff5a5a']];

class RevRaceHud {
    constructor() {
        this.el = id => document.getElementById(id);
        this.text = new Map();
        this.gauge = this.setupCanvas(this.el('hud-gauge'), 176, 176);
        this.map = this.setupCanvas(this.el('hud-map'), 140, 140);
        this.lamps = [...document.querySelectorAll('#hud-lights .lamp')];
        this.rivalsClock = 0;
        this.pulse = 0;
    }

    setupCanvas(canvas, width, height) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = width * dpr; canvas.height = height * dpr;
        const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
        return { canvas, ctx, width, height };
    }

    set(id, value) {
        if (this.text.get(id) === value) return;
        this.text.set(id, value); this.el(id).textContent = value;
    }

    update(s, frameDt) {
        this.pulse += frameDt;
        if (s.driftPoints !== null && s.driftPoints !== undefined) {
            this.set('hud-a-label', 'DRIFT'); this.set('hud-a', String(Math.round(s.driftPoints)));
            this.set('hud-b-label', 'KM'); this.set('hud-b', `${(s.race.distance / 1000).toFixed(2)} / ${(s.race.length / 1000).toFixed(0)}`);
        } else if (s.racing) {
            this.set('hud-a-label', 'POS'); this.set('hud-a', `${s.race.position} / 4`);
            this.set('hud-b-label', 'KM'); this.set('hud-b', `${(s.race.distance / 1000).toFixed(2)} / ${(s.race.length / 1000).toFixed(0)}`);
        } else {
            this.set('hud-a-label', 'GEAR'); this.set('hud-a', s.gear ? String(s.gear) : 'N');
            this.set('hud-b-label', 'ODO'); this.set('hud-b', `${(s.odometer / 1000).toFixed(2)} km`);
        }
        this.set('hud-score', Math.floor(s.score).toLocaleString('en-US'));
        this.set('hud-time', this.formatTime(s.time));
        this.updateLights(s);
        this.updateBanner(s);
        this.rivalsClock -= frameDt;
        if (this.rivalsClock <= 0) { this.rivalsClock = .2; this.updateRivals(s); }
        this.drawGauge(s);
        this.drawCourseMap(s);
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
    }

    updateLights(s) {
        const lit = s.gear > 0 ? Math.max(0, Math.min(5, Math.floor((s.rpm - 6.8) / .45))) : 0;
        this.lamps.forEach((lamp, i) => { const on = String(i < lit); if (lamp.dataset.on !== on) lamp.dataset.on = on; });
        const chevrons = this.el('hud-chevrons');
        const grade = !s.shiftReady ? 'off' : s.rpm > 9.5 ? 'late' : s.rpm >= 8.5 ? 'perfect' : 'early';
        if (chevrons.dataset.grade !== grade) chevrons.dataset.grade = grade;
    }

    updateBanner(s) {
        let message = '', tone = '';
        if (s.gameOver) message = '';
        else if (!s.manual && s.inputMode === 'none' && s.running) { message = 'NO SOUND INPUT · OPEN SETTINGS'; tone = 'warn'; }
        else if (s.redlineTime > .35) { message = `ENGINE OVERHEAT ${Math.max(0, 3 - s.redlineTime).toFixed(1)}s · SHIFT!`; tone = 'danger'; }
        else if (s.hillGear) { message = `HILL! SHIFT DOWN TO GEAR ${s.hillGear}`; tone = 'danger'; }
        else if (s.limiting) { message = 'REV LIMITER · SHIFT UP!'; tone = 'danger'; }
        else if (s.running && s.gear === 0 && s.speed < 1) { message = s.manual ? 'HOLD CLUTCH + TAP ▲ FOR 1ST' : 'TAP N ↔ D TO DRIVE'; tone = 'info'; }
        else if (s.offRoad) { message = 'OFF TRACK!'; tone = 'warn'; }
        else if (s.drifting) { message = 'DRIFT!'; tone = 'drift'; }
        const banner = this.el('hud-banner');
        if (banner.dataset.tone !== tone) banner.dataset.tone = tone;
        this.set('hud-banner', message);
        banner.hidden = !message;
    }

    updateRivals(s) {
        const list = this.el('hud-rivals');
        list.hidden = !s.racing;
        if (!s.racing) return;
        const standings = s.race.standings();
        const signature = standings.map(r => `${r.name}:${Math.round(r.distance - s.race.distance)}`).join('|');
        if (list.dataset.signature === signature) return;
        list.dataset.signature = signature;
        list.replaceChildren(...standings.map((row, i) => {
            const item = document.createElement('li');
            if (row.player) item.className = 'is-player';
            const place = document.createElement('b'); place.textContent = String(i + 1);
            const swatch = document.createElement('i'); swatch.style.background = row.player ? s.playerColor : row.color;
            const name = document.createElement('span'); name.textContent = row.player ? 'YOU' : row.name.toUpperCase();
            const gap = document.createElement('small');
            const meters = Math.round(row.distance - s.race.distance);
            gap.textContent = row.player ? '' : `${meters >= 0 ? '+' : '−'}${Math.abs(meters)}m`;
            item.append(place, swatch, name, gap);
            return item;
        }));
    }

    drawGauge(s) {
        const { ctx } = this.gauge, cx = 88, cy = 90, ring = 64;
        const angle = rpm => REV_GAUGE_START + Math.max(0, Math.min(10, rpm)) / 10 * REV_GAUGE_SWEEP;
        ctx.clearRect(0, 0, 176, 176);
        const skin = s.skin || { face: ['#24406e', '#0b1426'], ring: REV_INK, text: '#c9d4e6', needle: '#ff3b47' };
        ctx.fillStyle = skin.ring; ctx.beginPath(); ctx.arc(cx, cy, 85, 0, Math.PI * 2); ctx.fill();
        const face = ctx.createRadialGradient(cx, cy - 20, 8, cx, cy, 80);
        face.addColorStop(0, skin.face[0]); face.addColorStop(1, skin.face[1]);
        ctx.fillStyle = face; ctx.beginPath(); ctx.arc(cx, cy, 79, 0, Math.PI * 2); ctx.fill();
        if (s.limiting) {
            ctx.strokeStyle = `rgba(255,70,80,${.5 + Math.sin(this.pulse * 20) * .4})`; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, cy, 81, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        for (const [from, to, color] of REV_RPM_ZONES) {
            ctx.strokeStyle = color; ctx.globalAlpha = .22; ctx.lineWidth = 12;
            ctx.beginPath(); ctx.arc(cx, cy, ring, angle(from), angle(to)); ctx.stroke();
            if (s.rpm > from) {
                ctx.globalAlpha = 1;
                ctx.beginPath(); ctx.arc(cx, cy, ring, angle(from), angle(Math.min(to, s.rpm))); ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'italic 600 15px Teko, "Arial Narrow", sans-serif';
        for (let n = 0; n <= 10; n++) {
            const a = angle(n);
            ctx.strokeStyle = n >= 9.5 ? '#ff5a5a' : '#dfe6f2'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 54, cy + Math.sin(a) * 54); ctx.lineTo(cx + Math.cos(a) * 49, cy + Math.sin(a) * 49); ctx.stroke();
            ctx.fillStyle = n >= 9 ? '#ff8a8a' : skin.text;
            ctx.fillText(String(n), cx + Math.cos(a) * 41, cy + Math.sin(a) * 41 + 1);
        }
        // Voice level lives in the gap at the bottom of the dial, like the reference's NITRO arc.
        ctx.lineCap = 'round'; ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(0,230,118,.2)';
        ctx.beginPath(); ctx.arc(cx, cy, ring, Math.PI * .69, Math.PI * .31, true); ctx.stroke();
        if (s.voice > .01) {
            ctx.strokeStyle = '#00e676';
            ctx.beginPath(); ctx.arc(cx, cy, ring, Math.PI * .69, Math.PI * .69 - Math.PI * .38 * Math.min(1, s.voice), true); ctx.stroke();
        }
        ctx.font = '9px "Lilita One", sans-serif'; ctx.fillStyle = '#00e676'; ctx.fillText('VOICE', cx, cy + 80);

        const needle = angle(s.rpm + (s.limiting && !s.reducedMotion ? Math.sin(this.pulse * 45) * .18 : 0));
        ctx.lineCap = 'round';
        for (const [width, color] of [[6, REV_INK], [3, skin.needle]]) {
            ctx.strokeStyle = color; ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(cx - Math.cos(needle) * 8, cy - Math.sin(needle) * 8);
            ctx.lineTo(cx + Math.cos(needle) * 60, cy + Math.sin(needle) * 60); ctx.stroke();
        }
        ctx.fillStyle = '#2b3446'; ctx.strokeStyle = REV_INK; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

        ctx.font = 'italic 600 46px Teko, "Arial Narrow", sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = REV_INK; ctx.lineJoin = 'round';
        const speed = String(Math.round(s.speed));
        ctx.strokeText(speed, cx, cy + 27); ctx.fillStyle = '#ffffff'; ctx.fillText(speed, cx, cy + 27);
        ctx.font = 'italic 600 14px Teko, "Arial Narrow", sans-serif'; ctx.fillStyle = '#a9b6ca';
        ctx.fillText('KM/H', cx, cy + 50);
        const gear = s.gear ? String(s.gear) : 'N';
        ctx.fillStyle = s.gear ? '#ffc928' : '#c9d4e6';
        ctx.beginPath(); ctx.roundRect(cx - 14, cy - 39, 28, 24, 7); ctx.fill(); ctx.stroke();
        ctx.font = '19px "Lilita One", sans-serif'; ctx.fillStyle = REV_INK; ctx.fillText(gear, cx, cy - 26);

        const label = `Estimated ${Math.round(s.rpm * 1000)} RPM, ${Math.round(s.speed)} km/h, gear ${gear}${s.limiting ? ', rev limiter active' : ''}`;
        if (this.gauge.canvas.getAttribute('aria-label') !== label) this.gauge.canvas.setAttribute('aria-label', label);
    }

    // Whole-course map, fixed for the run. The route is drawn as one circuit loop (the loop
    // itself is for display); every left/right wiggle is a real bend of the road at that
    // distance, with tyre walls on the outside, so the map matches the track.
    courseShape(s) {
        const key = `${Math.round(s.mapLength)}|${s.curved}`;
        if (this.shape?.key === key) return this.shape;
        const length = s.mapLength, step = 2, count = Math.ceil(length / step), lean = 3.2;
        const forward = metres => metres * s.groundPxPerMetre;
        const points = [];
        let x = 0, y = 0;
        for (let i = 0; i <= count; i++) {
            const m = i * step;
            const slope = (s.courseOffset(m + 1) - s.courseOffset(m - 1)) / (forward(2));
            const theta = 2 * Math.PI * m / length + Math.atan(slope) * lean;
            points.push({ x, y, theta });
            x += Math.sin(theta) * step; y -= Math.cos(theta) * step;
        }
        const gapX = points[count].x - points[0].x, gapY = points[count].y - points[0].y;
        points.forEach((p, i) => { p.x -= gapX * i / count; p.y -= gapY * i / count; });
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const { width: W, height: H } = this.map, pad = 14;
        const scale = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxY - minY || 1));
        for (const p of points) { p.x = W / 2 + (p.x - (minX + maxX) / 2) * scale; p.y = H / 2 + (p.y - (minY + maxY) / 2) * scale; }
        const tyres = [];
        const bendStep = 24 / s.groundPxPerMetre;
        for (let i = 0; i <= count; i += 3) {
            const m = i * step;
            const bend = (s.courseOffset(m - bendStep) - 2 * s.courseOffset(m) + s.courseOffset(m + bendStep)) / 576;
            if (Math.abs(bend) * 55000 < 12) continue;
            const side = bend > 0 ? -1 : 1, { x: px, y: py, theta } = points[i];   // backend pushes cars left when bend > 0
            tyres.push([px + Math.cos(theta) * side * 6.5, py + Math.sin(theta) * side * 6.5]);
        }
        return (this.shape = { key, points, step, count, tyres });
    }

    drawCourseMap(s) {
        const { ctx, width: W, height: H } = this.map, shape = this.courseShape(s);
        const at = metres => {
            const index = Math.max(0, Math.min(shape.count, metres / shape.step));
            const a = shape.points[Math.floor(index)], b = shape.points[Math.min(shape.count, Math.floor(index) + 1)], t = index % 1;
            return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.theta];
        };
        ctx.clearRect(0, 0, W, H);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        shape.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        for (const [width, color] of [[10, REV_INK], [7.5, '#e8372f'], [5, '#4a505b']]) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
        ctx.fillStyle = '#111';
        for (const [x, y] of shape.tyres) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
        // Start / finish line.
        const [sx, sy, theta] = at(0);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(theta);
        for (let i = 0; i < 8; i++) { ctx.fillStyle = (i + Math.floor(i / 4)) % 2 ? '#fff' : '#11151b'; ctx.fillRect(-8 + (i % 4) * 4, -4 + Math.floor(i / 4) * 4, 4, 4); }
        ctx.restore();
        const dot = (metres, color, radius) => {
            const [x, y] = at(metres);
            ctx.fillStyle = color; ctx.strokeStyle = REV_INK; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            return [x, y];
        };
        if (s.racing) for (const rival of s.race.rivals) dot(Math.min(s.race.length, rival.distance), rival.color, 3.6);
        const metres = s.racing ? Math.min(s.mapLength, s.playerMetres) : ((s.playerMetres % s.mapLength) + s.mapLength) % s.mapLength;
        const [px, py] = dot(metres, s.playerColor, 5);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, 7.5 + Math.sin(this.pulse * 6) * 1.2, 0, Math.PI * 2); ctx.stroke();
    }
}
