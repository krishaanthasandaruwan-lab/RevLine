# Round-intro videos (make after the images)

The race lobby plays a short intro before a career round. The game looks up a video for
the round first (`videos.r1m20`), then for its region (`videos.r1`). With no video, the
lobby shows without one. Add finished videos to `frontend/shared/art/videos/` and list
them in `frontend/shared/art/manifest.json`:

```json
"videos": { "r1": "frontend/shared/art/videos/r1.mp4", "r1m20": "frontend/shared/art/videos/r1m20.mp4" }
```

Format: MP4 (H.264), vertical 9:16 (1080 × 1920), 5–8 seconds, no sound needed (the game
plays its own), no text. Use the finished region image (`region-<id>.jpg`) as the first
frame, so the video matches the map.

## Current status (26 Oct): videos removed

The user tried the 23 intro videos in the game and asked to remove them because they made
starting a round slow. The manifest has no videos, so rounds open straight to the lobby.
The originals stay in `frontend/Videos/` (not part of the app) and `video-sources.json` still
maps them. To bring them back, run `python3 scripts/import-videos.py`.

## Shared style line

> Bold cartoon mobile racing game, thick dark navy outlines, bright flat colours, glossy
> highlights, smooth camera, no text, no logos, no people's faces.

## Region intros (one per region)

| File | Prompt (after the style line) |
|---|---|
| `r1.mp4` | Start from this image of Green Valley. The camera glides down from the sky over green hills and grandstands to a race start grid with four cartoon cars revving and small exhaust puffs. End looking straight down at the grid. |
| `r2.mp4` | Coastal Sprint: a fly-in along a sunny seaside highway, waves and palm trees, ending above the start grid. |
| `r3.mp4` | Autumn Hills: drifting falling orange leaves, the camera weaves down through forest bends to the grid. |
| `r4.mp4` | Gravel Quarry: dust rising, cranes and rock piles, rally cars at a gravel start line. |
| `r5.mp4` | Desert Dust: wind blowing sand over dunes, cactus, cars waiting in a dusty haze. |
| `r6.mp4` | Snow Peak Pass: gentle snowfall, icy mountain road, cars with frosty windows at the start. |
| `r7.mp4` | Neon City Nights: night city from above, neon signs flickering, traffic lights turning green. |
| `r8.mp4` | Jungle Mud Run: birds flying over the jungle canopy down to a muddy riverside start. |
| `r9.mp4` | Canyon Drift Kings: a drift car slides through a red canyon bend with tyre smoke, then cut to the start. |
| `r10.mp4` | Volcano Ridge: glowing lava rivers, smoke plumes, black rock road to the start grid. |
| `r11.mp4` | Monster Arena: stadium lights, monster trucks bouncing on huge tyres over dirt mounds. |
| `r12.mp4` | Alpine Rally: gravel stage climbing into snow, chalets and a gondola passing overhead. |
| `r13.mp4` | Harbour Docks: container cranes swinging, seagulls, cars lined up between stacked containers. |
| `r14.mp4` | Salt Flats: heat shimmer over endless white flats, cars waiting at a long straight. |
| `r15.mp4` | Rainforest Rally: heavy rain over the jungle, a waterfall, muddy start line. |
| `r16.mp4` | Midnight Touge: lanterns along a night mountain pass, a car drifting through a hairpin. |
| `r17.mp4` | Glacier Drift: northern lights over a frozen lake, a car sliding on ice. |
| `r18.mp4` | Red Rock Rally: dust devils in a red canyon, rally cars at a dusty start. |
| `r19.mp4` | Monster Mayhem: a monster truck crushes a car, fireworks, huge dirt hills. |
| `r20.mp4` | Legends Final: fireworks over a grand stadium, golden trophy glint, cars lined up for the final. |

## Special rounds (optional)

| File | Prompt (after the style line) |
|---|---|
| `r1m5.mp4` | Drift School: a cartoon car drifts around a cone circle, leaving smoke rings, top-down camera. |
| `r1m13.mp4` | Drift Trophy: two cars tandem-drift through a long bend, smoke trails, trophy sparkle at the end. |
| `r1m20.mp4` | Valley Championship: a muddy dirt track with barrels, cones and rocks, four cars lined up, mud splashes as they rev. |
