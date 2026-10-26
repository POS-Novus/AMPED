# Tools

Scripts that turn originals in `design/kit/` into runtime files in `game/assets/`
(trimming, resizing, compressing, cropping concept sheets). Each derived file
should be reproducible from a script here.

| Script | What it makes |
|---|---|
| `prepare_assets.py` | Trimmed character cutouts, WebP backdrops, venue/festival scenes cropped from the concept sheets, copies of brand/icons/rhythm SVGs and fonts, plus `game/assets/derived.json` |
| `prepare_music.py` | From `design/music/`: loudness-normalised MP3 excerpts and auto-charts for covers, the menu loop, and `game/assets/music/index.json` (credits) |
| `fetch_music.py` | Used by the manual *Fetch music candidates* workflow to download OpenGameArt pages + files for licence review |
| `render_instruments.py` | From `design/instruments/GeneralUser-GS.sf2`: per-note MP3 samples for the band (distorted/overdriven/clean/steel guitars and power chords, pick and synth bass, piano, organ, pad, saw lead, voices; power, standard and electronic drum kits) and `game/assets/instruments/index.json` |
| `prepare_characters.py` | From the five tribe sheets and the genre wardrobe: 36 transparent full-body looks (15 characters × base/stage outfits, plus Nia's six genre outfits), cream background removed with clean edges, same height as the band cutouts; `game/assets/characters/looks/index.json` and a review contact sheet in `tools/out/` |
| `runway/make_inputs.js` | Still images to upload to Runway (character + instrument on green, 3:4) in `design/animations/inputs/` |
| `prepare_animations.py` | From Runway clips in `design/animations/clips/`: keyed, loop-trimmed, beat-synced sprite strips in `game/assets/characters/anim/` |
