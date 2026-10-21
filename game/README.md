# AMPED: playable first slice

Plain HTML/CSS/JavaScript. No build step, no dependencies.

```
cd game
python3 -m http.server 8000      # then open http://localhost:8000
```
Opening `index.html` straight from disk will not work (browsers block loading the art that way).

## The loop

Title → **Garage HQ** → practise / write a song / rest → **Book the pub** → pick song, part and difficulty →
timing check (first time) → **rhythm gig on the pub stage** → **results** (rewards, review, goal progress) → saved → back to HQ.

Controls in a gig: **D F J K** (remappable in Settings) or tap the lanes. **Esc** or **P** pauses.
The game also pauses when the tab is hidden or the window loses focus.

## Files

| File | What it does |
|---|---|
| `index.html` | Title screen, app frame (header, resources, view, tab bar), dialogs |
| `css/tokens.css` | Copied unchanged from `design/kit/design/tokens.css` |
| `css/app.css` | All UI styling, built on the kit tokens; DejaVu Sans from the kit |
| `js/data.js` | Content and tuning: members, scene layouts, venue, songwriting, costs, rhythm settings |
| `js/audio.js` | Web Audio clock, **temporary synthesised beat**, metronome, SFX |
| `js/scene.js` | Backdrop + band placement + ambience (rain, light flicker, dust, notes) |
| `js/rhythm.js` | Chart generation, judging on the audio clock, HUD, pause, fail |
| `js/main.js` | State, saving, views (HQ, Band, Music, Gigs, Shop), sheets, calibration, rewards |
| `assets/` | Runtime copies made by `tools/prepare_assets.py` from `design/kit/` (see `assets/derived.json`) |

To rebuild the assets: `python3 tools/prepare_assets.py` from the repository root (needs Pillow).

## Status (milestones 1–2 from the handoff)

### Implemented
- Kit colours, spacing, radii, DejaVu Sans, real wordmark, app icon, 41 icons recoloured in code
- Title screen (key art, Continue / New game with overwrite confirmation)
- HQ on the empty garage backdrop with the five kit characters, placed by role with foot baselines
- Band roster and member sheet (stats, energy, morale, lesson, nap)
- Songwriting: title, theme, style, hidden combo bonuses, song list with quality and practice level
- Gig booking at the pub: song, part (each role has its own chart), difficulty, costs, tired-member blocking
- Rhythm gig: four lanes with the kit note shapes, hit line, ring/burst effects, crowd energy, score, streak multiplier, judgements, time, pause/resume with countdown, leave stage, booed off at 0 crowd
- Timing calibration (tap test on the audio clock) and manual offset; skippable before a gig
- Results: stars, review, accuracy, best streak, counts, cash/fans/hype/fame, goal progress, back to HQ / play again
- Practice warms the starting crowd; the played member's skill widens timing windows slightly
- Save in the browser (`amped.save.v3`), reload-safe; rewards applied once per gig id
- Settings: music and SFX volume, timing offset, calibration, key remapping, motion (device/reduce/full), reset progress
- Reduced motion: ambience, character motion and effects off; notes still move (gameplay)

### Tested (headless Chromium, 390×844, 844×390 landscape, 1440×900)
- Full loop end to end with an automated player; save and reload keep cash, fans, day, songs, energy
- Pause / resume; leaving mid-gig changes nothing; failing pays nothing, costs 3 fans, 8 hype and the energy
- Two gigs in a row; no double payout; no failed requests or script errors
- Not tested on real phones or with real players yet. Audio latency on Bluetooth headphones untested.

### Remaining (not done)
- **Music**: the beat is a placeholder made in code. Real songs, charts authored to them, SFX and voices are needed.
- **Animation**: characters are static cutouts with whole-sprite bob/sway only. Needed: idle, play, celebrate, tired, frustrated poses or rigs; seated drummer + kit; portrait expressions.
- **Story**: Moira tutorial, uncle's note, choices (story-cast sheet needs individual portrait crops).
- **Gear shop** (locked screen only), more venues, HQ tiers, festivals, multiplayer, accounts.
- **Rhythm**: sustain notes (only a cyan tail exists in the kit), per-lane tail colours, gear effects on timing.
- **Balance**: all prices, rewards and crowd numbers are working values. Hard difficulty loses an idle crowd in ~4 s.
- **Accessibility review** with a screen reader; larger text settings.

### Blocked
- Nothing blocked. Music sourcing is a separate decision (composer or licensed library).
