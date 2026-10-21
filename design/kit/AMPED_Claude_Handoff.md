# AMPED: From Garage to Glory
## Design, graphics and implementation handoff for Claude

**Version:** 1.0  
**Date:** 21 October 2026  
**Source:** `docs/AMPED_Game_Design-source.md` (the supplied game design document, v0.1)  
**Companion:** `AMPED_Design_Kit_v1.zip`

This document explains how to turn the supplied artwork and design system into AMPED. Claude owns implementation and integration. The supplied assets establish the visual direction. Work from the actual files, preserve their identities, and extend the game without replacing the artwork with generic substitutes.

This is a **v1 static design package**, not a completed game or a complete animation library. It contains 21 PNG masters, 101 editable SVG graphics, design tokens, a machine-readable inventory, fonts and seven interface compositions. The remaining production work is explicitly listed below.

---

## 1. Start here

### Instructions for Alexandre

1. Give Claude this Markdown file and the companion ZIP. The Markdown alone does not contain the artwork.
2. Ask Claude to extract the ZIP into the existing project workspace and inspect the project before changing its architecture.
3. Tell Claude to start with the garage-to-first-gig loop. Keep the existing game implementation if it is already working.
4. Open `preview/AMPED_Visual_Guide.html` from the extracted folder to review the graphics and interface compositions. Keep the folder structure intact so images and fonts resolve.

### Copy this message to Claude

```text
Read AMPED_Claude_Handoff.md and the original game design document inside
AMPED_Design_Kit_v1. Inspect the existing project and the supplied artwork.

Use the actual PNG and SVG assets. Preserve the proposed visual direction:
warm cartoon musicians, rainy Irish beginnings, dark navy interface panels,
cream text, yellow actions and restrained cyan/pink/violet accents.

First report the existing stack, the assets found, any missing dependencies
and a short implementation sequence. Then implement a playable first slice:
garage HQ -> practice/write -> book the pub -> play a short rhythm chart ->
results -> save progress -> return to HQ.

Build controls, text, counters, progress bars and note lanes in code. Keep
characters, scenery and illustration assets separate from interface logic.
The artwork contact sheets are visual references, not validated sprite atlases.

Do not replace supplied characters with emojis, generic avatars or newly
invented designs. Do not claim static images are animated. Use temporary
whole-sprite movement only where the handoff permits it, and keep an explicit
list of remaining animation, expression, wardrobe and scenery work.

Follow the asset manifest and design tokens. Use existing project conventions,
keep changes reviewable, and show the implemented result at phone and desktop
sizes. Do not describe planned features as finished.
```

## 2. What takes precedence

| Source | What it controls |
|---|---|
| Alexandre's latest instructions | Product decisions and changes to scope |
| Original game design document | Story, systems, progression, roles and fair monetisation |
| This handoff + supplied art | Proposed v1 visual direction, asset usage and interface rules |
| `design/asset-manifest.json` | Actual filenames, image dimensions, transparency, file hashes and asset status |
| `design/tokens.json` / `design/tokens.css` | Colours, spacing, radii, type sizes and motion defaults |
| Existing repository | Working architecture, dependency versions and established conventions |

Do not silently change a working engine or rewrite the project just to follow an example in this document. The GDD suggests Phaser or PixiJS; preserve whichever suitable stack has already been chosen. No engine dependency or API version is pinned by this design package.

The display band name **The Late Starts**, song **Rain on the Amp**, venue **The Rusty Mic**, sample dialogue, shop prices and all screen numbers are illustrative. They are not approved balance values or additions to the canonical story.

The GDD starts with four friends and supports up to five musical roles. Five role designs are supplied. The preview shows four friends plus a session player; treat that as a proposed presentation, not a mandatory story change.

## 3. Package contents

All paths below are relative to the extracted `AMPED_Design_Kit_v1/` folder.

| Path | Contents |
|---|---|
| `AMPED_Claude_Handoff.md` | This implementation handoff |
| `README.md` | Short package orientation |
| `docs/AMPED_Game_Design-source.md` | Unchanged copy of the source brief |
| `docs/TRIBES_AND_SKINS.md` | Five new style families, 15 character identities and 30 cosmetic looks |
| `design/tribes-catalog.json` | Stable character/skin IDs and concept references |
| `docs/IMAGE_PROMPTS.md` | Image-generation prompts for visual continuity |
| `design/asset-manifest.json` | Verified inventory of 21 PNGs and 101 SVGs |
| `design/tokens.json` | Structured design tokens |
| `design/tokens.css` | CSS colour tokens and reduced-motion rule |
| `design/gear-catalog.json` | 35 gear icons, category, tier, name and path |
| `assets/marketing/` | Garage key art |
| `assets/characters/` | Five character cutouts, story cast, costumes and crowd concepts |
| `assets/world/` | Three standalone backgrounds and environment/facility sheets |
| `assets/characters/tribes/` | Headbanger, Punk, Hippie, K-pop and Trapper concept sheets |
| `assets/brand/` | Three wordmark colour variants, a bolt mark and an app icon |
| `assets/icons/` | 41 interface symbols |
| `assets/gear/` | Seven equipment/crew categories, five tiers each |
| `assets/facilities/` | Seven vector map symbols: stage, bar, food, toilets, camp, medical, merch |
| `assets/rhythm/` | Four note shapes, a lane surface, sustain tail and two hit effects |
| `assets/posters/` | Five fictional in-game festival posters |
| `assets/fonts/` | DejaVu Sans regular and bold, with licence text |
| `preview/AMPED_Visual_Guide.html` | Local visual guide with seven static screen compositions |

The visual guide works as a design reference. Its buttons, timers and values do not implement the game. There is no backend, music, chart playback or save system in this package.

## 4. Visual direction

### The feeling

**A warm underdog story inside an electric music world.** The beginning should feel like making noise with your friends in a rainy garage. Success should bring brighter lights, larger stages and better spaces while keeping the same band recognisable.

Use expressive, exaggerated cartoon proportions, dark outlines, bold colour blocks and illustrated cel shading. The generated character art varies slightly in proportion; match the actual supplied character masters rather than forcing a mathematically exact chibi ratio. The backgrounds include more texture and detail than the interface.

Keep the emotional progression visible:

| Stage | Visual character |
|---|---|
| Garage | Warm bulbs, patched gear, rough timber, rain-blue doorway |
| Local circuit | Burgundy curtains, close crowds, practical equipment |
| Breakout | Clean stage lighting, loft studios, stronger poster identities |
| International tour | Larger lighting rigs, arena geometry, richer environments |
| Solstice | Cream and gold halo stage, radial sun, midnight blue and peach horizon |

### Colour system

| Token | Hex | Primary use |
|---|---|---|
| Ink | `#111424` | Main app background; strong outlines |
| Surface | `#1D2035` | Cards, navigation and HUD panels |
| Raised | `#292C45` | Secondary controls and nested surfaces |
| Line | `#464A66` | Borders and separators |
| Muted | `#B9BDD1` | Secondary text |
| Cream | `#FFF4D6` | Main text and neutral highlights |
| Yellow | `#FFE45E` | Primary actions, AMPED identity, rewards |
| Cyan | `#46D9E8` | Information, bass identity, first rhythm lane |
| Pink | `#FF648E` | Expression, vocalist accents, third rhythm lane |
| Violet | `#A792FF` | Creative/studio accents, fourth rhythm lane |
| Green | `#75E3B0` | Positive status |
| Red | `#FF8585` | Destructive/error status |

Use dark text on the yellow primary button. Avoid applying the accent colours to every border or adding heavy neon glow to every component. Put text over a solid or sufficiently opaque panel when scenery is busy.

### Typography and layout

- Use the supplied outlined wordmark SVG for the title. Do not recreate it with a generic text heading.
- The v1 interface uses bundled DejaVu Sans regular/bold. A later font change should be a deliberate design decision.
- Default gameplay body text: 16 px; secondary labels: 14 px; tertiary metadata: 12 px. The visual guide contains smaller presentation annotations; do not copy those sizes into essential gameplay instructions.
- Screen titles: 24–32 px. Avoid dense all-caps paragraphs.
- Use an 8 px spacing rhythm, with 4 px for fine alignment.
- Card radius: 16 px; small controls: 8–10 px; modal radius: 24 px.
- Minimum interactive target: 48 × 48 CSS px, with at least 8 px separation.
- Primary action height: approximately 52 px.
- Keep one clear primary action per decision panel.

## 5. How to use each image

### Standalone images

| File | Use | Important limitation |
|---|---|---|
| `assets/marketing/keyart-garage.png` | Title screen, loading art, promotional panels | Contains the whole band; not an interactive room |
| `assets/world/hq-garage-backdrop.png` | Starter HQ backdrop | Furniture and lights are baked in; no separate prop layers |
| `assets/world/venue-pub-backdrop.png` | First rhythm gig stage | Flat image; overlay performers and gameplay separately |
| `assets/world/festival-solstice-backdrop.png` | Solstice stage / endgame preview | Flat image; no animated lighting layers |
| `assets/characters/band-guitar.png` | Guitar role | One static pose with alpha |
| `assets/characters/band-vocals.png` | Vocals role | One static pose with alpha |
| `assets/characters/band-bass.png` | Bass role | One static pose with alpha |
| `assets/characters/band-drums.png` | Drums role | Standing with sticks; seated playing pose and drum kit are not separate assets |
| `assets/characters/band-keys.png` | Keys/producer role | Portable keyboard pose; not an animated keyboard rig |

Dimensions differ between character PNGs. Use the manifest rather than assuming every source is 1024 × 1536. Normalise their displayed scale by the intended on-screen body height and foot baseline, not by assigning the same image width.

Some transparent cutouts include soft coloured edge haze. Inspect them against the intended dark surface and a light diagnostic background before release. Alpha is present; this does not guarantee the artwork is fully cleaned for every background. Preserve the masters and document any derived cleanup.

### Concept sheets

**These are not validated sprite atlases.** An image that looks like a grid may have uneven panel boundaries, built-in lighting, touching edges or varying padding. Do not divide every sheet into equal cells and assume it will work.

| File | Intended reading order | How Claude should use it |
|---|---|---|
| `assets/world/hq-evolution.png` | Two columns, three rows: garage; rehearsal room; loft; studio complex; mansion; van interior | Visual references for later HQ tiers; only garage also has a standalone background |
| `assets/world/venue-evolution.png` | Two columns, three rows: pub; club; theatre; arena; stadium; street | Venue identity references; pub also has a standalone background |
| `assets/world/festival-evolution.png` | Two columns, three rows: Muddy Boots; Riverside; Neon Valley; Thunderdome; Solstice; Solstice at dawn | Festival appearance references; Solstice also has a standalone background |
| `assets/characters/story-cast.png` | Three columns, two rows: Moira; Rex; Velvet Riot representative; Superfan; Journalist; Uncle | Portrait references; measure individual portrait crops if used in UI |
| `assets/characters/genre-wardrobe.png` | Three columns, two rows: Rock; Punk; Indie; Metal; Pop; Electronic | Six outfits for the same guitarist as a style reference; not 30 completed character/outfit combinations |
| `assets/characters/crowd-strips.png` | Top to bottom: sparse, medium, dense crowd treatments | Density and audience style reference; actual bands are not equal-height frames |
| `assets/world/festival-facilities.png` | Three columns, two rows: bar; food; toilets; camp; medical; merch | Building concepts; inspect alpha, margins and overlaps before preparing independent textures |

For an implementation that needs crops:

1. Inspect the real pixels and choose bounds for that asset, not a guessed grid.
2. Record exact bounds, source dimensions, trim offsets and pivot in a new derived atlas file.
3. Review the extracted result at target size for neighbouring art, chopped edges and background haze.
4. Add padding/extrusion when packing textures to prevent seams.
5. Preserve the original sheet unchanged. Do not call extracted concept panels fully layered or animated assets.

Use the standalone images for the first playable slice. Concept sheets are sufficient for selection thumbnails or visual planning; large interactive scenes need dedicated production assets.

## 6. Character consistency

| Role | Identity cues to preserve |
|---|---|
| Guitar | Medium-brown skin, large dark curls with cyan streak, yellow jacket, coral angular guitar |
| Vocals | Pale skin, magenta undercut, lilac top, plaid waist layer, microphone |
| Bass | Deep-brown skin, round cyan glasses, mint beanie, blue overshirt, cream bass |
| Drums | Freckles, orange-red double buns, dark sleeveless top, olive trousers, sticks |
| Keys / producer | Black bob, lavender hoodie, turquoise keyboard, cream sneakers |

These are visual role designs, not locked player names or personalities. Preserve skin tone, face, hair and signature silhouette when applying a costume. Do not make the metal, punk or electronic variant a different person.

The story sheet establishes proposed appearances for Moira, Rex Gold, a Velvet Riot representative, Superfan, the Journalist and the late uncle. The uncle portrait is an archival illustration concept. The complete rival band and all dialogue expressions remain to be designed.

### Animation expectations

For a prototype, small whole-sprite position, rotation and scale changes can communicate breathing, stage bounce or celebration. Keep them restrained and disable unnecessary motion when reduced motion is selected. This does not create articulated playing animation.

For production, plan real assets or rigs for:

- Idle, practice/play, celebrate, tired and frustrated states.
- Blink and speaking expressions for story portraits.
- Guitar/bass fretting and strumming; vocalist mic gestures; drummer seated playing; keyboard playing.
- Stable feet and pivots across states.
- Genre outfits for every relevant base character.

Do not invent frame counts or frame coordinates for animation that has not been produced. Do not mirror instrument players indiscriminately: handedness and instrument details may become inconsistent.

### Music tribes and additional skins

The new `assets/characters/tribes/` sheets add Headbangers, Punks, Hippies, K-pop and Trappers: three identities per family, each with a base and stage outfit. That is 15 new characters and 30 outfit looks. Top and bottom rows depict the same people in corresponding columns. These are opaque concept sheets, not independently exported or animated sprites.

Read `docs/TRIBES_AND_SKINS.md` and `design/tribes-catalog.json` for the full character map and data model. Keep visual family, character identity, outfit, musical genre and instrument role separate. Skins are cosmetic and must not alter gameplay stats. Logical row/column positions in the catalogue are not validated pixel crop rectangles.

## 7. Interface architecture

Keep the game scene and interface as separate layers. Art changes should not require rewriting economy or progression code.

Recommended drawing order:

1. Environment background.
2. Separate scenery props, if/when produced.
3. Band members and stage equipment.
4. Foreground crowd, if appropriate.
5. World interaction markers.
6. HUD, navigation and resource counters.
7. Dialogues, overlays, pause and accessibility controls.

All readable text, values, timers, choices, prices and note judgements should be rendered in code. Do not bake translated or dynamic copy into backgrounds. Decorative poster text can remain in the supplied SVG artwork.

### Proposed screen requirements

The seven composed examples are in `preview/AMPED_Visual_Guide.html`. The rest of this table describes implementation requirements, not finished mockups.

| Screen | Required content | Design status |
|---|---|---|
| Title / continue | Wordmark, key art, continue/new game, settings | Assets supplied; layout to implement |
| Band creation | Name, six genres, role/character choice | Layout to implement |
| HQ | Resources, room, members, next objective, practice/write/gig actions | Composition supplied |
| Band roster | Five roles, morale/energy/stats, member detail access | Composition supplied |
| Member detail | Five GDD stats, traits, gear, training and rest | Layout to implement |
| Songwriting | Title, theme, style, contributors, cost/time | Composition supplied |
| Recording / release | Song readiness, recording quality, release type and timing | Layout to implement |
| Venue/map | Location, venue capacity, unlock requirements and booking | Layout to implement |
| Gig setup | Ticket price, role, difficulty, opener/hits/encore setlist | Layout to implement |
| Rhythm gig | Notes, hit line, crowd energy, score/streak, pause | Landscape composition supplied |
| Results | Accuracy, crowd response, review, cash/fans/fame and next action | Layout to implement |
| Story | Portrait, speaker, short dialogue, meaningful choices | Composition supplied |
| Gear shop | Category/tier, effect comparison, price, owned/locked states | Composition supplied |
| Festival planner | Fixed plots, facilities, queues, weather, lineup, tickets | Composition supplied |
| Co-op band | Roles, ready states, pending performances, shared versus personal resources | Layout to implement |
| Booking marketplace | Event offers, fee, slot, rider, acceptance and contract state | Layout to implement |
| Charts / labels / season | Ranking, releases, label membership and season progress | Later implementation |
| Settings / calibration | Audio and input offset, controls, accessibility and account | Layout to implement |

### Component states

Implement default, hover where relevant, keyboard focus, pressed, disabled, loading, success and error states. Locked items should explain the requirement in text. In-progress tasks should show what is happening and how long remains. Prevent double submission during purchases or booking actions.

Use explicit labels such as **Band bank** and **Your cash** when co-op introduces separate balances. Never rely on icon colour alone to distinguish ownership.

The supplied `assets/icons/` symbols are scalable interface assets. The `assets/facilities/` symbols are simplified plot markers, while the painted facility sheet supplies richer building appearance references. These are complementary visual uses.

## 8. Rhythm mode

The proposed v1 presentation uses a four-lane highway. The source brief left input style open; retain a different established implementation if Alexandre has already chosen one. Each musical role has its own chart; a role does not correspond to one of the four lanes.

| Lane | Keyboard default | Colour | Shape asset |
|---|---|---|---|
| 1 | D | Cyan | `assets/rhythm/note-d-circle.svg` |
| 2 | F | Yellow | `assets/rhythm/note-f-diamond.svg` |
| 3 | J | Pink | `assets/rhythm/note-j-square.svg` |
| 4 | K | Violet | `assets/rhythm/note-k-triangle.svg` |

- Show the hit line consistently near the lower part of the highway.
- Use stable hit areas; keep gameplay notes clear of decorative particles and dialogue.
- Preserve each lane's shape as well as colour. Offer keyboard remapping and appropriate touch controls.
- Render sustained notes with lane-aware colours; the supplied sustain tail is a cyan reference, not all four finished variants.
- Use the ring and burst effects for brief, restrained judgement feedback.
- Keep camera shake optional and avoid rapid full-screen flashing.
- Pause cleanly on an explicit pause action and handle focus loss predictably.
- Avoid text selection/dragging on gameplay surfaces; retain selection and accessibility in normal forms and menus.
- Use a continuous audio timeline for chart timing. Animation frame rate must not determine score timing.
- Include audio/input latency calibration before judging rhythm accuracy.
- Treat upgrade effects on timing, note value and assist as gameplay configuration rather than visual-only effects.

The package contains **no music, sound effects, voices or note charts**. Do not present a silent animated lane demo as a completed rhythm game. A first test may use a clearly identified temporary original beat/chart, but shipping music requires a separate completed sourcing/composition task.

## 9. Responsive layout and accessibility

The reference management viewport is **390 × 844**; the rhythm composition is **844 × 390**. These are design canvases, not fixed device requirements.

- Support a 360 px wide phone without horizontal scrolling in essential menus.
- Account for device safe areas and the browser's available height.
- Let settings, story and management panels scroll naturally. Do not hide choices behind a fixed bottom bar.
- Use a centred app frame or expanded multi-panel layout on desktop; do not stretch character art to fill empty space.
- Maintain background aspect ratio. Use intentional cropping for scenery and `contain` behaviour for full character figures.
- If a screen works better in landscape, offer a clear suggestion and an accessible fallback instead of trapping the player.
- Keep readable contrast, visible keyboard focus and controls that do not depend on colour alone.
- Use user-adjustable music/SFX levels, reduced motion and text-speed controls for dialogue.
- Provide named controls and semantic UI where the chosen stack supports it. A canvas-only icon is not automatically accessible.
- Check enlarged text and longer translated labels before finalising layouts.

The seven HTML compositions are visual reference layouts, not accessibility-certified or responsive production screens. Rebuild them with real layout constraints rather than copying their fixed presentation sizing wholesale.

## 10. Asset integration workflow

### Step A: inspect the project

Read repository instructions, existing scenes/components, package configuration and asset-loading conventions. Identify what already works. Summarise real findings before proposing a migration.

### Step B: verify the package

Read `design/asset-manifest.json`, check file existence and inspect the actual images. The manifest records measured width, height and alpha presence. Its `status` values describe use, not blanket production approval:

| Status | Meaning |
|---|---|
| `editable_vector` | SVG source that can be used or adapted as a graphic |
| `static_character_alpha` | Single character pose with transparency; no rig or animation |
| `flat_background` | Standalone flattened scene |
| `marketing_illustration` | Composed promotional illustration |
| `concept_sheet_needs_preparation` | Multiple concepts together; needs review/preparation for independent runtime use |

### Step C: keep originals separate from runtime derivatives

Use a structure consistent with the repository, for example:

```text
design/amped/                 original kit and design documentation
public/assets/amped/          runtime-ready copies or exports
src/game/assets/              stable asset identifiers and loading definitions
src/game/scenes/              game scenes
src/ui/                      menus, HUD, panels and reusable controls
src/game/data/                gear, venues, characters and story definitions
```

These are suggested directories, not files that already exist in the supplied package. Preserve source PNG/SVG files. Put resized, compressed, cropped or packed derivatives in a separate location and record how they were created.

Keep stable identifiers such as `band-guitar`, `hq-garage-backdrop` and `venue-pub-backdrop`. Do not reference temporary generation filenames, chat attachment URLs or local machine paths in production code.

### Step D: configure layout and pivots

Store character scale, display height, pivot and placement separately from the texture path. Start with a bottom-centre origin and then check the visible foot baseline. Do not infer collision boxes from transparent image dimensions. Set hit areas from the intended interaction, not incidental glow pixels.

### Step E: load only what is needed

Load the initial UI, garage, core characters and first pub before later festival content. Keep the high-resolution masters for authoring. Generate appropriate runtime derivatives after reviewing visual quality. Avoid loading every original PNG as an uncompressed GPU texture at startup.

Use SVG directly where the UI stack supports it, or export it at the required runtime size for the game renderer. Test the resulting edges at target size. Retain the font licence if bundling the font files.

### Step F: handle missing content honestly

If an asset is missing, identify the exact missing file/state and continue unaffected work. An obvious labelled development placeholder is acceptable while preparing a real replacement; do not silently ship a generic substitute or claim it is the supplied design. Only ask Alexandre for information that blocks a concrete next decision.

## 11. Implementation sequence

### Milestone 1: visual integration

Import the brand, tokens, five character cutouts, garage and pub backgrounds. Build the HUD, navigation, cards, buttons and resource display. Reproduce the HQ composition with real controls and state. Verify scale, foot alignment and image loading.

**Review result:** interactive HQ at phone and desktop sizes using the actual artwork.

### Milestone 2: complete first loop

Add practice, basic songwriting, pub booking, a short rhythm session, results, rewards and persistence. Return to the HQ successfully after a gig and reload a save without corrupting progression.

**Review result:** a player can complete the whole loop repeatedly. No unexplained placeholder screens or dead-end result screens.

### Milestone 3: story and progression

Add Moira's tutorial, the uncle's note, narrative choices, gear upgrades, additional venues and HQ tiers. Prepare dedicated runtime assets from concepts where needed. Build expression/animation work as explicit tasks.

**Review result:** progression changes both the gameplay and its visible world without changing the band's identities.

### Milestone 4: multiplayer and promoters

Follow the GDD unlock order. Add accounts/cloud saves, asynchronous band roles and booking, then the plot-based festival planner. Clearly separate shared and personal resources. Prepare the richer facility assets before expanding toward free placement.

**Review result:** no duplicate payouts, clear contract/ready states, and understandable festival capacity and queue feedback.

### Milestone 5: later systems and polish

Add live festival days, spectating, labels, chart competition and seasons only after the earlier loop is reliable. Extend the later-stage artwork and animations. Keep cosmetic purchases separate from fame, fans, rankings and gameplay advantage, as specified in the source brief.

## 12. Production work still needed

| Work | Current state | Next action |
|---|---|---|
| Five playable role designs | Static full-body cutouts supplied | Prepare animation assets/rigs and inspect edge haze |
| Six genre looks | One six-look guitarist sheet supplied | Produce independent outfits for all relevant characters |
| Music tribes / skins | Five sheets, 15 additional identities, 30 outfit looks | Prepare independent transparent sprites and role/animation variants |
| Story portraits | One six-portrait sheet supplied | Prepare individual portraits and dialogue expressions |
| HQ tiers | Five concepts; garage standalone | Produce later standalone rooms and separate interactive props |
| Venues | Five concepts; pub standalone | Produce club, theatre, arena and stadium runtime backgrounds |
| Festival stages | Five concepts; Solstice standalone | Prepare the other four standalone stage assets |
| Buildings | Six illustrated concepts + seven map symbols | Prepare independent textures/layers and upgrade states |
| Crowds | Three density treatments on one sheet | Prepare measured strips, repeats and animation states |
| Rhythm interface | Vector note/effect kit and composition | Implement timing, calibration, touch controls and feedback |
| Remaining UI screens | Requirements specified | Build and review the uncomposed screens in the same system |
| Audio and charts | Not supplied | Compose/source music, sound effects, voices and author charts |
| Full rival band / recruitables | Not supplied | Expand the cast while preserving the style |
| Seasonal/cosmetic content | Not supplied | Define and produce after core visual direction is validated |

The kit establishes the complete visual system and broad content direction. It does not claim every eventual animation, costume permutation, background layer or live-service asset has been produced.

## 13. Review and acceptance

For each milestone, report **implemented**, **tested**, **remaining** and **blocked**, with concrete file or screen references.

Before calling the first slice complete, check:

- All referenced assets exist and load without broken-image errors.
- No temporary machine paths or generation URLs remain in the application.
- The actual AMPED logo, characters and backgrounds are in use.
- Characters are not stretched, clipped or floating above their intended floor.
- UI text stays readable against the art, and critical controls remain reachable.
- Buttons have appropriate focus/pressed/disabled/loading states.
- Touch and keyboard input work without browser scrolling or text selection disrupting rhythm play.
- Result-to-HQ navigation works after multiple gigs.
- Resource changes and saved progress remain consistent on reload.
- Latency calibration and audio enablement are handled deliberately.
- Reduced motion and volume controls behave as labelled.
- Concept sheets are not mistaken for animation frames or certified packed atlases.
- Remaining asset work is explicitly listed rather than concealed.

Keep validation proportional to the change. Test gameplay state, saving and timing behaviour; use visual inspection for straightforward graphic updates.

## 14. Future artwork requests

When new artwork is needed, prepare a precise brief with: asset ID, intended screen/role, actual reference file, pose or scene, target aspect ratio, transparency requirement, invariant identity details and export needs.

Use `docs/IMAGE_PROMPTS.md` as continuity guidance. Its prompts describe intent; they are not proof that every requested detail appeared in the generated result. Inspect all new artwork before integrating it.

Example:

```text
Asset: band-guitar-play-01
Reference: assets/characters/band-guitar.png
Preserve: face, skin tone, cyan hair streak, yellow jacket, coral guitar,
outline character, palette and relative proportions.
Change: create a clear strumming pose suitable for the supplied pub stage.
Output: full body with transparent background; entire instrument and boots
visible; consistent foot baseline; no text, backdrop or cast shadow.
Production note: this is one new pose, not a complete animation cycle.
```

The objective is a playable, coherent AMPED that looks like this world at every stage: from a battered garage amp to the Solstice headline slot.
