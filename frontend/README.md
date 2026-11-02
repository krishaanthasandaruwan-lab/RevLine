# RevLine frontend

A new game UI in its own folder. It **adds** files only: the backend at the project root
(`game.js`, `voice-input.js`, `driving-scene.js`, `driving-feedback.js`,
`exhaust-feedback.js`, `garage.js`) is loaded unchanged and still owns voice input,
gear shifting, car physics, steering, drift, rivals, collisions, scoring and saves.
The original UI at `/index.html` keeps working.

## Run

```sh
python3 -m http.server 5173 --bind 127.0.0.1   # from the project root
```

Open http://localhost:5173/frontend/. (Python's dev server can occasionally drop one of
many parallel requests; if a page looks broken, reload.)

## Folders

| Folder | What it is | Edit here when… |
|---|---|---|
| `index.html`, `home/` | Home hub: logo, current car, Race / Free drive / Garage, race setup, live track background | changing the menu |
| `race/` | Race page: cartoon track renderer, HUD, lobby, results, pause/settings | changing how racing looks |
| `garage/` | Garage store: cars, engine swap, exhaust/silencer, turbo, blow-off, intake, meter skins, sound preview; everything costs coins | adding parts or sounds |
| `career/` | Career map: 20 playable regions + 4 coming soon (▲/▼ or swipe), 20 rounds each on a one-screen snake road over a painted region scene (`region-art.js`), stars, round sheet, gem store (coming soon) | adding regions or rounds |
| `shared/` | Theme + fonts, cartoon car painter, per-car tuning store, economy (prices, rewards), career progress store, optional art | changing the look or prices everywhere |
| `multiplayer/`, `profile/` | Multiplayer (online, friends lobby with code/link, friends, leaderboard) and the profile editor. See `/MULTIPLAYER.md` | multiplayer or profiles |
| `ART-REQUESTS/` | Image prompt sheet (204 images), references, sound research, video prompts; `scripts/import-art.py` brings finished images in | making art |

Design setup (fonts, colours, components): `DESIGN-SYSTEM.md` and `design-tokens.json`.
Generated art: `ART-REQUESTS/README.md` (prompts, references, import script).

Every page sets `<base href>` to the project root, so all paths in them are root-relative
(`frontend/...`, `assets/...`) and the backend finds its assets unchanged.

## How the race page uses the backend

`race/index.html` keeps every element id that `game.js` binds to (controls, settings,
telemetry), so input, hold-to-steer, drift, N ↔ D, brake, keyboard keys, microphone,
sound-test recording and calibration behave exactly as before. Then:

- `race/menu-bridge.js` (loaded before `game.js`) provides the menu functions `game.js`
  calls (`showGameMenu`, `hideGameMenu`, `renderGarage`, `renderStore`,
  `stopGaragePreview`) with lobby behaviour.
- `race/race-ui.js` replaces `draw()` and `drawBlueTachometer()` with no-ops and renders each
  frame from backend state instead: `car`, `gear`, `currentRpm`, `virtualButtonPress`,
  `road`, `race`, `enemies`, `skidMarks`, `tireSmokeParticles`, `exhaustParticles`,
  `exhaustFlash`, `driveFeedback`, `playerPose()`, `vehiclePose()`. It never writes them.
- `race/track-renderer.js` draws the same `RevRoadScene` geometry the backend uses for
  collisions, so what you see is what you hit. The camera follows the road and zooms
  out with speed; cosmetic effects (sparks, speed lines, trails) freeze when paused.
- **Fixed course map.** The backend's curve (`offsetAt`) advances at 0.45 × its paint
  scroll, and its start/finish/rivals use a third scale (4.5 px per metre). Drawn as-is,
  bends slid under the scenery. The renderer moves all ground (markings, curbs, sand,
  tyre walls, scenery, skid marks, start and finish) at the curve's rate
  (18.75 px per metre), so the road is one fixed map. Rivals and traffic are still
  drawn exactly where `game.js` puts them.
- Every ground item (tyres, posts, trees, stands) is placed from the road at its own
  ground position, never from screen-fixed samples, so nothing flickers or slides.
  Start and finish come from the ground position too, not from `race.distance`.
- The minimap shows the whole course once, as a fixed circuit: the loop shape is for
  display, every left/right wiggle is a real bend at that distance, with tyre walls,
  the start/finish line, rivals and you. Free drive laps four repeats of the road
  (the backend road repeats every ~134 m).
- Results: `game.js` still writes the result screen; the page restyles it and adds a
  medal, confetti for 1st, and Garage / Home buttons.

Course choices on Home write the backend's own `revline-course-v1` key.

## Garage and the backend

| Part | Stored in | Affects races? |
|---|---|---|
| Car (claim + select) | backend `revline-garage-v1` via `RevGarage` | yes, colour and default engine |
| Engine sound | backend `RevGarage` | engine id (legacy Sport tune +8%) |
| Turbo on/off | backend `RevGarage` (`off` / `street` = +12% acceleration) | yes |
| Turbo variant, exhaust, blow-off, intake | frontend `revline-tuning-v1` (per car) | sound preview + exhaust tips/flame colour in race |

The preview (`garage/sound-lab.js`) plays the real engine excerpts in `assets/engines/`
through Web Audio filters built from the fitted parts: silencers change loudness, tone,
rasp and crackle; turbos add a spooling whistle; blow-off valves sound on lift-off; intakes
add induction roar. It never touches the race microphone path.

**Later backend work** (kept out of this UI-only change): add `exhaust`, `bov` and `intake`
categories to `REV_SHOP` (and accept them in `revReadLeaderboard`'s course key), move the
`revline-tuning-v1` data across, and let `revComposeSound()` values feed race audio if
generated engine sound returns.

## Race rules and phone sounds (game.js / driving-scene.js / race-sfx.js)

- **Accident** only when your front hits the back of a car ahead. Side contact throws
  sparks and costs a little speed; a car running into you slows and drops back.
  **Engine blown** after more than 3 s at the 10k redline. A driver who is out ranks last.
- **Steering** (Home → Race setup, or Settings): Easy = curves steer themselves and each
  tap moves one lane; Normal = curves steer themselves; Hard = you steer the curves, lane
  changes need a long press or 2–3 taps, and sharp bends cost speed.
- **3-2-1-GO** before every new run. **Phone sounds** (Settings → Phone sounds): turbo
  whistle, blow-off, pops/bangs, clunks and contact bangs, shaped by the Garage parts.
  They only play right after a shift or while you rev, because the mic hears the speaker.
- **Store / Garage → Cars**: 42 cars with photos and engine excerpts from the reviewed
  michael.gaming92 index (`assets/cars`, `assets/engines/sources.json`).

## Career, coins and the store

- **Coins** are the backend garage's credits (`RevGarage.earn/spend`); everything else
  (stars, best results, points, gems, bought parts, meter skins) is `RevCareerStore`
  (`shared/career-store.js`, key `revline-career-v1`). New players get 2,000 coins once.
- **Prices** follow how loved a sound is, not speed (`shared/economy.js`; reasons and
  sources in `ART-REQUESTS/SOUND-RESEARCH.md`). Parts fitted before the store existed
  stay owned.
- **Rounds** (`career/career-data.js`): 20 playable regions of 20 rounds (400 rounds).
  Region 1 is hand-made; regions 2–20 come from `revGenerateRegion` and a profile per
  region (theme, surfaces, car class, drift-only, monster hills, traffic, speed). Rounds
  get harder within a region and from region to region: faster rivals, more and sharper
  bends, longer runs. Every non-drift region ends with rough-surface races with
  obstacles. Drift regions (Canyon Drift Kings, Glacier Drift) end with a drift final.
  Monster regions (Monster Arena, Monster Mayhem) put gear-2 (or gear-1) hills in every
  round. Regions 21–24 are visible but blurred ("coming in a future update"). Each region
  needs stars from the one before it, and rounds open in order.
- **Stars**: 1st place = the difficulty's maximum (Easy 1, Normal 2, Hard 3); 2nd = one
  less. On drift rounds, each multiple of the drift target earns a star. Out = nothing.
  Gems: +3 for a round's first 3★, +20 for a finished region.
- **Race page** with `?map=<id>&difficulty=<d>`: the round sets the distance, bends,
  traffic, theme, surface (grip, drag, wander), hills and obstacles (`driving-course.js`
  at the root), plus rival pace (+6% if your car's class doesn't suit the round). Course
  controls are locked during a career round, and your own race setup is kept.
- **Meter skins** (Garage → Meter) restyle the race gauge.
- **Engine sound** (`race/engine-sound.js`, race Settings → Engine sound): the selected
  car's engine, synthesised from its real layout (16 layouts: inline-4, VTEC, boxer,
  straight-6, V6, flat-6, crossplane/flat-plane V8, V10, V12, 2/3/4-rotor, diesel, F1
  V6), its Garage parts (240 builds) and a per-car seed, following RPM, voice throttle,
  shift cuts and the limiter. Each car also has 104 effect variants (pops, backfires,
  blow-offs, clunks, squeals, impacts, crashes, surfaces). The engine, tyre squeal and
  surface rumble play only with echo cancellation on.
- **No zoom**: `shared/no-zoom.js`, the viewport and `touch-action: manipulation` on every
  page; the iOS app also turns off pinch zoom natively.
- **Home → ⚙ Settings** holds the quick-race setup (distance, rivals, steering, road).
- **Creator mode** (Home → ⚙ Settings → Creator, key `revline-creator-v1`): every round in the
  20 playable regions is open, so any race can be run while maps are being made. It's on
  by default for now (`RevCareerStore.creatorDefault = true` in shared/career-store.js);
  set that to false, or switch it off in Settings, for normal in-order career locking.
  Results, stars and coins still count.
- **Echo cancellation** (race Settings → Ignore game sounds, default on) takes effect the
  next time the microphone starts. Off = the original raw input.

## Not done yet

- No laps: the backend race is point-to-point by distance, so the HUD shows km, not laps.
- Generated art is optional until it's imported; see `ART-REQUESTS/README.md`.
- Monster trucks need their own engine recordings before the Monster Arena region ships.
- Gem purchases are shown as "coming soon". There are no payments.
