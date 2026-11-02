const REV_DIFFICULTIES = {
    easy: { trafficSpacing: 110, rivalPace: 0.9 },
    normal: { trafficSpacing: 85, rivalPace: 1 },
    hard: { trafficSpacing: 60, rivalPace: 1.08 }
};

const REV_STEERING = ['easy', 'normal', 'hard'];
const REV_LANE_X = lane => 95 + lane * 87.5 + (87.5 - 46) / 2;

// Shared road geometry for paint, vehicles, steering, scenery and collision bounds.
// Steering assist: easy = curves steer themselves and a press moves one whole lane;
// normal = curves steer themselves, free steering; hard = the driver steers curves
// (outward force, cornering drag) with slower steering. The class default is the original
// hard behaviour; the game selects the player's level.
class RevRoadScene {
    constructor() { this.curved = false; this.assist = 'hard'; this.curveScale = 1; this.reset(); }
    reset() {
        this.distance = 0; this.lateralVelocity = 0; this.yaw = 0; this.drifting = false; this.offRoad = false;
        this.targetLane = null; this.lastSteer = 0; this.clock = 0; this.laneRequestedAt = -1;
    }
    nearestLane(x) { return Math.max(0, Math.min(3, Math.round((x - REV_LANE_X(0)) / 87.5))); }
    // Easy steering: one press, one lane. Repeats within 0.15 s (a tap's click) are ignored.
    requestLane(car, direction) {
        if (this.clock - this.laneRequestedAt < 0.15) return;
        this.laneRequestedAt = this.clock;
        const from = this.targetLane ?? this.nearestLane(car.x);
        this.targetLane = Math.max(0, Math.min(3, from + Math.sign(direction)));
    }
    offsetAt(y) {
        if (!this.curved) return 0;
        const world = this.distance * 0.45 - y + 760;
        // curveScale: gentler (< 1) or sharper (> 1) bends per career map; 1 = the original road.
        return (56 * Math.sin(world / 400) + 18 * Math.sin(world / 200)) * this.curveScale;
    }
    headingAt(y) { return -Math.atan((this.offsetAt(y + 4) - this.offsetAt(y - 4)) / 8); }
    bendAt(y) { return (this.offsetAt(y + 24) - 2 * this.offsetAt(y) + this.offsetAt(y - 24)) / (24 * 24); }
    step(car, steer, drift, dt, roadLeft = 95, roadWidth = 350, canvasWidth = 540) {
        const y = car.y + car.height / 2, assist = REV_STEERING.includes(this.assist) ? this.assist : 'hard';
        this.clock += dt;
        this.drifting = drift !== 0 && car.speedKmh >= 25;
        const target = this.drifting ? drift * 140 : 0;
        this.lateralVelocity += (target - this.lateralVelocity) * (1 - Math.exp(-dt / (this.drifting ? 0.22 : 0.3)));
        if (assist === 'hard') {
            const bend = this.bendAt(y);
            this.lateralVelocity -= bend * car.speedKmh ** 2 * 18 * dt;
            // Sharp bends cost speed when the driver steers them, so the gearbox may drop a gear there.
            car.speedKmh = Math.max(0, car.speedKmh - Math.abs(bend) * car.speedKmh ** 2 * 0.6 * dt);
        }
        if (assist === 'easy' && !this.drifting) {
            if (steer !== 0 && this.lastSteer === 0) this.requestLane(car, steer);
            if (this.targetLane === null) this.targetLane = this.nearestLane(car.x);
            const gap = REV_LANE_X(this.targetLane) - car.x;
            car.x += Math.max(-420 * dt, Math.min(420 * dt, gap));
        } else {
            if (this.drifting) this.targetLane = null;
            car.x += steer * (assist === 'hard' ? 200 : 312) * dt;
        }
        this.lastSteer = steer;
        car.x += this.lateralVelocity * dt;
        const desiredYaw = this.drifting ? drift * 0.55 + steer * 0.1 : steer * (this.targetLane !== null && assist === 'easy' ? 0 : 0.055)
            + (assist === 'easy' && this.targetLane !== null ? Math.max(-0.12, Math.min(0.12, (REV_LANE_X(this.targetLane) - car.x) / 400)) : 0);
        this.yaw += (desiredYaw - this.yaw) * (1 - Math.exp(-dt / 0.16));
        const edgeAllowance = this.curved || this.drifting ? 18 : -6;
        const offset = this.offsetAt(y);
        car.x = Math.max(Math.max(4 - offset, roadLeft - edgeAllowance),
            Math.min(Math.min(canvasWidth - car.width - 4 - offset, roadLeft + roadWidth - car.width + edgeAllowance), car.x));
        this.offRoad = car.x < roadLeft || car.x + car.width > roadLeft + roadWidth;
        if (this.drifting) car.speedKmh = Math.max(0, car.speedKmh - car.speedKmh * 0.018 * dt);
        if (this.offRoad) car.speedKmh = Math.max(0, car.speedKmh - 18 * dt);
    }
    static bounds(x, y, width, height, angle = 0) {
        const halfWidth = Math.abs(Math.cos(angle)) * (width / 2 - 6) + Math.abs(Math.sin(angle)) * (height / 2 - 6);
        const halfHeight = Math.abs(Math.sin(angle)) * (width / 2 - 6) + Math.abs(Math.cos(angle)) * (height / 2 - 6);
        return { left: x + width / 2 - halfWidth, right: x + width / 2 + halfWidth,
            top: y + height / 2 - halfHeight, bottom: y + height / 2 + halfHeight };
    }
    static overlaps(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
    // How two overlapping cars touch. Only our front into the back of a car ahead is an accident;
    // a car running into us from behind, or any side contact, is a bump.
    static contact(player, other) {
        const overlapX = Math.min(player.right, other.right) - Math.max(player.left, other.left);
        const overlapY = Math.min(player.bottom, other.bottom) - Math.max(player.top, other.top);
        if (overlapX <= overlapY || overlapX < 10) return { kind: 'side', overlapX, overlapY };
        const ahead = (other.top + other.bottom) / 2 < (player.top + player.bottom) / 2;
        return { kind: ahead ? 'rear-end' : 'from-behind', overlapX, overlapY };
    }
}

class RevRace {
    constructor() { this.reset(false, 1000); }
    reset(enabled, distance) {
        this.enabled = enabled; this.length = distance; this.started = false; this.finished = false;
        this.time = 0; this.distance = 0; this.finishTime = null;
        this.rivals = [
            { name: 'Nova', color: '#65d5e0', lane: 0, pace: 151, acceleration: 9.8 },
            { name: 'Blaze', color: '#ff9e52', lane: 1, pace: 159, acceleration: 10.5 },
            { name: 'Apex', color: '#d8b4fe', lane: 3, pace: 166, acceleration: 11.3 }
        ].map((r, i) => ({ ...r, distance: 8 + i * 8, speedKmh: 0, finishTime: null, blockedSpeed: null,
            x: 95 + r.lane * 87.5 + (87.5 - 46) / 2, y: 0, width: 46, height: 86 }));
    }
    update(dt, playerSpeed, engaged, bend = 0) {
        if (!this.enabled || this.finished) return false;
        if (!this.started && engaged && playerSpeed > 1) this.started = true;
        if (!this.started) return false;
        const velocity = Math.max(0, playerSpeed) / 3.6;
        const step = velocity > 0 ? Math.min(dt, (this.length - this.distance) / velocity) : dt;
        for (const [i, rival] of this.rivals.entries()) {
            // Multiplayer: another player's car; the network sets its distance, speed and finish.
            if (rival.remote) continue;
            if (rival.finishTime !== null) { rival.distance += rival.speedKmh / 3.6 * step; continue; }
            let target = rival.pace + Math.sin(this.time / 8 + i) * 5 - Math.min(16, Math.abs(bend) * 40000);
            if (rival.blockedSpeed !== null) target = Math.min(target, rival.blockedSpeed);
            rival.speedKmh += Math.max(-16 * step, Math.min(rival.acceleration * step, target - rival.speedKmh));
            const travel = rival.speedKmh / 3.6 * step;
            if (rival.distance + travel >= this.length) rival.finishTime = this.time + (this.length - rival.distance) / (rival.speedKmh / 3.6);
            rival.distance = Math.min(this.length, rival.distance + travel);
        }
        this.distance = Math.min(this.length, this.distance + velocity * step);
        this.time += step;
        if (this.distance >= this.length - 1e-6) {
            this.distance = this.length; this.finishTime = this.time; this.finished = true; return true;
        }
        return false;
    }
    standings() {
        return [{ name: 'You', distance: this.distance, finishTime: this.finishTime, player: true }, ...this.rivals]
            .sort((a, b) => (a.finishTime !== null && b.finishTime !== null ? a.finishTime - b.finishTime
                : a.finishTime !== null ? -1 : b.finishTime !== null ? 1 : b.distance - a.distance));
    }
    get position() { return this.standings().findIndex(r => r.player) + 1; }
}

function revRaceTime(seconds) {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
function revReadLeaderboard(storage) {
    try {
        const rows = JSON.parse(storage.getItem('revline-races-v1') || '[]');
        return Array.isArray(rows) ? rows.filter(r => r && /^[01]:[01]:(1000|3000|5000)(\|(easy|normal|hard)\|[01]\|[a-z0-9]{1,16}:[a-z0-9]{1,16}:(off|street))?$/.test(r.course)
            && Number.isFinite(r.time) && r.time > 0 && r.time < 86400 && Number.isFinite(r.score)
            && r.score >= 0 && Number.isInteger(r.place) && r.place >= 1 && r.place <= 4).slice(-50) : [];
    } catch { return []; }
}
function revSaveRace(storage, entry) {
    const rows = [...revReadLeaderboard(storage), entry].slice(-50);
    try { storage.setItem('revline-races-v1', JSON.stringify(rows)); return true; } catch { return false; }
}
if (typeof module !== 'undefined') module.exports = { REV_DIFFICULTIES, REV_STEERING, REV_LANE_X, RevRoadScene, RevRace, revRaceTime, revReadLeaderboard, revSaveRace };
