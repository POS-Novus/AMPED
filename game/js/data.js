// Game content and tuning. Art paths point at runtime copies made by tools/prepare_assets.py.
// Positions in scenes are percentages of the backdrop (3:2), so they track the art at any size.
// Names, prices and numbers here are working values, not approved balance.
// Five players across a stage: centre x, feet line y, player height h, spacing (all % of the backdrop).
function stage(src, x, y, h, gap) {
  return {
    src,
    slots: {
      vocals: { x: x - gap * 2, y, h, z: 3 },
      drums:  { x: x - gap, y: y - h * 0.12, h: h * 0.85, z: 1 },
      guitar: { x, y: y + h * 0.04, h: h * 1.05, z: 5 },
      bass:   { x: x + gap, y: y - h * 0.05, h: h * 0.95, z: 2 },
      keys:   { x: x + gap * 2, y, h: h * 0.95, z: 4 }
    }
  };
}

window.AMPED_DATA = {
  saveVersion: 3,

  band: { name: "The Static Kids" },
  start: { cash: 120, fans: 12, fame: 1, hype: 20, day: 1 },
  goal: { label: "Pub gigs", target: 10 },

  members: [
    { id: "roxy", name: "Roxy", role: "vocals", roleLabel: "Vocals", color: "var(--pink)",
      sprite: "assets/characters/band-vocals.webp", aspect: 0.5344, anim: "sing", line: "Mic check, one two",
      stats: { skill: 22, presence: 41, creativity: 28, ego: 35, stamina: 30 }, energy: 90, morale: 85,
      bio: "Loud, fearless, the band's heart." },
    { id: "saoirse", name: "Saoirse", role: "drums", roleLabel: "Drums", color: "var(--green)",
      sprite: "assets/characters/band-drums.webp", aspect: 0.5122, anim: "drum", line: "Always one beat ahead",
      stats: { skill: 27, presence: 24, creativity: 18, ego: 15, stamina: 40 }, energy: 80, morale: 95,
      bio: "Chaotic joy. Has never once played quietly." },
    { id: "nia", name: "Nia", role: "guitar", roleLabel: "Guitar", color: "var(--yellow)",
      sprite: "assets/characters/band-guitar.webp", aspect: 0.71, anim: "guitar", line: "Ready to shred",
      stats: { skill: 34, presence: 30, creativity: 31, ego: 20, stamina: 33 }, energy: 95, morale: 90,
      bio: "Your uncle's note is in that jacket pocket. Play Solstice." },
    { id: "theo", name: "Theo", role: "bass", roleLabel: "Bass", color: "var(--cyan)",
      sprite: "assets/characters/band-bass.webp", aspect: 0.56, anim: "sway", line: "Calm in the chaos",
      stats: { skill: 25, presence: 18, creativity: 22, ego: 8, stamina: 31 }, energy: 85, morale: 88,
      bio: "The calm one. Keeps band drama down." },
    { id: "mika", name: "Mika", role: "keys", roleLabel: "Keys / Producer", color: "var(--violet)",
      sprite: "assets/characters/band-keys.webp", aspect: 0.4233, anim: "keys", line: "Session wizard",
      stats: { skill: 29, presence: 15, creativity: 38, ego: 12, stamina: 26 }, energy: 75, morale: 80,
      bio: "Quiet studio genius. Already producing the demo." }
  ],

  statLabels: { skill: "Skill", presence: "Stage presence", creativity: "Creativity", ego: "Ego", stamina: "Stamina" },

  scenes: {
    garage: {
      src: "assets/world/hq-garage-backdrop.webp",
      label: "Garage · Level 1",
      // where each role stands (feet at y)
      slots: {
        vocals: { x: 20, y: 95, h: 58, z: 3 },
        drums:  { x: 35, y: 88, h: 52, z: 1 },
        guitar: { x: 51, y: 99, h: 62, z: 5 },
        bass:   { x: 67, y: 92, h: 57, z: 2 },
        keys:   { x: 83, y: 95, h: 55, z: 4 }
      },
      fx: {
        rain: { x: 3, y: 5, w: 21, h: 53 },
        dust: { x: 28, y: 12, w: 70, h: 55 },
        lights: [
          { x: 39, y: 24, size: 9, color: "rgba(255, 200, 110, 0.55)" },
          { x: 45.5, y: 29, size: 8, color: "rgba(255, 200, 110, 0.5)" },
          { x: 69.5, y: 29.5, size: 8, color: "rgba(255, 200, 110, 0.5)" },
          { x: 79.3, y: 24.5, size: 9, color: "rgba(255, 200, 110, 0.55)" },
          { x: 90.7, y: 23, size: 9, color: "rgba(255, 200, 110, 0.5)" },
          { x: 48.5, y: 36, size: 12, color: "rgba(255, 214, 140, 0.45)" },
          { x: 87, y: 42, size: 12, color: "rgba(255, 214, 140, 0.45)" }
        ]
      }
    },
    street:        stage("assets/venues/street.webp", 52, 92, 40, 9),
    club:          stage("assets/venues/club.webp", 52, 64, 26, 6.5),
    "muddy-boots": stage("assets/venues/muddy-boots.webp", 51, 54, 19, 5.5),
    riverside:     stage("assets/venues/riverside.webp", 51, 63, 20, 6),
    theatre:       stage("assets/venues/theatre.webp", 49, 81, 26, 6),
    "neon-valley": stage("assets/venues/neon-valley.webp", 50, 61, 18, 5),
    arena:         stage("assets/venues/arena.webp", 50, 69, 16, 4.5),
    thunderdome:   stage("assets/venues/thunderdome.webp", 51, 65, 20, 5.5),
    stadium:       stage("assets/venues/stadium.webp", 50, 69, 12, 3.5),
    solstice:      stage("assets/venues/solstice.webp", 50, 60, 18, 5),
    pub: {
      src: "assets/world/venue-pub-backdrop.webp",
      slots: {
        vocals: { x: 36, y: 58, h: 27, z: 3 },
        drums:  { x: 44, y: 55, h: 23, z: 1 },
        guitar: { x: 52, y: 59.5, h: 29, z: 5 },
        bass:   { x: 60, y: 56.5, h: 26, z: 2 },
        keys:   { x: 67, y: 58, h: 25, z: 4 }
      },
      fx: {
        lights: [
          { x: 39.5, y: 9, size: 10, color: "rgba(255, 200, 110, 0.5)" },
          { x: 69, y: 9, size: 10, color: "rgba(255, 200, 110, 0.5)" },
          { x: 7, y: 17, size: 9, color: "rgba(255, 200, 110, 0.45)" },
          { x: 95.5, y: 17, size: 9, color: "rgba(255, 200, 110, 0.45)" }
        ]
      }
    }
  },

  // The Road to Solstice. Unlocks: fame level, wins at an earlier venue, number of songs written.
  // tough: how much harder the crowd is to win (miss penalty multiplier). Prices and numbers are working values.
  venues: [
    { id: "street", name: "Quay Street", type: "Busking", act: 1, scene: "street", capacity: 40, ticket: 0, tips: 2, tough: 0.8,
      blurb: "Open the guitar case and play for passers-by. No tickets, just tips.", needs: {} },
    { id: "pub", name: "The Crane Bar", type: "Pub", act: 1, scene: "pub", capacity: 80, ticket: 6, tough: 1,
      blurb: "Open mic night. The regulars have heard it all.", needs: {} },
    { id: "muddy-boots", name: "Muddy Boots Fest", type: "Festival", act: 1, scene: "muddy-boots", capacity: 600, ticket: 10, tough: 1.1, poster: "assets/posters/muddy-boots.svg",
      blurb: "A field, a stage and a lot of mud. Your first festival.", needs: { fame: 2, winsAt: { pub: 3 } } },
    { id: "club", name: "The Vault", type: "Club", act: 2, scene: "club", capacity: 300, ticket: 12, tough: 1.15,
      blurb: "Sticky floors, loud speakers, a real crowd.", needs: { fame: 3 } },
    { id: "riverside", name: "Riverside Sounds", type: "Festival", act: 2, scene: "riverside", capacity: 2500, ticket: 15, tough: 1.2, poster: "assets/posters/riverside-sounds.svg",
      blurb: "Summer evening by the water. Bring three songs of your own.", needs: { fame: 5, songs: 3 } },
    { id: "theatre", name: "The Grand", type: "Theatre", act: 3, scene: "theatre", capacity: 1200, ticket: 20, tough: 1.25,
      blurb: "Velvet seats and perfect sound. Every mistake is heard.", needs: { fame: 7, winsAt: { club: 2 } } },
    { id: "neon-valley", name: "Neon Valley", type: "Festival", act: 3, scene: "neon-valley", capacity: 15000, ticket: 22, tough: 1.3, poster: "assets/posters/neon-valley.svg",
      blurb: "Three stages, lasers, a national crowd.", needs: { fame: 9, winsAt: { riverside: 1 } } },
    { id: "arena", name: "Harbour Arena", type: "Arena", act: 4, scene: "arena", capacity: 12000, ticket: 35, tough: 1.4,
      blurb: "Your name on the screens. Your first headline tour.", needs: { fame: 12, winsAt: { theatre: 2 } } },
    { id: "thunderdome", name: "Thunderdome Open Air", type: "Festival", act: 4, scene: "thunderdome", capacity: 40000, ticket: 40, tough: 1.5, poster: "assets/posters/thunderdome.svg",
      blurb: "Europe's loudest weekend. Storms guaranteed.", needs: { fame: 15, winsAt: { "neon-valley": 1 } } },
    { id: "stadium", name: "Northfield Stadium", type: "Stadium", act: 5, scene: "stadium", capacity: 60000, ticket: 50, tough: 1.6,
      blurb: "Sixty thousand phones in the air.", needs: { fame: 18, winsAt: { arena: 2 } } },
    { id: "solstice", name: "Solstice", type: "Festival", act: 5, scene: "solstice", capacity: 100000, ticket: 60, tough: 1.75, poster: "assets/posters/solstice.svg",
      blurb: "The festival your uncle never played. Finish what they started.", needs: { fame: 22, winsAt: { thunderdome: 1 } } }
  ],
  acts: { 1: "Hometown", 2: "The Circuit", 3: "The Breakout", 4: "The Tour", 5: "Solstice" },
  // fans needed to reach a fame level
  fameFans: (level) => Math.round(100 * Math.pow(level - 1, 1.6)),

  songwriting: {
    themes: ["Love", "Rebellion", "Party", "Heartbreak"],
    styles: ["Ballad", "Anthem", "Banger"],
    // hidden bonuses the player discovers
    combos: { "Rebellion|Anthem": 18, "Heartbreak|Ballad": 16, "Party|Banger": 16, "Love|Ballad": 8 }
  },
  starterSongs: [
    { id: "s-start", title: "Garage Anthem", theme: "Rebellion", style: "Anthem", quality: 32, practice: 0 }
  ],

  costs: { practice: 15, write: 10, gig: 20, restGain: 35, train: 50, trainEnergy: 10 },

  rhythm: {
    countIn: 4,     // tempo and length come from each song's arrangement (js/composer.js)
    // seconds either side of the note; gear upgrades will widen these later
    windows: { perfect: 0.045, great: 0.09, good: 0.135 },
    points: { perfect: 300, great: 200, good: 100 },
    crowd: { start: 60, perfect: 2, great: 1.5, good: 0.5, miss: -6 },
    difficulties: {
      easy:   { label: "Easy",   travel: 2.0, quarter: 0.55, eighth: 0.0,  chord: 0.0 },
      normal: { label: "Normal", travel: 1.6, quarter: 0.8,  eighth: 0.22, chord: 0.05 },
      hard:   { label: "Hard",   travel: 1.25, quarter: 0.9, eighth: 0.5,  chord: 0.15 }
    },
    lanes: [
      { key: "d", color: "var(--cyan)",   note: "assets/rhythm/note-d-circle.svg",   shape: "circle" },
      { key: "f", color: "var(--yellow)", note: "assets/rhythm/note-f-diamond.svg",  shape: "diamond" },
      { key: "j", color: "var(--pink)",   note: "assets/rhythm/note-j-square.svg",   shape: "square" },
      { key: "k", color: "var(--violet)", note: "assets/rhythm/note-k-triangle.svg", shape: "triangle" }
    ]
  },

  reviews: {
    fail: "Booed off. The landlord wants the stage back.",
    1: "\"They turned up. That's something.\"",
    2: "\"Rough edges, but there's a band in there.\"",
    3: "\"A solid set. The regulars nodded along.\"",
    4: "\"The whole pub was singing by the end.\"",
    5: "\"Legendary. People will lie about being here.\""
  }
};
