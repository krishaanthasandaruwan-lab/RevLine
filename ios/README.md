# RevLine for iPhone

Open [RevLine.xcodeproj](RevLine.xcodeproj), select the connected iPhone and run
the **RevLine** scheme. The project uses the Mac's existing development team.
The deployment target is iOS 17+. The current vertical race uses portrait mode.

For command-line builds, list paired devices with
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl list devices`,
then run `scripts/install-ios.sh <device-identifier>` from the project root.
This builds, signs, installs and opens the app. Xcode's developer account and the
phone's Developer Mode must already be ready; neither is changed by the script.

The build bundles the shared root HTML/CSS/JS and `assets` directory. Edit those
sources and rebuild; do not edit `ios/build` or duplicate the simulator code.
The offline bundle includes the AI model and both voice references. No Mac web
server, Wi-Fi connection to a development server, or cloud model is required.

The native shell uses WKWebView and a loopback-only asset server. It supports
byte ranges for the audio/video references and restricts paths to the app bundle.
Only the app's own main frame can request microphone access or native CSV sharing.
The app opens on Home with Race, Free Drive, Store and Garage. Use **Settings** for input, calibration, score, the
Traffic / Curved roads / Race switches and the local leaderboard. The smaller
speedometer overlaps the RPM meter at its lower-right. Tap **Use microphone**,
allow microphone access, and use **N ↔ D** to drive.
The first microphone permission belongs to iOS and must be approved on the phone.
CSV export opens the native share sheet. Backgrounding stops microphone capture
and audio; tap **Use microphone** again when returning.

The switches can be combined. Race mode defaults to **1 km** with three rivals
and can include curves and traffic. Hold the separate left/right Drift buttons
above 25 km/h. Generated engine audio is removed; voice-driven exhaust effects
remain visual. Settings pauses the race; changing the course starts a fresh run.

The server uses a stable loopback origin so course preferences and race results
persist across app launches. The Swift host is ready for future Core Motion /
gyroscope integration; tilt steering is not enabled.

Checks:

- Run the root `premium-ui.json` unit command for the shared simulator.
- Compile and run the loopback server check:

  ```sh
  DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swiftc \
    -module-cache-path /tmp/revline-swift-module-cache \
    ios/RevLine/LoopbackServer.swift tests/ios-local-server.check.swift \
    -o /tmp/revline-local-server-check
  /tmp/revline-local-server-check
  ```

- Debug builds launched with `--revline-self-test` check the secure origin,
  microphone API, local model inference, native layout and ranged media fetches.
  The result is written to this app's `Documents/native-smoke-check.json`.
  The check uses a generated tone and does not start the microphone.

All eight cars and every part are free to claim/fit. The bundle includes eight
small source previews and excludes the 1.1 GB reference archive. Local difficulty
offers Easy, Normal and Hard. Existing local race results, preferences and car
ownership use the same stable loopback origin.

The app uses the original top-down car scene. FPV, generated
sprites and obstacle systems are removed. Root game.css is bundled and served as
text/css. Native smoke checks cover the three course switches, simple controls,
touch target spacing, CSS delivery, free inventory, eight previews and the voice model.
