#!/usr/bin/env python3
"""Import generated images from frontend/ART-REQUESTS/incoming/ into the game.

For each file whose name matches a request in requests.json (any of .png .jpg .jpeg .webp):
removes the green/magenta chroma key, trims, resizes, saves to the request's target under
frontend/shared/art/ and lists it in frontend/shared/art/manifest.json. Re-running replaces
earlier imports, so a bad image can be regenerated and imported again.

Usage: python3 scripts/import-art.py [--dry-run] [--missing]
Requires Pillow (pip3 install pillow).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
REQUESTS = ROOT / 'frontend/ART-REQUESTS/requests.json'
INCOMING = ROOT / 'frontend/ART-REQUESTS/incoming'
MANIFEST = ROOT / 'frontend/shared/art/manifest.json'
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp'}


def remove_key(image, key):
    """Alpha from how strongly a pixel matches the key colour; edges are de-spilled."""
    rgba = image.convert('RGBA')
    r, g, b, a = rgba.split()
    if key == 'green':
        excess = ImageChops.subtract(g, ImageChops.lighter(r, b))
    else:  # magenta
        excess = ImageChops.subtract(ImageChops.darker(r, b), g)
    alpha = excess.point(lambda v: 255 if v < 40 else 0 if v > 110 else int(255 * (110 - v) / 70))
    alpha = ImageChops.multiply(alpha, a)
    # Remove the key's tint from fringe pixels only, so the subject's own colours stay.
    fringe = excess.point(lambda v: 255 if v > 12 else 0)
    if key == 'green':
        g = Image.composite(ImageChops.subtract(g, excess), g, fringe)
    else:
        r = Image.composite(ImageChops.subtract(r, excess), r, fringe)
        b = Image.composite(ImageChops.subtract(b, excess), b, fringe)
    return Image.merge('RGBA', (r, g, b, alpha))


def trim(image):
    box = image.split()[3].point(lambda v: 255 if v > 16 else 0).getbbox()
    return image.crop(box) if box else image


def fit(image, size, tight):
    """Cars keep their trimmed shape (the game sizes them by width); props sit centred on the canvas."""
    width, height = size
    scale = min(width / image.width, height / image.height)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.LANCZOS)
    if tight:
        return resized
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(resized, ((width - resized.width) // 2, (height - resized.height) // 2))
    return canvas


def cover(image, size):
    width, height = size
    scale = max(width / image.width, height / image.height)
    resized = image.convert('RGB').resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    left, top = (resized.width - width) // 2, (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def main():
    dry = '--dry-run' in sys.argv
    requests = json.loads(REQUESTS.read_text())['requests']
    by_stem = {Path(r['name']).stem: r for r in requests}
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    for section in ('cars', 'props', 'videos'):
        manifest.setdefault(section, {})
    found, unknown = set(), []
    for source in sorted(INCOMING.rglob('*')) if INCOMING.exists() else []:
        if source.suffix.lower() not in EXTENSIONS:
            continue
        request = by_stem.get(source.stem)
        if not request:
            unknown.append(source.name)
            continue
        found.add(source.stem)
        target = ROOT / request['target']
        print(f"{'would import' if dry else 'import'} {source.name} → {request['target']}")
        if dry:
            continue
        image = Image.open(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        if request['key'] == 'none':
            cover(image, request['size']).save(target, quality=86, optimize=True)
        else:
            art = trim(remove_key(image, request['key']))
            out = fit(art, request['size'], tight=request['slot'][0] == 'cars')
            # WebP keeps transparency at a fraction of PNG's size (iOS 14+ and all current browsers).
            out.save(target, quality=86, method=6) if target.suffix == '.webp' else out.save(target, optimize=True)
        section, key = request['slot']
        manifest[section][key] = request['target']
    if not dry and found:
        MANIFEST.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'{len(found)} imported, {len(by_stem) - len(found)} still to generate.')
    if unknown:
        print('Not in requests.json (check the name):', ', '.join(unknown))
    if '--missing' in sys.argv:
        for request in requests:
            section, key = request['slot']
            if key not in manifest[section]:
                print('  missing', request['name'])


if __name__ == '__main__':
    main()
