// A backdrop with the band placed on it, plus code-drawn ambience (rain, light flicker, dust, notes).
// Characters are single static cutouts: movement here is whole-sprite bob/sway/squash only.
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

    const actors = {};
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
      el.innerHTML = `<span class="actor-shadow"></span><span class="actor-body anim-${m.anim}" style="animation-delay:-${rand(0, 2).toFixed(2)}s"><img src="${m.sprite}" alt="" draggable="false"></span>`;
      box.appendChild(el);
      actors[m.id] = el;
    });

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
      burst(label) {
        members.forEach((m, i) => setTimeout(() => {
          const s = scene.slots[m.role];
          for (let k = 0; k < 3; k++) setTimeout(() => note(box, s.x, s.y - s.h * 0.85, m.color), k * 150);
          if (label) floatText(box, s.x, s.y - s.h - 2, label, m.color);
        }, i * 90));
        cheerAll();
      },
      floatText: (x, y, text, color) => floatText(box, x, y, text, color),
      stop() { stopLoop(); clearTimeout(noteTimer); }
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
