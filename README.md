# AMPED: From Garage to Glory

A band-management tycoon with rhythm-game gigs and multiplayer festivals.
Mobile and web browser.

## Folders

| Folder | What goes here |
|---|---|
| `docs/` | Game design document, music tribes & skins, music credits, screenshots |
| `design/music/` | Licensed/commissioned recordings, unchanged, with `sources.json` (none yet) |
| `design/instruments/` | GeneralUser GS SoundFont + licence, source of the band's sampled instruments |
| `design/kit/` | Design kit v1, **unchanged**: PNG/SVG masters, tokens, manifest, fonts, visual guide. Start with `design/kit/AMPED_Claude_Handoff.md` |
| `game/` | The playable web prototype (HTML/CSS/JS) and its runtime assets |
| `tools/` | Scripts that prepare runtime assets from the design kit (resize, crop, compress) |

## Play

Online: https://pos-novus.github.io/AMPED/ (published from `game/` by `.github/workflows/pages.yml` on every push to `main`).

Locally:

```
cd game
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Rules
- Originals stay in `design/kit/`. Resized or cropped copies go in `game/assets/`, with the script that made them in `tools/`.
- Text, numbers and buttons are built in code, never painted into art.
- Skins are cosmetic only.
- Music and samples must allow commercial use. Credit every source in `docs/MUSIC_CREDITS.md` and in-game.
