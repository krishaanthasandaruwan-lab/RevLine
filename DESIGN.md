---
version: alpha
name: RevLine
description: A voice-driven simulator with configurable road, traffic and race testing.
colors:
  panel: "#15191e"
  border: "#454b52"
  text: "#edf0f3"
  muted: "#b6bec7"
  accent: "#00e676"
  error: "#ff8585"
typography:
  body:
    fontFamily: "'Segoe UI', 'Noto Sans Sinhala', sans-serif"
  data:
    fontFamily: "'Courier New', monospace"
rounded:
  DEFAULT: "10px"
omitted:
  - section: spacing
    reason: Existing single-screen game uses local instrument dimensions, with no shared spacing scale.
components:
  test-button:
    height: "44px"
  reference-video:
    backgroundColor: "{colors.panel}"
---

The visual reference is the supplied Carrera GT dashboard: blue tachometer,
metal controls, LCD gear display, and a dark instrument surface. Preserve the
existing canvas game. The test panel is a quiet companion for repeated comparison,
with green reserved for input activity and primary playback. No rebrand or remote fonts.

The user works in Sinhala and English. Retain bilingual instructions and familiar
English instrument labels. This is a local testing tool; it does not infer a market
from language. The single screen has no account, server data, or destructive actions.

`game.css` is canonical (runtime ownership model B). Its `:root` variables
`--panel`, `--border`, `--text`, `--muted`, `--accent`, `--error`, `--font-body`,
`--font-data`, and `--radius` map directly to the corresponding values above.
Legacy canvas colors and instrument geometry remain owned by drawing functions.

The race is the primary 540px surface on desktop and fills the native phone view.
Settings owns the input/reference controls, score, calibration and leaderboard in
a native HTML dialog. Its content scrolls; the race stays paused behind it.
At 390px neither the race nor settings overflow horizontally.
The video reserves its 640 / 308 aspect ratio. Test actions retain a 44px target and visible
focus. Buttons express disabled state with native semantics. Status text is the
shared live region; errors stay there with recovery instructions. Reduced motion
disables decorative control transitions. Canvas movement is the tested behavior.

The native sound-profile select deliberately uses the operating system's popup,
keyboard, and focus behavior. Global scrollbar styling lives in game.css.
Playback, loop, and reset own one animation loop. A paused or buffering reference
freezes simulation. A seek resets the model; only replay from the beginning provides
continuous gear inference. Microphone denial keeps the reference flow available.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select in index.html | DESIGN.md | Native operating-system popup | Browser keyboard and narrow viewport |
| Scrollbar | Global index.html stylesheet | DESIGN.md | Standard and WebKit fallback | Computed style and overflow check |
| Dialog | Native HTML dialog in index.html | DESIGN.md | Settings and guided voice setup; native focus containment and Escape | Done/Cancel, Escape, focus restoration and frozen race clock |

RPM, gear, and speed are always labeled estimates. The video is an input, never a
scripted vehicle trajectory. Throttle is an inferred control, not a measured pedal
position. Gear selection, clutch and brake actions are ambiguous from audio alone.
The N ↔ D button explicitly selects manual neutral or resumes in the gear suited
to current speed (first at a stop). Manual neutral allows free revs and coasts;
the user must press again to resume, even after long silence.
Silence releases throttle immediately, with coasting and gradual
downshifts after sustained quiet. More than three continuous quiet seconds selects
automatic neutral. Returning sound must persist for 120 ms before re-engaging the
speed-appropriate gear. Pause freezes these timers; replay resets to manual N.

Voice mode offers a local CREPE pitch model through the AI voice pitch checkbox.
Loading, ready, disabled and fallback states share one stable status region.
A clear recent vocal pitch may replace the standard voice pitch estimate;
Porsche engine mode always keeps its existing spectral detector. Neither the
model score nor simulated RPM is presented as measured real-car accuracy.

The reference selector defaults to the user's IMG_3313 audio with a waveform
derived from that recording. Porsche remains a separate reference and restores
its original engine settings. The custom voice preset shows its 150–300 Hz
matched pitch range instead of the engine-only RPM/Hz control. Per-profile input
settings are retained while switching.
Its upshift cue is the brief acoustic cut itself: raw volume drops together with
a voiced pitch reset, or a short quiet gap followed by sound returning. Pedal
smoothing does not delay cue detection. Sustained stops and uninterrupted rising
revs are not upshift cues; the standard voice profile retains its stricter gesture.

The native **Voice downshift** checkbox defaults on for both voice references and
is retained in microphone mode. It is available in voice profiles with AI enabled.
The current downshift-only trial also confirms a small paired pitch/volume dip
after a continuous upsweep for about 120 ms. No new control or visual is added;
sharp/quiet acoustic cuts keep their upshift interpretation.
Keep the existing upshift detector/preset intact. A sustained falling voiced pitch
must downshift without requiring reduced volume or a low initial throttle. Confirm
the lower tone briefly, reserve short acoustic cuts for upshifts, reject octave
glitches and do not repeat shifts within 0.9 seconds. Standard voice upshift
requests keep priority. The custom profile also
arbitrates ambiguous cuts using a falling glide, short returning rev blip, or quieter
same-pitch return. Its short confirmation window may defer an ambiguous up request.
No timeline may drive the car. The original project and asset hashes are retained
under `.checkpoints` for the user's explicit “back to previous” restore request.

Roadside trees and white/black marker posts scroll at actual road speed, with
staggered spacing and a longer repeat than lane marks. High-speed trails add a
speed cue without changing vehicle acceleration. Preserve the existing car and
blue instrument identity. Progressive green/yellow/red lamps and a double up-chevron
indicate the shift window from 7k visually. Holding a driving gear in the late band
engages a delayed pulsing power cut; the needle and car shudder to show the limiter.
Each actual upshift briefly shows Early below 8.5k, Perfect at 8.5–9.5k, or Late
above 9.5k, using pre-shift RPM. Text and color both identify the timing. Downshifts
show their gear/down arrow. The small live-status popup sits below the instrument
cluster; the canvas accessible label describes the meter state.
Reduced motion removes cosmetic trails/shudder while retaining functional race
movement. Power-cut feedback must never feed back into input pitch/throttle or
change the pitch model. RPM context arms real cuts throughout 7–10k; it never
requests an upshift by itself. Neutral remains free-rev capable. More than three
continuous seconds at the 10k marker ends the run with Engine failure, a reason
and the existing retry action. Release, braking, a gear change or leaving the
9.8–10k marker zone clears the timer before failure. Pauses do not count.

Gear changes use sound; remove manual shift buttons and their keyboard shortcuts.
The bottom-left controls retain steering and the manual N ↔ D button. A smaller
round blue speedometer overlaps the lower-right of the RPM meter, sharing its metallic
bezel and red needle. It displays actual simulated speed on a 0–200 km/h scale,
with a numeric readout and KM/H units. Both instruments update together during
driving, coasting and pause, and the smaller bubble scales down on narrow screens.

Exhaust particles originate at the twin rear outlets. Quick voice onsets produce
small distinct puffs; sustained revs produce lighter wisps. A recently voiced
downshift briefly backfires. Silence-based downshifts do not backfire, and high
RPM alone does not create a permanent flame. Keep exhaust and tire smoke separate,
bound particle counts and freeze them with paused simulation. Generated engine,
shift-click and pop audio are removed. Only the input / reference recording is heard.

The native iPhone host bundles this same simulator, model and references offline.
Its portrait WKWebView respects the phone's safe areas and adds `body.ios-app`:
the race fills the available height, with settings in its accessible modal. Native microphone permission is requested only after the user's action.
Backgrounding stops capture/audio; resuming requires a new microphone action.
Native CSV export uses the system share sheet. Keep the web and native simulator
logic shared. A stable loopback origin preserves the local leaderboard and course
preferences. Native motion/gyroscope controls remain future work.


Traffic, Curved roads and Race are independent native checkbox switches. Plain
mode has all three off; traffic-only, curves with traffic and racing combinations
are supported. Toggling a course starts a new run in manual neutral. Defaults
are the approved plain course and a 1 km race distance; course preferences persist.
A settings change never changes the voice/AI/upshift calibration.

One road model owns paint, lanes, verge scenery, car orientation and collision
bounds. Curves apply outward cornering force. Keep the existing left/right steering
buttons and add separate hold-to-drift buttons (Q/E), with slide inertia, visible
yaw, tire smoke and bounded skid marks above 25 km/h. Release restores grip; verge
contact costs speed. Plain-mode acceleration stays unchanged when not drifting.

Race mode adds exactly three named/color-coded rivals with independent speed and
meter-based distance. Rivals follow the curved course, avoid traffic when a lane
is free and slow if blocked. Finished rivals continue clear of the finish line.
The compact race HUD shows position, distance, progress and rival gaps. Scores stay
in Settings. A checkerboard finish leads to a four-driver result table and Race
again; collision ends the run without saving a completed result. Settings stays
available over result/start overlays. Results save locally by distance/traffic/curves,
show the best ten from a bounded store, and use text-safe rendering. Handle missing
or full storage without losing the visible result. No online leaderboard or account.

Settings uses native dialog focus/Escape behavior, Done and backdrop dismissal.
The dialog owns an 8px boundary inset, with 10px additional horizontal content
padding. Held drift buttons use a solid green pressed state and neutral elevation.
Opening it releases held controls and freezes the scene/reference clock. Input
buttons toggle microphone or recording; successful activation returns to racing.
Score, signal readings, sensitivity and noise gate are inside Settings. Generated
support engine sound and its slider are removed. Reference race loops preserve
progress; explicit replay/source/course changes reset the run.

The only driving view is the original top-down Canvas car scene, with existing
road geometry, trees, car proportions, exhaust, skid marks and traffic. FPV,
projection-camera code, generated car sprites/models and roadwork hazards are
removed. No camera, obstacle or incident toggle is exposed. Normal road/race
behavior remains the baseline; difficulty controls traffic density and rival pace.

The driving HUD stays quiet: Menu and Settings at the top left; race position/
distance below; compact blue RPM/speed instruments at the right; a small voice
level bar below them. Steering (64 × 58px) and drift (64 × 44px) sit at bottom left.
Neutral (56 × 48px) and brake (76 × 70px) sit at bottom right. Controls are flat,
clearly labeled, and distinct from read-only telemetry. Hold, touch-cancel,
keyboard and assistive activation behavior are retained. No fake pedal or touch
dot suggests that the user should tap to accelerate.

Home retains Race, Free Drive, Garage and Store. It shares the actual top-down
car drawing with the race; Store uses compact color-coded car rows. The former
illustrated showroom and sprite atlas are removed. Native buttons own actions;
no remote fonts, 3D dependencies or new bitmap assets. The selected-car Store
action area stays sticky, as do Home/Settings headers. All touch actions have a
44px minimum target, visible keyboard focus and native disabled state.

The free ownership flow, eight source-based previews, local save rollback and
legacy credit preservation remain as documented in PRODUCT.md. Claim a car in
Store, select it in Garage, then choose engine/turbo. Source preview names and
times live in assets/engines/sources.json. Preview audio never enters the analyser
and stops on navigation/backgrounding. Engine mixes are reference excerpts.

index.html owns semantic markup and script order. game.css owns all application
styles and existing root tokens. game.js coordinates game UI, transmission application, physics,
HUD and Canvas drawing. game-menu.js owns Home/Store/Garage navigation; garage.js
owns local inventory/equipment; driving-scene.js owns road/race geometry and
difficulty. voice-input.js is the single owner of capture, sound calibration,
analysis, shift-cue detection and local AI pitch. It has no game UI, car physics or
rendering dependencies; the game consumes its sound data and requested shifts.
The iOS staging script bundles root stylesheets alongside scripts/assets; its
loopback server serves CSS with text/css. The research archive and restore
checkpoints stay outside the shipping app.

The pitch/volume trial reuses the native checkbox, shared switch-line styling and
existing AI status region inside Settings. Its switch defaults on; Off immediately
selects the prior control algorithm and starts a fresh run. Engine mode and AI-off
disable the trial control and preserve their old detector paths. The adaptive range
is displayed next to voice calibration; it learns only from clear on-device pitch
and never changes the frozen preset or model weights. No new driving HUD is added.

First launch offers an optional guided voice setup in a native dialog; Home and
Settings can reopen it. The existing panel, type, radius and button tokens own its
appearance. A compact blue semicircular tachometer illustrates the 7–10k shift
window and 8.5–9.5k perfect band; a green sound trace distinguishes the short up
break from the flowing down gesture. A live level/needle responds during capture,
without decorative looping animation. Step numbering describes the real sequence.
The dialog owns scrolling and sticky 44px+ actions on narrow/short viewports.
Body instructions remain Sinhala/English, with English instrument/action labels.

Microphone access starts only after Begin setup. Each listening attempt is bounded
and stops its microphone afterward. Quiet (3s) and rev (5s) measurements fit a local
pitch range, voice level, noise gate and quiet-voice recovery level. Two consecutive
correct detections per direction verify practice using the actual input pipeline;
the fixed practice window is explicitly labeled, and the vehicle stays paused.
Wrong/missing gestures show actionable retries, never success. Saving requires both
practice steps. Cancel/Escape preserves the previous profile; hidden/backgrounded
setup stops capture and can restart. A saved/skipped setup does not reopen each
launch. Storage failure offers explicit session-only use. Persist only validated
numeric settings/practice completion on this device, never raw audio. Original
reference presets, detector algorithms, model weights and driving rules stay intact.
`voice-setup.js` owns presentation/lifecycle; all sound logic remains in voice-input.js.

Microphone startup (27 Oct): the existing cartoon frontend uses
`frontend/shared/theme.css` and `frontend/race/race.css` (see
`frontend/DESIGN-SYSTEM.md`). The start panel and Sound input controls share
`setStatus` feedback. Permission/startup progress and actionable errors appear
beside Start; Sound input repeats them above the recording controls. Start is
disabled/busy during one request, and the race begins only with an active input.
Recording remains an explicit user action. Native permission is requested from
the app's local main frame before WebKit capture/audio startup; capture attempts
are bounded and late results are stopped. No microphone source, analysis,
calibration, gesture or AI data is sent to a server. The microphone bridge changes
startup only; detector/calibration behavior and model weights stay unchanged.

When the native host has no WebKit microphone API, its AVAudioEngine captures
mono PCM after the same OS permission. A bounded 8192-sample in-memory window is
read into the existing silent Web Audio high-pass/analyser path. This is input
transport only: it never becomes a saved recording or a reference playback.
Native automatic gain control is disabled. Stop, backgrounding, page navigation,
timeout and capture failure release native input; native read failures surface in
the same Sound input feedback. WebKit capture remains the primary path wherever
available. Build 2026102701 added diagnostics; 2026102702 adds this fallback.
