// Turns a song (title, theme, style) into an arrangement: key, tempo, sections and note events
// for drums, bass, guitar, keys and the lead vocal line. Everything is seeded by the song,
// so the same song always sounds and charts the same.
// This is generated placeholder music, not composed game music.
window.AmpedComposer = (() => {
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
  const MODE_BY_THEME = { Love: "major", Rebellion: "minor", Party: "mixo", Heartbreak: "minor" };
  // chord progressions as scale degrees (0 = I/i)
  const PROGS = {
    major: { verse: [[0, 4, 5, 3], [0, 5, 3, 4], [0, 3, 0, 4]], chorus: [[3, 0, 4, 5], [5, 3, 0, 4], [3, 4, 0, 0]] },
    minor: { verse: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 5, 4]], chorus: [[5, 6, 0, 0], [5, 2, 6, 0], [0, 6, 5, 6]] },
    mixo:  { verse: [[0, 6, 3, 0], [0, 3, 6, 3]], chorus: [[3, 0, 6, 0], [0, 6, 3, 3]] }
  };
  const STYLES = {
    Ballad: { bpm: [76, 84], feel: "half",
      form: [["Intro", 2], ["Verse", 4], ["Chorus", 4], ["Chorus", 4], ["Outro", 1]] },
    Anthem: { bpm: [108, 118], feel: "rock",
      form: [["Intro", 2], ["Verse", 4], ["Chorus", 4], ["Verse", 4], ["Chorus", 4], ["Outro", 2]] },
    Banger: { bpm: [136, 148], feel: "drive",
      form: [["Intro", 2], ["Verse", 4], ["Chorus", 4], ["Verse", 4], ["Chorus", 8], ["Outro", 2]] }
  };
  const ROOTS = [40, 43, 45, 38, 42];   // E2, G2, A2, D2, F#2

  function compose(song) {
    const rnd = seeded(`${song.id}|${song.theme}|${song.style}`);
    const style = STYLES[song.style] || STYLES.Anthem;
    const mode = MODE_BY_THEME[song.theme] || "minor";
    const scale = SCALES[mode];
    const bpm = Math.round(style.bpm[0] + rnd() * (style.bpm[1] - style.bpm[0]));
    const root = pick(rnd, ROOTS);
    const prog = { Verse: pick(rnd, PROGS[mode].verse), Chorus: pick(rnd, PROGS[mode].chorus) };
    prog.Intro = prog.Outro = prog.Verse;

    // scale degree (can be >6 or <0) -> MIDI note, relative to an octave offset from the root
    const note = (deg, octave) => root + 12 * octave + scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);

    const melodies = { Verse: makeMelody(rnd, [0.75, 0.45]), Chorus: makeMelody(rnd, [0.85, 0.22]) };
    const events = [], sections = [];
    const add = (part, beat, dur, kind, extra) => events.push({ part, beat, dur, kind, vel: 0.8, accent: false, ...extra });
    let beat = 0;

    style.form.forEach(([name, bars], sIndex) => {
      sections.push({ name, beat });
      const lastSection = sIndex === style.form.length - 1;
      let melodyDeg = 7;
      for (let b = 0; b < bars; b++) {
        const t = beat + b * 4;
        const deg = prog[name][b % 4];
        const lastBar = b === bars - 1 && !lastSection;
        drums(add, style.feel, name, t, b, lastBar);
        bass(add, style.feel, name, t, b, note(deg, 0));
        guitar(add, style.feel, name, t, b, note(deg, 1));
        keys(add, style.feel, name, t, [0, 2, 4].map((i) => note(deg + i, 2)));
        if (name === "Verse" || name === "Chorus") {
          const lift = name === "Chorus" ? 2 : 0;
          melodies[name][b % 2].forEach((n) => {
            melodyDeg = n.strong ? deg + [0, 2, 4][n.idx] + 7 + lift : melodyDeg + n.step;
            add("vocals", t + n.off, n.dur, "lead", { midi: note(melodyDeg, 1), accent: n.dur >= 0.5 || n.strong });
          });
        }
      }
      beat += bars * 4;
    });
    // final hit
    add("drums", beat, 2, "crash", { vel: 1, accent: true });
    add("drums", beat, 0.5, "kick", { vel: 1, accent: true });
    add("bass", beat, 2, "note", { midi: note(0, 0), accent: true });
    add("guitar", beat, 2.5, "power", { midi: note(0, 1), accent: true });
    add("keys", beat, 2.5, "pad", { notes: [0, 2, 4].map((i) => note(i, 2)), midi: note(0, 2), accent: true });

    events.sort((a, b) => a.beat - b.beat);
    return { title: song.title, bpm, root, mode, key: keyName(root, mode), beats: beat + 2, sections, events };
  }

  // Two bars of melody rhythm + contour. Strong beats take chord tones, others step by scale.
  function makeMelody(rnd, density) {
    return [0, 1].map((bar) => {
      const starts = [];
      for (let e = 0; e < 8; e++) {
        const p = e % 2 === 0 ? density[0] : density[1];
        if (e === 0 || rnd() < p) starts.push(e);
      }
      if (bar === 1 && starts.length > 2) starts.pop();       // breathe at the end of the phrase
      return starts.map((s, i) => {
        const next = i + 1 < starts.length ? starts[i + 1] : 8;
        const strong = s % 2 === 0;
        const r = rnd();
        return {
          off: s / 2, dur: Math.min((next - s) / 2, 2) * 0.92, strong,
          idx: r < 0.45 ? 0 : r < 0.8 ? 1 : 2,
          step: r < 0.5 ? 1 : -1
        };
      });
    });
  }

  function drums(add, feel, section, t, bar, fill) {
    const intro = section === "Intro", outro = section === "Outro", chorus = section === "Chorus";
    const hit = (b, kind, accent, vel) => add("drums", t + b, 0.25, kind, { accent, vel: vel || 0.85 });
    if (bar === 0 && !intro) hit(0, "crash", true, 1);
    if (outro) { hit(0, "kick", true); hit(2, "snare", true); hit(0, "crash", true, 1); return; }
    if (feel === "half") {
      hit(0, "kick", true);
      if (!intro) hit(2.5, "kick", false, 0.7);
      if (!intro || bar > 0) hit(2, "snare", true);
      for (let i = 0; i < (chorus ? 8 : 4); i++) hit(chorus ? i / 2 : i, "hat", false, i % 2 ? 0.5 : 0.7);
    } else if (feel === "rock") {
      hit(0, "kick", true); hit(2, "kick", true);
      if (bar % 2 === 1 || chorus) hit(2.5, "kick", false, 0.75);
      if (!intro || bar > 0) { hit(1, "snare", true); hit(3, "snare", true); }
      for (let i = 0; i < 8; i++) hit(i / 2, chorus && i % 2 === 1 ? "ohat" : "hat", chorus && i % 2 === 1, i % 2 ? 0.5 : 0.75);
    } else {
      if (chorus) [0, 1, 2, 3].forEach((b) => hit(b, "kick", true));
      else { hit(0, "kick", true); hit(1.5, "kick", false, 0.75); hit(2, "kick", true); }
      if (!intro || bar > 0) { hit(1, "snare", true); hit(3, "snare", true); }
      for (let i = 0; i < 8; i++) hit(i / 2, chorus && i % 2 === 1 ? "ohat" : "hat", false, i % 2 ? 0.55 : 0.75);
    }
    if (fill) [3, 3.25, 3.5, 3.75].forEach((b, i) => add("drums", t + b, 0.25, i < 2 ? "snare" : "tom", { tom: i, vel: 0.7 + i * 0.08, accent: false }));
  }

  function bass(add, feel, section, t, bar, midi) {
    if (section === "Intro" && bar === 0) return;
    const n = (b, dur, m, accent) => add("bass", t + b, dur, "note", { midi: m, accent });
    if (section === "Outro") return n(0, 3.5, midi, true);
    if (feel === "half") { n(0, 1.9, midi, true); n(2, 1.4, midi, true); n(3.5, 0.45, midi + 7, false); return; }
    for (let i = 0; i < 8; i++) n(i / 2, 0.42, feel === "drive" && i % 2 ? midi + 12 : midi, i % 2 === 0 || i === 3 || i === 7);
  }

  function guitar(add, feel, section, t, bar, midi) {
    const g = (b, dur, kind, accent) => add("guitar", t + b, dur, kind, { midi, accent });
    const chorus = section === "Chorus";
    if (section === "Outro") return g(0, 3.5, "power", true);
    if (feel === "half") {
      if (chorus) { g(0, 1.9, "power", true); g(2, 1.9, "power", true); }
      else [0, 7, 12, 16, 12, 7, 12, 7].forEach((iv, i) => add("guitar", t + i / 2, 0.45, "pluck", { midi: midi + iv, accent: i % 2 === 0 }));
      return;
    }
    if (section === "Intro" && bar === 0) { g(0, 1.9, "power", true); g(2, 1.9, "power", true); return; }
    if (chorus && feel === "rock") { g(0, 1.4, "power", true); g(1.5, 0.45, "power", true); g(2, 1.4, "power", true); g(3.5, 0.45, "power", false); return; }
    if (chorus) { for (let i = 0; i < 8; i++) g(i / 2, 0.42, "power", i % 2 === 0); return; }
    for (let i = 0; i < 8; i++) g(i / 2, 0.2, "mute", i % 2 === 0 || i === 3);
  }

  function keys(add, feel, section, t, triad) {
    if (section === "Intro") return;
    if (section === "Chorus" || section === "Outro") {
      add("keys", t, 3.8, "pad", { notes: triad, midi: triad[0], accent: true });
      if (section === "Chorus") [1, 2, 3].forEach((b, i) => add("keys", t + b, 0.4, "arp", { midi: triad[(i + 1) % 3] + 12, accent: true, vel: 0.5 }));
      return;
    }
    const step = feel === "half" ? 0.5 : 1;
    for (let b = 0, i = 0; b < 4; b += step, i++) add("keys", t + b, step * 0.9, "arp", { midi: triad[i % 3] + (i % 6 >= 3 ? 12 : 0), accent: b % 2 === 0 || b === 1.5 });
  }

  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function keyName(root, mode) { return NAMES[root % 12] + (mode === "minor" ? " minor" : mode === "mixo" ? " mixolydian" : " major"); }

  // ---------- charts ----------
  const DRUM_LANE = { kick: 0, snare: 1, hat: 2, ohat: 3, crash: 3 };
  // gap is in seconds, so faster songs get thinned out instead of getting harder
  const RULES = {
    easy:   { gap: 0.4,  offbeats: false, perBeat: 1 },
    normal: { gap: 0.2,  offbeats: "accent", perBeat: 2 },
    hard:   { gap: 0.12, offbeats: true, perBeat: 2 }
  };

  // Chart for the part you play: [{ beat, lane }] taken from that part's actual notes.
  function chart(arr, role, difficulty) {
    const rule = RULES[difficulty] || RULES.normal;
    const mine = arr.events.filter((e) => e.part === role && e.beat < arr.beats);
    let cands;
    if (role === "drums") {
      cands = mine.filter((e) => e.kind !== "hat" || difficulty === "hard")
        .map((e) => ({ beat: e.beat, lane: e.kind === "tom" ? 2 + (e.tom % 2) : DRUM_LANE[e.kind], accent: e.accent, prio: { snare: 3, kick: 2 }[e.kind] || 1 }));
    } else {
      // spread the part's distinct pitches evenly over the four lanes, low to high
      const pitches = [...new Set(mine.map((e) => e.midi))].sort((a, b) => a - b);
      const lane = (m) => (pitches.length > 1 ? Math.round((pitches.indexOf(m) / (pitches.length - 1)) * 3) : 1);
      cands = [];
      mine.forEach((e) => {
        cands.push({ beat: e.beat, lane: lane(e.midi), accent: e.accent, prio: 2 });
        // big open chords become two-note hits on hard
        if (difficulty === "hard" && ((role === "guitar" && e.kind === "power") || e.kind === "pad") && e.dur >= 1) cands.push({ beat: e.beat, lane: (lane(e.midi) + 2) % 4, accent: true, prio: 1 });
      });
    }
    cands = cands.filter((c) => (c.beat % 1 === 0) || rule.offbeats === true || (rule.offbeats === "accent" && c.accent));
    const spb = 60 / arr.bpm;
    const out = [];
    let lastBeat = -Infinity;
    for (let i = 0; i < cands.length;) {
      const b = cands[i].beat;
      const group = [];
      while (i < cands.length && cands[i].beat === b) group.push(cands[i++]);
      if ((b - lastBeat) * spb < rule.gap - 1e-6) continue;
      const lanes = [];
      group.sort((x, y) => y.prio - x.prio).forEach((c) => { if (lanes.length < rule.perBeat && !lanes.includes(c.lane)) lanes.push(c.lane); });
      lanes.forEach((l) => out.push({ beat: b, lane: l }));
      lastBeat = b;
    }
    return out;
  }

  return { compose, chart };
})();
