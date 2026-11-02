const assert = require('node:assert/strict');
const { RevRoadScene, RevRace, revReadLeaderboard, revSaveRace, revRaceTime } = require('../driving-scene.js');

const road = new RevRoadScene();
assert.equal(road.offsetAt(300), 0, 'Plain mode stays straight');
road.curved = true;
for (let distance = 0; distance < 9000; distance += 173) {
    road.distance = distance;
    for (let y = -100; y <= 1000; y += 17) {
        assert.ok(Math.abs(road.offsetAt(y)) <= 74, 'The full road stays inside the canvas');
        assert.ok(Math.abs(road.headingAt(y)) < 0.27, 'Curves have continuous drivable headings');
    }
}
for (const fps of [30, 60, 120]) {
    const scene = new RevRoadScene();
    const car = { x: 280, y: 580, width: 46, height: 86, speedKmh: 150 };
    scene.step(car, 0, 0, 1 / fps);
    assert.equal(car.x, 280, 'Plain mode must not add lateral force');
    assert.equal(car.speedKmh, 150, 'Plain mode keeps the approved speed response');
    for (let i = 0; i < fps * 0.4; i++) scene.step(car, 0, -1, 1 / fps);
    assert.ok(car.x < 265 && scene.yaw < -0.2 && scene.drifting, 'Holding left drift slides and rotates the car');
    assert.ok(car.speedKmh < 150, 'A drift has a small traction cost');
    const velocity = scene.lateralVelocity;
    scene.step(car, 0, 0, 1 / fps);
    assert.ok(scene.lateralVelocity > velocity && scene.lateralVelocity < 0, 'Releasing drift smoothly restores grip');
    car.speedKmh = 10; scene.reset(); scene.step(car, 0, 1, 1 / fps);
    assert.equal(scene.drifting, false, 'Low-speed input does not generate a fake drift');

    for (const speed of [120, 160]) {
        const race = new RevRace(); race.reset(true, 5000);
        race.update(1, 0, false);
        assert.equal(race.time, 0, 'Opponents wait for the player to launch');
        assert.equal(race.rivals.length, 3);
        while (!race.finished && race.time < 200) race.update(1 / fps, speed, true);
        assert.equal(race.finished, true);
        assert.ok(Math.abs(race.time - 5000 / (speed / 3.6)) < 0.001, 'Finish uses actual distance and fractional-frame time');
        assert.equal(race.distance, 5000);
        assert.equal(race.position, speed === 120 ? 4 : 1, 'Results use opponent progress rather than a scripted win');
        if (speed === 120) assert.ok(race.rivals.every(r => r.distance > race.length), 'Finished opponents keep driving clear of the finish line');
        const time = race.time; race.update(2, 200, true);
        assert.equal(race.time, time, 'Finished results are immutable');
    }
}
const corner = new RevRoadScene(); corner.curved = true;
const cornerCar = { x: 260, y: 580, width: 46, height: 86, speedKmh: 140 };
const bend = corner.bendAt(cornerCar.y + cornerCar.height / 2);
corner.step(cornerCar, 0, 0, 0.05);
assert.ok(corner.lateralVelocity * bend < 0, 'Cornering inertia pushes outward, opposite the curve center');
const a = RevRoadScene.bounds(100, 100, 46, 86, 0.3);
assert.ok(RevRoadScene.overlaps(a, RevRoadScene.bounds(120, 130, 46, 86)), 'Collision uses the rotated painted vehicle bounds');
assert.equal(RevRoadScene.overlaps(a, RevRoadScene.bounds(250, 130, 46, 86)), false);

let stored = '';
const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
const entry = { course: '1:1:5000', time: 150, score: 7123, place: 2 };
assert.equal(revSaveRace(storage, entry), true);
assert.deepEqual(revReadLeaderboard(storage), [entry], 'Race results survive a fresh leaderboard read');
stored = JSON.stringify([entry, { course: '<script>', time: 'bad' }, null]);
assert.deepEqual(revReadLeaderboard(storage), [entry], 'Malformed saved results are ignored');
assert.equal(revSaveRace({ getItem: () => '[]', setItem: () => { throw Error('full'); } }, entry), false);
assert.equal(revRaceTime(125.3), '2:05.3');
console.log('Scene/race checks passed: road bounds, drift/grip, real-distance rivals, finish ranking, collision and local results.');
