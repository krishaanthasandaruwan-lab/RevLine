# Local voice model

CREPE neural pitch estimation is by Jong Wook Kim, Justin Salamon, Peter Li,
and Juan Pablo Bello: https://github.com/marl/crepe (MIT).
The bundled tiny-model TensorFlow.js conversion comes from
https://github.com/ml5js/ml5-data-and-models/tree/main/models/pitch-detection/crepe.
Its exact commit is recorded in `assets/voice-pitch/provenance.json`.
The MIT notice is included in `assets/voice-pitch/CREPE-LICENSE.txt`.

TensorFlow.js 4.22.0 is bundled under Apache-2.0. Its license is included in
`assets/vendor/TFJS-LICENSE.txt`. The runtime and weights load from this app's
local assets. Voice audio is not sent to an inference service.
