# RevLine — voice recognition handoff for Claude Code

Prepared on 25 October 2026, Asia/Colombo. Workspace:
`/Volumes/USER/CodeWorks/RevLine2`.

## 1. Read this first: the current result is not accepted

**The unresolved problem is real voice up/down direction recognition.** The user
has just tested **Set up your voice** and reports that their intended **upshift is
recognised as a downshift**. The user is frustrated after many iterations and is
handing this work to Claude Code. Do not describe this as solved because automated
checks pass.

Latest user report, translated from Sinhala:

> In Set up your voice, when I make an upshift, it recognises it as a downshift.
> That is not right. I am giving this task to Claude Code. Save all the details
> needed for the work in a complete Markdown file.

This handoff is the only work requested in the latest turn. No new detector fix,
rollback, model retraining, device installation or UI redesign was requested for
this handoff. Runtime code has been left as-is while writing this document.

Earlier, the user explicitly said the preceding version felt better, but asked
**to improve the current update without reverting**. “Previous version” has referred
to several different stages over the conversation. A timestamped backup is not
proof that the user approves that version. Do not silently choose an archive as
the desired baseline.

The previous agent's key mistake was treating synthetic/fixture regression
success as sufficient evidence of the user's live recognition accuracy. Passing
tests and successful iPhone builds have **not** resolved the reported problem.

## 2. Product intent and behaviors to preserve

The user communicates in Sinhala and English. The main interaction is **mouth-made
engine/rev imitation**, not real engine audio as the primary player input.

The product is a simple racing game whose satisfaction comes from making rev
sounds and seeing the car respond. The initial Porsche recording was a reference:
sound from acceleration should become the control input for simulated driving.
Do not infer that an audio recording uniquely specifies real vehicle physics.

Expected controls:

- A continuing/rising rev accelerates the car. Rising pitch or increasing volume
  alone must not invent a gear change.
- **Upshift:** the user's very short acoustic break/drop followed by rev returning.
  Earlier versions recognised this well. Preserve genuine upshift cuts.
- **Downshift:** a voiced lowering of pitch/lower register, sometimes with a small
  volume dip, or a returning rev/blip. The user has also demonstrated whole
  descending-gear sequences and said those sequences were correct. Distinguishing
  these gestures from upshift cuts is the unresolved task.
- Stopping the sound releases throttle immediately. Continued quiet allows
  coasting and gradual automatic downshifts. **More than three seconds** of silence
  selects automatic neutral; sustained returning sound selects a speed-suitable
  gear. Do not confuse this with manually selected neutral.
- **N ↔ D** is manual neutral/drive. It can select neutral in any gear, permits free
  revving and coasting, and needs another press to resume in a suitable gear.
- Manual up/down buttons and their keyboard shortcuts were removed intentionally.
- Real sound gestures may shift from the 7–10k RPM window. Upshift grades use RPM
  before the shift: Early below 8.5k; Perfect 8.5–9.5k; Late above 9.5k.
- Holding a gear too long engages a rev limiter/power cut and visual shake. More
  than three continuous seconds in the implemented 9.8–10k failure zone ends the
  run. Lift, braking, a gear change or neutral clears the timer before failure.
- Keep existing vehicle acceleration, steering, drift, braking, neutral rules,
  timing grades and engine-failure behavior separate from recognition changes.

Other established features: top-down Canvas car scene, speed-sensitive trees and
road scenery, RPM meter with a smaller overlapping speedometer, voice-responsive
exhaust puffs, voiced downshift pops, traffic, curved roads, left/right steering
and drift buttons, easy/normal/hard difficulty, optional race mode with exactly
three opponents and **1 km default distance**, local results, Home/Store/Garage.
Cars/parts are currently free. FPV, 3D models and roadwork/obstacle features were
removed/deferred; do not reintroduce them during this fix.

## 3. Current code map

| Location | Responsibility / useful entry points |
|---|---|
| `AGENTS.md` | Voice freeze/change policy, preservation rules and experiment context. Read it. |
| `voice-input.js` | All capture, pitch AI, signal mapping, gesture direction, blend, neutral helper and personal calibration. Main investigation file. |
| `voice-setup.js` | Guided setup UI/lifecycle; calls the same voice module. Does not implement a separate direction classifier. |
| `game.js` | Global game coordinator, sound-to-vehicle bridge, physics, UI updates and Canvas rendering. Instantiates `RevPersonalVoiceInput`. |
| `index.html`, `game.css` | Root game UI, Settings and voice setup dialog. |
| `driving-feedback.js` | Shift grading, limiter and engine failure. |
| `exhaust-feedback.js` | Voice puffs/downshift backfire feedback. |
| `driving-scene.js` | Road/race/traffic geometry and local race results. |
| `game-menu.js`, `garage.js` | Root Home/Store/Garage and inventory/equipment. |
| `assets/voice-pitch/` | Local pretrained CREPE tiny model, weights, licenses and provenance. |
| `assets/vendor/tf-4.22.0.min.js` | Bundled TensorFlow.js runtime. |
| `tests/` | Node assert-based regression suites and recorded-feature fixtures. |
| `voice-lock.json` | SHA-256 lock for voice source and model/runtime assets. |
| `premium-ui.json` | Authoritative complete test command. |
| `ios/RevLine/` | Swift WKWebView host, loopback server, microphone permission, background handling and debug self-check. |
| `scripts/stage-ios-web.py` | Verifies the voice lock, then stages root JS/CSS/HTML plus `assets/` into the app. |
| `frontend/` | Separate newer UI work; see the warning below. |
| `.checkpoints/` | Archives, SHA manifests, active experiment manifests and restoration notes. |

**Separate frontend work:** `frontend/README.md` documents a newer Home/race/garage
skin that consumes the root backend. It was present/being worked on separately
during the voice task and was not rewritten by the voice changes. At this handoff,
`frontend/race/index.html` has the original three sound-profile options, without
the new personal-profile option or guided setup script. The iOS staging script
still bundles the **root** game, not `frontend/`. Verify which surface the user is
testing before diagnosing a UI discrepancy. Preserve this separate work.

No `.git` directory was detected at the workspace root when preparing this file.
Use the existing archives and manifests; do not assume Git can restore the project.

## 4. Audio pipeline and direction arbitration

Current landmarks in `voice-input.js` (line numbers can change):

| Symbol | Approximate line |
|---|---:|
| `RevAudioModel` | 8 |
| `RevVoiceUpshift` | 79 |
| `RevVoiceCut` | 118 |
| `RevTransmission` | 157 |
| `prepareVoiceFrame` | 217 |
| `RevVoicePitch` | 253 |
| `REV_VOICE_3313` | 335 |
| `RevVoiceDownshift` | 358 |
| `RevAutoNeutral` | 541 |
| `RevVoiceBlend` | 575 |
| `RevVoiceInput` | 619 |
| `RevVoiceInput.analyze` | 738 |
| `RevVoiceInput.detectShift` | 758 |
| `RevVoiceCalibration` | 792 |
| `RevPersonalVoiceInput` | 829 |

`voice-input.js` contains preserved sections marked `BEGIN/END audio-model.js`,
`voice-ai.js`, `voice-preset.js`, and `experimental-downshift.js`. These older
standalone files were consolidated into the module; do not create duplicate voice
implementations in the UI.

Pipeline:

1. Microphone requests disable echo cancellation, noise suppression and automatic
   gain control. Web Audio uses a 45 Hz high-pass filter, analyser FFT size 8192
   and no analyser spectral smoothing. Analysis is connected silently; microphone
   input is not played back through the speaker.
2. `analyze()` calculates RMS over 8192 samples and `activityRms` over the most
   recent 1024 samples. The latter is used to detect short acoustic cuts.
3. `RevVoicePitch` uses a normalized 1024-sample frame resampled to 16 kHz: about
   64 ms of audio. Inference starts at most every 100 ms, is single-flight, accepts
   confidence/voicing score >= 0.65 and retains a clear result for at most 300 ms.
   Quiet invalidates pending/results. Unclear/expired results use spectral fallback.
4. `RevAudioModel` maps pitch/RMS to a smoothed gesture pedal. A custom/personal
   calibration changes its pitch/level mapping. The AI score is **pitch/voicing
   confidence**, not confidence in an upshift or downshift.
5. Optional, default-on `RevVoiceBlend` normalizes pitch and loudness and averages
   them 50/50 for throttle feel. It adapts an approximately 8-second personal range.
   It preserves the original envelope in `signal.gesturePress`.
6. `detectShift()` uses `gesturePress ?? press` for gesture recognition. RPM >= 7
   can arm the original upshift detector by raising its active cut pedal to at
   least 0.5, but RPM alone does not trigger a shift.
7. With a calibration containing `cut`, `RevVoiceCut` detects upshift requests.
   Without it, the stricter `RevVoiceUpshift` is used.
8. `RevVoiceDownshift.update(..., upRequested)` arbitrates the final direction.
   The generic uncalibrated profile passes `preserveUp: true`; custom/personal
   profiles pass **false**. Several down rules can therefore override an up request.
9. `game.js::processVoiceShift()` applies the returned direction to the vehicle.
   Neutral/silence timers and vehicle physics run separately.

### Important arbitration investigation point

An unchanged core upshift detector does **not** imply unchanged final upshift
behavior: later downshift arbitration may override it. Instrument the raw
`upRequested` result and the particular down-rule reason separately. The current
module returns only `{ direction, releasing }`, not a decision trace.

Custom baseline `REV_VOICE_3313` settings:

```text
pitchLowHz=150, pitchHighHz=300, fullRms=0.075
sensitivity=2, gate=0.008, volumeExponent=0.35, pitchFloor=0.2
cut.minimumSeconds=0.025, maximumSeconds=0.45
cut.volumeDropRatio=0.55, pitchDropRatio=0.85, returnRms=0.02
```

The downshift class currently combines multiple heuristics: a 120 ms small paired
pitch/volume dip after a rising rev; established lower-register drop; quieter
near-same-pitch return after a gap; low-rev returning blip; weak-pedal peak glide;
steady voiced pitch fall; and the recently added rounded return. It tracks history,
`gap`, `blip`, `loweredPitch`, `pendingUp`, `pitchFallTime`, `softFallTime` and
`glideBlockedUntil`. General downshift cooldown is 0.9 seconds; some ambiguous up
requests may defer up to 0.25 seconds. Read the actual branches before changing a
threshold: their interactions are a plausible source of conflicts, not a proven
diagnosis of the latest live failure.

The latest rounded-return path uses a local 0.7-second rev window; an established
rise; 0.35–0.6 seconds after the peak; a pitch fall to <= 88% and RMS <= 85% of
the peak; at least two downward pitch steps; no >2% step rebound; no abrupt >14%
single pitch fall; no >120 ms gap between voiced history points; and no deep RMS
release below max(gate*2, peak RMS*0.25). Earlier paths remain active too.

## 5. What the AI actually is — and is not

Read `assets/voice-pitch/MODEL_CARD.md` and `provenance.json`.

- CREPE tiny is a **pretrained pitch estimator**, bundled locally via the ml5.js
  conversion. Its model weights were not trained/fine-tuned on these videos.
- There is currently **no trained up/down gesture classification model**.
- RPM, throttle, direction, gear, neutral and brake decisions are mappings and
  hand-written state machines around pitch/volume, not CREPE predictions.
- The Porsche/IMG_3313 work produced signal calibration and tests. Calling this
  “training” in conversation does not mean neural training occurred.
- The user's earlier estimate of roughly 75% for a Porsche-reference stage was
  subjective feedback, not a measured accuracy benchmark.

## 6. Current onboarding implementation and its critical limitation

Root Home/Settings offer **Set up your voice**. First launch opens it unless a
valid saved profile or a skipped/seen marker exists.

Flow:

1. Begin: microphone permission and local pitch model readiness.
2. Quiet: 3 seconds of room measurement.
3. Rev: 5 seconds of comfortable low-to-high rev.
4. Up practice: two consecutive recognised upshift attempts.
5. Down practice: two consecutive recognised downshift attempts.
6. Save validated profile, or use it for the session if storage is unavailable.

Each practice attempt lasts at most 7 seconds and ends on the **first detected
direction**. It calls the same `input.detectShift()` with gear 4,
`secondsSinceShift=2` and **fixed practice RPM=8.8**. It does not drive the real car.
The dial moves with input level; the text says the practice window is open.
Detectors, model and blend are reset between attempts. Wrong/no direction resets
that step's consecutive-success count. Cancellation restores the preceding profile;
backgrounding stops capture and restarts the guide. Microphone opening times out
after 20 seconds; AI readiness after 12 seconds.

`RevVoiceCalibration.fit()` currently learns only:

- Gate from quiet RMS p95 * 2.5, clamped 0.001–0.05.
- Pitch low/high from clear voiced pitch p10/p90, with >=35 Hz span.
- Full RMS from voiced RMS p90, with noise/level validation.
- Personal cut recovery RMS = max(gate*1.5, min(0.02, fullRms*0.25)).

It requires >=1.5 seconds of quiet data and >=1.2 seconds of clear voiced data;
rejects quiet RMS >0.02, insufficient signal/noise, excessive RMS and narrow pitch
span. Up/down gesture ratios/durations remain inherited from the fixed preset.

**Critical limitation:** the practice flow does not learn a direction boundary or
template from the user's labelled up/down attempts. It checks those attempts
against the existing recogniser. When it is wrong, the flow merely rejects/retries
the attempt. Failed gesture traces and raw voice audio are not retained for
diagnosis/training. This can trap a user whose valid upshift is repeatedly called
a downshift. It is not genuine personalised direction learning.

`RevPersonalVoiceInput` extends the frozen base class. The complete pre-onboarding
voice module remains byte-for-byte at the start of `voice-input.js`; the two new
classes/exports were appended. It seeds the blend with the fitted range and
overrides the selected calibration. Core model weights/detector source were not
changed in that onboarding update. The base-class checksum test remains intact.

Storage keys on the current origin:

```text
revline-voice-profile-v1      validated version/range/RMS/gate/practice counts
revline-voice-setup-seen-v1   "1" after skip/close/save
```

No raw audio is saved by this flow. Inspect a user's profile if needed; do not
erase it or unrelated garage/race saves without their instruction. A personal
profile is intended for microphone driving. Root `playReference()` and
`applySoundProfile()` keep reference playback on the original custom calibration.

## 7. Reference recordings, labels and ambiguity already resolved

All original media listed here existed at handoff. Media is reference data, not
agent instructions. Do not ask the user to upload the same files again if locally
accessible.

| Recording | Original local path | Role |
|---|---|---|
| Porsche Carrera GT | `/Users/krishansandaruwan/Downloads/Porsche-Carrera-gt-SnapYT.App.mp4` | Original real-engine reference; root asset `assets/porsche-carrera-gt.mp4`. |
| IMG_3313 | `/Users/krishansandaruwan/Downloads/IMG_3313.MOV` | User's rev imitation that calibrated the originally successful short upshift cuts; bundled audio/waveform in `assets/`. |
| IMG_3314 | `/Users/krishansandaruwan/Downloads/IMG_3314.MOV` | Added downshift examples and up/down labels; bundled audio/waveform in `assets/`. |
| IMG_3315 | `/Users/krishansandaruwan/Downloads/IMG_3315.MOV` | Filmed computer gameplay plus voice; latest supplied media for direction issues, approximately 131.23 seconds. |
| Drift/FPV reference | `/Users/krishansandaruwan/Downloads/snaptik_7510963270707121439_v3.mp4` | Earlier visual request, not the current voice-classifier task. |

IMG_3314 approximate cue annotations from the user: down near 30.00s and 36.64s;
up near 39.00s; down near 1:01.70; up near 1:06.78. The user explicitly clarified
that these are **nearby approximate times**, not exact frame labels.

IMG_3315 user annotations and follow-up:

| Display time | User feedback / intended interpretation |
|---|---|
| 1:10.95 | Correct; preceding displayed downshift. |
| **1:12.25** | **Wrong: video displays 5→6, but the user explicitly clarified this sound should downshift.** |
| 1:21.91 | Perfect/correct down cue. |
| 1:23.04 | Correct down cue. |
| 1:24.95 | Correct down cue. |

The initial verbal description mentioned unwanted 5→4 instead of intended 5→6.
After inspecting the marked 1:12 frame, the agent asked for clarification; the
user answered **“That sound should downshift.”** Use this later clarification for
that particular event, rather than reversing its label back to the initial account.
The user also said two complete descending runs in the video were correct and
should be preserved. Do not infer labels for every other sound from existing
program output.

There is no newly supplied recording of the latest **onboarding** up→down failure
as of this handoff. Its existence is a direct user report, not a captured fixture.

### Durable feature fixtures and their limits

`tests/fixtures/rev-3313-features.json`, `rev-3314-features.json` and
`rev-3315-features.json` retain extracted pitch/RMS features. The IMG_3315 fixture
contains the complete 2622-row camera-audio trace, source hash, method, labels,
limitations and a compatibility baseline.

IMG_3315 source SHA-256:
`fcf6219dfb378d36aec70beb68eab1b8df73ef118749d978fb1c33d943bfa3e0`.

Its method: mono 48 kHz camera audio, approximately 45 Hz high-pass; 8192/1024
sample RMS windows; 50 ms feature hop; local CREPE inference every 100 ms, with
confidence hold/fallback modeled in replay. The camera microphone is **not** the
original computer microphone stream; filtering, gain, pitch estimation and timing
can differ. Full fixed-RPM replays did not match all photographed gears.

Local tests initialise a gear and arm a fixed 8.5k window to isolate marked cues.
Pitch-scaled cases are synthetic robustness checks, not measured live accuracy.
The whole-trace compatibility baseline preserves prior algorithm output; it is
**not ground-truth annotation of every event**.

Useful temporary analysis directory, present at handoff:
`/tmp/revline-3315-review/`. It contains `voice.wav`, `filtered.f32`, `features.cjs`,
`features.json`, replay scripts/JSON, full frames, contact sheets and OCR attempts.
`frame72.png`, `near72.jpg` and `near84.jpg` show the marked displays. OCR was sparse
and unreliable; do not treat `gear-timeline.json` gaps as unchanged-gear evidence.
Temporary files can disappear. The repository fixtures and originals are the
durable sources; copy useful temporary diagnostics if you need to retain them.

## 8. Change history and available safety snapshots

The archives below have matching `.json` SHA manifests in `.checkpoints/`.
Several were extracted and verified in scratch directories when made. Treat the
manifests and archive contents as the exact source of truth; some early small
archives are source snapshots rather than complete asset backups.

| Snapshot (all dates 2026-10-25) | State before the named change |
|---|---|
| `shift-up-perfect-before-IMG_3314-2026-10-25.tar.gz` | Early user-approved upshift stage, before downshift experiment. |
| `before-simulator-upgrade-2026-10-25.tar.gz` | Before pitch-downshift/trees/limiter/instrument/rolling-neutral work. |
| `before-exhaust-ios-2026-10-25.tar.gz` | Before exhaust feedback and native iPhone work. |
| `before-curves-race-settings-2026-10-25.tar.gz` | Before curved roads/race/settings update. |
| `before-fpv-events-shop-2026-10-25.tar.gz` | Before the later removed/deferred FPV/events/shop experiment. |
| `before-free-garage-2d-2026-10-25.tar.gz` | Before that intermediate garage/visual experiment. |
| `before-topdown-cleanup-2026-10-25.tar.gz` | Before returning to the clean top-down scene. |
| `before-voice-module-2026-10-25.tar.gz` | Before consolidating voice logic into one module; small source archive. |
| `before-shift-direction-fix-2026-10-25.tar.gz` | Earlier direction-fix source snapshot; inspect manifest for scope. |
| `before-voice-blend-trial-2026-10-25.tar.gz` | Before 50/50 pitch+volume trial. |
| `before-shift-window-engine-failure-2026-10-25.tar.gz` | Before 7–10k recognition window/timing/failure change. |
| `before-soft-downshift-trial-2026-10-25.tar.gz` | 61-file stage before small paired-dip downshift experiment. |
| `before-IMG_3315-tuning-2026-10-25.tar.gz` | 62-file mostly-working soft-downshift stage, before IMG_3315 rounded-return correction. |
| `before-direction-refinement-2026-10-25.tar.gz` | 64-file state after first IMG_3315 correction, before further refinement. |
| `before-voice-onboarding-2026-10-25.tar.gz` | 64-file state after direction refinement, before personal setup. |

Relevant active manifests: `active-voice-trial.json`,
`active-shift-window-update.json`, `active-soft-downshift-trial.json`,
`active-IMG_3315-tuning.json`, `active-direction-refinement.json`,
`active-voice-onboarding.json`. They identify changed and newly added files.

Recent sequence:

1. Pitch+volume blend trial was added with Settings Off selecting prior control.
2. Recognition was armed from 7k, timing grades and three-second engine failure
   were implemented. Core upshift algorithms remained protected.
3. A small continuous paired pitch/volume fall was added to downshift detection.
4. IMG_3315 tuning added rounded-return evidence above an old pedal cutoff. Tests
   reproduced an up/down mismatch at higher pitch scales. **User felt worse.**
5. A refinement used a local rev peak, multiple descending steps, rebound/deep-cut
   rejection and stale-spike handling. Synthetic regression cases passed.
   **User still did not accept the live direction behavior.**
6. Guided personal calibration/practice was added. The base module was preserved
   as an unchanged prefix, with new classes appended. **Latest user reports the
   guide itself calls their upshift a downshift.**

For any future requested restore: inspect the intended stage with the user, use
the matching manifest, restore only affected files, preserve unrelated later work
and device saves, verify original hashes/lock, and run the restored checks. Tests
may depend on older checkpoint JSON manifests even when archives exclude the
checkpoint directory. Do not overwrite the entire workspace or delete frontend/
while restoring a voice experiment. **No restore is requested now.**

## 9. Tests: useful protections, insufficient live acceptance

Run the configured complete command without duplicating a stale test list:

```sh
node -e "require('child_process').execSync(require('./premium-ui.json').commands.unit,{stdio:'inherit'})"
```

There are currently 14 Node assert-based suites, followed by the voice-lock check.
Last implementation run passed all of them. Not rerun merely to write this file.

| Suite | What it mainly checks |
|---|---|
| `audio-model` / `voice-ai` | Mapping, cuts, resampling, pitch decode, inference lifecycle, stale fallback. |
| `custom-voice` | Earlier short-cut/upshift fixtures. |
| `downshift-trial` | Earlier labelled recordings, protected original section hashes, silence/manual neutral, synthetic pitch fall/blips. |
| `voice-input` / `voice-blend` | Capture lifecycle, source cancellation, blend mapping and older fixture sequences. |
| `soft-downshift` | Synthetic paired drops, jitter/latency/quiet-cut checks; pins the pre-soft-trial `RevVoiceInput` class hash. |
| `recorded-downshift` | IMG_3315 isolated cues, register scaling, compatibility replay, synthetic rebound/deep-cut/stale-spike cases. |
| `voice-setup` | Fit/validation, personal-profile synthetic gestures, practice counts, save/cancel/reload, storage failure, permission/timeout/background recovery and reference guard. |
| `driving-feedback` / `shift-window` | Actual game bridge, grades, limiter, engine failure and lack of RPM-only shifts. |
| `exhaust-feedback` / `driving-scene` / `garage-options` | Non-voice gameplay and UI cleanup regressions. |

The native DEBUG self-check likewise uses generated signals for direction probes
and synthetic measurements for personal calibration. `narrowVoiceSetup` checks
six dialog states for width and button height. It does **not** record the user's
actual up/down examples or demonstrate live direction accuracy. The personal
calibration self-check supplies practice counts in code to test profile plumbing;
that is not human completion of onboarding.

Current tests are useful regression boundaries but must be supplemented with the
latest real failing gestures. Some expected outputs are historical program
behavior, so a passing test can preserve a wrong decision. Do not update expected
labels or checksums merely to get green output.

## 10. Diagnostic gap and a suggested next investigation

These are recommendations for a future authorised fix, not changes implemented
by this handoff.

First reproduce the user's intended upshift in the current setup without asking
them to change their voice to satisfy a failing recogniser. Identify whether the
core cut detector requested up and was overridden, or whether it never armed.

Useful decision trace on one monotonic clock:

- Frame time/dt and actual input sample rate; microphone/reference mode.
- Raw full RMS and recent activity RMS; gate/sensitivity; active/quiet state.
- Raw clear AI pitch, confidence, inference timestamp/age and fallback source.
- Gesture pedal versus blended pedal; personal range/profile and blend state.
- Core up request, cut valley/return timings and peak ratios.
- Each down candidate's reason and state, any pending/deferred up, cooldown.
- Final direction, intended user label, pre/post gear and displayed RPM.

Existing Export run CSV in `game.js` is a coarse telemetry export, not this trace.
Its fields are time/input/profile/band/RMS/estimated RPM/throttle/gear/speed/pitch
source. It lacks direction reason, raw up request, recent RMS, AI confidence/age,
and intended labels. It does not export raw microphone audio.

An opt-in, short synchronized capture of the actual app microphone input plus
decision trace could resolve the camera-vs-live mismatch. Such a recorder was
discussed but **not implemented**; current onboarding explicitly says raw audio is
not saved. If adding one, make that change clear to the user, keep it local and
bounded, and preserve the prior no-recording behavior outside diagnostics.

Use the existing recordings/confirmed labels first. If more evidence is required,
ask for one targeted current-device failure, not a repeat of every previous
upload. Compare identical input through checkpoints in isolated scratch copies;
do not revert the user's installed/current project as a diagnostic shortcut.

If onboarding is meant to learn the user's gesture classes, the current
check-against-the-existing-detector loop is insufficient. A future design needs
user-labelled examples, independently validated separability and held-out/live
checks. Whether this needs templates, a smaller state machine or a learned
classifier should follow evidence, not an assumption that CREPE already performs
gesture classification. Evaluate false up, false down, missed cues and latency
separately; do not claim a percentage without defined labelled ground truth.

## 11. Running the root app and the iPhone build

Browser, from workspace root:

```sh
python3 -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173/` for the root app; `/frontend/` is the separate skin.
Use an HTTP loopback server, not file://, for Web Audio/model assets. A server on
5173 was started during the previous work and may still be serving both surfaces;
check before starting/stopping it. Browser and native loopback origins have
different local storage.

iPhone details used in this session:

```text
Device: iPhone 16 Pro
Identifier: 00008140-00045DA11184801C
Bundle ID: com.krishansandaruwan.revline
Xcode: /Applications/Xcode.app/Contents/Developer
Project: ios/RevLine.xcodeproj
Scheme: RevLine
Build output: ios/build/Build/Products/Debug-iphoneos/RevLine.app
```

Existing convenience script: `scripts/install-ios.sh <device-identifier>`.
Explicit commands used successfully (follow your environment's permission policy):

```sh
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild \
  -project ios/RevLine.xcodeproj -scheme RevLine -configuration Debug \
  -destination 'generic/platform=iOS' -derivedDataPath ios/build \
  -allowProvisioningUpdates build

env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl device install app \
  --device 00008140-00045DA11184801C \
  ios/build/Build/Products/Debug-iphoneos/RevLine.app --timeout 60

env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl device process launch \
  --device 00008140-00045DA11184801C --terminate-existing --timeout 30 \
  com.krishansandaruwan.revline --revline-self-test
```

The debug check writes `Documents/native-smoke-check.json` in the app container:

```sh
env DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl device copy from \
  --device 00008140-00045DA11184801C --domain-type appDataContainer \
  --domain-identifier com.krishansandaruwan.revline \
  --source Documents/native-smoke-check.json \
  --destination /tmp/revline-native-check.json --timeout 30
```

Launch without `--revline-self-test` afterward for normal play. These are
operational instructions, not a request to install anything during this handoff.
Device auto-lock repeatedly blocked launch; installation could succeed while
launch failed with `FBSOpenApplicationErrorDomain: Locked`. Ask the user to unlock
when a real device launch is needed; do not misreport that as a source/build error.

The host uses a stable loopback origin (port 18743), serves bundled assets offline
with no-store behavior, requests microphone access after user action and stops
capture on backgrounding. iOS staging verifies `voice-lock.json` before copying.
Do not hand-edit the built app's Web folder; rebuild from root sources.

Last final build/install/native self-check succeeded and the app was launched in
normal mode. The **subsequent user test rejected its direction recognition**.
The last native result is available at
`/tmp/revline-onboarding-iphone-final-verified.json` (temporary diagnostic).

## 12. Freeze policy, evidence files and non-goals

The user requested the separated voice module stay locked against unrelated UI
work. `AGENTS.md` allows explicitly requested voice fixes/changes after preserving
a verified checkpoint. Keep core approved detector/preset/AI source protected
unless the new task specifically requires changing it. Refresh lock hashes only
after a reviewed authorised change, not to hide drift.

Current `voice-input.js` lock SHA-256:
`6d46679e18c40b6d92c721ab89570f7f0315d6f5173879ba594dcbdffe3268d1`.
Use `voice-lock.json` for all model/runtime hashes. Its `status: frozen` means
source integrity protection, **not that current recognition is correct**.

Prior verification artifacts still present in /tmp include native check JSON,
build logs, `/tmp/revline-onboarding-premium-audit.json` and
`/tmp/revline-onboarding-shipping-audit.json`. The root shipped UI snapshot's strict
audit had zero findings; whole-workspace audit had 17 findings in the separate
frontend directory. DESIGN.md lint had zero errors and five token-description
warnings. These are UI/static checks and irrelevant as proof of voice accuracy.

The `michael.gaming92/` research archive is about 1.1 GB and intentionally outside
the app bundle. Store audio previews are reference excerpts, not isolated engine
loops or a complete factory sound database. Preserve that archive, original
Downloads videos, checkpoints, garage ownership, race saves and separate frontend
work. Do not broaden a voice fix into visual redesign, model downloading,
retraining, FPV, store changes, obstacle work or an automatic rollback.

## 13. A useful acceptance bar for the next iteration

- The latest intended upshift works in **Set up your voice** and during actual
  microphone driving; the user confirms it, not only a generated test.
- Genuine downshifts and the confirmed descending examples remain downshifts.
- Steady/rising revs and brief inference glitches do not invent shifts.
- Collected failures have explicit intended labels and reproducible traces.
- A personalised setup must not trap the user behind its own incorrect classifier
  or present a failed attempt as learned/successful.
- The original regression checks and unrelated driving/neutral behavior remain
  protected; changes, failures and limitations are reported plainly.

The next agent should be able to begin from this document and existing files
without asking the user to recount the entire project history.
