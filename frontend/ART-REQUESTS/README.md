# Art requests

Everything here is for making the game's images. Hand this whole folder to the image agent
(Google Flow, ChatGPT images, Midjourney, or anything else).

| Path | What it is |
|---|---|
| `PROMPTS.md` | The prompt sheet: 208 images, each with its exact file name, size, background key, where the game uses it, and a ready prompt. Start here. |
| `requests.json` | The same list in machine-readable form (used by the import script). |
| `references/screens/` | Screenshots of the current game (home, garage, career map, grass race, dirt race, HUD gauge, win screen) plus `car-sprites.png`, all 42 cars as the game draws them now. They show the style to match. |
| `references/cars/<id>.jpg` | The current store photo of each car (stills from the source videos). Use them for the body shape and colour only. The new portraits replace them. |
| `incoming/` | Put finished images here, named exactly as in `PROMPTS.md`. |
| `SOUND-RESEARCH.md` | Which engine sounds people love most, with sources, and how that sets store prices. |
| `VIDEO-PROMPTS.md` | Draft prompts for the round-intro videos. Make these after the images, from the finished region art. |

## Current art (26 Oct)

All 220 requests are filled from the user's generated set in `frontend/Images/` (Google
Flow file names). `image-sources.json` records which original file became which request,
so a single image can be swapped and re-imported. `frontend/Images/` holds the raw
originals (245 MB) and is not copied into the iOS app. Cut-outs are stored as WebP
(16 MB in total), and pages load each image only when they need it (`car-art.js`).

## After generating

```sh
python3 scripts/import-art.py --dry-run   # check the names first
python3 scripts/import-art.py             # import into the game
python3 scripts/import-art.py --missing   # list what is still to make
```

The import removes the green (#00FF00) or magenta (#FF00FF) background, trims and
resizes each image, saves it in `frontend/shared/art/` and lists it in
`frontend/shared/art/manifest.json`. The game then uses it in place of the drawn
placeholder. If an image looks wrong, regenerate it with the same name and run the
import again; the new file replaces the old one.

When cars, parts, regions or rounds change, rebuild the sheet with
`node scripts/build-art-requests.cjs`.

## What each image replaces in the game

- `topdown-<car>`: your car in races, the garage bay and the home turntable.
- `portrait-<car>`: the Garage store card (replaces the video screenshot).
- `engine-<id>`, `part-<category>-<id>`, `skin-<id>`: Garage cards for engines, sound parts and meter skins.
- `icon-coin`, `icon-gem`, `icon-star`: the wallet on Home, Garage and Career, and race rewards. The other icons (trophy, chest, lock, flag, stacks, empty star) have slots ready for later screens.
- `region-<id>`: the Career map background (24 regions; 21–24 show it blurred until they're released).
- `banner-<theme>`: the banner on a round's sheet in Career, shared by every round on that theme. A round-specific `map-<round id>` (e.g. `map-r1m20`) also works if added to the manifest by hand.
- `prop-obstacle-*`, `prop-tree` / `pine` / `cactus`, `prop-bush`, `prop-tent`, `prop-grandstand`, `prop-billboard`: on the race track.
- `topdown-monster1-4`: monster trucks for the Monster Arena and Monster Mayhem regions. The slots are ready; until the trucks and their engine recordings are added, those regions recommend the Truck class (Hilux, Silverado).
