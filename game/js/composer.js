// Turns a song into an arrangement the band plays. Every song is driven by a "groove":
// genre, tempo, guitar tone, drum kit, chord progression, a one-bar drum beat and a one-bar
// guitar riff (16 sixteenth-note steps each). Songs written in the studio store their groove;
// older/generated songs get one from their genre's presets, seeded by the song so it never changes.
// Charts are then cut from the notes of the part you play.
window.AmpedComposer = (() => {
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };

  // Patterns: drums "." off, "x" hit, "X" accent (on hi-hat: open). Riff steps:
  // "." rest, "m" palm-muted chug, "P" power chord, "H" high note, "L" lead lick note, "A" arpeggio note.
  const GENRES = {
    metal: {
      label: "Metal", blurb: "Low tuning, galloping chugs, double-kick choruses.", bpm: 168, tone: "metal", kit: "power", keys: "pad", root: 38,
      progs: [{ name: "Phrygian doom (i–♭II–i–i)", deg: [0, 1, 0, 0], mode: "phrygian" }, { name: "Epic (i–♭VI–♭VII–i)", deg: [0, 5, 6, 0], mode: "minor" }, { name: "Grind (i–i–♭VI–♭VII)", deg: [0, 0, 5, 6], mode: "minor" }],
      beats: {
        "Gallop": { kick: "x.xxx.xxx.xxx.xx", snare: "....X.......X...", hat: "x...x...x...x...", crash: "x..............." },
        "Thrash": { kick: "x.x.x.x.x.x.x.x.", snare: "..X...X...X...X.", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Double kick": { kick: "xxxxxxxxxxxxxxxx", snare: "....X.......X...", hat: "x...x...x...x...", crash: "x...x...x...x..." },
        "Breakdown": { kick: "x..x..x...x..x..", snare: "........X.......", hat: "X.......X.......", crash: "x..............." }
      },
      riffs: { "Gallop chug": "m.mmm.mmm.mmP.P.", "Chug & stab": "mmmmP...mmmmH...", "Tremolo lead": "LLLLLLLLLLLLLLLL", "Djent stop": "P..m.mP..m.mP.m." },
      chorus: "double", chorusRiff: "P.......P...P.P.", density: { verse: [0.6, 0.3], chorus: [0.75, 0.2] }
    },
    rock: {
      label: "Rock", blurb: "Crunchy power chords, big backbeat, singalong choruses.", bpm: 128, tone: "crunch", kit: "power", keys: "organ", root: 40,
      progs: [{ name: "Classic (I–♭VII–IV–I)", deg: [0, 6, 3, 0], mode: "mixo" }, { name: "Drive (I–IV–V–IV)", deg: [0, 3, 4, 3], mode: "major" }, { name: "Dark (i–♭VI–♭VII–i)", deg: [0, 5, 6, 0], mode: "minor" }],
      beats: {
        "Rock beat": { kick: "x.....x.x.......", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Driving 8ths": { kick: "x.x...x.x.x...x.", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Half-time": { kick: "x.........x.....", snare: "........X.......", hat: "x...x...x...x...", crash: "x..............." }
      },
      riffs: { "Power stabs": "P..P..P.P..P..P.", "Chug & chord": "P.mmP.mmH.mmP.mm", "Riff lick": "P...P.LLP...H.L.", "Open strum": "P.......P.....P." },
      chorus: "open", chorusRiff: "P.......P.....P.", density: { verse: [0.75, 0.4], chorus: [0.85, 0.25] }
    },
    punk: {
      label: "Punk", blurb: "Fast down-strummed chords, no brakes.", bpm: 186, tone: "dist", kit: "standard", keys: null, root: 40,
      progs: [{ name: "Three chords (I–IV–V–IV)", deg: [0, 3, 4, 3], mode: "major" }, { name: "Pop-punk (I–V–vi–IV)", deg: [0, 4, 5, 3], mode: "major" }, { name: "Street (i–♭VII–♭VI–♭VII)", deg: [0, 6, 5, 6], mode: "minor" }],
      beats: {
        "Skate punk": { kick: "x...x...x...x...", snare: "..X...X...X...X.", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Punk rock": { kick: "x.x...x.x.x...x.", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." }
      },
      riffs: { "Downstrokes": "P.P.P.P.P.P.P.P.", "Stop-start": "P.P.P...P.P.P...", "Octaves": "P.P.P.P.H.H.H.H." },
      chorus: "open", chorusRiff: "P.P.P.P.P.P.P.P.", density: { verse: [0.9, 0.55], chorus: [0.9, 0.35] }
    },
    pop: {
      label: "Pop", blurb: "Clean guitar, piano chords, a hook you can't shake.", bpm: 112, tone: "clean", kit: "standard", keys: "piano", root: 43,
      progs: [{ name: "Hit maker (I–V–vi–IV)", deg: [0, 4, 5, 3], mode: "major" }, { name: "Sad pop (vi–IV–I–V)", deg: [5, 3, 0, 4], mode: "major" }, { name: "Uplift (IV–I–V–vi)", deg: [3, 0, 4, 5], mode: "major" }],
      beats: {
        "Pop groove": { kick: "x.......x.x.....", snare: "....X.......X...", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." },
        "Four on the floor": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "..X...X...X...X.", crash: "x..............." }
      },
      riffs: { "Muted strum": "m.m.m.m.m.m.m.m.", "Chord hits": "P...P...P.P.P...", "Arpeggio": "A.A.A.A.A.A.A.A." },
      chorus: "four", chorusRiff: "P...P...P.P.P...", density: { verse: [0.75, 0.35], chorus: [0.85, 0.15] }
    },
    indie: {
      label: "Indie", blurb: "Jangly arpeggios, a steady motorik beat.", bpm: 124, tone: "clean", kit: "standard", keys: "organ", root: 40,
      progs: [{ name: "Jangle (I–vi–IV–V)", deg: [0, 5, 3, 4], mode: "major" }, { name: "Moody (i–♭VI–♭III–♭VII)", deg: [0, 5, 2, 6], mode: "minor" }],
      beats: {
        "Motorik": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "xxxxxxxxxxxxxxxx", crash: "x..............." },
        "Dance-punk": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "..X...X...X...X.", crash: "x..............." }
      },
      riffs: { "Jangle": "AAAAAAAAAAAAAAAA", "Picked": "A.A.A.A.A.A.A.A.", "Strum": "P.P.P.mmP.P.P.mm" },
      chorus: "open", chorusRiff: "P.P.P.mmP.P.P.mm", density: { verse: [0.7, 0.4], chorus: [0.8, 0.25] }
    },
    electronic: {
      label: "Electronic", blurb: "Four on the floor, rolling synth bass, big drops.", bpm: 126, tone: "synth", kit: "electronic", keys: "pad", root: 45,
      progs: [{ name: "Night drive (i–♭VI–♭III–♭VII)", deg: [0, 5, 2, 6], mode: "minor" }, { name: "Euphoria (vi–IV–I–V)", deg: [5, 3, 0, 4], mode: "major" }],
      beats: {
        "House": { kick: "x...x...x...x...", snare: "....X.......X...", hat: "x.X.x.X.x.X.x.X.", crash: "x..............." },
        "Breakbeat": { kick: "x.....x...x.....", snare: "....X.......X..x", hat: "x.x.x.x.x.x.x.x.", crash: "x..............." }
      },
      riffs: { "Arp": "AAAAAAAAAAAAAAAA", "Stabs": "P..P..P...P..P..", "Lead": "L.L.L...L.L.L..." },
      chorus: "four", chorusRiff: "AAAAAAAAAAAAAAAA", density: { verse: [0.6, 0.2], chorus: [0.8, 0.15] }
    }
  };
  const GENRE_IDS = Object.keys(GENRES);
  const TONES = ["clean", "crunch", "dist", "metal", "synth"];
  const FORM = [["Intro", 2], ["Verse", 4], ["Chorus", 4], ["Verse", 4], ["Chorus", 4], ["Outro", 1]];

  const first = (o) => o[Object.keys(o)[0]];
  function defaultGroove(genre) {
    const G = GENRES[genre] || GENRES.rock;
    return normalise({ genre, bpm: G.bpm, tone: G.tone, kit: G.kit, root: G.root, prog: 0, beat: { ...first(G.beats) }, riff: first(G.riffs), chorus: G.chorus });
  }
  // Fills in anything missing, so saved grooves keep working as the format grows.
  function normalise(g) {
    const G = GENRES[g.genre] || GENRES.rock;
    const prog = typeof g.prog === "number" ? G.progs[g.prog] || G.progs[0] : g.prog || G.progs[0];
    const pad = (p) => String(p || "").padEnd(16, ".").slice(0, 16);
    return {
      genre: GENRES[g.genre] ? g.genre : "rock",
      bpm: Math.max(60, Math.min(230, Math.round(g.bpm || G.bpm))),
      tone: TONES.includes(g.tone) ? g.tone : G.tone,
      kit: ["power", "standard", "electronic"].includes(g.kit) ? g.kit : G.kit,
      root: g.root || G.root,
      prog: { name: prog.name, deg: prog.deg.slice(0, 4), mode: SCALES[prog.mode] ? prog.mode : "minor" },
      beat: { kick: pad(g.beat && g.beat.kick), snare: pad(g.beat && g.beat.snare), hat: pad(g.beat && g.beat.hat), crash: pad(g.beat && g.beat.crash) },
      riff: pad(g.riff).replace(/[^.mPHLA]/g, "."),
      chorus: ["open", "double", "half", "four"].includes(g.chorus) ? g.chorus : G.chorus
    };
  }
  // A groove for songs without one: the genre's presets, picked by the song's seed; style sets the pace.
  function grooveFor(song, bandGenre) {
    if (song.groove) return normalise(song.groove);
    const genre = song.genre || bandGenre || "rock", G = GENRES[genre] || GENRES.rock;
    const rnd = seeded(`${song.id}|${genre}|${song.style}`);
    const pace = { Ballad: 0.7, Anthem: 1, Banger: 1.12 }[song.style] || 1;
    return normalise({
      genre, bpm: G.bpm * pace + Math.round(rnd() * 8 - 4), tone: G.tone, kit: G.kit, root: G.root,
      prog: pick(rnd, G.progs), beat: { ...pick(rnd, Object.values(G.beats)) }, riff: pick(rnd, Object.values(G.riffs)),
      chorus: song.style === "Ballad" ? "half" : G.chorus
    });
  }

  // ---------- one bar of each part ----------
  const steps = (p) => [...p].map((c) => (c === "X" ? 2 : c === "x" ? 1 : 0));
  function barMaker(g, add) {
    const scale = SCALES[g.prog.mode];
    const note = (deg, oct) => g.root + 12 * oct + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
    const minorish = g.prog.mode !== "major";
    const penta = minorish ? [0, 3, 5, 7, 10, 12] : [0, 2, 4, 7, 9, 12];
    const B = steps(g.beat.kick), S = steps(g.beat.snare), Hh = steps(g.beat.hat), C = steps(g.beat.crash);
    const snareKind = g.kit === "electronic" ? "clap" : "snare";
    const hit = (t, i, kind, vel, accent, extra) => add("drums", t + i / 4, 0.25, kind, { vel, accent, ...extra });

    function drums(section, t, bar, fill, isFirst) {
      if (section === "Outro") { hit(t, 0, "crash", 1, true); hit(t, 0, "kick", 1, true); hit(t, 8, snareKind, 0.9, true); return; }
      const intro0 = section === "Intro" && bar === 0;
      for (let i = 0; i < 16; i++) {
        if (fill && i >= 12) continue;
        let k = B[i], s = S[i], h = Hh[i], c = C[i];
        if (section === "Chorus") {
          if (g.chorus === "double") { if (!k) k = 3; if (i % 4 === 0) c = 1; }   // 3 = softer double-kick fill
          if (g.chorus === "half") { s = i === 8 ? 2 : 0; k = i === 0 || i === 10 ? 1 : 0; }
          if (g.chorus === "four") { if (i % 4 === 0) k = 2; if (i % 4 === 2) h = 2; }
          if (g.chorus === "open" && h) h = i % 4 === 2 ? 2 : 1;
        }
        if (intro0) { s = 0; if (i % 4) k = 0; }
        if (isFirst && i === 0 && section !== "Intro") c = 1;
        if (k) hit(t, i, "kick", k === 2 ? 1 : k === 3 ? 0.6 : 0.82, (i % 4 === 0 || k === 2) && k !== 3);
        if (s) hit(t, i, snareKind, s === 2 ? 1 : 0.7, i % 4 === 0 || s === 2);
        if (h && !c) hit(t, i, h === 2 ? "ohat" : "hat", i % 2 ? 0.55 : 0.75, h === 2);
        if (c) hit(t, i, g.genre === "metal" && i % 8 === 4 ? "china" : "crash", 1, true);
      }
      if (fill) [12, 13, 14, 15].forEach((i, n) => hit(t, i, n < 2 ? snareKind : "tom", 0.75 + n * 0.07, n === 0, { tom: n }));
    }

    function riffNotes(pattern, t, deg, kindFor) {
      const root = note(deg, 1), triad = [0, 2, 4].map((d) => note(deg + d, 1));
      let lead = 0, arp = 0;
      const cells = [...pattern];
      cells.forEach((c, i) => {
        if (c === ".") return;
        let j = i + 1;
        while (j < 16 && cells[j] === ".") j++;
        const len = Math.min(j - i, 8) / 4;
        const accent = i % 4 === 0 || c === "P";
        if (c === "m") add("guitar", t + i / 4, 0.25, "mute", { midi: root, accent: i % 4 === 0 });
        else if (c === "P") add("guitar", t + i / 4, len, "power", { midi: root, accent });
        else if (c === "H") add("guitar", t + i / 4, len, "note", { midi: root + 12, accent });
        else if (c === "L") add("guitar", t + i / 4, len, "note", { midi: root + 12 + penta[lead++ % penta.length], accent: i % 2 === 0 });
        else if (c === "A") add("guitar", t + i / 4, len, kindFor("A"), { midi: [triad[0] + 12, triad[1] + 12, triad[2] + 12, triad[0] + 24][arp++ % 4], accent: i % 4 === 0 });
      });
    }

    function guitar(section, t, bar, deg) {
      if (section === "Outro") return add("guitar", t, 3.5, "power", { midi: note(deg, 1), accent: true });
      const pattern = section === "Chorus" ? GENRES[g.genre].chorusRiff : g.riff;
      riffNotes(pattern, t, deg, () => (g.tone === "synth" ? "synth" : "pluck"));
    }

    function bass(section, t, bar, deg) {
      const r = note(deg, 0) - (g.root >= 43 ? 12 : 0);
      const n = (i, len, m, accent) => add("bass", t + i / 4, len, "note", { midi: m, accent });
      if (section === "Intro" && bar === 0) return;
      if (section === "Outro") return n(0, 3.5, r, true);
      if (g.genre === "electronic") { [2, 6, 10, 14].forEach((i) => n(i, 0.4, i % 8 === 6 ? r + 12 : r, true)); return; }
      if (g.genre === "pop") { [0, 3, 6, 8, 11, 14].forEach((i) => n(i, 0.6, r, i % 4 === 0)); return; }
      if (g.genre === "indie") { for (let i = 0; i < 16; i += 2) n(i, 0.45, i % 4 ? r + 12 : r, i % 4 === 0); return; }
      // rock / metal / punk: lock to the riff's rhythm
      const pattern = section === "Chorus" && g.chorus !== "double" ? "x.x.x.x.x.x.x.x." : g.riff;
      [...pattern].forEach((c, i) => { if (c !== ".") n(i, c === "m" ? 0.22 : 0.45, r, i % 4 === 0); });
    }

    function keys(section, t, deg) {
      const kind = GENRES[g.genre].keys;
      if (!kind || section === "Intro") return;
      const triad = [0, 2, 4].map((d) => note(deg + d, 2) - (g.root >= 43 ? 12 : 0));
      const chorus = section === "Chorus" || section === "Outro";
      if (chorus || g.genre === "electronic") add("keys", t, 3.8, "pad", { notes: triad, midi: triad[0], accent: true });
      if (g.genre === "pop" && !chorus) [0, 8].forEach((i) => add("keys", t + i / 4, 1.8, "pad", { notes: triad, midi: triad[0], accent: true }));
      if (chorus && (g.genre === "electronic" || g.genre === "pop")) for (let i = 0; i < 16; i += 2) add("keys", t + i / 4, 0.4, "arp", { midi: triad[(i / 2) % 3] + 12, accent: i % 4 === 0, vel: 0.5 });
    }
    return { drums, guitar, bass, keys, note };
  }

  // Two bars of melody rhythm + contour. Strong beats take chord tones, others step by scale.
  function makeMelody(rnd, density) {
    return [0, 1].map((bar) => {
      const starts = [];
      for (let e = 0; e < 8; e++) {
        const p = e % 2 === 0 ? density[0] : density[1];
        if (e === 0 || rnd() < p) starts.push(e);
      }
      if (bar === 1 && starts.length > 2) starts.pop();
      return starts.map((s, i) => {
        const next = i + 1 < starts.length ? starts[i + 1] : 8;
        const r = rnd();
        return { off: s / 2, dur: Math.min((next - s) / 2, 2) * 0.92, strong: s % 2 === 0, idx: r < 0.45 ? 0 : r < 0.8 ? 1 : 2, step: r < 0.5 ? 1 : -1 };
      });
    });
  }
  const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m > hi) m -= 12; return m; };

  function compose(song, bandGenre) {
    const g = grooveFor(song, bandGenre), G = GENRES[g.genre];
    const rnd = seeded(`${song.id}|${song.title}|melody`);
    const events = [], sections = [];
    const add = (part, beat, dur, kind, extra) => events.push({ part, beat, dur, kind, vel: 0.8, accent: false, ...extra });
    const bar = barMaker(g, add);
    const melodies = { Verse: makeMelody(rnd, G.density.verse), Chorus: makeMelody(rnd, G.density.chorus) };
    const form = g.bpm >= 160 ? FORM.map(([n, b], i) => [n, i === 4 ? 8 : b]) : FORM;
    let beat = 0;
    form.forEach(([name, bars], sIndex) => {
      sections.push({ name, beat });
      const last = sIndex === form.length - 1;
      let melodyDeg = 7;
      for (let b = 0; b < bars; b++) {
        const t = beat + b * 4, deg = g.prog.deg[b % 4];
        bar.drums(name, t, b, b === bars - 1 && !last && name !== "Intro", b === 0);
        bar.guitar(name, t, b, deg);
        bar.bass(name, t, b, deg);
        bar.keys(name, t, deg);
        if (name === "Verse" || name === "Chorus") {
          const lift = name === "Chorus" ? 2 : 0;
          melodies[name][b % 2].forEach((n) => {
            melodyDeg = n.strong ? deg + [0, 2, 4][n.idx] + 7 + lift : melodyDeg + n.step;
            add("vocals", t + n.off, n.dur, "lead", { midi: fold(bar.note(melodyDeg, 1), 57, 76), accent: n.dur >= 0.5 || n.strong });
          });
        }
      }
      beat += bars * 4;
    });
    add("drums", beat, 2, "crash", { vel: 1, accent: true });
    add("drums", beat, 0.5, "kick", { vel: 1, accent: true });
    add("bass", beat, 2, "note", { midi: bar.note(0, 0), accent: true });
    add("guitar", beat, 2.5, "power", { midi: bar.note(0, 1), accent: true });
    events.sort((a, b) => a.beat - b.beat);
    return { title: song.title, genre: g.genre, groove: g, bpm: g.bpm, root: g.root, mode: g.prog.mode, key: keyName(g.root, g.prog.mode), beats: beat + 2, sections, events };
  }

  // Two bars for the studio preview (bar 1 as verse, bar 2 as chorus, or both as one section).
  function composeLoop(groove, section) {
    const g = normalise(groove), events = [];
    const add = (part, beat, dur, kind, extra) => events.push({ part, beat, dur, kind, vel: 0.8, accent: false, ...extra });
    const bar = barMaker(g, add);
    [0, 1].forEach((b) => {
      const sec = section || (b === 0 ? "Verse" : "Chorus"), deg = g.prog.deg[b % 4];
      bar.drums(sec, b * 4, b, false, b === 0);
      bar.guitar(sec, b * 4, b, deg);
      bar.bass(sec, b * 4, b, deg);
      bar.keys(sec, b * 4, deg);
    });
    events.sort((a, b) => a.beat - b.beat);
    return { genre: g.genre, groove: g, bpm: g.bpm, beats: 8, sections: [], events };
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

  return { GENRES, GENRE_IDS, compose, composeLoop, grooveFor, defaultGroove, normalise, chart, trackChart };
})();
