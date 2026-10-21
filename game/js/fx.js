// Ambient life and action effects layered over the scene art.
// Everything is positioned in % of the scene, like the characters, so it tracks the art at any size.
window.FX = (() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let cam, stage, cfg, canvas, ctx, w = 0, h = 0;
  let drops = [], motes = [];
  let idleTimer = null;

  const rand = (a, b) => a + Math.random() * (b - a);

  function init(camEl, stageEl, sceneCfg) {
    cam = camEl; stage = stageEl; cfg = sceneCfg.fx || {};

    (cfg.lights || []).forEach((l) => {
      const g = document.createElement("div");
      g.className = "glow";
      Object.assign(g.style, {
        left: l.x + "%", top: l.y + "%", width: l.size + "%",
        "--glow": l.color, animationDuration: rand(2.5, 5) + "s", animationDelay: -rand(0, 5) + "s"
      });
      cam.appendChild(g);
    });

    canvas = document.createElement("canvas");
    canvas.className = "fx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    cam.appendChild(canvas);
    ctx = canvas.getContext("2d");
    new ResizeObserver(resize).observe(cam);
    resize();

    if (!reduced) {
      cam.classList.add("drift");
      requestAnimationFrame(tick);
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = cam.clientWidth; h = cam.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    drops = []; motes = [];
    const r = cfg.rain;
    if (r) for (let i = 0; i < 90; i++) drops.push(newDrop(r, true));
    const d = cfg.dust;
    if (d) for (let i = 0; i < 45; i++) motes.push({
      x: rand(d.x, d.x + d.w), y: rand(d.y, d.y + d.h),
      vx: rand(-0.004, 0.004), vy: rand(-0.006, 0.002), r: rand(0.6, 2), t: rand(0, 6)
    });
  }

  function newDrop(r, anywhere) {
    return {
      x: rand(r.x, r.x + r.w + 4), y: anywhere ? rand(r.y, r.y + r.h) : r.y - rand(0, 6),
      len: rand(1.2, 2.6), v: rand(0.9, 1.5)
    };
  }

  function tick() {
    ctx.clearRect(0, 0, w, h);
    const r = cfg.rain;
    if (r) {
      ctx.strokeStyle = "rgba(190, 210, 255, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      drops.forEach((p, i) => {
        p.y += p.v; p.x -= p.v * 0.18;
        if (p.y > r.y + r.h) drops[i] = newDrop(r, false);
        const x = p.x / 100 * w, y = p.y / 100 * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.len * 0.18 / 100 * w, y + p.len / 100 * h);
      });
      ctx.stroke();
    }
    const d = cfg.dust;
    if (d) motes.forEach((m) => {
      m.x += m.vx; m.y += m.vy; m.t += 0.02;
      if (m.y < d.y) m.y = d.y + d.h;
      if (m.x < d.x || m.x > d.x + d.w) m.vx *= -1;
      ctx.fillStyle = `rgba(255, 214, 150, ${0.25 + Math.sin(m.t) * 0.2})`;
      ctx.beginPath();
      ctx.arc(m.x / 100 * w, m.y / 100 * h, m.r, 0, Math.PI * 2);
      ctx.fill();
    });
    requestAnimationFrame(tick);
  }

  // ---------- one-shot effects ----------
  function floatText(x, y, text, color) {
    const el = document.createElement("div");
    el.className = "float-text";
    el.textContent = text;
    Object.assign(el.style, { left: x + "%", top: y + "%", color });
    cam.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  function note(x, y, color) {
    if (reduced) return;
    const el = document.createElement("div");
    el.className = "note";
    el.innerHTML = NOTE;
    Object.assign(el.style, {
      left: x + rand(-2, 2) + "%", top: y + "%", color,
      "--sway": rand(-30, 30) + "px", animationDuration: rand(1.8, 2.6) + "s"
    });
    cam.appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }

  function burst(members, label) {
    members.forEach((m, i) => setTimeout(() => {
      for (let k = 0; k < 3; k++) setTimeout(() => note(m.tag.x, m.tag.y + 10, m.color), k * 160);
      if (label) floatText(m.tag.x, m.tag.y - 2, label(m), m.color);
    }, i * 90));
  }

  // The band "jams" while idle: notes drift up from a random member every so often.
  function startIdle(getMembers) {
    if (reduced) return;
    const loop = () => {
      const ms = getMembers();
      const m = ms[Math.floor(Math.random() * ms.length)];
      note(m.tag.x, m.tag.y + 12, m.color);
      idleTimer = setTimeout(loop, rand(700, 1600));
    };
    loop();
  }

  function chipPop(chipEl, text) {
    if (!chipEl) return;
    const el = document.createElement("span");
    el.className = "chip-pop";
    el.textContent = text;
    chipEl.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  // Gig: lights go down, spotlights sweep, flash on the drop. Resolves when the show is over.
  function gig(members) {
    return new Promise((done) => {
      const show = document.createElement("div");
      show.className = "gig-show";
      show.innerHTML = '<div class="spot spot--a"></div><div class="spot spot--b"></div><div class="gig-flash"></div><div class="gig-title">LIVE AT THE CRANE BAR</div>';
      stage.appendChild(show);
      if (!reduced) {
        const t = setInterval(() => burst([members[Math.floor(Math.random() * members.length)]]), 220);
        setTimeout(() => clearInterval(t), 2200);
        cam.classList.add("shake");
      }
      setTimeout(() => {
        cam.classList.remove("shake");
        show.classList.add("out");
        setTimeout(() => { show.remove(); done(); }, 400);
      }, reduced ? 600 : 2600);
    });
  }

  return { init, floatText, note, burst, startIdle, chipPop, gig };
})();
