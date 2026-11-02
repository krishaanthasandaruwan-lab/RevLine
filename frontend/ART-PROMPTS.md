# Optional generated art (Google Flow)

> **Superseded by [ART-REQUESTS/](ART-REQUESTS/README.md):** the full prompt sheet (204 images),
> references, and `scripts/import-art.py`, which removes backgrounds and fills the manifest. Car
> art is now keyed by car id (all 42 cars). The notes below are kept for the original 8 cars.

The game already draws all art in code. Generated images are optional upgrades: drop a
file in, list it in `shared/art/manifest.json`, and it replaces the procedural version.
Nothing is requested unless it is listed, so missing files never break the game.

## How to add a generated image

1. Generate with the prompt below. Flow usually returns a solid background, so remove it
   (macOS Preview → *Remove Background*, or any background remover) and export **PNG**.
2. Crop tightly. Cars must point **up** (front at the top).
3. Save with the exact file name, e.g. `frontend/shared/art/cars/supra.png`.
4. Add it to the manifest:

```json
{ "cars": { "supra": "frontend/shared/art/cars/supra.png" },
  "props": { "tree": "frontend/shared/art/props/tree.png" } }
```

Car images replace only the **player** car (traffic and rivals stay procedural and tinted).

## Shared style line (put at the start of every prompt)

> Top-down orthographic view, mobile racing game asset, bold cartoon style, thick dark
> navy outlines, flat bright colours with one soft glossy highlight, no perspective, no
> text, no shadow on the ground, centred, isolated on a plain flat white background.

## Cars — `shared/art/cars/<id>.png` (portrait, about 480 × 900 px)

| File | Prompt (after the style line) |
|---|---|
| `gt.png` | A blue (#1565c0) Porsche Carrera GT style mid-engine supercar seen from directly above, front pointing up, twin yellow racing stripes, dark tinted glass, low rear deck. |
| `rx7.png` | A yellow (#e2b83d) Mazda RX-7 FD style rounded sports car from directly above, front pointing up, pop-up headlights closed, small rear lip spoiler. |
| `supra.png` | An orange (#dc7939) Toyota Supra MK4 style sports car from directly above, front pointing up, tall rear wing, rounded nose. |
| `r34.png` | A blue (#2b75b9) Nissan Skyline R34 GT-R style boxy coupe from directly above, front pointing up, tall rear wing, bonnet vents. |
| `mustang.png` | A gunmetal grey (#505862) 1965 Ford Mustang fastback style muscle car from directly above, front pointing up, one wide white centre stripe. |
| `s2000.png` | A red (#c7443b) Honda S2000 style roadster from directly above with the roof open, two red seats and roll hoops visible, front pointing up. |
| `civic.png` | A white-silver (#d1d9df) Honda Civic Type R hatchback from directly above, front pointing up, large rear wing, red accents. |
| `lfa.png` | A dark red (#913a3e) Lexus LFA style wedge supercar from directly above, front pointing up, small rear spoiler, side vents. |

## Track props — `shared/art/props/<name>.png`

| File | Size | Prompt (after the style line) |
|---|---|---|
| `tree.png` | square 512 | One round leafy tree canopy seen from directly above, several green lobes, lighter top-left highlight. |
| `bush.png` | square 256 | A small round green bush seen from directly above. |
| `tent.png` | square 512 | A square pop-up event tent seen from directly above, four triangular roof panels, blue and white. |
| `grandstand.png` | 560 × 800 portrait | A race-track grandstand seen from directly above, long side vertical, tiered seats full of a colourful cheering crowd facing right, red and white striped roof strip on the left edge, red banner wall on the right edge. |
| `billboard.png` | 160 × 520 portrait | A tall thin trackside advertising board seen from directly above, blue face with a bold orange abstract speed swoosh, no letters. |

Grandstand and billboard art is drawn for the **left** side of the road and mirrored for
the right, which is why the prompts ask for no text.

## Videos

None are needed. The menu background is a live render of the track, so it always matches
the selected car.
