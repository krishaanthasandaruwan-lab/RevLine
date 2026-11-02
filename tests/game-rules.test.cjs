const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const scene = require('../driving-scene.js');
const { RevCourse, REV_GROUND_PX_PER_M } = require('../driving-course.js');
const { RevGarage } = require('../garage.js');
const { RevRoadScene, RevRace, REV_LANE_X, REV_DIFFICULTIES, revRaceTime } = scene;
const source = fs.readFileSync(require.resolve('../game.js'), 'utf8');
const routine = name => { const start = source.indexOf('function ' + name + '('); assert(start >= 0, name); return source.slice(start, source.indexOf('\n}', start) + 2); };

// ---------- Contact types ----------
const box = (cx, cy) => RevRoadScene.bounds(cx - 23, cy - 43, 46, 86);
assert.equal(RevRoadScene.contact(box(300, 600), box(300, 520)).kind, 'rear-end', 'Our front into the back of a car ahead');
assert.equal(RevRoadScene.contact(box(300, 600), box(300, 680)).kind, 'from-behind', 'A car running into our back');
assert.equal(RevRoadScene.contact(box(300, 600), box(330, 600)).kind, 'side', 'Side by side');
assert.equal(RevRoadScene.contact(box(300, 600), box(328, 525)).kind, 'side', 'A small corner clip is only a bump');

// ---------- The real game.js collision handling ----------
function game({ vehicle, racing = false, course = null }) {
    const elements = new Map(), element = id => {
        if (!elements.has(id)) elements.set(id, { style: {}, dataset: {}, textContent: '', innerHTML: '', addEventListener() {} });
        return elements.get(id);
    };
    const race = new RevRace(); race.reset(racing, 1000);
    if (racing) { race.started = true; race.distance = 500; race.rivals.forEach((r, i) => { r.distance = 100 + i * 50; }); }
    const state = {
        car: { x: REV_LANE_X(2), y: 580, width: 46, height: 86, speedKmh: 100, worldSpeed: 10 },
        road: new RevRoadScene(), race, enemies: vehicle ? [vehicle] : [], skidMarks: [], impacts: [],
        revCourse: course, REV_LANE_X, roadOffset: 0, sceneryDistance: 0, score: 0, trafficSpawnDistance: 0, trafficEnabled: true, difficulty: 'normal',
        raceEnabled: racing, gear: 3, moveLeft: false, moveRight: false, driftLeft: false, driftRight: false,
        simulationTime: 5000, isGameOver: false, settingsResumeReference: false, skidClock: 0,
        canvas: { width: 540, height: 900 }, roadLeft: 95, roadWidth: 350, laneWidth: 87.5, REV_DIFFICULTIES, RevRoadScene, revRaceTime, Math,
        voiceInput: { mode: 'mic' }, referenceVideo: { pause() {} }, gameStorage: {},
        document: { getElementById: element }, spawnEnemy() {}, renderRaceHUD() {}, updateTestTelemetry() {},
        spawnTireSmoke() {}, clearHeldControls() {}, renderGarage() {}, renderLeaderboard() {}, courseKey: () => 'x',
        revSaveRace() { throw Error('A crash never saves a finish'); }, resetGame() {}, startLoop() {}
    };
    vm.createContext(state);
    vm.runInContext(['playerPose', 'vehiclePose', 'playerPoint', 'bumpVehicle', 'showRunEnd', 'stepDrivingScene'].map(routine).join('\n'), state);
    const kept = state.stepDrivingScene(1 / 60);
    return { state, kept, overlay: element('overlay') };
}
const traffic = (dx, y, speedKmh) => ({ x: REV_LANE_X(2) + dx, y, width: 46, height: 86, speedKmh, lane: 2, color: '#d500f9' });

const rearEnd = game({ vehicle: traffic(0, 510, 60) });
assert.equal(rearEnd.kept, false); assert.equal(rearEnd.state.isGameOver, true);
assert(rearEnd.overlay.innerHTML.includes('<h1>Accident</h1>') && rearEnd.overlay.innerHTML.includes('back of a traffic car'), 'Hitting the back of a car is an accident');

const behind = game({ vehicle: traffic(0, 650, 120) });
assert.equal(behind.kept, true); assert.equal(behind.state.isGameOver, false, 'A car running into us does not end the run');
assert(behind.state.enemies[0].speedKmh < 100 && behind.state.enemies[0].y > 650, 'It slows and drops back');
assert.equal(behind.state.impacts.at(-1).kind, 'from-behind');

const side = game({ vehicle: traffic(30, 580, 90) });
assert.equal(side.kept, true); assert.equal(side.state.isGameOver, false, 'Side contact does not end the run');
assert(Math.abs(side.state.car.speedKmh - 92) < 0.5, 'Side contact costs a little speed');
assert(side.state.car.x < REV_LANE_X(2), 'Side contact pushes the cars apart');
assert.equal(side.state.impacts.at(-1).kind, 'side');

const outOfRace = game({ vehicle: traffic(0, 510, 60), racing: true });
const table = outOfRace.overlay.innerHTML;
assert(table.indexOf('>You<') > table.indexOf('>Apex<') && table.indexOf('>You<') > table.indexOf('>Nova<'), 'A driver who is out ranks last');
assert(table.includes('Out · '), 'The table marks the driver as out');

// ---------- Steering levels ----------
function steer(assist, { steerFor = 0, seconds = 1.5, curved = false, speed = 120, drift = 0 } = {}) {
    const road = new RevRoadScene(); road.assist = assist; road.curved = curved;
    const car = { x: REV_LANE_X(1), y: 580, width: 46, height: 86, speedKmh: speed };
    let maxYaw = 0;
    for (let t = 0; t < seconds; t += 1 / 60) {
        road.distance += 15;
        road.step(car, t < steerFor ? 1 : 0, drift, 1 / 60);
        maxYaw = Math.max(maxYaw, Math.abs(road.yaw));
    }
    return { car, road, maxYaw };
}
assert(Math.abs(steer('easy', { steerFor: 0.05 }).car.x - REV_LANE_X(2)) < 1, 'Easy: a tap moves exactly one lane');
assert(Math.abs(steer('easy', { steerFor: 1 }).car.x - REV_LANE_X(2)) < 1, 'Easy: holding still moves one lane per press');
const curvedEasy = steer('easy', { curved: true, seconds: 3 }), curvedNormal = steer('normal', { curved: true, seconds: 3 });
assert(Math.abs(curvedEasy.car.x - REV_LANE_X(1)) < 1, 'Easy: curves steer themselves, the car keeps its lane');
assert(Math.abs(curvedNormal.car.x - REV_LANE_X(1)) < 1, 'Normal: curves steer themselves');
const curvedHard = steer('hard', { curved: true, seconds: 3 });
assert(Math.abs(curvedHard.car.x - REV_LANE_X(1)) > 5, 'Hard: the driver must steer the curves');
assert(curvedHard.car.speedKmh < 120, 'Hard: bends cost speed');
assert(steer('hard', { steerFor: 0.3 }).car.x - REV_LANE_X(1) < steer('normal', { steerFor: 0.3 }).car.x - REV_LANE_X(1), 'Hard: slower steering');
assert(steer('normal', { drift: 1, seconds: 1 }).maxYaw > 0.45, 'Drift rotates the car further');

// ---------- Career course features ----------
// A hill needs a low gear: in 5th the car bogs down, in 2nd it climbs.
const climb = gear => {
    const course = new RevCourse({ hills: [{ from: 0, to: 500, maxGear: 2 }] }), car = { speedKmh: 80 }, road = { lateralVelocity: 0 };
    for (let t = 0; t < 2; t += 1 / 60) course.apply({ car, road, gear, metres: 100, dt: 1 / 60 });
    return { speed: car.speedKmh, lugging: course.lugging };
};
assert(climb(5).speed <= 22 && climb(5).lugging, 'Too high a gear bogs down on a hill');
assert(climb(2).speed > 60 && !climb(2).lugging, 'A low gear climbs the hill');
// An obstacle in our lane costs speed once, with sparks, and never ends the run.
const barrelRun = game({ racing: true, course: new RevCourse({ obstacles: [{ at: 500 + 4 / REV_GROUND_PX_PER_M, lane: 2, kind: 'barrel' }] }) });
assert.equal(barrelRun.state.isGameOver, false, 'Obstacles never end the run');
assert(barrelRun.state.car.speedKmh <= 100 - 18 + 0.5 && barrelRun.state.impacts.at(-1)?.kind === 'obstacle', 'A barrel costs speed and throws sparks');
// Mud drags while you are in it; it is driven through, not bounced off.
const mud = new RevCourse({ obstacles: [{ at: 100, lane: 2, kind: 'mud' }] }), mudCar = { speedKmh: 90 };
const [entry] = mud.obstaclesNear(100, 580, () => 0, REV_LANE_X);
assert.equal(mud.hit(entry, mudCar, 0.5), false); assert(mudCar.speedKmh < 90, 'Mud drags');
// Curve strength scales the one road shape that drawing and collisions share.
const gentle = new RevRoadScene(), sharp = new RevRoadScene();
gentle.curved = sharp.curved = true; gentle.curveScale = 0.6; sharp.curveScale = 1.2; gentle.distance = sharp.distance = 900;
assert(Math.abs(Math.abs(sharp.offsetAt(300)) / Math.abs(gentle.offsetAt(300)) - 2) < 1e-9, 'Curve strength scales the road');

// ---------- Coins ----------
const wallet = { data: {}, getItem(k) { return this.data[k] || null; }, setItem(k, v) { this.data[k] = v; } };
const coins = new RevGarage(wallet);
assert.equal(coins.earn(300), ''); assert.equal(coins.state.credits, 800);
assert.equal(coins.spend(1000), 'Not enough coins.'); assert.equal(coins.spend(250), ''); assert.equal(new RevGarage(wallet).state.credits, 550);
assert(coins.earn(-5) && coins.earn(1.5), 'Only whole positive amounts are earned');

console.log('Game rules passed: rear-end accidents, side and from-behind bumps, crashed driver ranked last, easy/normal/hard steering, drift rotation, hills, obstacles, mud, curve strength and coins.');
