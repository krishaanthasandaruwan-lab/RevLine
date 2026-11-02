#!/usr/bin/env python3
"""Import round/region intro videos listed in frontend/ART-REQUESTS/video-sources.json.

Each source is re-encoded for the app (H.264, 720 px wide, no audio because the intro plays
muted, fast start so it begins at once), saved as frontend/shared/art/videos/<id>.mp4 and
listed under "videos" in the art manifest. Ids are a region (r1) or a round (r1m20); the race
lobby plays the round's video first, else its region's.

Usage: python3 scripts/import-videos.py    (requires ffmpeg)
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / 'frontend/ART-REQUESTS/video-sources.json'
MANIFEST = ROOT / 'frontend/shared/art/manifest.json'
OUT = ROOT / 'frontend/shared/art/videos'


def main():
    sources = json.loads(SOURCES.read_text())
    manifest = json.loads(MANIFEST.read_text())
    manifest.setdefault('videos', {})
    OUT.mkdir(parents=True, exist_ok=True)
    for video_id, source in sources.items():
        target = OUT / f'{video_id}.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(ROOT / source), '-an', '-vf', 'scale=720:-2',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(target)], check=True)
        manifest['videos'][video_id] = str(target.relative_to(ROOT))
        print(f'{video_id}: {source} → {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KB)')
    MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
