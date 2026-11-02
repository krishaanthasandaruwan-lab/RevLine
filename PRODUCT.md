# RevLine

RevLine is a local voice-driven racing simulator, developed with a Sinhala/English
speaking user for an external iPhone and the browser. Its central interaction is
making rev sounds to accelerate and using short acoustic cues to shift gears.
Preserve the approved upshift detector and calibration, silence downshifts,
manual / automatic neutral, braking and rev-limiter feedback.

The user requested a game-style Home with Race, Free Drive, Store and Garage,
referencing Need for Speed: Most Wanted's navigation and car ownership flow.
The existing blue instruments and simple controls remain the visual identity.
Claiming a car in the Store adds it to the local collection; Garage selects the
owned car, engine sound and turbo. **All cars and parts are free for testing.**
Previous local credits remain stored, with no spending or rewards in this build.
There are no accounts, real-money payments, subscriptions or Pro entitlements.

Car sound satisfaction is the central aim. This build provides eight short source
previews, selected from the existing Porsche clip and the downloaded reference
archive. Engine sound names follow the visible segment label, not repeated upload
captions. Excerpts can retain source mixes; they are not validated isolated engine
loops or a factory specification database. This update implements previews in the
Store and Garage, preserving the microphone/reference input behavior during driving.

The game uses the original top-down car scene. The user deferred FPV and removed
the generated car sprites/models and the entire roadwork/obstacle option, including
its extra high-gear grip penalties and NPC incident/recovery system. Traffic,
curved roads, three-opponent local races, drift, difficulty, engine previews and
Settings remain. Preserve unrelated player driving behavior during voice changes.

The controls use simple touch buttons: steering/drift on the left, neutral/brake
on the right, compact instruments and a non-interactive voice-level bar. There
is no on-screen accelerator button: voice controls acceleration. Page markup,
styles and runtime are kept in index.html, game.css and game.js respectively.
Voice capture, calibration, signal analysis, shift cues and local AI are isolated
in voice-input.js. Game UI, vehicle physics and visuals consume its results.
The user froze this voice baseline. voice-lock.json and AGENTS.md protect it from
unrelated updates; tests and iPhone staging check the recorded hashes.

The user authorized a reversible pitch + volume averaging trial. Its adaptive
50/50 mix affects voice rev/throttle response; established up/down gestures remain
calibrated. Settings can switch back to the previous control. A verified complete
pre-trial archive is the current rollback target when the user asks to go back.

The user then requested recognition across 7–10k RPM, upshift timing grades
(Early below 8.5k, Perfect at 8.5–9.5k, Late above 9.5k), and engine failure after
more than three continuous seconds at the 10k marker while driving. RPM only arms
the sound detector; a genuine gesture is still required. Neither low-envelope
cuts nor downshifts should be lost because blended throttle and gesture throttle
have different scales. Neutral free revs and manual/automatic neutral rules remain.

The user then approved current upshift behavior and requested a reversible
downshift-only trial for a small simultaneous pitch/volume dip during an unbroken
rising rev. Preserve current upshift recognition, game physics and presentation.
The exact approved pre-experiment state is saved in the before-soft-downshift
checkpoint; it is the latest explicit rollback target when the user asks to undo
this downshift experiment.

For IMG_3315 the user clarified that the upshift shown near 1:12.25 should be a
downshift. Recognize its sustained rounded rev return across pedal/voice registers
while preserving sharp upshift cuts, the previously correct descending sequence,
all vehicle behavior and the UI. The pre-correction 62-file IMG_3315 checkpoint is
the latest rollback target for this change; earlier experiment backups remain.

The user's next instruction is to improve both shift directions without reverting
the IMG_3315 update. Keep its valid down cue while rejecting recovered-pitch and
deep-release false downshifts; isolate the current rev from older pitch spikes.
This is an incremental voice-only refinement, with no UI or vehicle changes.

User/session instructions are the business authority. The 1.1 GB research archive
under michael.gaming92 is source material and must stay outside the app bundle.

The user requested a first-install introduction that listens to the player's own
voice, configures suitable input values, and teaches when/how to shift. Offer an
optional local setup: quiet room measurement, comfortable low-to-high rev, and two
consecutive recognised up/down gestures each. Use the resulting personal range,
level/noise and recovery settings for microphone play. This calibrates and checks
the existing recogniser; it does not retrain CREPE or promise universal accuracy.
Home/Settings can repeat setup; skip/cancel preserves previous/default control,
and only a completed profile is persisted locally. Do not retain raw voice audio.
