"""Bundle the shared simulator without making a second editable copy."""
from pathlib import Path
import hashlib
import json
import shutil
import sys

root = Path(__file__).resolve().parent.parent

def verify_voice_lock():
    lock = json.loads((root / 'voice-lock.json').read_text())
    for name, expected in lock['files'].items():
        file = root / name
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise SystemExit(f'Frozen voice file changed: {name}. See AGENTS.md; do not silently refresh the lock.')
    print('Frozen voice module, calibration and AI assets verified')

if sys.argv[1:] == ['--check-voice-lock']:
    verify_voice_lock()
    raise SystemExit(0)
if len(sys.argv) != 2:
    raise SystemExit('Usage: stage-ios-web.py <app/Web> or --check-voice-lock')
destination = Path(sys.argv[1]).resolve()
if destination.name != "Web" or destination.parent.suffix != ".app":
    raise SystemExit("Destination must be the Web folder inside a built .app")
verify_voice_lock()
if destination.exists():
    shutil.rmtree(destination)
destination.mkdir(parents=True)
for source in [root / "index.html", root / "THIRD_PARTY_NOTICES.md", *root.glob("*.js"), *root.glob("*.css")]:
    shutil.copy2(source, destination / source.name)
shutil.copytree(root / "assets", destination / "assets")
# The new game UI (Home / Garage / Race) loads the same root backend through <base href>.
# ART-REQUESTS (prompts, references), Images and Videos (raw generated originals, imported
# into shared/art by scripts/import-art.py / import-videos.py) are for making art, not game files.
shutil.copytree(root / "frontend", destination / "frontend", ignore=shutil.ignore_patterns("ART-REQUESTS", "Images", "Videos"))
print("Bundled shared RevLine web assets and frontend")
