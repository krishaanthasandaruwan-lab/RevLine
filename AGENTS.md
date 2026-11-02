# Frozen voice behavior

The user requested that the working voice module and AI model stay locked.
`voice-lock.json` records the frozen files and their SHA-256 hashes. Tests and iOS
staging verify them. Do not modify these files for UI, race, garage, cleanup or
general refactoring work, and do not refresh hashes merely to pass a failed check.

Change this baseline only when the user explicitly asks to fix, change or unlock
voice behavior. That explicit task is authorization; no additional confirmation is
needed. Preserve a verified restore checkpoint first, keep the approved upshift
detector/calibration intact unless that task requests otherwise, run all commands
in `premium-ui.json`, then record the reviewed files' new hashes in the lock.

Keep voice capture, signal analysis, calibration, direction cues and local AI in
`voice-input.js`. Vehicle physics, UI and rendering belong outside it. The model
and TensorFlow assets remain in `assets`. Settings may still adjust runtime input
controls; those controls do not alter the frozen source or model files.

## Active pitch/volume trial

The user explicitly authorized this reversible voice change and requested an exact
rollback. The averaging trial's “back to previous” target is
`.checkpoints/before-voice-blend-trial-2026-10-25.tar.gz`, with its verified JSON
manifest and `.checkpoints/active-voice-trial.json`. Use this checkpoint for that
trial, rather than the older IMG_3314 experiments. Preserve unrelated subsequent
edits. Trial Off in Settings already selects the previous algorithm; a requested
full rollback restores the affected archived files and removes trial-only files,
then verifies their original hashes and voice lock. Do not retrain or modify the
AI assets for this averaging trial.

## RPM window and engine-failure update

The user explicitly authorized wider voice recognition, timing grades and the
three-second engine-failure rule. Its independent pre-update restore point is
`.checkpoints/before-shift-window-engine-failure-2026-10-25.tar.gz`; see
`.checkpoints/active-shift-window-update.json`. Match rollback scope to the user's
request: this checkpoint undoes the latest RPM/failure update, while the earlier
pre-mix checkpoint undoes averaging. Keep both. The core pitch model, upshift
detector and preset remain protected; RPM context may arm the existing detector
from 7k but must never trigger a shift without a sound gesture.

## Current soft-downshift experiment and explicit rollback target

The user confirmed that upshift works at this stage and requested only better
recognition of a small pitch/volume dip during a continuous rising rev. Preserve
the upshift/RPM coordinator, core detectors, AI weights, blend, car physics, timing
grades and engine-failure rules. The new rule is confined to RevVoiceDownshift.

If the user asks to return to this approved stage after the soft-downshift trial,
use `.checkpoints/before-soft-downshift-trial-2026-10-25.tar.gz` and its verified
manifest, with `.checkpoints/active-soft-downshift-trial.json` identifying affected
and trial-only files. This is the latest explicit rollback target; do not choose
an older checkpoint unless the user names that earlier experiment. Preserve other
later user edits and saved device data. Restore the original voice lock as well.

## IMG_3315 direction correction

The user confirmed that the displayed 5→6 near 1:12.25 should downshift. The
current authorized fix extends only RevVoiceDownshift's returning-rev rule to
recognize a continuous rounded descent above the old pedal cutoff. Keep the
original upshift detector/coordinator, preset, blend, AI and vehicle logic intact.
Camera-derived fixture replays are regression checks, not exact live accuracy.

The latest rollback target for this correction is
`.checkpoints/before-IMG_3315-tuning-2026-10-25.tar.gz` and its verified 62-file
manifest. `.checkpoints/active-IMG_3315-tuning.json` lists affected/new files.
Use it if the user asks to undo this correction, preserving unrelated later edits
and device saves. Keep the older trial restore points for explicitly older requests.

## Direction refinement after user feedback

The user found both directions less accurate after the IMG_3315 correction and
explicitly requested improvement without reverting. Keep that correction active.
Refine only its rounded-return evidence: use the current rev's recent history,
require multiple descending pitch steps, reject pitch rebounds and deep releases.
Preserve the protected upshift/coordinator, AI, blend, UI and physics as before.
The verified 64-file safety snapshot is
`.checkpoints/before-direction-refinement-2026-10-25.tar.gz`; its active manifest
records the incremental changes. A snapshot is not permission to revert: do so
only if the user later explicitly requests it.

## Guided personal voice setup

The user explicitly authorized onboarding that listens to their voice and sets up
personal controls while teaching shifts. New RevVoiceCalibration and
RevPersonalVoiceInput in voice-input.js extend the frozen input path; preserve the
original detector/coordinator classes and preset source byte-for-byte. All capture,
signal and fitting logic remains in this voice file. voice-setup.js owns UI flow
only. Persist validated settings after two consecutive detections per direction;
never save raw audio or change model weights. Reference playback uses its original
preset; skipped/cancelled setup retains prior behavior and saved profile.

The 64-file pre-setup snapshot and matching verified manifest are
`.checkpoints/before-voice-onboarding-2026-10-25.tar.gz` and `.json`. See its active
manifest for affected/new files. Do not revert earlier voice refinements as part
of this feature. Run the complete premium-ui command and update reviewed lock
hashes only for this authorized extension.

## Direction guard from IMG_3317 (flat-hold and blip downshifts)

The user explicitly authorized building their IMG_3317 rules: decide a gesture by
what follows it. RevDirectionGuard (appended to voice-input.js, used through
RevPersonalVoiceInput.detectShift, i.e. by game.js and the setup guide) leaves every
original detector byte-for-byte unchanged and only filters/adds directions:
a real break (silence or < 30% of recent loudness) then return = immediate up; a
volume cut whose pitch falls > 25% = up; other drops wait ≤ 0.9 s (rev rebuilds = up,
stays flat = any requested down); a short blip from a flat level that falls back
near it = down (one small rev = one gear down); one shift per 0.75 s. A constant rev
in any gear never shifts: the timed 3-second flat-hold downshift was tried and then
removed at the user's request after the iPhone test (cruising looked like a hold).
Instead the user asked for a speed-matched gearbox, which lives in game.js (vehicle
physics, not the voice module): with sound on, a car settled in the bottom 20% of its
gear's speed range for 1 s (not speeding up) drops one gear, at most every 1.5 s,
never in the engine-reference profile. Checks: `tests/speed-gearbox.test.cjs`.
Voice has priority over that gearbox: it waits while the guard is still judging a
gesture (`direction.busy`) and for 4 s after a voice shift. Down = even the smallest
rev: ≥ 8% above a steady level for 0.15–0.6 s, falling most of the way back (a held
voice wobbles ≤ 1%); silence ends a small rev because a break is an upshift.
Restore point for this step: `.checkpoints/before-voice-priority-small-rev-2026-10-26`
(.tar.gz/.json; voice-input.js rebuilt and verified against the previous lock hash). Sudden ×2 pitch readings are treated as the model doubling a low voice.
Labels: `tests/fixtures/rev-3317-features.json`; checks: `tests/direction-guard.test.cjs`.
The synthetic "rebound" probe in recorded-downshift.test.cjs (base class) would give
no shift through the guard; the user's 21.14 label wins. Rollback target for this
update only: `.checkpoints/before-flat-hold-downshift-2026-10-25.tar.gz` and its
verified 67-file manifest (see `active-flat-hold-downshift.json`). The state with the
3-second hold, the iPhone frontend start page and the old gauge position is
`.checkpoints/before-remove-flat-hold-2026-10-25.tar.gz` (97 files; see `active-remove-flat-hold.json`). Restore only on
explicit request; keep frontend/ and device saves.

## Game rules, phone sounds and archive store (user request, 26 Oct)

Voice logic was explicitly left as-is for this update; voice-input.js and its lock are
unchanged. Changes live outside the voice module:
- driving-scene.js: RevRoadScene.assist = easy | normal | hard (class default hard =
  original behaviour). Easy/normal: curves steer themselves; easy moves one whole lane
  per press. Hard: outward curve force, cornering drag, slower steering (taps move ~1/3
  lane). Drift yaw 0.55. RevRoadScene.contact classifies overlaps.
- game.js: only our front into the back of a car ahead is an Accident; side contact and
  cars running into us are bumps (sparks via `impacts`, −8 km/h / pushed apart, or the
  other car slows and drops back). Endings are named "Accident" and "Engine blown"; a
  driver who is out ranks last ("Out"). Brake 50 km/h/s (was 132), tap −3. Steering is
  read from `steering-mode` and saved in revline-course-v1.
- garage.js: 42 cars (original 8 + 34 from the reviewed michael.gaming92 index) with a
  photo in assets/cars and a 3 s excerpt in assets/engines (start = still − 1.5 s, as
  before; see sources.json). The 1.1 GB archive itself stays out of the app.
- frontend/race: 3-2-1-GO before every new run (simulation and recording held), phone
  sound effects (race-sfx.js: whistle, blow-off, pops, clunks, bangs) only inside the
  0.75 s post-shift window or while the voice is active, because the mic hears the
  speaker. iOS asks for the loudspeaker when the mic is granted (best effort).
Tests: tests/game-rules.test.cjs (plus updated garage-options and shift-window).
Restore point: `.checkpoints/before-game-logic-sfx-store-2026-10-26.tar.gz` (124 files).

## Sound fix, echo cancellation, career and economy (user request, 26 Oct)

The user explicitly authorized echo cancellation like a video call. RevPersonalVoiceInput
gains `echoCancellation` (default on, race Settings "Ignore game sounds") and a
startMicrophone override that differs from the original only in the getUserMedia
constraint; Off calls the original path. Calibration error strings are now English (all
Sinhala text was removed at the user's request). Detectors, guard, preset and AI assets
are unchanged. voice-lock.json records the reviewed hash. Race sound effects now use the
voice input's AudioContext (iOS interrupted a second context once the mic started).
Career and economy live outside the voice module: frontend/shared/economy.js (prices by
sound appeal), frontend/shared/career-store.js, frontend/career/, driving-course.js
(surfaces, hills, obstacles; applied from game.js via `revCourse`). Coins stay in
RevGarage credits. Art slots: frontend/ART-REQUESTS (prompts, references,
scripts/import-art.py). Tests: tests/career.test.cjs, plus game-rules for the course.
Restore point: `.checkpoints/before-sound-fix-echo-coins-2026-10-26.tar.gz` (202 files,
verified); `active-sound-fix-echo-coins.json` lists what changed. Restore only on an
explicit request, and keep device saves.

## 20 regions, one-screen map, no zoom, Home settings, engine sound (user request, 26 Oct)

Voice files untouched. Regions 1–20 are playable (r1 hand-made, r2–r20 from
`revGenerateRegion` profiles in frontend/career/career-data.js); r21–r24 are "coming in a
future update". The career map fits all 20 rounds on one screen (4 × 5 snake) over a
painted scene (frontend/career/region-art.js) or imported region art. Zoom is blocked
(frontend/shared/no-zoom.js, viewport, touch-action, native pinch off in
RevLineController.swift). Home race setup moved into a ⚙ Settings dialog. The selected
car's engine is synthesised in frontend/race/engine-sound.js (layout per engine id, parts,
per-car seed) with a 104-variant effect bank per car; engine and loops play only with echo
cancellation on. Tests: tests/career.test.cjs, tests/engine-sound.test.cjs. Restore point:
`.checkpoints/before-20-regions-map-engine-sound-2026-10-26.tar.gz` (83 files, verified);
`active-20-regions-map-engine-sound.json` lists the changes. The user then asked for every map to be
open while maps are being made: creator mode (RevCareerStore.creatorDefault = true, Home →
Settings → Creator) opens all rounds of regions 1–20; future regions stay locked. Turn the
default off when the user asks for normal career locking again. Generated art from frontend/Images is
mapped in frontend/ART-REQUESTS/image-sources.json and imported by scripts/import-art.py
into frontend/shared/art (WebP cut-outs, loaded on demand); frontend/Images stays out of
the iOS bundle. Intro videos were imported, then removed
at the user's request (they slowed round start): the manifest has no videos. The originals
stay in frontend/Videos (out of the bundle); scripts/import-videos.py with
frontend/ART-REQUESTS/video-sources.json restores them only if the user asks.

## Multiplayer, profiles and leaderboards (user request, 26 Oct)

The user chose Game Center now, Firebase later. See MULTIPLAYER.md (setup, data and upgrade
path). Voice files untouched. RevRace skips rivals marked `remote` and game.js excludes them
from contact; frontend/race/mp-race.js drives them from lobby.js messages. net.js has two
transports (Game Center bridge in ios/RevLine/RevGameCenter.swift; BroadcastChannel simulator
for browsers). Never rename the leaderboard IDs revline.wins / revline.stars / revline.points.
Browser checks need each player in its own window (background tabs stop requestAnimationFrame).
Tests: tests/multiplayer.test.cjs. Restore point: `.checkpoints/before-multiplayer-profiles-2026-10-26.tar.gz`
(84 files, verified); `active-multiplayer-profiles.json` lists the changes.

## Microphone startup repair (user request, 27 Oct)

The user authorized editing after the first TestFlight build failed to prompt for
microphone access on a tester's Mac. Changes to voice-input.js are confined to
capture startup: native permission preflight, capture before audio resume,
30-second timeout and stale-stream cleanup shared by raw/echo-cancelled paths.
Recognition, calibration, direction guards, presets and AI assets are unchanged.
voice-lock.json records the reviewed capture hash; do not alter it for UI work.
The native reply bridge accepts only the app's own local main frame and still
asks the operating system for permission. game.js owns visible pending/errors,
duplicate-start prevention and the no-input start guard. Tests:
tests/microphone-startup.test.cjs plus every premium-ui.json command.
Restore point: .checkpoints/before-microphone-startup-2026-10-27.tar.gz and its
verified manifest. Restore only on explicit request, preserving device saves
and unrelated later edits.

The tester's 2701 screenshot confirmed `getUserMedia` is missing in the Mac app
window. Build 2026102702 adds a native AVAudioEngine PCM fallback only when that
API is absent; its bounded transient samples feed the same web analyser. Capture
and source cleanup remain in voice-input.js; native permission/PCM transport live
in RevLineController.swift. All analysis, calibration and detectors remain
byte-for-byte unchanged. The independent pre-fallback restore point is
.checkpoints/before-native-microphone-fallback-2026-10-27.tar.gz with its verified
manifest; the original pre-startup checkpoint remains available. The existing
soft-downshift freeze test excludes only the user-authorized capture lifecycle
methods and retains its hash over the unchanged class coordination/analysis.

## Manual controls, any-phone layout, instant Start (user request, 31 Oct)

Voice files untouched. game.js adds `controlMode` ('voice' | 'manual', key revline-control-v1;
race Settings → Controls, the lobby switch and Home → Settings). Manual: processManualDrive
replaces sound input (auto throttle builds 0 → 1 in ~2 s after each clutch release, idles in
neutral, holds under the redline in 6th); gears change only with CLUTCH held (manualShift,
setClutch; grading uses the RPM where the clutch went in); same timing grades and 3-second
engine failure. Start uses startDriving(): manual and a live microphone start at once; the
race lobby keeps a live mic for 60 s (menu-bridge.js) instead of closing it on every lobby, which
caused the multi-tap Start lag. Controls scale from one `--u` unit (race.css) so the deck,
HUD and lobbies fit 320×568 to 430×932. Tests: tests/manual-controls.test.cjs (and the mic
startup test now stubs controlMode). TestFlight build 1.0 (2026110101) uploaded with
xcodebuild archive + exportArchive (app-store-connect, destination upload, team HYKLC6A296).
Restore point: `.checkpoints/before-manual-controls-phone-fit-2026-10-31.tar.gz` (99 files).
