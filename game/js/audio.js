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

  // Which sampled instruments each song style uses.
  function setupFor(arr) {
    const style = arr.style || "Anthem";
    return {
      kit: style === "Ballad" ? "drums-standard" : "drums-power",
      keys: style === "Anthem" ? "organ" : "piano",
      guitar: "guitar-power", clean: "guitar-clean", bass: "bass-pick", voice: "voice-lead", choir: "voice-choir"
    };
  }
  const instrumentsFor = (arr) => [...new Set(Object.values(setupFor(arr)))];

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
  const SAMPLE_LEVELS = { drums: 1.6, bass: 3.2, guitar: 7.2, keys: 10, vocals: 7.7 };

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

    const parts = {};
    Object.entries(LEVELS).forEach(([name, level]) => {
      const g = c.createGain(); g.gain.value = level; g.connect(comp);
      const sg = c.createGain(); sg.gain.value = SAMPLE_LEVELS[name]; sg.connect(g);   // samples sit at their own level
      parts[name] = { gain: g, sgain: sg, level };
    });
    const send = (node, amount) => { const s = c.createGain(); s.gain.value = amount; node.connect(s); s.connect(verb); };

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
    const rnd = (a) => (Math.random() * 2 - 1) * a;
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
      if (o.send) send(last, o.send);
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
      if (o.send) send(last, o.send);
      src.start(t + rnd(0.003), offsetOf(s.buffer));
      return true;
    }
    const lowGuitar = (m) => { while (m > 57) m -= 12; while (m < 38) m += 12; return m; };
    let crashSide = 1;
    const sampled = setup ? {
      kick: (e, t) => hit("kick", t, e.vel),
      snare: (e, t) => hit("snare", t, e.vel, { send: 0.25 }),
      hat: (e, t) => hit("hat", t, e.vel * 0.85, { pan: 0.3 }),
      ohat: (e, t) => hit("ohat", t, e.vel * 0.85, { pan: 0.3 }),
      crash: (e, t) => { crashSide = -crashSide; return hit(crashSide > 0 ? "crash" : "crash2", t, e.vel, { pan: 0.45 * crashSide, send: 0.2 }); },
      tom: (e, t) => hit(["tom1", "tom2", "tom3", "tom4"][e.tom || 0], t, e.vel, { pan: [0.4, 0.15, -0.15, -0.4][e.tom || 0], send: 0.15 }),
      bass: (e, t, spb) => sample(setup.bass, e.midi, t + rnd(0.004), e.dur * spb * 0.95, 1 + rnd(0.08), parts.bass.sgain, { release: 0.06, lowpass: 3500 }),
      guitar(e, t, spb) {
        const dur = e.dur * spb;
        if (e.kind === "pluck") return sample(setup.clean, e.midi, t + rnd(0.006), dur, 0.9, parts.guitar.sgain, { release: 0.35, pan: 0.3, send: 0.25 });
        const muted = e.kind === "mute", m = lowGuitar(e.midi);
        const o = muted ? { release: 0.04, lowpass: 1500 } : { release: 0.1, lowpass: 6500 };
        const d = muted ? 0.11 : dur, lvl = muted ? 0.75 : 0.95;
        // double-tracked: two takes panned wide, slightly apart in time and tuning
        const ok = sample(setup.guitar, m, t + rnd(0.004), d, lvl, parts.guitar.sgain, { ...o, pan: -0.75 });
        sample(setup.guitar, m, t + 0.011 + rnd(0.004), d, lvl, parts.guitar.sgain, { ...o, pan: 0.75, cents: 6 });
        return ok;
      },
      keys(e, t, spb) {
        const dur = e.dur * spb, organ = setup.keys === "organ";
        const o = { attack: organ ? 0.02 : 0.003, release: organ ? 0.12 : 0.4, pan: 0.25, send: 0.2 };
        let ok = true;
        (e.notes || [e.midi]).forEach((m) => { ok = sample(setup.keys, m, t + rnd(0.005), dur, e.kind === "pad" ? 0.55 : 0.7 * e.vel, parts.keys.sgain, o) && ok; });
        // backing "aahs" under chorus chords
        if (e.kind === "pad") (e.notes || []).forEach((m) => sample(setup.choir, m, t, dur, 0.28, parts.vocals.sgain, { attack: 0.15, release: 0.4, pan: -0.3, send: 0.45 }));
        return ok;
      },
      vocals: (e, t, spb) => sample(setup.voice, e.midi, t + rnd(0.01), e.dur * spb, 0.9, parts.vocals.sgain, { attack: 0.03, release: 0.18, send: 0.35, vibrato: true }),
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
      sticks(t, accent) { noise(env(parts.drums.gain, t, 0.001, accent ? 0.6 : 0.4, 0, 0.04), t, 0.06, "bandpass", 3000, 4); }
    };

    function schedule(e, t, spb) {
      const key = e.part === "drums" ? e.kind : e.part;
      if (sampled && sampled[key](e, t, spb)) return;
      return play[key](e, t, spb);
    }
    return {
      parts, schedule, sticks: (t, accent) => (sampled && sampled.sticks(t, accent)) || play.sticks(t, accent),
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

  // Renders an arrangement to an AudioBuffer (used to make listening previews).
  async function renderOffline(arr, countIn = 4, sampleRate = 44100) {
    const spb = 60 / arr.bpm;
    const seconds = (countIn + arr.beats) * spb + 2.5;
    await loadInstruments(instrumentsFor(arr));
    const oc = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const band = createBand(oc, oc.destination, makeNoise(oc), setupFor(arr));
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
  function playBuffer(buffer, startAt) {
    ensure();
    const src = ctx.createBufferSource(); src.buffer = buffer;
    const tone = ctx.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 20000;
    const g = ctx.createGain();
    src.connect(tone); tone.connect(g); g.connect(musicBus);
    src.start(startAt);
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

  // ---------- menu music: one looping track, faded in and out ----------
  // source: a URL to a recording, or a function that returns a Promise<AudioBuffer> (e.g. a rendered arrangement)
  const menu = (() => {
    let node = null, gain = null, wanted = false, source = null, cached = null;
    async function play(src) {
      source = src || source; wanted = true;
      if (node || !source) return;
      if (!cached) cached = typeof source === "string" ? load(source) : source();
      const buf = await cached;
      if (!wanted || node) return;
      gain = ctx.createGain(); gain.gain.value = 0; gain.connect(musicBus);
      node = ctx.createBufferSource(); node.buffer = buf; node.loop = true; node.connect(gain);
      node.start();
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.5);
    }
    function stop() {
      wanted = false;
      if (!node) return;
      const n = node, g = gain, t = ctx.currentTime;
      node = gain = null;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.6);
      setTimeout(() => { try { n.stop(); } catch { /* ignore */ } g.disconnect(); }, 700);
    }
    return { play, stop, resume: () => source && play() };
  })();

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

  return { unlock, setVolumes, now, suspend, resume, playArrangement, renderOffline, loadInstruments, instrumentsFor, load, playBuffer, menu, click, sfx };
})();
