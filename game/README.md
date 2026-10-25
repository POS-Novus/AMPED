# AMPED: playable first slice

Plain HTML/CSS/JavaScript. No build step, no dependencies.

```
cd game
python3 -m http.server 8000      # then open http://localhost:8000
```
Opening `index.html` straight from disk will not work (browsers block loading the art that way).

## The loop

Title → name the band and pick its genre → **Garage HQ** → practise / **write a song in the studio** / rest → **Map** (Road to Solstice) → book an unlocked venue → pick song, part and difficulty →
timing check (first time) → **rhythm gig, filmed like a concert** → **results** (rewards, review, unlocks) → saved → back to HQ or the map.

Controls in a gig: **D F J K** (remappable in Settings) or tap the lanes. **Esc** or **P** pauses.
The game also pauses when the tab is hidden or the window loses focus.

## Files

| File | What it does |
|---|---|
| `index.html` | Title screen, app frame (header, resources, view, tab bar), dialogs |
| `css/tokens.css` | Copied unchanged from `design/kit/design/tokens.css` |
| `css/app.css` | All UI styling, built on the kit tokens; DejaVu Sans from the kit |
| `js/data.js` | Content and tuning: members, scene layouts, venue, songwriting, costs, rhythm settings |
| `js/composer.js` | Genre presets (metal, rock, punk, pop, indie, electronic) and the groove model the studio edits (tempo, tone, kit, chords, 16-step beat and riff); arranges each song into intro/verse/chorus/outro for five parts; builds charts from the part you play |
| `js/audio.js` | Web Audio clock, synth band for generated songs, recorded-song playback, metronome, SFX |
| `assets/instruments/` | Sampled band instruments (drum kits, guitars, bass, piano, organ, voices) rendered by `tools/render_instruments.py` |
| `assets/music/` | Licensed recordings + auto-charts (none at the moment; pipeline in `tools/prepare_music.py`) |
| `js/scene.js` | Backdrop + band placement + ambience (rain, light flicker, dust, notes) |
| `js/director.js` | Gig camera: beat-timed cuts between wide, close-up, two-shot and crowd shots with push-ins, genre-coloured lights, foreground crowd |
| `js/rhythm.js` | Chart generation, judging on the audio clock, HUD, pause, fail |
| `js/main.js` | State, saving, views (HQ, Band, Map, Studio, Shop), venue unlocks, sheets, calibration, rewards |
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
- **Real instruments**: generated songs play on sampled drums, double-tracked distorted guitar, pick bass, piano/organ, a lead voice and backing choir, with timing/velocity humanising and a stereo mix (synth fallback if a sample fails to load)
- Music credits in Settings
- **Map (Road to Solstice)**: 11 venues from the street corner to the Solstice festival, in acts; each unlocks by fame, wins at earlier venues and songs written; venue sheet with capacity, pay, crowd toughness; bigger venues pay more and punish misses harder
- **Studio**: pick genre, guitar tone (clean / crunch / distorted / metal / synth), drum kit, tempo, chords and chorus feel; program the beat and the guitar riff on 16-step grids; hear verse/chorus live before recording
- **Gig camera**: cuts on the beat between wide shots, close-ups, two-shots and a shot from the pit; flash on section changes, light pulses in choruses, a foreground crowd that grows with the venue; reduced motion keeps one steady wide shot
- Generated songs: theme picks the key/mode, style picks tempo and feel (Ballad, Anthem, Banger); drums, bass, distorted guitar, keys and a sung lead line with room reverb
- Charts from the actual notes of your part, thinned by difficulty in seconds so fast songs stay fair
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
- **Music**: songs are generated and played on sampled instruments. The lead voice sings a melody on an "ooh/aah" sound; real lyrics need a singer or commissioned songs. Commissioned songs with stems can use `tools/prepare_music.py`. Each song has its own key, tempo, structure and melody, and the chart follows the part you play; a miss ducks your part. Real recorded songs, hand-authored charts, SFX and voices are still needed for release.
- **Animation**: characters are static cutouts; the gig camera, lights and crowd move, the players don't. Needed: idle, play, celebrate, tired, frustrated poses or rigs; seated drummer + kit; portrait expressions.
- **Story**: Moira tutorial, uncle's note, choices (story-cast sheet needs individual portrait crops).
- **Gear shop** (locked screen only), HQ tiers, venue-specific events, multiplayer, accounts. Venue scenes are crops of the concept sheets, not production backdrops.
- **Rhythm**: sustain notes (only a cyan tail exists in the kit), per-lane tail colours, gear effects on timing.
- **Balance**: all prices, rewards and crowd numbers are working values. Hard difficulty loses an idle crowd in ~4 s.
- **Accessibility review** with a screen reader; larger text settings.

### Blocked
- Nothing blocked. Music sourcing is a separate decision (composer or licensed library).
