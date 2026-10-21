(() => {
  const DATA = window.AMPED_DATA;
  const SAVE_KEY = "amped.save.v2";
  const $ = (id) => document.getElementById(id);

  const ICONS = {
    cash: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/>',
    fans: '<circle cx="9" cy="7" r="4"/><path d="M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M22 20v-1a4 4 0 0 0-3-3.9"/>',
    fame: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    hype: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 3s0-4 0-7z"/>',
    day: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
  };
  const RESOURCE_VIEW = [
    { key: "cash", color: "var(--amber)", fmt: (v) => "€" + v.toLocaleString() },
    { key: "fans", color: "var(--teal)", fmt: (v) => v.toLocaleString() + " fans" },
    { key: "fame", color: "var(--magenta)", fmt: (v) => "Fame " + v },
    { key: "hype", color: "#FF8A4C", fmt: (v) => v + "% hype" },
    { key: "day", color: "var(--lilac)", fmt: (v) => "Day " + v }
  ];

  // ---------- state ----------
  const fresh = () => JSON.parse(JSON.stringify({
    band: DATA.band, resources: DATA.resources, goal: DATA.goal, members: DATA.members, songs: []
  }));

  let state = load() || fresh();
  state.members.forEach((m) => {
    const def = DATA.members.find((d) => d.id === m.id);
    m.sprite = def.sprite;
    m.tag = { x: def.sprite.x, y: def.sprite.y - def.sprite.h - 1 };
  });
  let openMemberId = null;

  function load() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* private mode: play without saving */ }
  }

  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
  const avg = (key) => state.members.reduce((s, m) => s + m.stats[key], 0) / state.members.length;
  const member = (id) => state.members.find((m) => m.id === id);

  // ---------- render ----------
  const shown = {};
  function buildChips() {
    $("resources").innerHTML = RESOURCE_VIEW.map((r) => `
      <li class="chip" data-chip="${r.key}" style="color:${r.color}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[r.key]}</svg>
        <span style="color:var(--ink)">${r.fmt(state.resources[r.key])}</span>
      </li>`).join("");
    RESOURCE_VIEW.forEach((r) => { shown[r.key] = state.resources[r.key]; });
  }

  function tween(el, from, to, fmt) {
    const start = performance.now(), dur = 700;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderScene() {
    const scene = $("scene");
    scene.innerHTML = "";
    scene.style.setProperty("--beat", (60 / (DATA.scene.bpm || 110)) + "s");
    const cam = document.createElement("div");
    cam.className = "cam";
    scene.appendChild(cam);
    DATA.scene.layers.forEach((layer) => {
      const img = document.createElement("img");
      img.src = layer.src;
      img.alt = layer.alt || "";
      img.draggable = false;
      if (layer.backdrop) img.className = "backdrop";
      cam.appendChild(img);
    });
    FX.init(cam, document.querySelector(".stage"), DATA.scene);

    state.members.forEach((m) => {
      const sp = m.sprite;
      // Wrapper places the character (feet on the baseline); body handles the animation.
      const actor = document.createElement("button");
      actor.className = "actor";
      actor.dataset.member = m.id;
      actor.setAttribute("aria-label", `${m.name}, ${m.role}`);
      Object.assign(actor.style, { left: sp.x + "%", bottom: (100 - sp.y) + "%", height: sp.h + "%", zIndex: 10 + sp.z });
      actor.style.setProperty("--c", m.color);
      actor.innerHTML = `<span class="actor__shadow"></span>
        <span class="actor__body anim-${sp.anim}" style="animation-delay:-${(Math.random() * 2).toFixed(2)}s">
          <img src="${sp.src}" alt="" draggable="false">
        </span>`;
      // Match the button to the drawing's real proportions once it loads.
      actor.querySelector("img").addEventListener("load", (e) => {
        actor.style.aspectRatio = e.target.naturalWidth / e.target.naturalHeight;
      });
      actor.addEventListener("click", () => { cheer(m.id); openSheet(m.id); });
      cam.appendChild(actor);

      const tag = document.createElement("div");
      tag.className = "tag";
      tag.style.left = m.tag.x + "%";
      tag.style.top = m.tag.y + "%";
      tag.style.zIndex = 30;
      tag.style.setProperty("--c", m.color);
      tag.innerHTML = `<span class="tag__name">${m.name}</span><span class="tag__energy"><span data-energy="${m.id}"></span></span>`;
      cam.appendChild(tag);
    });
  }

  function cheer(id) {
    const body = document.querySelector(`[data-member="${id}"] .actor__body`);
    if (!body) return;
    body.classList.remove("cheer"); void body.offsetWidth; body.classList.add("cheer");
    setTimeout(() => body.classList.remove("cheer"), 700);
  }
  const cheerAll = () => state.members.forEach((m, i) => setTimeout(() => cheer(m.id), i * 90));

  function render(changed = []) {
    $("band-name").textContent = state.band.name;
    $("act").textContent = `Act ${state.band.act} · ${state.band.actTitle}`;

    RESOURCE_VIEW.forEach((r) => {
      const chip = document.querySelector(`[data-chip="${r.key}"]`);
      const from = shown[r.key], to = state.resources[r.key];
      if (from !== to) {
        tween(chip.querySelector("span"), from, to, r.fmt);
        if (changed.includes(r.key) && r.key !== "day") FX.chipPop(chip, (to > from ? "+" : "") + (to - from));
        chip.classList.remove("bump"); void chip.offsetWidth; chip.classList.add("bump");
        shown[r.key] = to;
      }
    });

    $("goal-label").textContent = state.goal.label;
    $("goal-count").textContent = `${state.goal.progress} / ${state.goal.target}`;
    $("goal-bar").style.width = (100 * state.goal.progress / state.goal.target) + "%";

    state.members.forEach((m) => {
      const el = document.querySelector(`[data-energy="${m.id}"]`);
      if (el) el.style.width = m.energy + "%";
    });
    document.querySelectorAll(".actor").forEach((a) => a.classList.toggle("is-active", a.dataset.member === openMemberId));

    const tired = state.members.some((m) => m.energy < DATA.costs.gigEnergy);
    document.querySelector('[data-action="gig"]').disabled = tired;
    if (openMemberId) renderSheet();
    save();
  }

  function renderSheet() {
    const m = member(openMemberId);
    const sheet = $("sheet");
    sheet.style.setProperty("--c", m.color);
    $("sheet-name").textContent = m.name;
    $("sheet-role").textContent = m.role;
    $("sheet-bio").textContent = m.bio;
    const rows = { ...m.stats, energy: m.energy, morale: m.morale };
    const labels = { ...DATA.statLabels, energy: "Energy", morale: "Morale" };
    $("sheet-stats").innerHTML = Object.keys(rows).map((k) => `
      <dt>${labels[k]}</dt>
      <dd><div class="bar"><div class="bar__fill" style="width:${rows[k]}%"></div></div><span class="num">${rows[k]}</span></dd>`).join("");
    const train = $("sheet-train");
    train.textContent = `Train · €${DATA.costs.trainCash}`;
    train.disabled = state.resources.cash < DATA.costs.trainCash || m.energy < DATA.costs.trainEnergy;
  }

  function openSheet(id) {
    openMemberId = id;
    $("sheet").hidden = false;
    render();
    $("sheet-close").focus();
  }
  function closeSheet() {
    openMemberId = null;
    $("sheet").hidden = true;
    render();
  }

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- actions ----------
  const actions = {
    practice() {
      if (state.members.some((m) => m.energy < DATA.costs.practiceEnergy)) return toast("Someone's exhausted. Let them rest.");
      state.members.forEach((m) => {
        m.stats.skill = clamp(m.stats.skill + 1 + Math.round(Math.random() * 2));
        m.energy = clamp(m.energy - DATA.costs.practiceEnergy);
      });
      state.resources.day += 1;
      FX.burst(state.members, () => "Skill up!");
      cheerAll();
      toast("Tight rehearsal. Everyone's skill went up.");
      render(["day"]);
    },
    write() {
      const quality = Math.round(avg("creativity") + Math.random() * 20);
      state.songs.push({ quality, day: state.resources.day });
      state.resources.hype = clamp(state.resources.hype + 5);
      state.resources.day += 1;
      FX.burst(state.members.filter((m) => m.id === "mika" || m.id === "nia"));
      FX.floatText(50, 40, `New song · quality ${quality}`, "var(--amber)");
      toast(`New song written. Quality ${quality}.`);
      render(["hype", "day"]);
    },
    async gig() {
      setBusy(true);
      document.querySelector(".scene").classList.add("live");
      cheerAll();
      await FX.gig(state.members);
      document.querySelector(".scene").classList.remove("live");
      setBusy(false);
      // Placeholder for the rhythm game: score comes from stats until it exists.
      const score = avg("skill") * 0.6 + avg("presence") * 0.4 + state.resources.hype * 0.2 + Math.random() * 15;
      const fans = Math.round(score / 2);
      const cash = Math.round(40 + score * 2);
      state.resources.fans += fans;
      state.resources.cash += cash;
      state.resources.hype = clamp(state.resources.hype + 3);
      state.resources.day += 1;
      state.members.forEach((m) => { m.energy = clamp(m.energy - DATA.costs.gigEnergy); });
      state.goal.progress = Math.min(state.goal.target, state.goal.progress + 1);
      if (state.resources.fans >= state.resources.fame * 150) state.resources.fame += 1;
      render(["fans", "cash", "hype", "day", "fame"]);
      showResult(score, fans, cash);
    }
  };

  function setBusy(on) {
    document.querySelectorAll("[data-action], .actor").forEach((b) => { b.disabled = on; });
  }

  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>';
  function showResult(score, fans, cash) {
    const stars = Math.max(1, Math.min(5, Math.round(score / 12)));
    const titles = ["Rough night", "Not bad", "Solid set", "The crowd loved it!", "Legendary!"];
    $("result-title").textContent = titles[stars - 1];
    $("result-stars").innerHTML = Array.from({ length: 5 }, (_, i) =>
      STAR.replace("<svg", `<svg class="${i < stars ? "on" : ""}" style="animation-delay:${i * 0.12}s"`)).join("");
    $("result-grid").innerHTML = `
      <div><dt>Fans</dt><dd style="color:var(--teal)">+${fans}</dd></div>
      <div><dt>Cash</dt><dd style="color:var(--amber)">+€${cash}</dd></div>
      <div><dt>Score</dt><dd>${Math.round(score)}</dd></div>`;
    $("result").showModal();
  }
  $("result-close").addEventListener("click", () => $("result").close());

  document.querySelectorAll("[data-action]").forEach((b) =>
    b.addEventListener("click", () => actions[b.dataset.action]()));

  $("sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openMemberId) closeSheet(); });

  $("sheet-train").addEventListener("click", () => {
    const m = member(openMemberId);
    state.resources.cash -= DATA.costs.trainCash;
    m.stats.skill = clamp(m.stats.skill + 4);
    m.energy = clamp(m.energy - DATA.costs.trainEnergy);
    FX.burst([m], () => "Skill +4");
    cheer(m.id);
    toast(`${m.name} took a lesson. Skill +4.`);
    render(["cash"]);
  });
  $("sheet-rest").addEventListener("click", () => {
    const m = member(openMemberId);
    m.energy = clamp(m.energy + 30);
    m.morale = clamp(m.morale + 5);
    FX.floatText(m.tag.x, m.tag.y, "Energy +30", m.color);
    toast(`${m.name} is recharged.`);
    render();
  });

  buildChips();
  renderScene();
  render();
  FX.startIdle(() => state.members);
})();
