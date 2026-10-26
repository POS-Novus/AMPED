// A backdrop with the band placed on it, plus code-drawn ambience (rain, light flicker, dust, notes).
// Characters are static cutouts, so each is rigged in three soft-edged layers of the same picture:
// legs, torso (pivots at the hips) and head (pivots at the neck). Moves are driven by the music's
// beat: knee bounces, headbangs, sways, jumps into the chorus, drumsticks hitting the kit.
// Instruments a character's art lacks are drawn in code (js/props.js).
window.AmpedScene = (() => {
  const reduced = () => document.documentElement.classList.contains("reduce-motion");
  const rand = (a, b) => a + Math.random() * (b - a);

  // opts: { scene, members, onTap(member), ambience: bool, drift: bool }
  function mount(host, opts) {
    const { scene, members } = opts;
    host.innerHTML = "";
    const box = document.createElement("div");
    box.className = "scene-box" + (opts.drift && !reduced() ? " drift" : "");
    host.appendChild(box);

    const bg = document.createElement("img");
    bg.className = "scene-bg"; bg.src = scene.src; bg.alt = ""; bg.draggable = false;
    box.appendChild(bg);

    (scene.fx && scene.fx.lights || []).forEach((l) => {
      const g = document.createElement("div");
      g.className = "glow";
      Object.assign(g.style, { left: l.x + "%", top: l.y + "%", width: l.size + "%", animationDuration: rand(2.5, 5) + "s", animationDelay: -rand(0, 5) + "s" });
      g.style.setProperty("--glow", l.color);
      box.appendChild(g);
    });

    let canvas = null, stopLoop = () => {};
    if (opts.ambience && scene.fx && (scene.fx.rain || scene.fx.dust)) {
      canvas = document.createElement("canvas");
      canvas.className = "scene-fx"; canvas.setAttribute("aria-hidden", "true");
      box.appendChild(canvas);
      stopLoop = ambience(box, canvas, scene.fx);
    }

    const actors = {}, rigs = [];
    members.forEach((m) => {
      const slot = scene.slots[m.role];
      const el = document.createElement(opts.onTap ? "button" : "div");
      el.className = "actor";
      if (opts.onTap) {
        el.type = "button";
        el.setAttribute("aria-label", `${m.name}, ${m.roleLabel}. Open details`);
        el.addEventListener("click", () => { cheer(m.id); opts.onTap(m); });
      }
      Object.assign(el.style, {
        left: slot.x + "%", bottom: (100 - slot.y) + "%", height: slot.h + "%",
        aspectRatio: String(m.aspect), zIndex: String(10 + slot.z)
      });
      el.style.setProperty("--c", m.color);
      const props = window.AmpedProps ? window.AmpedProps.forMember(m, m.aspect) : { held: "", front: "" };
      const img = `<img src="${m.sprite}" alt="" draggable="false">`;
      el.innerHTML = `<span class="actor-shadow"></span>
        <span class="actor-body"><span class="rig rig-legs">${img}</span><span class="rig rig-torso">${img}${props.held}<span class="rig rig-head">${img}</span></span></span>${props.front}`;
      box.appendChild(el);
      actors[m.id] = el;
      // animated clips for this look and role, if any were made from Runway
      const anims = {}, all = window.AMPED_ANIMS || {};
      Object.keys(all).forEach((k) => { const [look, role, move] = k.split("__"); if (look === m.lookId && role === m.role) anims[move] = all[k]; });
      let sprite = null;
      if (anims.play) {
        el.classList.add("has-anim");
        sprite = document.createElement("span");
        sprite.className = "anim-sprite";
        el.querySelector(".actor-body").appendChild(sprite);
      }
      rigs.push({ m, el, seed: rand(0, 1), jumpAt: -9, fistAt: -9, anims, sprite, move: "", moveStart: 0 });
    });

    // ---------- moves ----------
    const ENERGY = { "Count-in": 0.3, Intro: 0.45, Verse: 0.65, "Pre-chorus": 0.75, Chorus: 1, Bridge: 0.7, Solo: 0.95, Breakdown: 0.85, Outro: 0.8, Live: 0.8 };
    let ext = null, lastSection = "", raf = 0, alive = true;
    const t0 = performance.now();
    const decay = (p, k) => Math.exp(-p * k);
    function pose(r, b, e) {
      const role = r.m.role, n = Math.floor(b), p = b - n, hit = decay(p, 6), side = n % 2 ? 1 : -1;
      const v = { k: 1 - 0.03 * e * hit, lean: 0, nod: 0, hy: 0, jump: 0, sl: 0, sr: 0, cr: 0 };
      if (role === "guitar" || role === "bass") {
        v.hy = (1 + 2.2 * e) * hit; v.nod = side * (2 + 5 * e) * hit;
        v.lean = Math.sin((b + r.seed) * Math.PI / 2) * (1 + 2.5 * e) * (r.m.guest ? 1 : 0.6);
      } else if (role === "vocals") {
        v.lean = Math.sin((b + r.seed) * Math.PI / 2) * (1.5 + 3.5 * e); v.nod = Math.sin(b * Math.PI) * (1 + 2 * e); v.hy = 0.8 * e * hit;
      } else if (role === "drums") {
        v.k = 1 - 0.045 * e * hit; v.hy = (1 + 2 * e) * hit; v.nod = side * (2 + 4 * e) * hit;
        const h8 = b * 2, q = Math.floor(h8), hp = decay(h8 - q, 8);
        v.sl = q % 2 === 0 ? 38 * hp : 4; v.sr = q % 2 === 1 ? -38 * hp : -4;
        v.cr = n % 4 === 0 ? Math.sin(p * 30) * 9 * decay(p, 3) * e : 0;
      } else {
        v.hy = 1.2 * e * hit; v.nod = Math.sin((b + r.seed) * Math.PI / 2) * (1 + 2 * e); v.lean = Math.sin(b * Math.PI / 4) * 1.5 * e;
      }
      const jt = b - r.jumpAt;
      if (jt >= 0 && jt < 1) { v.jump = -9 * Math.sin(Math.PI * jt); v.k = jt < 0.15 || jt > 0.85 ? 0.95 : 1; }
      return v;
    }
    // which clip a character plays: jump into the chorus, a fist to the crowd after a great run,
    // headbang or dance in the chorus, the singer working the crowd in quiet parts, else playing
    function moveFor(r, b, section) {
      const has = (k) => r.anims[k];
      if (b - r.jumpAt >= 0 && b - r.jumpAt < 2 && has("jump")) return "jump";
      if (b - r.fistAt >= 0 && b - r.fistAt < 4 && has("fist")) return "fist";
      if (section === "Chorus" || section === "Solo") return has("headbang") && (r.m.role !== "vocals" || !has("dance")) ? "headbang" : has("dance") ? "dance" : "play";
      if ((section === "Bridge" || section === "Breakdown" || (r.m.role === "vocals" && Math.floor(b / 16) % 2 === 1)) && has("crowd")) return "crowd";
      return "play";
    }
    function drawClip(r, b, section) {
      const mv = moveFor(r, b, section), c = r.anims[mv];
      if (mv !== r.move) {
        r.move = mv; r.moveStart = Math.floor(b);
        const a = r.m.aspect, bx = c.box, st = r.sprite.style;
        Object.assign(st, { backgroundImage: `url(${c.file})`, backgroundSize: `${c.frames * 100}% 100%`,
          left: `calc(50% + ${(bx.left / a) * 100}%)`, top: `${100 + bx.top * 100}%`, width: `${(bx.width / a) * 100}%`, height: `${bx.height * 100}%` });
      }
      const f = Math.floor((((b - r.moveStart) / c.beats) % 1) * c.frames);
      r.sprite.style.backgroundPositionX = `${(f / (c.frames - 1)) * 100}%`;
    }
    function tick(now) {
      if (!alive) return;
      const live = ext && now - ext.at < 400;
      // between songs the band noodles along at 92 BPM
      const b = live ? ext.beat + (now - ext.at) / 1000 / ext.spb : (now - t0) / 1000 / (60 / 92);
      const e = live ? (ENERGY[ext.section] ?? 0.7) : 0.25;
      if (live && ext.section !== lastSection) {
        if (ext.section === "Chorus" || ext.section === "Solo") rigs.forEach((r, i) => { if (r.m.role !== "drums" && r.m.role !== "keys") r.jumpAt = Math.ceil(b) + i * 0.15; });
        lastSection = ext.section;
      }
      rigs.forEach((r) => {
        const st = r.el.style;
        if (reduced()) return;   // .reduce-motion turns the rig transforms off in CSS
        if (r.sprite) { drawClip(r, Math.max(0, b), live ? ext.section : ""); return; }
        const v = pose(r, Math.max(0, b), e);
        st.setProperty("--k", v.k.toFixed(4)); st.setProperty("--lean", v.lean.toFixed(2) + "deg"); st.setProperty("--nod", v.nod.toFixed(2) + "deg");
        st.setProperty("--hy", v.hy.toFixed(2) + "%"); st.setProperty("--jump", v.jump.toFixed(2) + "%");
        st.setProperty("--sl", v.sl.toFixed(1) + "deg"); st.setProperty("--sr", v.sr.toFixed(1) + "deg"); st.setProperty("--cr", v.cr.toFixed(1) + "deg");
      });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    function cheer(id) {
      const body = actors[id] && actors[id].querySelector(".actor-body");
      if (!body || reduced()) return;
      body.classList.remove("cheer"); void body.offsetWidth; body.classList.add("cheer");
      setTimeout(() => body.classList.remove("cheer"), 700);
    }
    const cheerAll = () => members.forEach((m, i) => setTimeout(() => cheer(m.id), i * 90));

    // Music notes drift up from a random player while idle.
    let noteTimer = null;
    function startNotes() {
      if (reduced()) return;
      const loop = () => {
        const m = members[Math.floor(Math.random() * members.length)];
        const s = scene.slots[m.role];
        note(box, s.x, s.y - s.h * 0.85, m.color);
        noteTimer = setTimeout(loop, rand(800, 1700));
      };
      loop();
    }
    if (opts.ambience) startNotes();

    return {
      box, cheer, cheerAll,
      setLive(on) { box.classList.toggle("live", on); },
      // called every frame during a gig: song position in beats, seconds per beat, section name
      setBeat(beat, spb, section) { ext = { beat, spb, section, at: performance.now() }; },
      jump(role) { rigs.forEach((r) => { if (!role || r.m.role === role) r.jumpAt = (ext ? ext.beat : 0) + 0.01; }); },
      fist() { rigs.forEach((r) => { r.fistAt = ext ? Math.ceil(ext.beat) : 0; }); },
      burst(label) {
        members.forEach((m, i) => setTimeout(() => {
          const s = scene.slots[m.role];
          for (let k = 0; k < 3; k++) setTimeout(() => note(box, s.x, s.y - s.h * 0.85, m.color), k * 150);
          if (label) floatText(box, s.x, s.y - s.h - 2, label, m.color);
        }, i * 90));
        cheerAll();
      },
      floatText: (x, y, text, color) => floatText(box, x, y, text, color),
      stop() { stopLoop(); clearTimeout(noteTimer); alive = false; cancelAnimationFrame(raf); }
    };
  }

  const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  function note(box, x, y, color) {
    if (reduced()) return;
    const el = document.createElement("div");
    el.className = "note";
    el.innerHTML = NOTE;
    Object.assign(el.style, { left: x + rand(-2, 2) + "%", top: y + "%", color, animationDuration: rand(1.8, 2.6) + "s" });
    el.style.setProperty("--sway", rand(-30, 30) + "px");
    box.appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }

  function floatText(box, x, y, text, color) {
    const el = document.createElement("div");
    el.className = "float-text";
    el.textContent = text;
    Object.assign(el.style, { left: x + "%", top: y + "%", color });
    box.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  function ambience(box, canvas, fx) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, drops = [], motes = [], raf = 0, alive = true;
    const newDrop = (r, anywhere) => ({ x: rand(r.x, r.x + r.w + 4), y: anywhere ? rand(r.y, r.y + r.h) : r.y - rand(0, 6), len: rand(1.2, 2.6), v: rand(0.9, 1.5) });
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth; h = box.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = fx.rain ? Array.from({ length: 80 }, () => newDrop(fx.rain, true)) : [];
      const d = fx.dust;
      motes = d ? Array.from({ length: 40 }, () => ({ x: rand(d.x, d.x + d.w), y: rand(d.y, d.y + d.h), vx: rand(-0.004, 0.004), vy: rand(-0.006, 0.002), r: rand(0.6, 2), t: rand(0, 6) })) : [];
    }
    const ro = new ResizeObserver(resize); ro.observe(box); resize();
    function tick() {
      if (!alive) return;
      ctx.clearRect(0, 0, w, h);
      if (!reduced()) {
        const r = fx.rain;
        if (r) {
          ctx.strokeStyle = "rgba(190, 210, 255, 0.45)"; ctx.lineWidth = 1.2; ctx.beginPath();
          drops.forEach((p, i) => {
            p.y += p.v; p.x -= p.v * 0.18;
            if (p.y > r.y + r.h) drops[i] = newDrop(r, false);
            const x = p.x / 100 * w, y = p.y / 100 * h;
            ctx.moveTo(x, y); ctx.lineTo(x - p.len * 0.18 / 100 * w, y + p.len / 100 * h);
          });
          ctx.stroke();
        }
        const d = fx.dust;
        if (d) motes.forEach((m) => {
          m.x += m.vx; m.y += m.vy; m.t += 0.02;
          if (m.y < d.y) m.y = d.y + d.h;
          if (m.x < d.x || m.x > d.x + d.w) m.vx *= -1;
          ctx.fillStyle = `rgba(255, 214, 150, ${0.25 + Math.sin(m.t) * 0.2})`;
          ctx.beginPath(); ctx.arc(m.x / 100 * w, m.y / 100 * h, m.r, 0, Math.PI * 2); ctx.fill();
        });
      }
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
  }

  return { mount };
})();
