// Web Audio: one clock for music and judging, a TEMPORARY synthesised beat, and simple SFX.
// The beat is a development placeholder, not game music.
window.AmpedAudio = (() => {
  let ctx = null, master, musicBus, sfxBus, noise;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  // Must be called from a user gesture (tap / key) so browsers allow sound.
  async function unlock() {
    ensure();
    if (ctx.state !== "running") await ctx.resume();
    return ctx;
  }

  function setVolumes(music, sfx) {
    ensure();
    musicBus.gain.value = music;
    sfxBus.gain.value = sfx;
  }

  const now = () => (ctx ? ctx.currentTime : 0);
  const suspend = () => ctx && ctx.suspend();
  const resume = () => ctx && ctx.resume();

  // ---------- instruments ----------
  function env(out, t, attack, peak, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }
  function kick(out, t) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(env(out, t, 0.002, 0.9, 0.22));
    o.start(t); o.stop(t + 0.3);
  }
  function noiseHit(out, t, freq, q, peak, decay) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(env(out, t, 0.001, peak, decay));
    s.start(t); s.stop(t + decay + 0.05);
  }
  const snare = (out, t) => noiseHit(out, t, 1800, 0.8, 0.5, 0.16);
  const hat = (out, t, open) => noiseHit(out, t, 8000, 1.2, open ? 0.18 : 0.12, open ? 0.12 : 0.04);
  function tone(out, t, freq, type, peak, decay) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    o.connect(env(out, t, 0.005, peak, decay));
    o.start(t); o.stop(t + decay + 0.05);
  }

  // ---------- temporary beat ----------
  // A minor loop: Am F C G, one chord per bar.
  const CHORDS = [[110, 220, 261.63, 329.63], [87.31, 174.61, 220, 261.63], [130.81, 196, 261.63, 329.63], [98, 196, 246.94, 293.66]];

  // Schedules the whole song ahead on the audio clock. Returns a stop() that silences it.
  function playTempBeat({ bpm, startAt, countIn, beats }) {
    ensure();
    const bus = ctx.createGain(); bus.connect(musicBus);
    const spb = 60 / bpm;
    for (let b = 0; b < countIn; b++) noiseHit(bus, startAt + b * spb, 3200, 4, b === 0 ? 0.6 : 0.4, 0.05);
    for (let b = 0; b < beats; b++) {
      const t = startAt + (countIn + b) * spb;
      const chord = CHORDS[Math.floor(b / 4) % 4];
      if (b % 2 === 0) kick(bus, t); else snare(bus, t);
      if (b % 4 === 3) kick(bus, t + spb / 2);
      hat(bus, t, false); hat(bus, t + spb / 2, b % 4 === 3);
      tone(bus, t, chord[0], "sawtooth", 0.12, spb * 0.45);
      tone(bus, t + spb / 2, chord[0], "sawtooth", 0.09, spb * 0.4);
      if (b % 4 === 0) chord.slice(1).forEach((f) => tone(bus, t, f, "triangle", 0.06, spb * 1.6));
    }
    kick(bus, startAt + (countIn + beats) * spb);
    chordEnd(bus, startAt + (countIn + beats) * spb);
    return () => { bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime); bus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08); setTimeout(() => bus.disconnect(), 200); };
  }
  function chordEnd(out, t) { CHORDS[0].forEach((f) => tone(out, t, f, "triangle", 0.08, 1.8)); }

  // ---------- metronome for calibration ----------
  function click(t, accent) { ensure(); noiseHit(sfxBus, t, accent ? 3600 : 2600, 5, accent ? 0.7 : 0.5, 0.05); }

  // ---------- sfx ----------
  const sfx = {
    hit(lane) { ensure(); tone(sfxBus, ctx.currentTime, [523, 587, 659, 784][lane], "sine", 0.08, 0.08); },
    miss() { ensure(); tone(sfxBus, ctx.currentTime, 90, "square", 0.05, 0.1); },
    cheer() { ensure(); noiseHit(sfxBus, ctx.currentTime, 1200, 0.4, 0.25, 1.4); },
    boo() { ensure(); tone(sfxBus, ctx.currentTime, 110, "sawtooth", 0.12, 0.9); }
  };

  return { unlock, setVolumes, now, suspend, resume, playTempBeat, click, sfx };
})();
