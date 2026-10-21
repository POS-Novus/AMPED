# AMPED · prototype

A playable Band HQ screen that shows how the game splits **art** from **code**.

```
amped/
  index.html        page structure (HUD, scene, actions, member sheet)
  styles.css        UI look: colours, panels, buttons, layout
  js/data.js        all game content: band, members, stats, hotspots, costs
  js/main.js        game logic: actions, saving, rendering
  assets/scenes/    artwork only (no text, no UI baked in)
```

Run it: `python3 -m http.server` in this folder, then open http://localhost:8000.

## How the screen is built

| Layer | What it is | Who changes it |
|---|---|---|
| 1. Scene art | `assets/scenes/garage_t1.webp` | Artist |
| 2. Hotspots | Invisible tap areas over each character, positioned in `data.js` as % of the image | Code |
| 3. Name tags + energy bars | Drawn in HTML on top of the art | Code |
| 4. HUD, goal, buttons, member sheet | Plain HTML/CSS | Code |

Text, numbers, stats and buttons are never painted into the art, so they can change freely.

## Delivering art

**Scenes (backgrounds)**
- 1536 × 1024 (3:2) minimum; 3072 × 2048 preferred for sharp phones. Export as `.webp`.
- Name: `<location>_t<tier>.webp`, e.g. `garage_t1.webp`, `rehearsal_t2.webp`.
- No text, logos or UI in the image (posters can have shapes, but no readable words the game needs).
- Keep ~8% at the top and bottom free of important detail; the HUD and buttons sit there on wide screens.

**Characters (when separated from the scene)**
- Transparent `.png` or `.webp`, one file per pose: `characters/<id>/<pose>.png` (e.g. `nia/idle.png`, `nia/play.png`, `nia/cheer.png`).
- Same canvas size for every pose of a character, feet at the same baseline, so swapping poses doesn't jump.
- For animation, deliver layered PSD for Spine/Live2D rigging.

**Layered scenes (target for final game)**
Export each scene as separate same-size layers, all aligned:
1. `background`: room/walls/outside view
2. `props`: furniture and gear (swappable when upgrades are bought)
3. *(characters are placed by code)*
4. `light`: glow and light overlay (can animate/flicker)
5. `foreground`: objects in front of characters (amps, cases)

**Icons and UI art**
- Gear icons 512 × 512 transparent, same lighting and outline style as the scenes.
- UI frames/buttons are built in code; only send decorative art (textures, badges) if wanted.

## Adding a new scene

1. Drop the image in `assets/scenes/`.
2. In `js/data.js`, set `scene.layers[0].src` to it.
3. Adjust each member's `hotspot` and `tag` (percent of image width/height).
