# AMPED: From Garage to Glory
### Game Design Document · v0.1 (draft)

---

## 1. Overview

| | |
|---|---|
| **Pitch** | You start with a busted guitar in a garage. You end headlining the biggest festival on the planet. |
| **Genre** | Band management tycoon + deep simulation + rhythm game, with narrative choices |
| **Platforms** | Mobile and web browser (one web build, wrapped for iOS/Android later) |
| **Multiplayer** | Persistent shared world, mostly async, with live play as a bonus |
| **Session length** | 5–15 min sessions, with offline progression between them |
| **Tone** | Funny, warm, a bit satirical about the music industry |
| **Scale plan** | Small test first (hundreds of players), architecture ready to grow big |

**Pillars**
1. **Grow the band:** gear, skills, fans, fame
2. **Play the gig:** a full rhythm game, where your upgrades change how it plays
3. **Live the story:** choices with real trade-offs
4. **Play together:** join bands, book each other, run festivals

---

## 2. Story

### Premise
Four friends in a small, rainy town (an Irish town fits well). Your late uncle was a roadie for the legendary band **The Static Saints**. He left you his old van and a note: *"Finish what we started. Play Solstice."*

**Solstice** is the mythical, invite-only mega-festival. Nobody knows how bands get picked.

### Acts

| Act | Setting | Goal | Story beat |
|---|---|---|---|
| **1. The Garage** | Hometown | Play 10 pub gigs, record a demo | Form and name the band, find the uncle's note |
| **2. The Circuit** | Regional cities | Get signed by an indie label | Rival band **Velvet Riot** starts stealing your gigs. Multiplayer unlocks here. |
| **3. The Breakout** | National | First album, first festival slot | Shady major-label manager **Rex Gold** offers a contract with a catch |
| **4. The Tour** | International | Tour 3 continents | Band tension: a member threatens to leave |
| **5. Solstice** | Legendary | Headline Solstice | Learn what happened to the Static Saints and why they never played it |

### Key characters
- **Moira:** grumpy sound engineer and mentor
- **Rex Gold:** major-label manager (money now, freedom later)
- **Velvet Riot:** rival band
- **Superfan:** runs your fan club and reacts to your choices
- **The Journalist:** can make or break a release

### Narrative systems
- Branching choices with trade-offs, e.g. sign with Rex for fast cash with less creative control, or stay indie for slower growth with more loyal fans
- Choices set flags such as reputation (credible vs. sell-out), band morale and relationships
- Random events: broken strings, viral videos, sponsor offers, muddy festivals

---

## 3. Music genres

The player picks a band genre at the start: **Rock, Punk, Indie, Metal, Pop, Electronic**.

Genre affects:
- Look of the gear, outfits and crowds
- Which festivals and venues love or hate you
- Stat bonuses, e.g. Punk gets cheap gigs and fast hype; Pop gets big streaming but needs expensive production
- Rhythm-game track list and note patterns

---

## 4. Core gameplay

### Core loop
```
Practice / Write → Record → Gig (rhythm game) / Release → Earn Cash, Fame, Fans
       ↑                                                          ↓
       └────── Buy gear, upgrade HQ, hire crew, unlock venues ←───┘
```

### Resources

| Resource | Gained from | Used for |
|---|---|---|
| **Cash** | Gigs, merch, streams, sponsors | Gear, HQ, crew, travel |
| **Fame** | Good gigs, hits, press, viral moments | Unlocks venues, festivals, labels |
| **Fans** | Gigs, releases, social | Passive income, ticket sales |
| **Hype** | Teasers, events, viral posts (decays) | Multiplier on releases and gigs |
| **Energy / Morale** | Rest, good results | Performance; low = burnout and drama |

### Band members (RPG layer)
Stats: **Skill, Stage Presence, Creativity, Ego, Stamina**
- Level up through practice and gigs
- High Ego triggers drama: arguments, solo projects, quitting
- Recruitable replacements with traits, e.g. *Shredder: +20% solo quality, −10 morale when not in the spotlight*

### Band HQ progression
Garage → Rented rehearsal room → Studio loft → Own studio complex → Mansion with a recording wing

### Shop and upgrades

| Category | Tier 1 → Tier 5 | Effect |
|---|---|---|
| Instruments | Pawn-shop guitar → Custom signature model | Song quality, rhythm-game note value |
| Amps & PA | Practice amp → Stadium line array | Max crowd size, more forgiving rhythm timing |
| Studio | Laptop + mic → Analog console | Recording quality, streams |
| Transport | Uncle's van → Tour bus → Private jet | Tour range, less energy lost travelling |
| Stage FX | Fairy lights → Lasers, pyro, LED walls | Gig fame and score multiplier |
| Merch | Hand-printed tees → Clothing line | Passive income per fan |
| Crew | Friend with a car → Manager, PR, sound tech, social media | Automation (idle) and bonuses |

### Songwriting and releases
- A song = **Theme** (love, rebellion, party, heartbreak…) + **Style** (ballad, anthem, banger…)
- Hidden combos work best for each genre, and players discover the hits
- Release as a single, EP or album. Timing matters: hype, rival releases, seasons
- Songs have a chart run and earn streams over time

### Idle / offline
- Fans stream your songs while you're away, so cash builds offline
- Crew can auto-book small gigs
- All timers run on the server (anti-cheat)

---

## 5. Rhythm game (gig mode)

A core pillar, not an optional extra.

### Flow
1. Pick a venue from the map and set the ticket price
2. Build the **setlist**: opener, hits, encore (affects crowd energy)
3. Play each song as a rhythm game
4. Results: crowd reaction, review score, new fans, viral chance, cash

### Mechanics
- Note highway or lane-based tapping, playable on touch screens and keyboards
- Each band role has its own chart: vocals, guitar, bass, drums, keys
- A **crowd energy** meter rises with streaks and drops with misses
- **Hype moments** (solo or drop): hit perfect streaks to trigger a crowd surge
- Difficulty tiers per song

### Upgrades affect play
- Better amps/PA → wider timing window
- Stage FX → score multiplier
- Member Skill stat → auto-assist on hard sections
- Stamina → long sets get harder as energy drains

### Technical notes
- **Latency calibration** screen (audio and input offset), essential on web and mobile
- Music: original tracks per genre and difficulty → budget for a composer or royalty-free licensing
- Charts (note maps) authored per track; consider a simple internal chart editor

### Multiplayer rhythm
- **Async:** each member plays their part when they can; scores are combined into the band result. Offline members are covered by AI at reduced score.
- **Live:** if everyone is online, they play together for a big multiplier

---

## 6. Festival ladder (single-player and story)

| Tier | Festival | Requirement |
|---|---|---|
| 1 | **Muddy Boots Fest** (local field) | 500 fans |
| 2 | **Riverside Sounds** (regional) | Fame 5 + an EP |
| 3 | **Neon Valley** (national, 3 stages) | Fame 12 + a chart song |
| 4 | **Thunderdome Open Air** (European giant) | Album + 100k fans |
| 5 | **Solstice** (the legend) | Story complete + headliner reputation |

Within each festival you progress tent stage → second stage → main stage → **headliner**.

---

## 7. Multiplayer

### 7.1 Shared world
- One persistent map split into **scenes** (cities and regions), each with venues, festivals and charts
- **Global weekly charts** where all player releases compete
- **Scene leaderboards**, e.g. "Top band in Dublin" or "Hottest festival in Europe"
- **Seasons** of 8–10 weeks ending in a Solstice finale for the top bands
- Single-player campaign = tutorial and offline mode; multiplayer unlocks at **Act 2**

### 7.2 Joining bands (co-op)
A player band has 2–5 real players. Empty slots are filled by AI session musicians.

| Role | Contribution | Special |
|---|---|---|
| Vocalist / Frontperson | Stage Presence | Crowd hype and viral chance |
| Guitarist | Skill, solos | Song quality |
| Bassist | Groove | Reduces drama and stamina loss |
| Drummer | Tempo, energy | Rhythm multiplier |
| Keys / Producer | Creativity | Better recordings, new song styles |

- **Shared:** band HQ, band fame and fans, band bank account
- **Personal:** skill level, cash, gear (kept if you leave), personal fame
- **Songwriting together:** each member adds a part (lyrics, riff, beat)
- **Revenue split:** set by the leader or voted on; unfair splits hurt morale
- **Recruiting:** band-finder board, auditions (rhythm challenge or stat check)
- Leaving, being kicked out and solo careers are all possible
- Gigs and recordings can be **scheduled** so members don't need to be online together

### 7.3 Organising festivals (promoter role)
A second tycoon game inside the game.

| Tier | Event | Capacity |
|---|---|---|
| 1 | Pub night / open mic | 50 |
| 2 | Warehouse / club night | 500 |
| 3 | Field festival, 1 stage | 5,000 |
| 4 | Multi-stage weekend | 30,000 |
| 5 | Mega-festival | 100,000+ |

**Promoter manages:**
- **Site:** stages, bars, food, toilets, campsite, medical, merch
- **Booking:** invite player bands and/or NPC bands; set lineup and running order
- **Tickets and marketing:** pricing, posters, early-bird sales
- **Theme:** genre focus decides which fans come
- **Risks:** weather, overcrowding, headliner cancels, toilet queues

**Festival builder: options for site management**

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Menu-based | Lineup list, +/− buttons for facilities, ticket slider, forecast | Fastest to build, phone-friendly | Less visual and less "tycoon" |
| B. Plot-based hybrid | Pre-made festival map with numbered plots; tap a plot and pick 1 of 3 buildings | Visual, easy on touch, easy to balance | Less freedom |
| C. Full site builder | Free placement on a grid with crowd flow, queues and warnings | Deepest, most tycoon | Most work, fiddly on phones |

**Recommendation:** launch with **B** and grow toward **C**. Small festivals have few plots and higher tiers unlock more; free placement becomes a later "Pro mode." Option A's lineup and ticket screen is still used for booking.

**Booking marketplace (bands ↔ promoters)**
1. Promoter posts the festival: dates, genre, slots, fees
2. Bands apply, or the promoter sends offers
3. Negotiate fee, stage, time slot, rider
4. Contract locks; a no-show loses reputation and pays a penalty

**Festival day**
- Runs as a live event at a scheduled time; booked bands play live or are simulated
- Other players can attend as spectators (walk the site, buy merch, watch sets)
- **Results:** promoter gets profit, reputation and reviews; bands get fans, fame, fees and a "Best Set of the Weekend" award

**Economy loop**
```
Bands want bigger stages → need good festivals
Festivals want famous bands → to sell tickets
Famous bands charge more → promoters must grow to afford them
```

### 7.4 Competitive modes
- **Battle of the Bands:** head-to-head rhythm gig, decided by audience vote + score; ranked ladder
- **Chart Wars:** weekly release race; #1 gets a fame bonus
- **Festival Rivalry:** two promoters, same weekend, competing for bands and fans
- **Season Finale:** top bands play Solstice

### 7.5 Labels (endgame social layer)
- A clan of bands and promoters
- Shared label studio and marketing budget
- Labels sign players for a cut in exchange for boosts
- Labels run their own festival series
- Label wars on the season charts

### 7.6 Social
- Chat: band, label, global
- Band profile: discography, gig history, merch, fan count
- Follow bands, buy their virtual merch, wear band tees in festival crowds
- Shareable gig posters and festival lineups (free marketing)

---

## 8. Art direction brief

**Style:** clean vector cartoon (final look to be decided).

### General rules
- Chibi-style characters with big heads and expressive faces, plus idle animations (drummer twirling sticks, bassist asleep on the amp)
- Cutaway rooms for the band HQ that visibly upgrade with each tier
- Gig scenes from the side, with a crowd that grows with fame: from 3 bored people to a sea of phone lights
- Festivals each get their own identity: poster, stage design, weather mood
- UI touch targets ≥ 44px; readable on small phones

### Style options under consideration

| Option | Look | Palette idea | Fits |
|---|---|---|---|
| **A. Neon Pop** | Dark rooms, bold black outlines, neon lighting | Deep navy/purple ground; hot pink, cyan, yellow accents | Nightlife, rock, punk, electronic; strong for rhythm gigs |
| **B. Sticker Flat** | Bright backgrounds, pastel colours, thick white "sticker" outlines, soft drop shadows | Sky blue ground; coral, mint, lilac, sunny yellow | Casual-friendly, easy to animate |
| **C. Gig Poster** | Screen-print look, paper texture, halftone dots, two-colour offset print | Off-white paper, black ink, one accent (red or blue) | Indie character; harder to keep readable |

**Recommendation:** A as the base, with B's rounded, friendly character shapes.

### UI theme ideas
- Buttons styled like guitar pedals
- Menus as setlists taped to the floor
- Money counter as a VU meter

### Asset list (first pass)
- 4–5 band member base characters × genre outfits
- HQ rooms × 5 tiers
- Venues: pub, club, theatre, arena, stadium
- Festival stages × 5 festivals; site buildings (bar, food, toilets, campsite, medical, merch)
- Crowd sprites (scalable density)
- Gear icons × categories × 5 tiers
- Rhythm-game UI: note highway, hit effects, crowd meter, results screen
- Story portraits: Moira, Rex Gold, Velvet Riot, Superfan, Journalist

**References:** Game Dev Tycoon, Two Point Hospital, Rock Band, Hotline Miami (neon), Stardew Valley (coziness).

---

## 9. Monetisation (fair, no pay-to-win)
- Cosmetics: outfits, instrument skins, stage designs, festival decorations
- Season pass with cosmetic rewards
- Promoter premium: extra decoration items and layouts
- **Never** sell fame, fans or chart position

---

## 10. Technical plan

| Need | Approach |
|---|---|
| Client | Web first (Phaser or PixiJS for 2D, Web Audio for rhythm), wrapped for mobile later |
| Backend | Supabase: auth, Postgres, realtime |
| Chat, live gigs, festival day | Realtime channels (dedicated game server later if needed) |
| Timers / offline income | Server-side jobs |
| Anti-cheat | All economy maths on the server; rhythm scores validated server-side |

### Build roadmap
1. Single-player core loop + rhythm-game prototype (offline)
2. Accounts + cloud save
3. Join bands (async co-op)
4. Booking marketplace + plot-based festivals
5. Live festival days + spectators
6. Labels, ranked battles, seasons
7. Full site builder ("Pro mode")

---

## 11. Open decisions
- [ ] Final art style (A / B / C or a mix)
- [ ] Festival builder for launch (recommended: B)
- [ ] Rhythm input style: note highway vs. lanes vs. circles
- [ ] Music sourcing: composer vs. royalty-free library
- [ ] Final game title
