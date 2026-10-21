# Tools

Scripts that turn originals in `design/kit/` into runtime files in `game/assets/`
(trimming, resizing, compressing, cropping concept sheets). Each derived file
should be reproducible from a script here.

| Script | What it makes |
|---|---|
| `prepare_assets.py` | Trimmed character cutouts, WebP backdrops, copies of brand/icons/rhythm SVGs and fonts, plus `game/assets/derived.json` |
| `prepare_music.py` | From `design/music/`: loudness-normalised MP3 excerpts and auto-charts for covers, the menu loop, and `game/assets/music/index.json` (credits) |
| `fetch_music.py` | Used by the manual *Fetch music candidates* workflow to download OpenGameArt pages + files for licence review |
