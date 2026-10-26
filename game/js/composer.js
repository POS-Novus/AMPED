// Turns a song into an arrangement the band plays. A song is a list of sections (Intro, Verse,
// Chorus, ...), each with a chord progression and one clip per track: drums, guitar, bass, vocals.
// Clips are one-bar patterns of 16 sixteenth-note steps (vocals: two bars, 32 steps), picked from
// sample libraries in the studio or edited step by step. Keys follow the chords automatically.
// Older songs (a single "groove", or none) are converted on the fly, seeded so they never change.
// Charts are then cut from the notes of the part you play.
window.AmpedComposer = (() => {
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };
  const TRACKS = ["drums", "guitar", "bass", "vocals"];
  const SECTION_TYPES = ["Intro", "Verse", "Pre-chorus", "Chorus", "Bridge", "Solo", "Breakdown", "Outro"];
  const DRUM_ROWS = ["kick", "snare", "hat", "crash"];

  // Pattern alphabets
  //   drums  (per row): "." off, "x" hit, "X" accent (hi-hat: open), "o" ghost (soft)
  //   guitar: "." rest, "m" palm-muted chug, "P" power chord, "H" high note, "L" lead lick, "A" arpeggio
  //   bass:   "." rest, "r" root, "f" fifth, "o" octave, "m" short muted root; or "follow" (copies the guitar's rhythm)
  //   vocals: 32 steps; "1"-"8" a note that many scale steps above the chord root (8 = octave), "." hold, "_" silence
  const GENRES = {
    metal: {
      label: "Metal", blurb: "Low tuning, galloping chugs, double-kick choruses.", bpm: 168, tone: "metal", kit: "power", keys: "pad", root: 38,
      progs: [{ name: "Phrygian doom (i–♭II–i–i)", mood: "Dark and doomy", deg: [0, 1, 0, 0], mode: "phrygian" }, { name: "Epic (i–♭VI–♭VII–i)", mood: "Epic", deg: [0, 5, 6, 0], mode: "minor" }, { name: "Grind (i–i–♭VI–♭VII)", mood: "Grinding", deg: [0, 0, 5, 6], mode: "minor" }],
      drums: {
        "Gallop": { kick: "x.xxx.xxx.xxx.xx", snare: "....X.......X...", hat: "x...x...x...x...", crash: "x..............." },
        "Thrash": { kick: "x.x.x.x.x.x.x.x.", snare: "..X...X...X...X.", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Double kick": { kick: "xxxxxxxxxxxxxxxx", snare: "....X.......X...", hat: "................", crash: "x...x...x...x..." },
        "Breakdown": { kick: "x..x..x...x..x..", snare: "........X.......", hat: "X.......X.......", crash: "x..............." },
        "Blast beat": { kick: "x.x.x.x.x.x.x.x.", snare: ".x.x.x.x.x.x.x.x", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." }
      },
      guitar: { "Gallop chug": "m.mmm.mmm.mmP.P.", "Chug & stab": "mmmmP...mmmmH...", "Tremolo lead": "LLLLLLLLLLLLLLLL", "Djent stop": "P..m.mP..m.mP.m.", "Big chords": "P.......P...P.P." },
      bass: {},
      def: { verse: ["Gallop", "Gallop chug", "Follow guitar", "Low drone"], chorus: ["Double kick", "Big chords", "Follow guitar", "Soaring"] }
    },
    rock: {
      label: "Rock", blurb: "Crunchy power chords, big backbeat, singalong choruses.", bpm: 128, tone: "crunch", kit: "power", keys: "organ", root: 40,
      progs: [{ name: "Classic (I–♭VII–IV–I)", mood: "Classic rock", deg: [0, 6, 3, 0], mode: "mixo" }, { name: "Drive (I–IV–V–IV)", mood: "Driving", deg: [0, 3, 4, 3], mode: "major" }, { name: "Dark (i–♭VI–♭VII–i)", mood: "Dark", deg: [0, 5, 6, 0], mode: "minor" }],
      drums: {
        "Rock beat": { kick: "x.....x.x.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Driving 8ths": { kick: "x.x...x.x.x...x.", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Open hats": { kick: "x.....x.x.......", snare: "....X.......X...", hat: "x.X.x.X.x.X.x.X.", crash: "x..............." },
        "Half-time": { kick: "x.........x.....", snare: "........X.......", hat: "x...x...x...x...", crash: "x..............." }
      },
      guitar: { "Power stabs": "P..P..P.P..P..P.", "Chug & chord": "P.mmP.mmH.mmP.mm", "Riff lick": "P...P.LLP...H.L.", "Open strum": "P.......P.....P." },
      bass: {},
      def: { verse: ["Rock beat", "Chug & chord", "Follow guitar", "Steady"], chorus: ["Open hats", "Open strum", "Root 8ths", "Hook"] }
    },
    punk: {
      label: "Punk", blurb: "Fast down-strummed chords, no brakes.", bpm: 186, tone: "dist", kit: "standard", keys: null, root: 40,
      progs: [{ name: "Three chords (I–IV–V–IV)", mood: "Three chords", deg: [0, 3, 4, 3], mode: "major" }, { name: "Pop-punk (I–V–vi–IV)", mood: "Pop-punk", deg: [0, 4, 5, 3], mode: "major" }, { name: "Street (i–♭VII–♭VI–♭VII)", mood: "Street", deg: [0, 6, 5, 6], mode: "minor" }],
      drums: {
        "Skate punk": { kick: "x...x...x...x...", snare: "..X...X...X...X.", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Punk rock": { kick: "x.x...x.x.x...x.", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Crash ride": { kick: "x...x...x...x...", snare: "..X...X...X...X.", hat: "................", crash: "x.x.x.x.x.x.x.x." }
      },
      guitar: { "Downstrokes": "P.P.P.P.P.P.P.P.", "Stop-start": "P.P.P...P.P.P...", "Octaves": "P.P.P.P.H.H.H.H." },
      bass: {},
      def: { verse: ["Punk rock", "Stop-start", "Root 8ths", "Chant"], chorus: ["Skate punk", "Downstrokes", "Root 8ths", "Hook"] }
    },
    pop: {
      label: "Pop", blurb: "Clean guitar, piano chords, a hook you can't shake.", bpm: 112, tone: "clean", kit: "standard", keys: "piano", root: 43,
      progs: [{ name: "Hit maker (I–V–vi–IV)", mood: "Happy", deg: [0, 4, 5, 3], mode: "major" }, { name: "Sad pop (vi–IV–I–V)", mood: "Bittersweet", deg: [5, 3, 0, 4], mode: "major" }, { name: "Uplift (IV–I–V–vi)", mood: "Uplifting", deg: [3, 0, 4, 5], mode: "major" }],
      drums: {
        "Pop groove": { kick: "x.......x.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Four on the floor": { kick: "X...X...X...X...", snare: "....X.......X...", hat: "..X...X...X...X.", crash: "x..............." }
      },
      guitar: { "Muted strum": "m.m.m.m.m.m.m.m.", "Chord hits": "P...P...P.P.P...", "Arpeggio": "A.A.A.A.A.A.A.A." },
      bass: { "Pop bounce": "r..r..r.r..r..r." },
      def: { verse: ["Pop groove", "Muted strum", "Pop bounce", "Call & answer"], chorus: ["Four on the floor", "Chord hits", "Pop bounce", "Hook"] }
    },
    indie: {
      label: "Indie", blurb: "Jangly arpeggios, a steady motorik beat.", bpm: 124, tone: "clean", kit: "standard", keys: "organ", root: 40,
      progs: [{ name: "Jangle (I–vi–IV–V)", mood: "Jangly", deg: [0, 5, 3, 4], mode: "major" }, { name: "Moody (i–♭VI–♭III–♭VII)", mood: "Moody", deg: [0, 5, 2, 6], mode: "minor" }],
      drums: {
        "Motorik": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "xxxxxxxxxxxxxxxx", crash: "x..............." },
        "Dance-punk": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "..X...X...X...X.", crash: "x..............." },
        "Big chorus": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "x.X.x.X.x.X.x.X.", crash: "x..............." }
      },
      guitar: { "Jangle": "AAAAAAAAAAAAAAAA", "Picked": "A.A.A.A.A.A.A.A.", "Strum": "P.P.P.mmP.P.P.mm" },
      bass: { "Octave 8ths": "r.o.r.o.r.o.r.o." },
      def: { verse: ["Motorik", "Jangle", "Octave 8ths", "Steady"], chorus: ["Big chorus", "Strum", "Octave 8ths", "Soaring"] }
    },
    electronic: {
      label: "Electronic", blurb: "Four on the floor, rolling synth bass, big drops.", bpm: 126, tone: "synth", kit: "electronic", keys: "pad", root: 45,
      progs: [{ name: "Night drive (i–♭VI–♭III–♭VII)", mood: "Night drive", deg: [0, 5, 2, 6], mode: "minor" }, { name: "Euphoria (vi–IV–I–V)", mood: "Euphoric", deg: [5, 3, 0, 4], mode: "major" }],
      drums: {
        "House": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "x.X.x.X.x.X.x.X.", crash: "x..............." },
        "Breakbeat": { kick: "x.....x...x.....", snare: "....X.......X..x", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Drop": { kick: "X...X...X...X...", snare: "....X.......X...", hat: "..X...X...X...X.", crash: "x..............." }
      },
      guitar: { "Arp": "AAAAAAAAAAAAAAAA", "Stabs": "P..P..P...P..P..", "Lead": "L.L.L...L.L.L..." },
      bass: { "Off-beat": "..r...o...r...o." },
      def: { verse: ["House", "Stabs", "Off-beat", "Call & answer"], chorus: ["Drop", "Arp", "Off-beat", "Soaring"] }
    }
  };
  const GENRE_IDS = Object.keys(GENRES);
  const TONES = ["clean", "crunch", "dist", "metal", "synth"];

  // Clips every genre can use
  const COMMON = {
    drums: {
      "Count-in": { kick: "x.......x.......", snare: "................", hat: "x...x...x...x...", crash: "x..............." },
      "Ending hit": { kick: "X...............", snare: "........X.......", hat: "................", crash: "X..............." },
      "Silent": { kick: "................", snare: "................", hat: "................", crash: "................" }
    },
    guitar: { "Ring out": "P...............", "Silent": "................" },
    bass: { "Follow guitar": "follow", "Root 8ths": "r.r.r.r.r.r.r.r.", "Root & fifth": "r.......f.......", "Walking": "r...f...o...f...", "Hold root": "r...............", "Silent": "................" },
    vocals: {
      "Steady": "1...3...5...3...2...1..._.......",
      "Soaring": "5.......6...5...8...........____",
      "Hook": "5_5_6_5_3...1...5_5_6_5_8.......",
      "Chant": "1_1_1_..1_1_1_..3_3_3_..1.......",
      "Call & answer": "1.3.5...________________5.3.1...",
      "Low drone": "1...............1.......2.......",
      "Rapid": "1_1_3_1_2_1_3_5_3_3_2_1_2...____",
      "Silent": "________________________________"
    }
  };
  // Plain-language hints for players who don't read music
  const HINTS = {
    "Gallop": "Horses charging: da-da-DUM, da-da-DUM", "Thrash": "Fast and furious, snare on every off-beat", "Double kick": "Both feet on the kick drums, a wall of thunder",
    "Breakdown": "Slow, heavy and stompy. Mosh time", "Blast beat": "As fast as drums go", "Rock beat": "The classic backbeat", "Driving 8ths": "Pushes the song forward",
    "Open hats": "Splashy and loud, for big choruses", "Half-time": "Feels twice as slow, twice as heavy", "Skate punk": "Bouncy, snare on the off-beat", "Punk rock": "Straight and fast",
    "Crash ride": "Riding the crash cymbal, total chaos", "Pop groove": "Laid-back and catchy", "Four on the floor": "Kick on every beat, made for dancing", "Motorik": "Hypnotic, steady, never stops",
    "Dance-punk": "Disco hats with a punk attitude", "Big chorus": "Lifts the chorus up", "House": "Club beat with open hats", "Breakbeat": "Choppy and funky", "Drop": "The moment the crowd jumps",
    "Count-in": "A gentle start", "Ending hit": "One big final hit", "Silent": "This track sits out",
    "Gallop chug": "Muted chugs in a gallop rhythm", "Chug & stab": "Chug, chug, then a big chord", "Tremolo lead": "Fast-picked melody notes", "Djent stop": "Stop-start, tight and heavy", "Big chords": "Huge ringing chords",
    "Power stabs": "Short punchy chords", "Chug & chord": "Chords with muted chugs between", "Riff lick": "Chords with a little melody", "Open strum": "Let the chords ring", "Downstrokes": "Chord on every 8th note, punk style",
    "Stop-start": "Play, play, play, stop", "Octaves": "Chords, then a higher line", "Muted strum": "Soft muted strums", "Chord hits": "Clean chords on the beat", "Arpeggio": "Chord notes one by one",
    "Jangle": "Bright picked notes, all the time", "Picked": "Gentle picked notes", "Strum": "Strummed chords with muted ghosts", "Arp": "Synth notes racing up and down", "Stabs": "Short synth chords", "Lead": "A synth melody",
    "Ring out": "One chord that rings to the end",
    "Follow guitar": "Bass plays the same rhythm as the guitar", "Root 8ths": "Steady pulse on the main note", "Root & fifth": "Two long notes per bar", "Walking": "Moves up and down", "Hold root": "One long note",
    "Pop bounce": "Bouncy and syncopated", "Octave 8ths": "Jumps between low and high", "Off-beat": "Between the kicks, club style",
    "Steady": "Calm, easy melody", "Soaring": "Long high notes, for big choruses", "Hook": "Catchy repeated phrase", "Chant": "Shouted together, crowd-style", "Call & answer": "Sing, pause, answer",
    "Low drone": "Low and menacing", "Rapid": "Lots of quick words"
  };

  // Every clip a track offers for a genre: the genre's own first, then the shared ones
  function library(track, genre) {
    const G = GENRES[genre] || GENRES.rock;
    const own = Object.entries(G[track] || {}).map(([name, p]) => ({ name, p, from: genre }));
    const shared = Object.entries(COMMON[track]).map(([name, p]) => ({ name, p, from: "any" }));
    return [...own, ...shared];
  }
  function allClips(track) {
    const seen = new Set(), out = [];
    GENRE_IDS.forEach((id) => library(track, id).forEach((c) => { if (!seen.has(c.name)) { seen.add(c.name); out.push(c); } }));
    return out;
  }
  function clipNamed(track, name, genre) {
    const c = library(track, genre).find((x) => x.name === name) || allClips(track).find((x) => x.name === name);
    return c ? { name: c.name, p: copy(c.p) } : null;
  }
  const copy = (p) => (typeof p === "string" ? p : { ...p });

  const pad = (p, n, fill) => String(p || "").padEnd(n, fill).slice(0, n);
  function normPattern(track, p) {
    if (track === "drums") { const o = {}; DRUM_ROWS.forEach((r) => { o[r] = pad(p && p[r], 16, ".").replace(/[^.xXo]/g, "."); }); return o; }
    if (track === "bass" && p === "follow") return "follow";
    if (track === "vocals") return pad(p, 32, "_").replace(/[^._1-8]/g, "_");
    if (track === "bass") return pad(p, 16, ".").replace(/[^.rfom]/g, ".");
    return pad(p, 16, ".").replace(/[^.mPHLA]/g, ".");
  }
  function normClip(track, c, genre, fallback) {
    if (!c || !c.p) return clipNamed(track, (c && c.name) || fallback, genre) || clipNamed(track, "Silent", genre);
    return { name: String(c.name || "Custom").slice(0, 30), p: normPattern(track, c.p) };
  }
  const isSilent = (track, c) => (track === "drums" ? DRUM_ROWS.every((r) => !/[^.]/.test(c.p[r])) : track === "vocals" ? !/[1-8]/.test(c.p) : c.p !== "follow" && !/[^.]/.test(c.p));
  function normProg(prog, G) {
    const p = typeof prog === "number" ? G.progs[prog] || G.progs[0] : prog && prog.deg ? prog : G.progs[0];
    return { name: String(p.name || "Custom"), mood: p.mood, deg: p.deg.slice(0, 4).map((d) => clampN(Math.round(d), 0, 6)), mode: SCALES[p.mode] ? p.mode : "minor" };
  }
  // all progressions from every genre (Pro mode offers any of them)
  const ALL_PROGS = GENRE_IDS.flatMap((id) => GENRES[id].progs).filter((p, i, a) => a.findIndex((q) => q.name === p.name) === i);

  function section(type, bars, prog, names, genre) {
    const clips = {};
    TRACKS.forEach((t, i) => { clips[t] = clipNamed(t, names[i], genre) || clipNamed(t, "Silent", genre); });
    return { type, bars, prog: { ...prog }, clips };
  }
  // A new song's starting point for a genre: intro, verse, chorus, verse, chorus, outro.
  function defaultArrangement(genre, progIndex = 0) {
    const G = GENRES[genre] || GENRES.rock, prog = G.progs[progIndex] || G.progs[0];
    const v = G.def.verse, c = G.def.chorus;
    const intro = ["Count-in", v[1], "Silent", "Silent"], outro = ["Ending hit", "Ring out", "Hold root", "Silent"];
    return normaliseArr({
      genre, bpm: G.bpm, tone: G.tone, kit: G.kit, root: G.root,
      sections: [section("Intro", 2, prog, intro, genre), section("Verse", 4, prog, v, genre), section("Chorus", 4, prog, c, genre),
        section("Verse", 4, prog, v, genre), section("Chorus", 4, prog, c, genre), section("Outro", 1, prog, outro, genre)]
    });
  }
  // Effects and feel. Every value is 0..1. Drive follows the guitar sound unless changed.
  const TONE_DRIVE = { clean: 0.05, crunch: 0.45, dist: 0.65, metal: 0.85, synth: 0.15 };
  const GENRE_FX = {
    metal: { guitar: { tone: 0.55, reverb: 0.15, delay: 0 }, bass: { drive: 0.45, tone: 0.55 }, drums: { room: 0.2, punch: 0.75 }, vocals: { reverb: 0.3, echo: 0.1 }, feel: { swing: 0, tight: 0.95 } },
    rock: { guitar: { tone: 0.5, reverb: 0.25, delay: 0.05 }, bass: { drive: 0.3, tone: 0.45 }, drums: { room: 0.35, punch: 0.55 }, vocals: { reverb: 0.35, echo: 0.15 }, feel: { swing: 0.05, tight: 0.75 } },
    punk: { guitar: { tone: 0.6, reverb: 0.1, delay: 0 }, bass: { drive: 0.4, tone: 0.6 }, drums: { room: 0.25, punch: 0.6 }, vocals: { reverb: 0.2, echo: 0.05 }, feel: { swing: 0, tight: 0.7 } },
    pop: { guitar: { tone: 0.6, reverb: 0.3, delay: 0.15 }, bass: { drive: 0.1, tone: 0.4 }, drums: { room: 0.25, punch: 0.5 }, vocals: { reverb: 0.4, echo: 0.25 }, feel: { swing: 0.1, tight: 0.9 } },
    indie: { guitar: { tone: 0.65, reverb: 0.45, delay: 0.3 }, bass: { drive: 0.15, tone: 0.5 }, drums: { room: 0.45, punch: 0.4 }, vocals: { reverb: 0.5, echo: 0.3 }, feel: { swing: 0.05, tight: 0.65 } },
    electronic: { guitar: { tone: 0.55, reverb: 0.35, delay: 0.35 }, bass: { drive: 0.2, tone: 0.55 }, drums: { room: 0.2, punch: 0.7 }, vocals: { reverb: 0.45, echo: 0.35 }, feel: { swing: 0.15, tight: 1 } }
  };
  function defaultFx(genre, tone) {
    const d = GENRE_FX[genre] || GENRE_FX.rock;
    return { guitar: { drive: TONE_DRIVE[tone] ?? 0.5, ...d.guitar }, bass: { ...d.bass }, drums: { ...d.drums }, vocals: { ...d.vocals }, feel: { ...d.feel } };
  }
  function normFx(fx, genre, tone) {
    const d = defaultFx(genre, tone), out = {};
    Object.keys(d).forEach((k) => { out[k] = {}; Object.keys(d[k]).forEach((f) => { const v = fx && fx[k] && fx[k][f]; out[k][f] = typeof v === "number" && isFinite(v) ? clampN(v, 0, 1) : d[k][f]; }); });
    return out;
  }
  // Swing moves every off-beat eighth (and the sixteenths around it) later, up to a full triplet feel.
  function applyFeel(events, feel) {
    const sw = (feel && feel.swing) || 0;
    if (!sw) return events;
    const mid = 0.5 + sw / 6;
    events.forEach((e) => {
      const n = Math.floor(e.beat + 1e-6), p = e.beat - n;
      if (p < 1e-6) return;
      e.beat = n + (p <= 0.5 ? (p / 0.5) * mid : mid + ((p - 0.5) / 0.5) * (1 - mid));
    });
    return events;
  }

  const MAX_SECTIONS = 12, MAX_BARS = 48;
  // Fills in anything missing, so saved songs keep working as the format grows.
  function normaliseArr(a) {
    const genre = GENRES[a.genre] ? a.genre : "rock", G = GENRES[genre];
    let sections = (a.sections || []).slice(0, MAX_SECTIONS).map((s) => ({
      type: SECTION_TYPES.includes(s.type) ? s.type : "Verse",
      bars: [1, 2, 4, 8].includes(s.bars) ? s.bars : 4,
      prog: normProg(s.prog, G),
      clips: Object.fromEntries(TRACKS.map((t) => [t, normClip(t, s.clips && s.clips[t], genre, "Silent")]))
    }));
    if (!sections.length) sections = defaultArrangement(genre).sections;
    const tone = TONES.includes(a.tone) ? a.tone : G.tone;
    return {
      v: 2, genre,
      bpm: clampN(Math.round(a.bpm || G.bpm), 60, 230),
      tone, fx: normFx(a.fx, genre, tone),
      kit: ["power", "standard", "electronic"].includes(a.kit) ? a.kit : G.kit,
      root: clampN(Math.round(a.root || G.root), 36, 47),
      sections
    };
  }
  const totalBars = (a) => a.sections.reduce((n, s) => n + s.bars, 0);

  // ---------- older songs ----------
  // Studio v1 songs saved a single groove; starter songs only a genre and style.
  function legacyGroove(song, bandGenre) {
    if (song.groove) return song.groove;
    const genre = song.genre || bandGenre || "rock", G = GENRES[genre] || GENRES.rock;
    const rnd = seeded(`${song.id}|${genre}|${song.style}`);
    const pace = { Ballad: 0.7, Anthem: 1, Banger: 1.12 }[song.style] || 1;
    return { genre, bpm: G.bpm * pace + Math.round(rnd() * 8 - 4), tone: G.tone, kit: G.kit, root: G.root,
      prog: pick(rnd, G.progs), beat: { ...pick(rnd, Object.values(G.drums)) }, riff: pick(rnd, Object.values(G.guitar)), chorus: song.style === "Ballad" ? "half" : null };
  }
  // the old "chorus feel" switches, applied to a copy of the verse beat
  function chorusBeat(beat, feel) {
    const B = Object.fromEntries(DRUM_ROWS.map((r) => [r, [...pad(beat[r], 16, ".")]]));
    for (let i = 0; i < 16; i++) {
      if (feel === "double") { if (B.kick[i] === ".") B.kick[i] = "o"; if (i % 4 === 0) B.crash[i] = "x"; }
      if (feel === "half") { B.snare[i] = i === 8 ? "X" : "."; B.kick[i] = i === 0 || i === 10 ? "x" : "."; }
      if (feel === "four") { if (i % 4 === 0) B.kick[i] = "X"; if (i % 4 === 2) B.hat[i] = "X"; }
      if (feel === "open" && B.hat[i] !== ".") B.hat[i] = i % 4 === 2 ? "X" : "x";
    }
    return Object.fromEntries(DRUM_ROWS.map((r) => [r, B[r].join("")]));
  }
  const OLD_FEEL = { metal: "double", rock: "open", punk: "open", pop: "four", indie: "open", electronic: "four" };
  const OLD_CHORUS_RIFF = { metal: "P.......P...P.P.", rock: "P.......P.....P.", punk: "P.P.P.P.P.P.P.P.", pop: "P...P...P.P.P...", indie: "P.P.P.mmP.P.P.mm", electronic: "AAAAAAAAAAAAAAAA" };
  function fromLegacy(song, bandGenre) {
    const g = legacyGroove(song, bandGenre), genre = GENRES[g.genre] ? g.genre : "rock", G = GENRES[genre];
    const rnd = seeded(`${song.id}|${song.title}|melody`);
    const prog = normProg(g.prog, G), feel = g.chorus || OLD_FEEL[genre];
    const vox = Object.keys(COMMON.vocals).filter((n) => n !== "Silent");
    const bassFor = (chorus) => G.def[chorus ? "chorus" : "verse"][2];
    const verse = { drums: { name: "Verse beat", p: g.beat }, guitar: { name: "Verse riff", p: g.riff }, bass: clipNamed("bass", bassFor(false), genre), vocals: clipNamed("vocals", pick(rnd, vox), genre) };
    const chorus = { drums: { name: "Chorus beat", p: chorusBeat(g.beat, feel) }, guitar: { name: "Chorus riff", p: OLD_CHORUS_RIFF[genre] }, bass: clipNamed("bass", feel === "double" ? "Follow guitar" : bassFor(true), genre), vocals: clipNamed("vocals", pick(rnd, vox), genre) };
    const intro = { drums: clipNamed("drums", "Count-in", genre), guitar: verse.guitar, bass: clipNamed("bass", "Silent", genre), vocals: clipNamed("vocals", "Silent", genre) };
    const outro = { drums: clipNamed("drums", "Ending hit", genre), guitar: clipNamed("guitar", "Ring out", genre), bass: clipNamed("bass", "Hold root", genre), vocals: clipNamed("vocals", "Silent", genre) };
    const fast = g.bpm >= 160;
    return normaliseArr({ genre, bpm: g.bpm, tone: g.tone, kit: g.kit, root: g.root, sections: [
      { type: "Intro", bars: 2, prog, clips: intro }, { type: "Verse", bars: 4, prog, clips: verse }, { type: "Chorus", bars: 4, prog, clips: chorus },
      { type: "Verse", bars: 4, prog, clips: verse }, { type: "Chorus", bars: fast ? 8 : 4, prog, clips: chorus }, { type: "Outro", bars: 1, prog, clips: outro }] });
  }
  // The arrangement for any song, old or new.
  const arrangementFor = (song, bandGenre) => (song.arr ? normaliseArr(song.arr) : fromLegacy(song, bandGenre));

  // ---------- playing a section ----------
  const LEVEL = { ".": 0, x: 1, X: 2, o: 3 };
  const VOCAL_LIFT = { Chorus: 2, "Pre-chorus": 1, Bridge: 1, Solo: 2 };
  const BIG = new Set(["Chorus", "Outro", "Solo"]);
  const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };

  // Adds one section's notes starting at beat t0. o: { next (a section follows), crashIn, only (track list) }
  function renderSection(a, sec, t0, add, o = {}) {
    const prog = sec.prog, scale = SCALES[prog.mode];
    const note = (deg, oct) => a.root + 12 * oct + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    const penta = prog.mode !== "major" ? [0, 3, 5, 7, 10, 12] : [0, 2, 4, 7, 9, 12];
    const snareKind = a.kit === "electronic" ? "clap" : "snare";
    const on = (t) => !o.only || o.only.includes(t);
    const clips = sec.clips;
    const fills = on("drums") && o.next && sec.type !== "Intro" && sec.type !== "Outro" && !isSilent("drums", clips.drums);

    for (let b = 0; b < sec.bars; b++) {
      const t = t0 + b * 4, deg = prog.deg[b % prog.deg.length];
      if (on("drums")) drums(clips.drums.p, t, fills && b === sec.bars - 1, o.crashIn && b === 0);
      if (on("guitar")) riff(clips.guitar.p, t, deg);
      if (on("bass")) bass(clips.bass.p, t, deg);
      if (on("keys")) keys(t, deg);
      if (on("vocals")) vocals(clips.vocals.p, t, b, deg);
    }

    function drums(p, t, fill, crashIn) {
      const hit = (i, kind, vel, accent, extra) => add("drums", t + i / 4, 0.25, kind, { vel, accent, ...extra });
      for (let i = 0; i < 16; i++) {
        if (fill && i >= 12) continue;
        const k = LEVEL[p.kick[i]], s = LEVEL[p.snare[i]], h = LEVEL[p.hat[i]];
        let c = LEVEL[p.crash[i]];
        if (crashIn && i === 0 && sec.type !== "Intro" && (k || s)) c = c || 1;
        if (k) hit(i, "kick", k === 2 ? 1 : k === 3 ? 0.6 : 0.82, (i % 4 === 0 || k === 2) && k !== 3);
        if (s) hit(i, snareKind, s === 2 ? 1 : s === 3 ? 0.45 : 0.7, (i % 4 === 0 || s === 2) && s !== 3);
        if (h && !c) hit(i, h === 2 ? "ohat" : "hat", h === 3 ? 0.4 : i % 2 ? 0.55 : 0.75, h === 2);
        if (c) hit(i, a.genre === "metal" && i % 8 === 4 ? "china" : "crash", c === 3 ? 0.6 : 1, c !== 3);
      }
      if (fill) [12, 13, 14, 15].forEach((i, n) => hit(i, n < 2 ? snareKind : "tom", 0.75 + n * 0.07, n === 0, { tom: n }));
    }
    // length of a step's note: until the next step that isn't a rest, at most `cap` steps
    function span(cells, i, cap, isHold) {
      let j = i + 1;
      while (j < cells.length && isHold(cells[j])) j++;
      return Math.min(j - i, cap) / 4;
    }
    function riff(p, t, deg) {
      const root = note(deg, 1), triad = [0, 2, 4].map((d) => note(deg + d, 1));
      let lead = 0, arp = 0;
      const cells = [...p];
      cells.forEach((c, i) => {
        if (c === ".") return;
        const len = span(cells, i, 16, (x) => x === ".");
        const accent = i % 4 === 0 || c === "P";
        if (c === "m") add("guitar", t + i / 4, 0.25, "mute", { midi: root, accent: i % 4 === 0 });
        else if (c === "P") add("guitar", t + i / 4, len, "power", { midi: root, accent });
        else if (c === "H") add("guitar", t + i / 4, len, "note", { midi: root + 12, accent });
        else if (c === "L") add("guitar", t + i / 4, len, "note", { midi: root + 12 + penta[lead++ % penta.length], accent: i % 2 === 0 });
        else if (c === "A") add("guitar", t + i / 4, len, a.tone === "synth" ? "synth" : "pluck", { midi: [triad[0] + 12, triad[1] + 12, triad[2] + 12, triad[0] + 24][arp++ % 4], accent: i % 4 === 0 });
      });
    }
    function bass(p, t, deg) {
      const low = a.root >= 43 ? 12 : 0, r = note(deg, 0) - low, f = note(deg + 4, 0) - low;
      if (p === "follow") {
        [...clips.guitar.p].forEach((c, i) => { if (c !== ".") add("bass", t + i / 4, c === "m" ? 0.22 : 0.45, "note", { midi: r, accent: i % 4 === 0 }); });
        return;
      }
      const cells = [...p];
      cells.forEach((c, i) => {
        if (c === ".") return;
        const len = c === "m" ? 0.22 : span(cells, i, 16, (x) => x === ".") * 0.9;
        add("bass", t + i / 4, len, "note", { midi: c === "f" ? f : c === "o" ? r + 12 : r, accent: i % 4 === 0 });
      });
    }
    function keys(t, deg) {
      const kind = GENRES[a.genre].keys;
      if (!kind || sec.type === "Intro") return;
      const triad = [0, 2, 4].map((d) => note(deg + d, 2) - (a.root >= 43 ? 12 : 0));
      const big = BIG.has(sec.type);
      if (big || a.genre === "electronic") add("keys", t, 3.8, "pad", { notes: triad, midi: triad[0], accent: true });
      if (a.genre === "pop" && !big) [0, 8].forEach((i) => add("keys", t + i / 4, 1.8, "pad", { notes: triad, midi: triad[0], accent: true }));
      if (big && (a.genre === "electronic" || a.genre === "pop")) for (let i = 0; i < 16; i += 2) add("keys", t + i / 4, 0.4, "arp", { midi: triad[(i / 2) % 3] + 12, accent: i % 4 === 0, vel: 0.5 });
    }
    function vocals(p, t, b, deg) {
      const cells = [...p.slice((b % 2) * 16, (b % 2) * 16 + 16)], lift = VOCAL_LIFT[sec.type] || 0;
      cells.forEach((c, i) => {
        if (!/[1-8]/.test(c)) return;
        const dur = span(cells, i, 16, (x) => x === ".") * 0.92;
        add("vocals", t + i / 4, dur, "lead", { midi: fold(note(deg + Number(c) - 1 + 7 + lift, 1), 57, 76), accent: i % 4 === 0 || dur >= 0.5 });
      });
    }
    return note;
  }

  function compose(song, bandGenre) {
    const a = arrangementFor(song, bandGenre);
    const events = [], sections = [];
    const add = (part, beat, dur, kind, extra) => events.push({ part, beat, dur, kind, vel: 0.8, accent: false, ...extra });
    let beat = 0, note = null;
    a.sections.forEach((sec, i) => {
      sections.push({ name: sec.type, beat });
      const n = renderSection(a, sec, beat, add, { next: i < a.sections.length - 1, crashIn: true });
      if (!note) note = n;
      beat += sec.bars * 4;
    });
    // the final hit
    add("drums", beat, 2, "crash", { vel: 1, accent: true });
    add("drums", beat, 0.5, "kick", { vel: 1, accent: true });
    add("bass", beat, 2, "note", { midi: note(0, 0) - (a.root >= 43 ? 12 : 0), accent: true });
    add("guitar", beat, 2.5, "power", { midi: note(0, 1), accent: true });
    applyFeel(events, a.fx.feel);
    events.sort((x, y) => x.beat - y.beat);
    const first = a.sections[0].prog;
    return { title: song.title, genre: a.genre, groove: a, bpm: a.bpm, root: a.root, mode: first.mode, key: keyName(a.root, first.mode), beats: beat + 2, sections, events };
  }

  // Studio previews. One section on a loop (o.only limits the tracks), or one clip on its own for two bars.
  function composeSection(a, index, o = {}) {
    a = normaliseArr(a);
    const sec = a.sections[index] || a.sections[0], events = [];
    const add = (part, beat, dur, kind, extra) => events.push({ part, beat, dur, kind, vel: 0.8, accent: false, ...extra });
    renderSection(a, sec, 0, add, { next: true, crashIn: true, only: o.only });
    applyFeel(events, a.fx.feel);
    events.sort((x, y) => x.beat - y.beat);
    return { genre: a.genre, groove: a, bpm: a.bpm, beats: sec.bars * 4, sections: [], events };
  }
  function composeClip(a, track, clip, sectionIndex = 0) {
    a = normaliseArr(a);
    const base = a.sections[sectionIndex] || a.sections[0];
    const sec = { ...base, bars: 2, clips: { ...base.clips, [track]: { name: clip.name, p: normPattern(track, clip.p) } } };
    const events = [];
    const add = (part, beat, dur, kind, extra) => events.push({ part, beat, dur, kind, vel: 0.8, accent: false, ...extra });
    // bass "follow" needs the guitar's rhythm but plays alone
    renderSection(a, sec, 0, add, { next: false, crashIn: false, only: [track] });
    applyFeel(events, a.fx.feel);
    events.sort((x, y) => x.beat - y.beat);
    return { genre: a.genre, groove: a, bpm: a.bpm, beats: 8, sections: [], events };
  }

  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function keyName(root, mode) { return NAMES[root % 12] + " " + ({ minor: "minor", mixo: "mixolydian", phrygian: "phrygian" }[mode] || "major"); }

  // ---------- charts ----------
  const DRUM_LANE = { kick: 0, snare: 1, clap: 1, hat: 2, ride: 2, ohat: 3, crash: 3, china: 3 };
  // gap is in seconds, so faster songs get thinned out instead of getting harder
  const RULES = {
    easy:   { gap: 0.4,  offbeats: false, perBeat: 1 },
    normal: { gap: 0.2,  offbeats: "accent", perBeat: 2 },
    hard:   { gap: 0.12, offbeats: true, perBeat: 2 }
  };

  // Chart for the part you play: [{ beat, lane }] taken from that part's actual notes.
  function chart(arr, role, difficulty) {
    const mine = arr.events.filter((e) => e.part === role && e.beat < arr.beats);
    let cands;
    if (role === "drums") {
      cands = mine.filter((e) => (e.kind !== "hat" && e.kind !== "ohat") || difficulty === "hard")
        .map((e) => ({ beat: e.beat, lane: e.kind === "tom" ? 2 + (e.tom % 2) : DRUM_LANE[e.kind], accent: e.accent, prio: { snare: 3, clap: 3, kick: 2 }[e.kind] || 1 }));
    } else {
      // spread the part's distinct pitches evenly over the four lanes, low to high
      const pitches = [...new Set(mine.map((e) => e.midi))].sort((a, b) => a - b);
      const lane = (m) => (pitches.length > 1 ? Math.round((pitches.indexOf(m) / (pitches.length - 1)) * 3) : 1);
      cands = [];
      mine.forEach((e) => {
        cands.push({ beat: e.beat, lane: lane(e.midi), accent: e.accent, prio: 2 });
        // big open chords become two-note hits on hard
        if (difficulty === "hard" && ((role === "guitar" && e.kind === "power") || e.kind === "pad") && e.dur >= 1) cands.push({ beat: e.beat, lane: (lane(e.midi) + 2) % 4, accent: true, prio: 2 });
      });
    }
    const out = thin(cands, 60 / arr.bpm, difficulty);
    // parts that live on the off-beat (e.g. electronic bass) would be empty on Easy: keep their accents
    const secs = arr.beats * 60 / arr.bpm;
    if (difficulty === "easy" && out.length / secs < 0.5) return thin(cands.filter((c) => c.accent), 60 / arr.bpm, "normal", RULES.easy.gap);
    return out;
  }

  // Thins candidate notes for a difficulty: which offbeats count, minimum gap in seconds,
  // and at most N lanes per instant (highest priority first). Used by generated and recorded songs.
  function thin(cands, spb, difficulty, minGap) {
    const rule = { ...(RULES[difficulty] || RULES.normal), ...(minGap ? { gap: minGap } : {}) };
    cands = cands.filter((c) => (c.beat % 1 === 0) || rule.offbeats === true || (rule.offbeats === "accent" && c.accent));
    const out = [];
    let lastBeat = -Infinity;
    for (let i = 0; i < cands.length;) {
      const b = cands[i].beat;
      const group = [];
      while (i < cands.length && cands[i].beat === b) group.push(cands[i++]);
      if ((b - lastBeat) * spb < rule.gap - 1e-6) continue;
      const lanes = [];
      // a second simultaneous note only for strong pairs (kick + snare, big chords), never hi-hat on top
      group.sort((x, y) => y.prio - x.prio).forEach((c) => { if (lanes.length < (c.prio >= 2 ? rule.perBeat : 1) && !lanes.includes(c.lane)) lanes.push(c.lane); });
      lanes.forEach((l) => out.push({ beat: b, lane: l }));
      lastBeat = b;
    }
    return out;
  }

  // Chart for a recorded song (game/assets/music/<id>.json, made by tools/prepare_music.py).
  function trackChart(track, role, difficulty) {
    const hard = difficulty === "hard";
    // detected sixteenths are for listening, not playing: none below Hard, accented ones on Hard
    const notes = (track.parts[role] || []).filter((n) => (role !== "drums" || n.k !== "hat" || hard) && (n.b % 0.5 === 0 || (hard && n.a)));
    const cands = notes.map((n) => ({ beat: n.b, lane: n.l, accent: n.a, prio: { snare: 3, kick: 2 }[n.k] || (role === "drums" ? 1 : 2) }))
      .sort((a, b) => a.beat - b.beat);
    return thin(cands, 60 / track.bpm, difficulty, TRACK_GAP[difficulty]);
  }
  const TRACK_GAP = { easy: 0.45, normal: 0.26, hard: 0.16 };

  return {
    GENRES, GENRE_IDS, TRACKS, SECTION_TYPES, DRUM_ROWS, HINTS, ALL_PROGS, MAX_SECTIONS, MAX_BARS,
    library, allClips, clipNamed, isSilent, normPattern, defaultArrangement, defaultFx, TONE_DRIVE, normaliseArr, arrangementFor, totalBars, keyName,
    compose, composeSection, composeClip, chart, trackChart
  };
})();
