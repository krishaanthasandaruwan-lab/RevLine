# RevLine frontend design system

The saved visual setup for the new frontend. `shared/theme.css` is the source of truth;
`design-tokens.json` mirrors it for tools. Change a value there and every page follows.

## Look

Cartoon top-down racing, based on the user's reference image: bright grass, red/white
curbs, sand run-off, tyre walls, grandstands with crowds, tents and billboards. Everything
has a thick dark ink outline (`--rl-ink #0f1724`), flat colour, one soft highlight and a
drop shadow offset down-right (+5, +7). HUD labels are yellow italic, values white.

## Fonts (bundled, offline, SIL OFL 1.1)

| Role | Font | File | Used for |
|---|---|---|---|
| Display | Lilita One | `shared/fonts/LilitaOne-Regular.ttf` | Logo, titles, buttons, popups, canvas labels |
| HUD | Teko 300–700 (italic 600) | `shared/fonts/Teko-Variable.ttf` | POS / SCORE / TIME, speed, stats |
| Body | Segoe UI → Noto Sans Sinhala → system | system | Paragraphs, Sinhala text, settings |
| Data | Courier New | system | Raw telemetry only |

## Colours

| Token | Value | Meaning |
|---|---|---|
| `--rl-yellow` | `#ffc928` | Primary action (Race), HUD labels, selected chips |
| `--rl-orange` | `#ff8a1f` | Garage, exhaust parts |
| `--rl-blue` | `#2f8cff` | Secondary action (Free drive), RPM below 7k |
| `--rl-red` | `#ff3b47` | Brake, danger, engine parts |
| `--rl-green` | `#00e676` | Voice level, Resume, "fitted", Perfect shift |
| `--rl-cyan` | `#38e1ff` | Focus ring, turbo parts |
| `--rl-purple` | `#b07cff` | Blow-off parts, drift banner |
| Grades | early `#ffd54a` · perfect `#00e676` · late `#ff5a5a` | Same meaning as backend `revShiftTiming` |
| Track | grass `#4fae3c` · asphalt `#3b3f47` · sand `#ecd096` · curb `#e8372f` | Renderer |

Garage categories each own one colour (`--cat`): cars yellow, engine red, exhaust orange,
turbo cyan, blow-off purple, intake green.

## Components (theme.css)

- `.rl-btn` chunky button: 3px ink border, 5px pressable bottom edge, Lilita text.
  Variants `--yellow --orange --red --green --dark --small`. Minimum 44px (48px default).
- `.rl-panel` translucent dark panel with blur.
- `.rl-label` / `.rl-value` HUD pair. `.rl-chip` toggle chip (`aria-pressed`).
- `.rl-title` outlined display heading.
- Race controls `.ctl` (race.css) keep the backend ids and the same hold behaviour.

## Layout rules

- Race stage is portrait, max 560px wide; the world (540 × 900) fits the stage width and the
  player car sits at 56% of the height so the gauge and controls never cover it.
- Top: POS/KM (left), pause (centre), SCORE/TIME (right). Shift lights under it.
- Bottom-left: minimap (race circuit or free-drive traffic radar) above steer/drift.
- Bottom-right: speedometer (RPM zones + voice arc) above N ↔ D and Brake.
- Every touch target ≥ 44px, visible `:focus-visible` cyan ring, safe-area insets on iPhone.
- `prefers-reduced-motion`: no speed lines, trails, shake, sparks, confetti or CSS animation.

## Car art rules

Sprites face up, body exactly 46 × 86 world units (the backend collision box), padding 16.
Eight player styles (`gt rx7 supra r34 mustang s2000 civic lfa`) plus `traffic` and `rival`.
Exhaust tips come from the fitted exhaust: twin, quad, centre, burnt titanium.
