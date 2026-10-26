# RevLine sound test

The default **My rev · IMG_3313** preset is calibrated to the supplied
`IMG_3313.MOV` recording. Its clear vocal pitch was mostly 156–287 Hz; the preset
uses a 150–300 Hz control range, a 0.8% noise gate, and compressed volume response
referenced to 7.5% RMS. This makes rising pitch drive the rev response even when
recorded loudness varies. Sensitivity and noise-gate adjustments stay separate
for each sound profile.

The **Reference recording** selector switches between that clip, the new
**Downshift trial · IMG_3314** recording, and the original Porsche video. **Use microphone** keeps the selected
voice preset, or selects the custom preset when leaving engine mode. Press
**N ↔ D** manually to drive. No timestamps from the recording drive the vehicle.
This is control calibration, not retraining the neural network or a measured
RPM accuracy improvement. The original video remains untouched; only its audio
is bundled for replay. Measurements are in `assets/rev-voice-3313-calibration.json`.

Run `python3 -m http.server 5173 --bind 127.0.0.1` in this directory and open
http://localhost:5173. Use a local server so Web Audio can read the bundled media.

Open **Settings** to choose Microphone / Recording, calibration and the test course.
Tap Microphone again to turn capture off; Recording toggles playback. The same
detector processes microphone input and reference audio. Settings pauses the race
and reference timeline, traps focus, closes with Done / Escape / backdrop, and
returns focus to its opener. Starting an input returns to the race automatically.
Score, input readings, sensitivity, noise gate and the local leaderboard live here.
Generated engine, shift-click and pop audio have been removed; reference recordings
retain their own sound, and exhaust/backfire feedback remains visual.

**Traffic**, **Curved roads** and **Race** are independent switches. Both road
switches off gives the original plain test; traffic-only and curves-with-traffic
are available, as is an empty curved course. Course changes start a fresh run in
manual neutral and save the selected switches. The default race distance is the
user-selected **1 km**, with optional 3 / 5 km courses.

Race mode adds exactly three named rivals. They wait for the player's launch,
then accelerate independently, follow curves, change lanes around traffic or slow
when blocked. Distances use km/h converted to meters, rather than scripted screen
positions. The race HUD shows position, progress and rival gaps even off-screen.
A checkerboard finish, four-driver result table and Race again action complete
the run. Finishing awards a position bonus and saves the player's time / place /
score locally; collisions end the run without a leaderboard entry. Best times are
separated by distance, traffic and curve settings. The top ten are shown from a
bounded 50-record store. This is a local leaderboard, with no account or online ranking.

Steer with left/right buttons or A/D. Hold the separate left/right **Drift** buttons
or Q/E above 25 km/h for a controlled slide, visible yaw, tire smoke and skid marks.
Grip returns gradually after release. Bends introduce outward force at speed;
drifting costs a little traction, and running onto the verge slows the car.
Road paint, lane markings, scenery, vehicle orientation and collision bounds
share one curve model. Plain driving retains the previous acceleration and sound shifts.

Replay resets vehicle and detectors. Loop repeats complete calibration runs;
an in-progress race can loop a recording continuously without losing race distance.

The Carrera GT profile estimates RPM from its dominant firing band and harmonics,
with an adjustable RPM/Hz scale. Rev dips suggest gear changes. Estimates are not
ground truth: audio cannot uniquely identify neutral, clutch, brake, or gear.
Use the **N ↔ D** button to select neutral or resume in a speed-appropriate gear
(first when stopped). Gear changes use sound; the manual shift buttons and W/S /
up/down-arrow shift shortcuts have been removed. The voice profile instead
maps volume and pitch to throttle.
Silence releases throttle immediately. Both profiles coast gradually, and after
1.2 seconds of silence downshift one gear at a time as speed falls. A brief pause
can still trigger the existing voice upshift when sound returns. Sound recovery
cancels automatic downshifting. More than three continuous seconds of silence
selects neutral without stopping the car's coast. When voice returns steadily
for 120 ms, neutral entered this way re-engages a gear suitable for the current
speed (first when stopped). **N ↔ D** / **N** selects manual neutral for
free revs at any speed. Manual neutral coasts and never auto-launches, even after
long silence: press again to resume in a suitable gear. Replay/source changes reset to manual N.
Standard voice upshifts require both a clear pedal release and a drop in microphone volume
for at least 100 ms, followed by a stable recovery. Pitch changes, AI/fallback
switches, a still-falling pedal, and brief noise dips alone cannot request a shift.
The release-and-return gesture expires after 700 ms; longer silence is coasting.
The **My rev · IMG_3313** preset detects the recording's much shorter acoustic
breaks directly from the raw microphone envelope. A cut lasting at least 25 ms
must have either a confirmed pitch reset or a short quiet gap followed by sound
returning. The detector does not wait for the smoothed pedal to finish falling.
Single-frame blips, pitch-only changes, uninterrupted rising revs and long stops
do not request an upshift. Cuts expire after 450 ms. The original Porsche engine
and standard voice detectors are separate.

**Voice downshift** defaults on for both voice references and stays selected for
microphone use. It requires local AI voice pitch; engine mode and AI-off bypass it.
A voiced pitch held near its peak then lowered by at least 14% triggers one downshift
after a short confirmation. Volume can stay constant. Abrupt acoustic cuts, brief octave
glitches, rising pitch and a brief pitch wobble are rejected. A 0.9-second shift
cooldown avoids repeated downshifts from a single gesture. Standard voice upshift
requests retain priority. The approved upshift detector and preset are unchanged.
The calibrated voice mode also keeps the previous
direction decision for lower-rev falling glides, quick rev blips that return,
and a brief quiet gap returning at similar pitch with lower volume. An ambiguous
upshift request can wait up to 250 ms while direction is confirmed. Disable the
checkbox to use the original upshift dispatch; silence downshifts / automatic N
remain available. Microphone capture quality still affects pitch recognition.

Roadside trees and marker posts travel with actual simulated speed, using a long
staggered repeat so faster movement is visible beyond the short lane-mark pattern.
High-speed tree trails reinforce that motion. A smaller round speedometer overlaps the lower-right of the RPM
meter and follows the same simulated speed, with a 0–200 km/h needle and numeric readout.
The meter lights build from green
through yellow to red; a double up-chevron appears at 7,000 RPM in gears 1–5.
Holding a driving gear above 9,600 RPM for 650 ms engages a pulsing rev limiter:
power drops and the car slows during cuts. Shifting, releasing throttle, braking,
or selecting neutral clears it. The needle and car shudder at the limiter; reduced
motion disables cosmetic shudder/trails. These effects never change audio input,
the voice throttle map, or the upshift detector. Initial acceleration is unchanged
before the top-end over-rev zone. Reference audio is never modified. More than
three continuous seconds at the 10k marker (9.8–10k with needle vibration) fails
the engine and ends the run. Releasing, braking, shifting or selecting neutral
clears the timer before failure; a failed engine requires restarting the run.

Exhaust follows the input envelope. Separate quick revs produce separate puffs;
steady revs leave faint wisps. A voiced downshift produces a short visual dual-tailpipe
backfire. Quiet automatic downshifts do not backfire. No generated audio is added.
Particles are bounded and effects reset with replay/source changes; they do not
change pitch, throttle, gear selection or the approved upshift detector.

The native iPhone app is in [ios/RevLine.xcodeproj](ios/RevLine.xcodeproj).
It bundles the simulator and model offline and opens directly on the race.
See [ios/README.md](ios/README.md) for builds, installation and microphone access.
Curved roads and race modes are available in Settings; gyroscope steering remains future work.

The supplied times are approximate annotations only. Measured feature replay finds
down cues near 30.50, 37.25 and 61.35 seconds, and the nearby marked up cues near
40.35 and 67.85 seconds. Live timing varies with pitch inference and audio frames.
The final falling rev can also request a downshift. These voice gestures remain
experimental; they do not uniquely identify a real transmission's direction.
No recording timestamps are used in the runtime detector.

The exact pre-trial project is saved in
`.checkpoints/shift-up-perfect-before-IMG_3314-2026-10-25.tar.gz` with verified
SHA-256 hashes. If asked **“back to previous”**, follow `.checkpoints/README.md`.
The state immediately before the simulator upgrades is also preserved in
`.checkpoints/before-simulator-upgrade-2026-10-25.tar.gz` with verified file hashes.

Pause freezes the model. Seeking resets it at that position; replay from the start
for a continuous gear test. CSV export records the current run at roughly 10 Hz
(up to 30 minutes), including source, profile, band, RMS, RPM, throttle, gear, speed.
Explicit replay begins a new run, so export before restarting if you want to keep it.
Another loaded file stays local and requires its own calibration.

The supplied clip is **not yet an exact behavioral match**. During validation,
the deceleration/downshift sequence diverged. Manual neutral supports free revs,
and quiet-input coasting is intentional rather than an inferred brake action. The main acceleration sequence now reaches gears 1–6;
this is a calibration baseline rather than a verified inverse vehicle model.

Voice mode includes optional **AI voice pitch** using the pretrained CREPE tiny
neural network, running on-device with bundled TensorFlow.js. Selecting Voice mode
or starting the microphone loads it. The model estimates vocal fundamental pitch;
the existing volume/pitch mapping still controls virtual throttle and simulated RPM.
It does not infer a real car's RPM from a person's voice or identify brake/neutral.
Unclear, old, unavailable or failed model predictions fall back to the standard
detector. Silence still releases throttle immediately. Porsche engine mode ignores
the AI model entirely. No accuracy percentage for real voice imitation is claimed;
that needs recorded user examples and a defined target throttle/RPM trace.

Run the `unit` command in `premium-ui.json` for all twelve Node checks.
The custom check replays measured
features from this recording and verifies all seven observed short cuts, quiet
release, full-rev response and no upshifts during its rising-rev sections.
The trial check protects the original detector files, replays the new annotated
cues, constant-volume pitch drops at multiple frame rates, automatic neutral,
speed-matched re-engagement and manual neutral. The drive-feedback check verifies
the shift window, limiter grace period, pulsing power cuts and recovery.
The exhaust check verifies distinct quick-rev puffs, steady wisps and voiced-only pops.
Scene/race checks cover bounded curves, grip and drifting, collision geometry,
independent rival progress, finish timing, rankings and safe local result storage.
Model provenance and licenses are in `THIRD_PARTY_NOTICES.md` and `assets/`.

### Simple top-down racing

Home offers Race, Free Drive, Garage and the free Store. The driving view is the
original top-down car scene with traffic, curves, exhaust, drift and three rivals.
FPV/rendered models, generated sprites, roadwork obstacles and their extra driving
penalties have been removed. Settings no longer contains camera/obstacle toggles.

Controls are grouped for touch: steer/drift left; neutral/brake right. The smaller
instruments and voice-level bar show feedback without a fake accelerator pedal.
Voice remains the accelerator and shift control. Existing up/down shifts, neutral,
coasting, braking and limiter logic are preserved.

The free car ownership, engine/turbo selection and eight source sound previews
remain. Source details are in `assets/engines/sources.json`. The original 1.1 GB
`michael.gaming92` research archive is kept outside the app bundle.

Source layout:

- `index.html`: markup and script loading order.
- `game.css`: styles, HUD and responsive controls.
- `game.js`: game/UI coordination, vehicle physics, instruments and top-down rendering.
- `voice-input.js`: microphone/recording capture, calibration, signal analysis, shift cues and local AI pitch.
- `game-menu.js`: Home / Store / Garage navigation and previews.
- `garage.js`: free inventory, local saving and equipment.
- `driving-scene.js`: road, steering geometry, traffic difficulty and races.
- Dedicated driving/exhaust feedback modules retain their approved behavior.

`RevVoiceInput` is the single voice entry point in browsers and CommonJS. Create an
instance with the reference media element, call `startMicrophone()` or
`prepareReference()`, then `analyze(dt)` for pitch, RMS, activity and throttle.
`ensureAI(enabled)` loads the local model; `detectShift(...)` returns the requested
direction and release state. The game applies gear, speed and visual changes.
Call `stop()` when leaving driving. AI weights/runtime remain bundled in `assets`.

Run all commands in `premium-ui.json`. The recording checks exercise the voice
module's shift decisions and verify its approved detector/calibration source;
neutral routines remain byte-identical. Actual game shift/failure routines are
exercised by `shift-window.test.cjs`. Capture checks cover late
permission results, source switching, AI routing and recent-silence release.

The voice baseline is frozen in `voice-lock.json`. Run
`python3 scripts/stage-ios-web.py --check-voice-lock` to verify source, AI weights,
model metadata and runtime hashes; iPhone builds run the same check before staging.
Only an explicit user request to fix/change voice behavior authorizes a new baseline.
The approved upshift detector, calibration and AI inference code remain unchanged.
A continuously voiced pitch step with a brief level dip now waits for the lower
tone to confirm downshift instead of immediately accepting an overlapping up cue.
Short quiet cuts still upshift, and both recording replays preserve their original
upshift feature-frame times. See AGENTS.md for the freeze policy.

The current **Pitch + volume mix** trial defaults on in Settings. It normalizes
pitch and loudness and averages them 50/50 for rev/throttle response. Recent clear
voiced samples gradually adapt pitch range and full-rev loudness within this run;
percentiles reject isolated spikes. Silence releases immediately, and unclear/AI-off
input uses the previous detector. Original shift gestures retain their calibrated
envelope so the new throttle mix does not reclassify known cuts.
Switch the trial off to use the previous voice control; switching resets the run.
For a complete code rollback, the exact pre-trial state is hash-verified at
`.checkpoints/before-voice-blend-trial-2026-10-25.tar.gz`. This is the current
“back to previous” target. See `.checkpoints/active-voice-trial.json` and its README.

The newer RPM-window update arms genuine voice cuts from 7k using the displayed
RPM even when the original gesture envelope is below its old 48% threshold. RPM
alone never changes gears. A lower voiced register and quieter same-pitch return
retain direction priority, including sixth-gear downshifts. The detector/pitch model
and frozen preset are unchanged; RPM context is passed to the direction coordinator.
Upshifts show Early below 8.5k, Perfect at 8.5–9.5k, and Late above 9.5k, based on
RPM before the shift drop. Downshifts show their gear and down arrow. This update
can be rolled back independently from the verified
`.checkpoints/before-shift-window-engine-failure-2026-10-25.tar.gz` checkpoint;
the earlier pre-mix checkpoint remains available.

The current soft-downshift trial adds one direction cue: after a clear continuous
upsweep, a small pitch drop (at least 6%) plus a modest volume drop (at least 10%)
must persist for about 120 ms. Both signals must remain voiced, without a sharp
or quiet acoustic cut; those cuts retain their approved upshift behavior. Volume
alone, pitch alone, one-frame wobble and uncertain AI input do not satisfy this cue.
Existing larger glides, blips, silence, neutral and cooldown rules remain available.
The upshift/capture/RPM coordinator and AI assets are unchanged. The exact stage
the user approved immediately before this experiment is verified at
`.checkpoints/before-soft-downshift-trial-2026-10-25.tar.gz`; this is the latest
“back to this stage” target. See `.checkpoints/active-soft-downshift-trial.json`.

IMG_3315 follow-up: the user confirmed that the displayed 5→6 near 1:12.25
should downshift. A rounded, continuously voiced rev return through intermediate
pitches can now qualify above the old pedal cutoff. It must persist for 350 ms;
sharp pitch resets, quiet cuts and AI-confidence gaps cannot use this new path.
The original upshift detector/coordinator, preset, blend, AI weights, physics and
UI remain unchanged. Recorded regression tests preserve the preceding correct
downshift and descending run; register-scaled cases cover the old direction
mismatch. Camera audio replays do not measure live microphone accuracy.

To undo this correction, the latest restore point is the verified 62-file archive
`.checkpoints/before-IMG_3315-tuning-2026-10-25.tar.gz`, with affected files listed
in `.checkpoints/active-IMG_3315-tuning.json`. Earlier restore points remain.

Direction refinement: after feedback that both directions became less accurate,
the IMG_3315 correction stays active. Its rounded-return path now uses the current
700 ms rev window and requires multiple downward pitch steps without a rebound
or a deep acoustic release. This protects release/recovery upshifts and prevents
an older isolated pitch spike from hiding a later down gesture. Tests cover both
failure directions alongside the earlier recordings. The 64-file pre-refinement
safety snapshot is retained; the user explicitly requested no revert.

First-launch voice setup is optional and can be reopened from Home or Settings.
It measures 3 seconds of room noise and a 5-second comfortable low/high rev, then
checks two consecutive upshifts and two downshifts through the actual detector in
a paused practice window. It teaches the 7–10k shift window and 8.5–9.5k perfect
timing. A completed personal pitch/volume/noise profile is saved on this device
and loaded at startup. Reference playback keeps its original calibration. Select
another sound profile in Settings to use the earlier controls.

Microphone attempts stop after each measurement/gesture, cancellation and
backgrounding. Permission/model errors can retry; invalid samples cannot save.
Cancel keeps the previous profile. Full/unavailable storage offers session-only
use. Raw audio is not stored. The original RevVoiceInput and detector source stays
unchanged: RevPersonalVoiceInput adds validated personal settings in voice-input.js;
voice-setup.js owns only the guide UI and lifecycle. This is personal calibration,
not neural model retraining or a guarantee of live shift accuracy.

The verified pre-setup snapshot is
`.checkpoints/before-voice-onboarding-2026-10-25.tar.gz`. Preserve later unrelated
work and device saves if explicitly asked to undo this feature.
# RevLine
