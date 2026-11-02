# CREPE voice pitch in RevLine

Pretrained CREPE tiny, converted by ml5.js and bundled locally. The exact upstream
commit, original file hashes, packaging change and runtime hash are recorded in
`provenance.json`. No weights were trained or fine-tuned on the Porsche video.

The model estimates fundamental pitch from a 1,024-sample, normalized, 16 kHz
mono frame. RevLine requests up to ten predictions per second. It accepts recent
predictions with a voicing score of at least 0.65; results older than 300 ms,
unclear results and model failures use the existing spectral voice detector.
Silence invalidates pending predictions and releases throttle immediately.
Engine mode never uses this model. Audio stays on-device.

This is **not an RPM, throttle, gear, neutral or brake prediction model**. Those
values remain part of the app's control mapping and simulation.

Browser checks using harmonic-rich synthetic signals produced:

| Input fundamental | Estimated fundamental |
|---|---|
| 100 Hz | 100.2 Hz |
| 180 Hz | 180.4 Hz |
| 300 Hz | 300.9 Hz |
| 500 Hz | 499.8 Hz |

Warm inference averaged approximately 10 ms on this computer's Chrome WebGL
backend. Tests also exercised stale-result rejection, fallback, tensor cleanup,
manual neutral, and a generated microphone stream through the live controller.
These checks do not establish accuracy on the user's voice, noisy rooms or
unpitched growls. Real rev imitation accuracy needs recorded examples and a
defined target throttle/RPM trace; no percentage is claimed.

Source: https://github.com/marl/crepe. MIT license: `CREPE-LICENSE.txt`.
