// Course features for career maps: hills that need a low gear, obstacles on the track and the
// surface's grip. A race without a course (revCourse = null in game.js) is unchanged.
// Positions are race metres on the fixed ground map: 18.75 px per metre, the scale the
// renderer draws the road with, so what you see is what you hit.
const REV_GROUND_PX_PER_M = 20 / 197 * 1.9 * 60 * 3.6 * 0.45;
const REV_SURFACES = {
    tarmac: { grip: 1, drag: 0 },
    gravel: { grip: 0.8, drag: 5 },
    dirt: { grip: 0.75, drag: 7 },
    sand: { grip: 0.7, drag: 9 },
    snow: { grip: 0.6, drag: 4 }
};
// Size (world px) and what a hit costs. Mud is driven through, not bounced off.
const REV_OBSTACLES = {
    cone: { width: 18, height: 18, slow: 10 },
    barrel: { width: 26, height: 26, slow: 18 },
    rock: { width: 34, height: 30, slow: 26 },
    mud: { width: 64, height: 46, slow: 0, drag: 40 }
};

class RevCourse {
    constructor({ surface = 'tarmac', hills = [], obstacles = [] } = {}) {
        this.surface = Object.hasOwn(REV_SURFACES, surface) ? surface : 'tarmac';
        this.hills = hills.map(h => ({ from: h.from, to: h.to, maxGear: h.maxGear }));
        this.obstacles = obstacles.filter(o => Object.hasOwn(REV_OBSTACLES, o.kind)).map(o => ({ at: o.at, lane: o.lane, kind: o.kind }));
        this.reset();
    }

    reset() { this.hill = null; this.lugging = false; for (const o of this.obstacles) o.hit = false; }

    hillAt(metres) { return this.hills.find(h => metres >= h.from && metres <= h.to) || null; }

    // Called by game.js after steering, each simulated frame.
    apply({ car, road, gear, metres, dt }) {
        const surface = REV_SURFACES[this.surface];
        if (surface.drag) car.speedKmh = Math.max(0, car.speedKmh - surface.drag * dt * car.speedKmh / 100);
        if (surface.grip < 1 && car.speedKmh > 20) {
            // Loose surfaces let the car wander; steering has to keep catching it.
            road.lateralVelocity += Math.sin(metres / 7) * (1 - surface.grip) * 160 * dt * car.speedKmh / 100;
        }
        this.hill = this.hillAt(metres);
        // A hill climb needs a low gear: above it the engine bogs down to a crawl.
        this.lugging = Boolean(this.hill && gear > this.hill.maxGear);
        if (this.lugging) car.speedKmh = Math.max(Math.min(car.speedKmh, 22), car.speedKmh - 70 * dt);
        else if (this.hill) car.speedKmh = Math.max(0, car.speedKmh - 6 * dt);
    }

    // Obstacles near the car, in world px. carFront is the car's front edge (car.y).
    obstaclesNear(metres, carFront, offsetAt, laneX) {
        return this.obstacles.filter(o => Math.abs(o.at - metres) < 70).map(o => {
            const size = REV_OBSTACLES[o.kind], y = carFront - (o.at - metres) * REV_GROUND_PX_PER_M - size.height / 2;
            const x = laneX(o.lane) + 23 - size.width / 2 + offsetAt(y + size.height / 2);
            return { obstacle: o, kind: o.kind, x, y, width: size.width, height: size.height,
                bounds: { left: x, right: x + size.width, top: y, bottom: y + size.height } };
        });
    }

    // What a contact does: mud drags while you are in it; anything else is hit once.
    hit(entry, car, dt) {
        const size = REV_OBSTACLES[entry.kind];
        if (size.drag) { car.speedKmh = Math.max(0, car.speedKmh - size.drag * dt); return false; }
        if (entry.obstacle.hit) return false;
        entry.obstacle.hit = true;
        car.speedKmh = Math.max(0, car.speedKmh - size.slow);
        return true;
    }
}

if (typeof module !== 'undefined') module.exports = { REV_GROUND_PX_PER_M, REV_SURFACES, REV_OBSTACLES, RevCourse };
