// Web Audio: one clock for music and judging, a synth band that plays composer arrangements,
// a metronome and SFX. The band is synthesised placeholder music, not final game audio.
window.AmpedAudio = (() => {
  let ctx = null, master, musicBus, sfxBus, noiseBuf;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      noiseBuf = makeNoise(ctx);
    }
    return ctx;
  }
  function makeNoise(c) {
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // Must be called from a user gesture (tap / key) so browsers allow sound.
  async function unlock() {
    ensure();
    if (ctx.state !== "running") await ctx.resume();
    return ctx;
  }
  function setVolumes(music, sfx) { ensure(); musicBus.gain.value = music; sfxBus.gain.value = sfx; }
  const now = () => (ctx ? ctx.currentTime : 0);
  const suspend = () => ctx && ctx.suspend();
  const resume = () => ctx && ctx.resume();
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  // ---------- sampled instruments (rendered by tools/render_instruments.py) ----------
  let instIndex = null;
  const inst = {};   // id -> { type, ok, notes: [{ key, buffer }] } or { type: "drums", ok, pieces: { name: [{ vel, buffer }] } }

  async function loadInstruments(ids) {
    ensure();
    if (!instIndex) instIndex = fetch("assets/instruments/index.json").then((r) => r.json()).catch(() => ({ instruments: {} }));
    const idx = await instIndex;
    await Promise.all(ids.map((id) => {
      if (inst[id]) return inst[id].ready;
      const def = idx.instruments[id];
      if (!def) return null;
      const entry = inst[id] = { type: def.type, ok: false };
      entry.ready = (async () => {
        if (def.type === "drums") {
          entry.pieces = {};
          await Promise.all(Object.entries(def.pieces).map(async ([name, list]) => {
            entry.pieces[name] = await Promise.all(list.map(async (x) => ({ vel: x.vel, buffer: await load(x.file) })));
          }));
        } else {
          entry.notes = await Promise.all(def.notes.map(async (x) => ({ key: x.key, buffer: await load(x.file) })));
        }
        entry.ok = true;
      })().catch(() => { delete inst[id]; });   // the band falls back to the synth for this part
      return entry.ready;
    }));
  }

  // Which sampled instruments a song uses, from its groove (genre, guitar tone, drum kit).
  function setupFor(arr) {
    const g = arr.groove || {}, tone = g.tone || "dist";
    const G = (window.AmpedComposer && window.AmpedComposer.GENRES[g.genre]) || {};
    return {
      tone,
      kit: { power: "drums-power", standard: "drums-standard", electronic: "drums-electronic" }[g.kit] || "drums-power",
      keys: { organ: "organ", piano: "piano", pad: "pad" }[G.keys] || "piano",
      chord: { clean: "guitar-clean", crunch: "guitar-od-power", dist: "guitar-power", metal: "guitar-power", synth: "saw-lead" }[tone],
      single: { clean: "guitar-clean", crunch: "guitar-od", dist: "guitar-dist", metal: "guitar-dist", synth: "saw-lead" }[tone],
      clean: "guitar-clean",
      bass: g.genre === "electronic" ? "synth-bass" : "bass-pick",
      voice: "voice-lead", choir: "voice-choir",
      tight: g.fx && g.fx.feel ? g.fx.feel.tight : 0.8
    };
  }
  const SETUP_KEYS = ["kit", "keys", "chord", "single", "clean", "bass", "voice", "choir"];
  const instrumentsFor = (arr) => { const s = setupFor(arr); return [...new Set(SETUP_KEYS.map((k) => s[k]))]; };

  // MP3 decoders may add a few ms of silence at the start; skip it so hits land on time.
  const leadIn = new WeakMap();
  function offsetOf(buffer) {
    if (!leadIn.has(buffer)) {
      const d = buffer.getChannelData(0), max = Math.min(d.length, Math.floor(buffer.sampleRate * 0.06));
      let i = 0;
      while (i < max && Math.abs(d[i]) < 0.002) i++;
      leadIn.set(buffer, i < max ? i / buffer.sampleRate : 0);
    }
    return leadIn.get(buffer);
  }

  // ---------- the band (sampled, with the synth as fallback; works on live and offline contexts) ----------
  const LEVELS = { drums: 0.9, bass: 0.62, guitar: 0.34, keys: 0.2, vocals: 0.34 };
  // balanced by measuring each part solo (tools: render previews); the soundfont samples are quiet
  const SAMPLE_LEVELS = { drums: 1.6, bass: 3.2, guitar: 7.2, keys: 10, vocals: 10.5 };
  // guitar tones differ a lot in loudness; measured per tone so the mix stays balanced
  const TONE_LEVEL = { clean: 0.93, crunch: 0.49, dist: 0.46, metal: 0.72, synth: 1 };

  function createBand(c, out, noiseBuffer, setup) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    const bandOut = c.createGain(); bandOut.gain.value = setup ? 0.7 : 0.45;
    // limiter: catches the loudest hits so the mix never distorts
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.1;
    comp.connect(bandOut); bandOut.connect(limiter); limiter.connect(out);

    // small room reverb
    const verb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 1.6), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    verb.buffer = ir;
    const verbOut = c.createGain(); verbOut.gain.value = 0.22;
    verb.connect(verbOut); verbOut.connect(comp);

    const parts = {}, vbus = {};
    Object.entries(LEVELS).forEach(([name, level]) => {
      const g = c.createGain(); g.gain.value = level; g.connect(comp);
      const sg = c.createGain(); sg.gain.value = SAMPLE_LEVELS[name]; sg.connect(g);   // samples sit at their own level
      parts[name] = { gain: g, sgain: sg, level };
      // each part's reverb sends pass through its own bus, so the studio can set how much reverb it gets
      vbus[name] = c.createGain(); vbus[name].connect(verb);
    });
    const send = (node, amount, part) => { const s = c.createGain(); s.gain.value = amount; node.connect(s); s.connect(vbus[part] || verb); };

    // echo: a dotted-eighth delay with darkening repeats, fed by the guitar and the vocals
    const delay = c.createDelay(2), fb = c.createGain(), fbLp = c.createBiquadFilter(), delayOut = c.createGain();
    fb.gain.value = 0.38; fbLp.type = "lowpass"; fbLp.frequency.value = 3200; delayOut.gain.value = 0.7; delay.delayTime.value = 0.33;
    delay.connect(fbLp); fbLp.connect(fb); fb.connect(delay); delay.connect(delayOut); delayOut.connect(comp);
    const dsend = {};
    ["guitar", "vocals"].forEach((n) => { dsend[n] = c.createGain(); dsend[n].gain.value = 0; parts[n].gain.connect(dsend[n]); dsend[n].connect(delay); });

    // bass: clean and driven paths blended, then a tone filter
    const bass = { dry: c.createGain(), pre: c.createGain(), shaper: c.createWaveShaper(), post: c.createGain(), lp: c.createBiquadFilter() };
    const soft = new Float32Array(2049);
    for (let i = 0; i < soft.length; i++) { const x = i / 1024 - 1; soft[i] = Math.tanh(x * 3) / Math.tanh(3); }
    bass.shaper.curve = soft; bass.shaper.oversample = "2x"; bass.lp.type = "lowpass"; bass.lp.Q.value = 0.7;
    parts.bass.sgain.disconnect();
    parts.bass.sgain.connect(bass.dry); parts.bass.sgain.connect(bass.pre); bass.pre.connect(bass.shaper); bass.shaper.connect(bass.post);
    bass.dry.connect(bass.lp); bass.post.connect(bass.lp); bass.lp.connect(parts.bass.gain);

    // drums: a bus compressor; more punch = more squeeze and more level
    const drumComp = c.createDynamicsCompressor(), drumMake = c.createGain();
    drumComp.attack.value = 0.012; drumComp.release.value = 0.12; drumComp.knee.value = 6;
    parts.drums.sgain.disconnect(); parts.drums.sgain.connect(drumComp); drumComp.connect(drumMake); drumMake.connect(parts.drums.gain);

    // distortion curve for the guitar
    const curve = new Float32Array(2049);   // odd length: silence in -> exactly 0 out
    for (let i = 0; i < curve.length; i++) { const x = i / 1024 - 1; curve[i] = Math.tanh(x * 6) * 0.8; }

    function env(dest, t, a, peak, hold, rel) {
      const g = c.createGain();
      g.gain.value = 0;                      // silent until the note starts
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
      g.connect(dest);
      return g;
    }
    function noise(dest, t, dur, type, freq, q) {
      const s = c.createBufferSource(); s.buffer = noiseBuffer;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      s.connect(f); f.connect(dest);
      s.start(t, Math.random() * 1.5); s.stop(t + dur);
    }
    function osc(dest, t, dur, type, freq, detune) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune;
      o.connect(dest); o.start(t); o.stop(t + dur);
      return o;
    }

    // ---- sampled voices ----
    // timing and level humanising; a tighter feel plays closer to the grid
    const loose = 0.35 + (1 - (setup && setup.tight != null ? setup.tight : 0.8)) * 1.8;
    const rnd = (a) => (Math.random() * 2 - 1) * a * loose;
    function sample(id, midi, t, dur, level, dest, o = {}) {
      const e = inst[id];
      if (!e || !e.ok || !e.notes || !e.notes.length) return false;
      let best = e.notes[0];
      for (const n of e.notes) if (Math.abs(n.key - midi) < Math.abs(best.key - midi)) best = n;
      const src = c.createBufferSource(); src.buffer = best.buffer;
      src.playbackRate.value = Math.pow(2, (midi - best.key + (o.cents || 0) / 100) / 12);
      const g = c.createGain(), a = o.attack ?? 0.003, rel = o.release ?? 0.12;
      const end = t + Math.max(a + 0.01, dur);
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + a);
      g.gain.setValueAtTime(level, end); g.gain.linearRampToValueAtTime(0, end + rel);
      let node = src;
      if (o.lowpass) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = o.lowpass; src.connect(f); node = f; }
      node.connect(g);
      let last = g;
      if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); last = p; }
      last.connect(dest);
      if (o.send) send(last, o.send, o.part);
      if (o.vibrato && dur > 0.35) {
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 5.2; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(src.playbackRate.value * 0.007, t + 0.3);
        lfo.connect(depth); depth.connect(src.playbackRate); lfo.start(t); lfo.stop(end + rel);
      }
      src.start(t, offsetOf(best.buffer)); src.stop(end + rel + 0.05);
      return true;
    }
    function hit(piece, t, vel, o = {}) {
      const e = inst[setup.kit];
      const list = e && e.ok && e.pieces[piece];
      if (!list || !list.length) return false;
      const s = vel < 0.78 ? list[0] : list[list.length - 1];
      const src = c.createBufferSource(); src.buffer = s.buffer;
      const g = c.createGain(); g.gain.value = (0.45 + 0.55 * vel) * (1 + rnd(0.08));
      src.connect(g);
      let last = g;
      if (o.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = o.pan; g.connect(p); last = p; }
      last.connect(parts.drums.sgain);
      if (o.send) send(last, o.send, "drums");
      src.start(t + rnd(0.003), offsetOf(s.buffer));
      return true;
    }
    const metal = setup && setup.tone === "metal";
    const lowGuitar = (m) => { const lo = metal ? 33 : 38; while (m > lo + 19) m -= 12; while (m < lo) m += 12; return m; };
    // guitar amp for every guitar sound: drive into a soft clipper, then a speaker cabinet
    // (tight low end, mid voicing, presence, steep top roll-off). Drive and tone come from the studio.
    let guitarIn = parts.guitar.sgain;
    if (setup) parts.guitar.sgain.gain.value = SAMPLE_LEVELS.guitar * (TONE_LEVEL[setup.tone] || 1);
    if (setup && setup.tone === "metal") parts.vocals.sgain.gain.value = SAMPLE_LEVELS.vocals * 1.35;   // sing over the wall of guitars
    const amp = {};
    if (setup && setup.tone !== "synth") {
      amp.pre = c.createGain();
      amp.shaper = c.createWaveShaper();
      const k = new Float32Array(4097);
      for (let i = 0; i < k.length; i++) { const x = i / 2048 - 1; k[i] = Math.tanh(x * 3) / Math.tanh(3); }
      amp.shaper.curve = k; amp.shaper.oversample = "4x";
      const f = (type, freq, q, gain) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = freq; if (q) n.Q.value = q; if (gain) n.gain.value = gain; return n; };
      amp.hp = f("highpass", metal ? 95 : 75, 0.7);
      amp.thump = f("peaking", 120, 1.1, 2.5);
      amp.mid = f("peaking", 700, 0.8, 0);
      amp.presence = f("peaking", 2600, 0.9, 3);
      amp.cab1 = f("lowpass", 5200, 0.9);
      amp.cab2 = f("lowpass", 6200, 0.6);
      amp.post = c.createGain();
      amp.pre.connect(amp.shaper); amp.shaper.connect(amp.hp); amp.hp.connect(amp.thump); amp.thump.connect(amp.mid);
      amp.mid.connect(amp.presence); amp.presence.connect(amp.cab1); amp.cab1.connect(amp.cab2); amp.cab2.connect(amp.post); amp.post.connect(parts.guitar.sgain);
      guitarIn = amp.pre;
    }
    // input gain into the clipper for a drive amount, and the output gain that keeps loudness steady
    const drivePre = (d) => 0.25 + d * d * 7;
    // measured: guitar loudness at drive 0, .25, .5, .75, 1 (tools: render each tone solo), evened out
    const POST_FIX = [6.7, 2.5, 1.04, 0.88, 1.06];
    const drivePost = (d) => {
      const x = drivePre(d) * 3 * 0.12, base = 1 / (0.12 * 3 * (x < 1 ? 1 : Math.pow(x, 0.85))) * 0.12;
      const i = Math.min(3, Math.floor(d * 4)), f = d * 4 - i;
      return base * (POST_FIX[i] + (POST_FIX[i + 1] - POST_FIX[i]) * f);
    };
    function setFx(fx, spb) {
      if (!fx) return;
      const t = c.currentTime, to = (param, v) => param.setTargetAtTime(v, t, 0.04);
      const G = fx.guitar, B = fx.bass, D = fx.drums, V = fx.vocals;
      if (amp.pre) {
        to(amp.pre.gain, drivePre(G.drive)); to(amp.post.gain, drivePost(G.drive));
        to(amp.mid.gain, metal ? -5 + G.tone * 2 : (G.tone - 0.5) * 4);
        to(amp.presence.gain, -4 + G.tone * 10);
        to(amp.cab1.frequency, 3400 + G.tone * 4200); to(amp.cab2.frequency, 4200 + G.tone * 5000);
      }
      to(vbus.guitar.gain, G.reverb / 0.25); to(vbus.vocals.gain, V.reverb / 0.35); to(vbus.drums.gain, D.room / 0.3); to(vbus.bass.gain, B.drive * 0.2);
      to(dsend.guitar.gain, G.delay * 0.55); to(dsend.vocals.gain, V.echo * 0.5);
      if (spb) to(delay.delayTime, Math.min(1.9, spb * 0.75));
      to(bass.dry.gain, 1 - B.drive * 0.6); to(bass.pre.gain, 1 + B.drive * 10); to(bass.post.gain, B.drive * 0.5);
      to(bass.lp.frequency, 900 + B.tone * 4500);
      to(drumComp.threshold, -6 - D.punch * 22); to(drumComp.ratio, 1.5 + D.punch * 5); to(drumMake.gain, 1 + D.punch * 0.35);
    }
    setFx({ guitar: { drive: setup ? ({ clean: 0.05, crunch: 0.45, dist: 0.65, metal: 0.85 }[setup.tone] ?? 0.5) : 0.5, tone: 0.5, reverb: 0.25, delay: 0 },
      bass: { drive: 0.2, tone: 0.5 }, drums: { room: 0.3, punch: 0.5 }, vocals: { reverb: 0.35, echo: 0.1 } }, 0.5);
    let crashSide = 1;
    const sampled = setup ? {
      kick: (e, t) => hit("kick", t, e.vel),
      snare: (e, t) => hit("snare", t, e.vel, { send: 0.25 }),
      clap: (e, t) => hit("clap", t, e.vel, { send: 0.3 }),
      china: (e, t) => hit("china", t, e.vel, { pan: -0.35, send: 0.2 }),
      hat: (e, t) => hit("hat", t, e.vel * 0.85, { pan: 0.3 }),
      ohat: (e, t) => hit("ohat", t, e.vel * 0.85, { pan: 0.3 }),
      crash: (e, t) => { crashSide = -crashSide; return hit(crashSide > 0 ? "crash" : "crash2", t, e.vel, { pan: 0.45 * crashSide, send: 0.2 }); },
      tom: (e, t) => hit(["tom1", "tom2", "tom3", "tom4"][e.tom || 0], t, e.vel, { pan: [0.4, 0.15, -0.15, -0.4][e.tom || 0], send: 0.15 }),
      bass: (e, t, spb) => sample(setup.bass, e.midi, t + rnd(0.004), e.dur * spb * 0.95, 1 + rnd(0.08), parts.bass.sgain, { release: 0.06, lowpass: 3500 }),
      guitar(e, t, spb) {
        const dur = e.dur * spb;
        if (e.kind === "pluck") return sample(setup.tone === "clean" ? setup.clean : setup.single, e.midi, t + rnd(0.006), dur, 0.9, guitarIn, { release: 0.35, pan: 0.3, send: 0.25, part: "guitar" });
        if (e.kind === "synth") return sample("saw-lead", e.midi, t, dur * 0.9, 1.1, parts.guitar.sgain, { release: 0.08, pan: 0.2, send: 0.25, lowpass: 5000, part: "guitar" });
        const muted = e.kind === "mute", single = e.kind === "note", m = lowGuitar(e.midi);
        const o = muted ? { release: 0.04, lowpass: metal ? 1900 : 1500 } : { release: 0.1, lowpass: 6500, send: 0.12, part: "guitar" };
        const d = muted ? (metal ? 0.09 : 0.11) : dur, lvl = muted ? 0.75 : 0.95;
        // double-tracked: two takes panned wide, slightly apart in time and tuning
        const take = (pan, delay, cents) => {
          if (single) return sample(setup.single, e.midi, t + delay + rnd(0.004), d, lvl, guitarIn, { ...o, pan, cents });
          if (setup.tone === "clean" || setup.tone === "synth") {
            // strum a real chord shape: root, fifth, octave, a few ms apart
            let ok = true;
            [0, 7, 12].forEach((iv, n) => { ok = sample(setup.chord, m + 12 + iv, t + delay + n * 0.012, d, lvl * 0.6, guitarIn, { ...o, pan, cents, release: muted ? 0.04 : 0.3 }) && ok; });
            return ok;
          }
          return sample(setup.chord, m, t + delay + rnd(0.004), d, lvl, guitarIn, { ...o, pan, cents });
        };
        const ok = take(-0.75, 0, 0);
        take(0.75, 0.011, 6);
        return ok;
      },
      keys(e, t, spb) {
        const dur = e.dur * spb, organ = setup.keys === "organ", pad = setup.keys === "pad" && e.kind === "pad";
        const o = { attack: pad ? 0.2 : organ ? 0.02 : 0.003, release: pad ? 0.6 : organ ? 0.12 : 0.4, pan: 0.25, send: pad ? 0.4 : 0.2, part: "keys" };
        let ok = true;
        const inst = e.kind === "arp" && setup.keys === "pad" ? "saw-lead" : setup.keys;
        (e.notes || [e.midi]).forEach((m) => { ok = sample(inst, m, t + rnd(0.005), dur, e.kind === "pad" ? 0.55 : 0.7 * e.vel, parts.keys.sgain, o) && ok; });
        // backing "aahs" under chorus chords
        if (e.kind === "pad") (e.notes || []).forEach((m) => sample(setup.choir, m, t, dur, 0.28, parts.vocals.sgain, { attack: 0.15, release: 0.4, pan: -0.3, send: 0.45, part: "vocals" }));
        return ok;
      },
      vocals: (e, t, spb) => sample(setup.voice, e.midi, t + rnd(0.01), e.dur * spb, 0.9, parts.vocals.sgain, { attack: 0.03, release: 0.18, send: 0.35, vibrato: true, part: "vocals" }),
      sticks: (t, accent) => hit("rim", t, accent ? 0.9 : 0.6)
    } : null;

    const play = {
      kick(e, t) {
        const o = c.createOscillator();
        o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        o.connect(env(parts.drums.gain, t, 0.002, 1.1 * e.vel, 0.02, 0.28)); o.start(t); o.stop(t + 0.4);
        noise(env(parts.drums.gain, t, 0.001, 0.25 * e.vel, 0, 0.02), t, 0.05, "highpass", 2500);
      },
      snare(e, t) {
        const g = env(parts.drums.gain, t, 0.001, 0.75 * e.vel, 0.01, 0.17);
        noise(g, t, 0.25, "bandpass", 2200, 0.7); send(g, 0.5);
        osc(env(parts.drums.gain, t, 0.001, 0.45 * e.vel, 0, 0.09), t, 0.15, "triangle", 185);
      },
      hat(e, t) { noise(env(parts.drums.gain, t, 0.001, 0.22 * e.vel, 0, 0.045), t, 0.08, "highpass", 8000); },
      ohat(e, t) { noise(env(parts.drums.gain, t, 0.001, 0.2 * e.vel, 0.02, 0.22), t, 0.3, "highpass", 7000); },
      crash(e, t) { const g = env(parts.drums.gain, t, 0.002, 0.32 * e.vel, 0.05, 1.4); noise(g, t, 1.6, "highpass", 5000); send(g, 0.4); },
      tom(e, t) {
        const o = c.createOscillator(), f = [220, 180, 150, 120][e.tom || 0];
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.25);
        o.connect(env(parts.drums.gain, t, 0.002, 0.7 * e.vel, 0.02, 0.25)); o.start(t); o.stop(t + 0.35);
      },
      bass(e, t, spb) {
        const dur = e.dur * spb;
        const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 3;
        f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(380, t + Math.min(0.25, dur));
        f.connect(env(parts.bass.gain, t, 0.005, 0.9, Math.max(0, dur - 0.06), 0.06));
        osc(f, t, dur + 0.1, "sawtooth", hz(e.midi));
        osc(f, t, dur + 0.1, "square", hz(e.midi - 12));
      },
      guitar(e, t, spb) {
        const dur = e.dur * spb;
        const muted = e.kind === "mute", pluck = e.kind === "pluck";
        const tone = c.createBiquadFilter(); tone.type = "lowpass";
        tone.frequency.value = muted ? 1100 : pluck ? 2600 : 3400;
        const g = env(parts.guitar.gain, t, 0.004, pluck ? 0.7 : 0.8, muted ? 0.02 : Math.max(0, dur - 0.1), muted ? 0.08 : 0.12);
        tone.connect(g);
        if (pluck) { send(g, 0.35); osc(tone, t, dur + 0.2, "triangle", hz(e.midi)); osc(tone, t, dur + 0.2, "sawtooth", hz(e.midi), 4); return; }
        const shaper = c.createWaveShaper(); shaper.curve = curve; shaper.oversample = "2x";
        const pre = c.createGain(); pre.gain.value = 0.6;
        pre.connect(shaper); shaper.connect(tone);
        [0, 7, 12].forEach((iv) => { osc(pre, t, dur + 0.15, "sawtooth", hz(e.midi + iv), -7); osc(pre, t, dur + 0.15, "sawtooth", hz(e.midi + iv), 7); });
        send(g, muted ? 0.05 : 0.15);
      },
      keys(e, t, spb) {
        const dur = e.dur * spb;
        const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = e.kind === "pad" ? 1800 : 3000;
        const g = e.kind === "pad" ? env(parts.keys.gain, t, 0.12, 0.5, Math.max(0, dur - 0.4), 0.4) : env(parts.keys.gain, t, 0.004, 0.55 * e.vel, 0.02, 0.25);
        f.connect(g); send(g, 0.45);
        (e.notes || [e.midi]).forEach((m) => { osc(f, t, dur + 0.5, e.kind === "pad" ? "sawtooth" : "square", hz(m), -6); if (e.kind === "pad") osc(f, t, dur + 0.5, "triangle", hz(m), 6); });
      },
      vocals(e, t, spb) {
        // a sung "ah": buzz through two vowel formants, with late vibrato
        const dur = e.dur * spb;
        const g = env(parts.vocals.gain, t, 0.03, 0.8, Math.max(0, dur - 0.08), 0.12);
        send(g, 0.35);
        const f1 = c.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 800; f1.Q.value = 5;
        const f2 = c.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 1200; f2.Q.value = 6;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2400;
        const dry = c.createGain(); dry.gain.value = 0.25;
        f1.connect(g); f2.connect(g); lp.connect(dry); dry.connect(g);
        const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = hz(e.midi);
        const lfo = c.createOscillator(), depth = c.createGain();
        lfo.frequency.value = 5.5; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(hz(e.midi) * 0.012, t + Math.min(0.35, dur));
        lfo.connect(depth); depth.connect(o.frequency);
        [f1, f2, lp].forEach((n) => o.connect(n));
        o.start(t); o.stop(t + dur + 0.2); lfo.start(t); lfo.stop(t + dur + 0.2);
      },
      clap(e, t) { this.snare(e, t); },
      china(e, t) { this.crash(e, t); },
      sticks(t, accent) { noise(env(parts.drums.gain, t, 0.001, accent ? 0.6 : 0.4, 0, 0.04), t, 0.06, "bandpass", 3000, 4); }
    };

    function schedule(e, t, spb) {
      const key = e.part === "drums" ? e.kind : e.part;
      if (sampled && sampled[key](e, t, spb)) return;
      return play[key](e, t, spb);
    }
    return {
      parts, schedule, setFx, sticks: (t, accent) => (sampled && sampled.sticks(t, accent)) || play.sticks(t, accent),
      // the player's part drops out for a moment after a miss
      duck(part) {
        const p = parts[part]; if (!p) return;
        const t = c.currentTime;
        p.gain.gain.cancelScheduledValues(t);
        p.gain.gain.setValueAtTime(p.level * 0.12, t);
        p.gain.gain.linearRampToValueAtTime(p.level, t + 0.45);
      },
      fadeOut() {
        const t = c.currentTime;
        bandOut.gain.setValueAtTime(bandOut.gain.value, t);
        bandOut.gain.linearRampToValueAtTime(0, t + 0.1);
        setTimeout(() => limiter.disconnect(), 300);
      }
    };
  }

  // Plays an arrangement live, scheduling a little ahead on the audio clock.
  // startAt = time of the first count-in beat.
  function playArrangement(arr, startAt, countIn) {
    ensure();
    const band = createBand(ctx, musicBus, noiseBuf, setupFor(arr));
    const spb = 60 / arr.bpm;
    band.setFx(arr.groove && arr.groove.fx, spb);
    for (let b = 0; b < countIn; b++) band.sticks(startAt + b * spb, b === 0);
    const songStart = startAt + countIn * spb;
    let i = 0, stopped = false;
    const pump = () => {
      if (stopped) return;
      const horizon = ctx.currentTime + 0.35;
      while (i < arr.events.length) {
        const t = songStart + arr.events[i].beat * spb;
        if (t > horizon) break;
        if (t >= ctx.currentTime - 0.02) band.schedule(arr.events[i], t, spb);
        i++;
      }
    };
    pump();
    const timer = setInterval(pump, 40);
    return {
      duck: band.duck,
      stop() { stopped = true; clearInterval(timer); band.fadeOut(); }
    };
  }

  // Loops a short arrangement for the studio preview. getArr() is called at the start of every
  // loop, so edits are heard on the next pass. position() gives the current step (0..31) for a playhead.
  function playLoop(getArr) {
    ensure();
    let arr = getArr(), band = null, key = "", stopped = false, i = 0;
    let cycleStart = ctx.currentTime + 0.12;
    const fresh = () => {
      const k = JSON.stringify(setupFor(arr));
      if (k !== key) { if (band) band.fadeOut(); band = createBand(ctx, musicBus, noiseBuf, setupFor(arr)); key = k; }
      band.setFx(arr.groove && arr.groove.fx, 60 / arr.bpm);
    };
    fresh();
    const pump = () => {
      if (stopped) return;
      const horizon = ctx.currentTime + 0.3;
      for (;;) {
        const spb = 60 / arr.bpm;
        if (i >= arr.events.length) {
          if (cycleStart + arr.beats * spb > horizon) break;
          cycleStart += arr.beats * spb; arr = getArr(); fresh(); i = 0;
          continue;
        }
        const e = arr.events[i], t = cycleStart + e.beat * spb;
        if (t > horizon) break;
        if (t >= ctx.currentTime - 0.02) band.schedule(e, t, spb);
        i++;
      }
    };
    pump();
    const timer = setInterval(pump, 30);
    return {
      stop() { stopped = true; clearInterval(timer); band.fadeOut(); },
      // effects changes are heard straight away, not on the next pass
      setFx(fx) { band.setFx(fx, 60 / arr.bpm); },
      position() { const spb = 60 / arr.bpm; return Math.floor(((ctx.currentTime - cycleStart) / spb) * 4); }
    };
  }

  // Renders an arrangement to an AudioBuffer (used to make listening previews).
  async function renderOffline(arr, countIn = 4, sampleRate = 44100) {
    const spb = 60 / arr.bpm;
    const seconds = (countIn + arr.beats) * spb + 2.5;
    await loadInstruments(instrumentsFor(arr));
    const oc = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const band = createBand(oc, oc.destination, makeNoise(oc), setupFor(arr));
    band.setFx(arr.groove && arr.groove.fx, spb);
    for (let b = 0; b < countIn; b++) band.sticks(0.1 + b * spb, b === 0);
    const songStart = 0.1 + countIn * spb;
    arr.events.forEach((e) => band.schedule(e, songStart + e.beat * spb, spb));
    return oc.startRendering();
  }

  // ---------- recorded songs ----------
  const buffers = {};
  async function load(url) {
    ensure();
    if (!buffers[url]) {
      buffers[url] = fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.arrayBuffer();
      }).then((data) => new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)));
      buffers[url].catch(() => { delete buffers[url]; });
    }
    return buffers[url];
  }

  // Plays a decoded recording at an exact audio-clock time. A miss muffles it briefly,
  // since a mixed recording has no separate instrument to drop out.
  // Where the music's first beat falls in a recording: slides the song's kick and snare times
  // (seconds from beat 1) across the recording's onset curve and keeps the best match.
  function alignOffset(buffer, hitTimes, maxOffset = 3) {
    const d = buffer.getChannelData(0), hop = Math.round(buffer.sampleRate * 0.01), n = Math.floor(d.length / hop);
    const env = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = i * hop; j < (i + 1) * hop; j++) e += d[j] * d[j];
      e = Math.sqrt(e / hop); env[i] = Math.max(0, e - prev); prev = e;
    }
    let best = 0, bestScore = -1;
    for (let o = -0.2; o <= maxOffset; o += 0.01) {
      let score = 0;
      for (const t of hitTimes) { const k = Math.round((t + o) * 100); if (k > 0 && k < n - 1) score += Math.max(env[k - 1], env[k], env[k + 1]); }
      if (score > bestScore) { bestScore = score; best = o; }
    }
    return Math.round(best * 1000) / 1000;
  }

  function playBuffer(buffer, startAt, from = 0) {
    ensure();
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 20000;
    const g = ctx.createGain();
    src.connect(tone); tone.connect(g); g.connect(musicBus);
    src.start(Math.max(startAt, ctx.currentTime), Math.max(0, from + Math.max(0, ctx.currentTime - startAt)));
    return {
      duck() {
        const t = ctx.currentTime;
        tone.frequency.cancelScheduledValues(t);
        tone.frequency.setValueAtTime(700, t);
        tone.frequency.exponentialRampToValueAtTime(20000, t + 0.45);
      },
      stop() {
        const t = ctx.currentTime;
        g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.15);
        try { src.stop(t + 0.2); } catch { /* already stopped */ }
      }
    };
  }

  // ---------- metronome for calibration ----------
  function click(t, accent) {
    ensure();
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = accent ? 3600 : 2600; f.Q.value = 5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.7 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 0.06);
  }

  // ---------- sfx ----------
  function tone(t, freq, type, peak, decay) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + decay + 0.05);
  }
  const sfx = {
    hit() { /* the music itself is the feedback; kept for later UI sounds */ },
    miss() { ensure(); tone(ctx.currentTime, 90, "square", 0.04, 0.1); },
    cheer() {
      ensure();
      const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1300; f.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + 2.3);
    },
    boo() { ensure(); tone(ctx.currentTime, 110, "sawtooth", 0.12, 0.9); }
  };

  return { unlock, setVolumes, now, suspend, resume, playArrangement, playLoop, renderOffline, loadInstruments, instrumentsFor, load, playBuffer, alignOffset, click, sfx };
})();
