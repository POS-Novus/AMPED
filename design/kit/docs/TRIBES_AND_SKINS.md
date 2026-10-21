# AMPED: Music tribes and cosmetic skins

## Scope

Five requested music tribes are added as character-design families: **Headbangers, Punks, Hippies, K-pop and Trappers**. Each family has three distinct adult character designs, with a base outfit and an alternate stage outfit for each person.

**Total: 15 new character identities and 30 outfit looks across five concept sheets.** These expand the existing five band-role designs. They are concept-sheet illustrations, not 30 independent transparent sprites or completed animations.

The top row shows the three base looks. The bottom row shows the same three people in stage outfits, in matching columns. Preserve each person's face, skin tone, body shape and hairstyle when preparing their alternate skin.

## Art and identity map

| Tribe / file | Character A | Character B | Character C |
|---|---|---|---|
| Headbangers / `tribe-headbangers.png` | Broad build, long black hair and moustache, lightning tee; alternate battle vest | Auburn hair, dark vest and boots; alternate leather jacket and plaid waist layer | Full build, curly teal-dark hair and round glasses; alternate long purple-trim coat |
| Punks / `tribe-punks.png` | Coral mohawk, cyan jacket and tartan; alternate black jacket and purple tartan | Stocky build, lime spikes and patch vest; alternate burgundy vest and mustard cargos | Asymmetric violet hair, cream tee and tartan skirt; alternate cyan patchwork hoodie |
| Hippies / `tribe-hippies.png` | Long dark curls, beard, amber glasses, flared trousers; alternate fringe waistcoat | Ginger waves, flower detail and tie-dye; alternate floral jacket and cream trousers | Natural afro, round glasses, mustard cardigan; alternate lavender sun-pattern shirt |
| K-pop / `tribe-kpop.png` | Silver hair, lilac bomber and platform sneakers; alternate navy performance jacket | High ponytail with pink streak, coral varsity jacket; alternate lilac stage tailoring | Mint hair, cyan sweater and white cargos; alternate satin bomber and violet trousers |
| Trappers / `tribe-trappers.png` | Dark curls, puffer vest over hoodie; alternate charcoal velour and yellow piping | Blonde braided ponytail, coral puffer; alternate violet technical varsity jacket | Violet-tipped twists, sage jacket; alternate cream quilted jacket with cyan accents |

All five files live in `assets/characters/tribes/`. Inspect the delivered art for final visual details; the descriptions specify intended identity continuity, not pixel-perfect guarantees.

## How Claude should model this

Treat a tribe as a **visual style family**, separate from musical genre, role and progression. A headbanger can be a bassist or singer. A K-pop-inspired character can be used in a different genre band. Do not create a new gameplay class or restrict instruments simply because of clothing.

Suggested data separation:

```ts
type CharacterAppearance = {
  characterId: string;   // stable identity, e.g. headbangers_a
  styleFamilyId: string; // headbangers | punks | hippies | kpop | trappers
  skinId: string;        // headbangers_a_base | headbangers_a_stage
};

// Store these independently from appearance:
// roleId, genreId, skill, stagePresence, creativity, ego, stamina,
// equippedInstrumentId, progressionLevel and gameplay traits.
```

`design/tribes-catalog.json` supplies stable IDs, display names and concept-sheet references. Its row/column references are **logical design positions**, not measured pixel rectangles. Runtime textures remain unset until production preparation is complete.

## Cosmetic rules

- Both outfits are visual variations. Stage clothing does not give cash, fame, accuracy, timing-window, stamina or leaderboard bonuses.
- Rarity, unlock requirements and prices are not yet assigned. Do not invent them from how expensive an outfit looks.
- A skin must preserve the underlying identity. Use the paired column as the identity reference.
- Keep character identity, visual family, outfit, instrument and musical role independent in save data.
- Mixing style families within a band is allowed. The shared AMPED outline, shading and palette keep them visually coherent.
- Use the designs for player avatars and recruitable musicians. Prepare simplified audience variants separately if needed.
- Future clothing/accessory mix-and-match requires separate compatible layers. The current illustrations are flattened and cannot provide that automatically.

## Character selection / wardrobe screen

1. Choose a style family from five tabs or labelled filters.
2. Show three character cards, using prepared portrait/character previews.
3. Selecting a character opens Base and Stage outfit choices.
4. Show a full-body preview on a quiet navy background after the cream sheet background has been removed during production preparation.
5. Show role/instrument separately. Keep the final confirmation explicit and preserve the selection in saves.
6. Display availability, unlock information and equipped state in text as well as colour.

This is a new screen requirement. It is not implemented by the static visual guide.

## Production preparation

The sheets have opaque cream backgrounds. Do not load the entire sheet as a single playable character, and do not assume an evenly divided sprite grid without inspection.

For each of the 30 looks:

1. Inspect and measure its actual bounds.
2. Prepare a separate transparent full-body texture, preserving hair, boots, accessories and silhouette edges.
3. Align the base and stage variants to a consistent foot baseline and scale for that character.
4. Check identity continuity against its paired illustration.
5. Add role-appropriate instrument poses and animation only when the required assets exist.
6. Record the final texture path, dimensions, pivot, trim and animation metadata in the runtime manifest.

For rigged production, create the layers and attachment points needed by the chosen animation system. Do not treat two different outfits as two frames of an animation.

## Expansion briefs

After the initial roster is integrated, useful additions include tour-weather outfits, rehearsal casuals, festival headline costumes and instrument skins. Extend the same identities rather than generating a completely different face for every outfit. Additional fashion families can be added without changing the appearance data model.
