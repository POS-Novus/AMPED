// Game content. Art lives in assets/, everything the player reads lives here.
// Hotspots and tags are percentages of the scene image, so they survive any resize.
window.AMPED_DATA = {
  band: { name: "The Static Kids", act: 1, actTitle: "The Garage" },

  resources: { cash: 250, fans: 12, fame: 1, hype: 20, day: 1 },

  goal: { label: "Play 10 pub gigs", target: 10, progress: 0 },

  scene: {
    id: "garage_t1",
    name: "The Garage",
    width: 1536,
    height: 1024,
    // Back to front. Characters are placed by code from each member's `sprite`.
    bpm: 112,
    layers: [
      // Placeholder: the old scene blurred into a backdrop until an empty garage painting exists.
      { src: "assets/scenes/garage_t1.webp", alt: "", backdrop: true }
    ],
    // Ambient effects drawn by code on top of the art (all in % of the image).
    fx: {
      rain: { x: 0, y: 0, w: 27, h: 62 },
      dust: { x: 30, y: 5, w: 70, h: 70 },
      lights: [
        { x: 49.6, y: 10, size: 12, color: "rgba(255, 196, 110, 0.55)" },
        { x: 58, y: 9, size: 12, color: "rgba(255, 196, 110, 0.55)" },
        { x: 69.2, y: 5.5, size: 10, color: "rgba(255, 196, 110, 0.5)" },
        { x: 94, y: 11, size: 18, color: "rgba(255, 210, 140, 0.45)" },
        { x: 14, y: 17.5, size: 8, color: "rgba(255, 220, 150, 0.5)" },
        { x: 18.8, y: 24.5, size: 6, color: "rgba(255, 220, 150, 0.45)" }
      ]
    }
  },

  members: [
    {
      id: "roxy", name: "Roxy", role: "Vocals", color: "#FF4F9A",
      sprite: { src: "assets/characters/roxy/idle.webp", x: 15, y: 93, h: 66, z: 3, anim: "sing" },
      stats: { skill: 22, presence: 41, creativity: 28, ego: 35, stamina: 30 },
      energy: 90, morale: 85,
      bio: "Loud, fearless, the band's heart."
    },
    {
      id: "nia", name: "Nia", role: "Lead guitar", color: "#FFC857",
      sprite: { src: "assets/characters/nia/idle.webp", x: 49, y: 99, h: 70, z: 5, anim: "guitar" },
      stats: { skill: 34, presence: 30, creativity: 31, ego: 20, stamina: 33 },
      energy: 95, morale: 90,
      bio: "Your uncle's note is in that jacket pocket. Play Solstice."
    },
    {
      id: "saoirse", name: "Saoirse", role: "Drums", color: "#FF8A4C",
      sprite: { src: "assets/characters/saoirse/idle.webp", x: 31, y: 84, h: 58, z: 1, anim: "drum" },
      stats: { skill: 27, presence: 24, creativity: 18, ego: 15, stamina: 40 },
      energy: 80, morale: 95,
      bio: "Chaotic joy. Has never once played quietly."
    },
    {
      id: "theo", name: "Theo", role: "Bass", color: "#3CCFCF",
      sprite: { src: "assets/characters/theo/idle.webp", x: 70, y: 90, h: 64, z: 2, anim: "sway" },
      stats: { skill: 25, presence: 18, creativity: 22, ego: 8, stamina: 31 },
      energy: 85, morale: 88,
      bio: "The calm one. Keeps band drama down."
    },
    {
      id: "mika", name: "Mika", role: "Keys", color: "#B79CFF",
      sprite: { src: "assets/characters/mika/idle.webp", x: 88, y: 92, h: 62, z: 4, anim: "keys" },
      stats: { skill: 29, presence: 15, creativity: 38, ego: 12, stamina: 26 },
      energy: 75, morale: 80,
      bio: "Quiet studio genius. Already producing the demo."
    }
  ],

  statLabels: {
    skill: "Skill", presence: "Stage presence", creativity: "Creativity", ego: "Ego", stamina: "Stamina"
  },

  costs: { practiceEnergy: 15, gigEnergy: 25, trainCash: 50, trainEnergy: 10 }
};
