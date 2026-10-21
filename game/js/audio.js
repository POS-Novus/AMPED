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

  // ---------- the synth band (works on live and offline contexts) ----------
  const LEVELS = { drums: 0.9, bass: 0.62, guitar: 0.34, keys: 0.2, vocals: 0.34 };

  function createBand(c, out, noiseBuffer) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    const bandOut = c.createGain(); bandOut.gain.value = 0.45;
    comp.connect(bandOut); bandOut.connect(out);

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
      parts[name] = { gain: g, level };
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
      if (e.part === "drums") return play[e.kind](e, t);
      return play[e.part](e, t, spb);
    }
    return {
      parts, schedule, sticks: play.sticks,
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
        setTimeout(() => bandOut.disconnect(), 300);
      }
    };
  }

  // Plays an arrangement live, scheduling a little ahead on the audio clock.
  // startAt = time of the first count-in beat.
  function playArrangement(arr, startAt, countIn) {
    ensure();
    const band = createBand(ctx, musicBus, noiseBuf);
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
    const oc = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const band = createBand(oc, oc.destination, makeNoise(oc));
    for (let b = 0; b < countIn; b++) band.sticks(0.1 + b * spb, b === 0);
    const songStart = 0.1 + countIn * spb;
    arr.events.forEach((e) => band.schedule(e, songStart + e.beat * spb, spb));
    return oc.startRendering();
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

  return { unlock, setVolumes, now, suspend, resume, playArrangement, renderOffline, click, sfx };
})();
