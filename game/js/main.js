(() => {
  const DATA = window.AMPED_DATA;
  const A = window.AmpedAudio;
  const SAVE_KEY = "amped.save.v3";
  const $ = (sel, el = document) => el.querySelector(sel);
  const icon = (name) => `<span class="icon" style="-webkit-mask-image:url(assets/icons/${name}.svg);mask-image:url(assets/icons/${name}.svg)"></span>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

  // ---------- state ----------
  function fresh() {
    return {
      v: DATA.saveVersion,
      band: { ...DATA.band },
      res: { ...DATA.start },
      members: DATA.members.map((m) => ({ id: m.id, stats: { ...m.stats }, energy: m.energy, morale: m.morale })),
      songs: DATA.starterSongs.map((s) => ({ ...s })),
      gigs: { played: 0, wins: 0, best: 0, lastId: null },
      next: { song: DATA.starterSongs[0].id, role: "guitar", difficulty: "easy" },
      settings: { music: 0.7, sfx: 0.8, offsetMs: 0, calibrated: false, keys: ["d", "f", "j", "k"], motion: "system" }
    };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      return s && s.v === DATA.saveVersion ? s : null;
    } catch { return null; }
  }
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* private mode: play without saving */ }
  }

  let state = load() || fresh();
  // Recorded songs (covers) and menu music, listed in assets/music/index.json at boot.
  let TRACKS = [];
  const coverId = (t) => "c-" + t.id;
  function ensureCovers() {
    // drop covers whose recording was removed from the game, then add any new ones
    state.songs = state.songs.filter((x) => !x.cover || TRACKS.some((t) => t.id === x.cover));
    if (!state.songs.some((x) => x.id === state.next.song)) state.next.song = state.songs[0].id;
    TRACKS.filter((t) => t.role === "gig").forEach((t) => {
      if (!state.songs.some((x) => x.id === coverId(t))) {
        state.songs.push({ id: coverId(t), title: t.title, cover: t.id, artist: t.artist, quality: 60, practice: 0 });
      }
    });
  }
  let view = "hq";
  let hqScene = null;

  const def = (id) => DATA.members.find((m) => m.id === id);
  const members = () => state.members.map((m) => ({ ...def(m.id), ...m }));
  const member = (id) => members().find((m) => m.id === id);
  const raw = (id) => state.members.find((m) => m.id === id);
  const avg = (key) => state.members.reduce((s, m) => s + m.stats[key], 0) / state.members.length;
  const avgEnergy = () => Math.round(state.members.reduce((s, m) => s + m.energy, 0) / state.members.length);
  const minEnergy = () => Math.min(...state.members.map((m) => m.energy));
  const tired = (cost) => state.members.filter((m) => m.energy < cost).map((m) => def(m.id).name);
  const song = (id) => state.songs.find((s) => s.id === id) || state.songs[0];

  // ---------- motion & audio settings ----------
  function applySettings() {
    const sysReduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reduce = state.settings.motion === "reduce" || (state.settings.motion === "system" && sysReduce);
    document.documentElement.classList.toggle("reduce-motion", reduce);
    A.setVolumes(state.settings.music, state.settings.sfx);
  }

  // ---------- shell ----------
  const TITLES = {
    hq: "Home, loud home.", band: "Your band.", gigs: "Book a gig.", music: "Make some noise.", shop: "Better gear."
  };
  const RESOURCES = [
    { key: "cash", icon: "cash", label: "Cash", fmt: (v) => "€" + v.toLocaleString() },
    { key: "fans", icon: "fans", label: "Fans", fmt: (v) => v.toLocaleString() },
    { key: "fame", icon: "fame", label: "Fame level", fmt: (v) => String(v) },
    { key: "energy", icon: "energy", label: "Band energy", fmt: (v) => v + "%" }
  ];
  const shown = {};
  const resValue = (key) => (key === "energy" ? avgEnergy() : state.res[key]);

  function buildResources() {
    $("#resources").innerHTML = RESOURCES.map((r) => `
      <li class="res" data-res="${r.key}">${icon(r.icon)}<span class="sr-only">${r.label}: </span><span data-val>${r.fmt(resValue(r.key))}</span></li>`).join("");
    RESOURCES.forEach((r) => { shown[r.key] = resValue(r.key); });
  }
  function updateResources() {
    RESOURCES.forEach((r) => {
      const el = $(`[data-res="${r.key}"]`);
      const from = shown[r.key], to = resValue(r.key);
      if (from === to) return;
      tween($("[data-val]", el), from, to, r.fmt);
      const pop = document.createElement("span");
      pop.className = "res-pop " + (to > from ? "up" : "down");
      pop.textContent = (to > from ? "+" : "") + (to - from);
      el.appendChild(pop);
      setTimeout(() => pop.remove(), 1200);
      shown[r.key] = to;
    });
  }
  function tween(el, from, to, fmt) {
    const start = performance.now(), dur = 600;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function commit() { save(); updateResources(); }

  function go(next, focus) {
    if (hqScene) { hqScene.stop(); hqScene = null; }
    view = next;
    $("#head-eyebrow").textContent = state.band.name;
    $("#head-title").textContent = TITLES[view];
    document.querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === view;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    document.body.dataset.view = view;
    VIEWS[view]($("#view"));
    if (focus) $("#view").focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  }

  // ---------- views ----------
  const VIEWS = {
    hq(el) {
      const venue = DATA.venues.pub;
      const wins = Math.min(state.gigs.wins, DATA.goal.target);
      const lowP = tired(DATA.costs.practice);
      el.innerHTML = `
        <section class="hq">
          <div class="scene-card">
            <div class="scene-host" id="hq-scene"></div>
            <span class="badge badge-on-art">${DATA.scenes.garage.label}</span>
          </div>
          <div class="hq-panel">
            <span class="badge">Act 1 · The Garage</span>
            <h2 class="display">Small room.<br>Big plans.</h2>
            <article class="card gig-card">
              <h3>Your next gig</h3>
              <p class="muted">${venue.name} · Day ${state.res.day}</p>
              <div class="chips">
                <span class="chip">${icon("mic")}${venue.tags[0]}</span>
                <span class="chip">${icon("fans")}${venue.tags[1]}</span>
              </div>
              <div class="progress-row"><span>${DATA.goal.label}</span><span>${wins} / ${DATA.goal.target}</span></div>
              <div class="meter"><i style="width:${100 * wins / DATA.goal.target}%"></i></div>
              <button class="btn btn-primary" type="button" data-act="book">Book the pub ${icon("arrow")}</button>
            </article>
            <div class="action-row">
              <button class="btn" type="button" data-act="practice" ${lowP.length ? "disabled" : ""}>${icon("guitar")}Practice</button>
              <button class="btn" type="button" data-act="write">${icon("record")}Write a song</button>
              <button class="btn" type="button" data-act="rest">${icon("moon")}Rest day</button>
            </div>
            <p class="small muted" id="hq-hint">${lowP.length ? `Too tired to practise: ${lowP.join(", ")}. Take a rest day.` : `Practice costs ${DATA.costs.practice} energy each and makes your songs tighter on stage.`}</p>
          </div>
        </section>`;
      hqScene = window.AmpedScene.mount($("#hq-scene"), {
        scene: DATA.scenes.garage, members: members(), ambience: true, drift: true, onTap: (m) => openMember(m.id)
      });
      el.onclick = (e) => {
        const b = e.target.closest("[data-act]");
        if (!b || b.disabled) return;
        ({ book: () => go("gigs", true), write: () => go("music", true), practice, rest: restDay })[b.dataset.act]();
      };
    },

    band(el) {
      el.innerHTML = `
        <section class="band">
          <span class="badge">5 musicians</span>
          <p class="muted">Different talents. Same impossible dream.</p>
          <ul class="roster">
            ${members().map((m) => `
              <li>
                <button class="card roster-card" type="button" data-member="${m.id}" style="--c:${m.color}">
                  <img src="${m.sprite}" alt="">
                  <span class="roster-text">
                    <strong>${m.roleLabel}</strong>
                    <span class="muted">${esc(m.name)} · ${m.line}</span>
                    <span class="mini-meter" aria-label="Energy ${m.energy}%"><i style="width:${m.energy}%"></i></span>
                  </span>
                  ${icon("arrow")}
                </button>
              </li>`).join("")}
          </ul>
        </section>`;
      el.onclick = (e) => { const b = e.target.closest("[data-member]"); if (b) openMember(b.dataset.member); };
    },

    music(el) {
      const W = DATA.songwriting;
      const crt = Math.round(avg("creativity"));
      const low = tired(DATA.costs.write);
      el.innerHTML = `
        <section class="music">
          <span class="badge">New song</span>
          <h2 class="display">What are we<br>trying to say?</h2>
          <form class="stack" id="write-form" novalidate>
            <label class="field"><span>Song title</span><input name="title" maxlength="40" autocomplete="off" required placeholder="Name your song"></label>
            <fieldset class="field"><legend>Theme</legend><div class="chips">${W.themes.map((t, i) => `<label class="pick"><input type="radio" name="theme" value="${t}" ${i === 1 ? "checked" : ""}><span>${t}</span></label>`).join("")}</div></fieldset>
            <fieldset class="field"><legend>Style</legend><div class="chips">${W.styles.map((s, i) => `<label class="pick"><input type="radio" name="style" value="${s}" ${i === 1 ? "checked" : ""}><span>${s}</span></label>`).join("")}</div></fieldset>
            <div class="card">
              <h3>The band brings</h3>
              <p class="muted">Creativity ${crt}. Some combinations of theme and style work better than others. Try them and see.</p>
            </div>
            <div class="card">
              <h3>Writing session</h3>
              <div class="chips"><span class="chip">${icon("clock")}1 day</span><span class="chip">${icon("energy")}${DATA.costs.write} energy each</span></div>
            </div>
            <p class="small error" id="write-error" role="alert">${low.length ? `Too tired to write: ${low.join(", ")}.` : ""}</p>
            <button class="btn btn-primary" type="submit" ${low.length ? "disabled" : ""}>Start writing ${icon("arrow")}</button>
          </form>
          <h3 class="section-title">Your songs</h3>
          <ul class="song-list">
            ${state.songs.filter((s) => !s.cover).map((s) => `
              <li class="card song-row">
                <span><strong>${esc(s.title)}</strong><span class="muted small">${s.theme} · ${s.style} · practised ${s.practice}/5</span></span>
                <span class="song-q" aria-label="Quality ${s.quality}"><span class="mini-meter"><i style="width:${s.quality}%"></i></span><b>${s.quality}</b></span>
              </li>`).join("")}
          </ul>
          <h3 class="section-title">Covers you can play</h3>
          <p class="small muted">Real recordings, free to use. Playing them builds skill and hype; your own songs grow your name.</p>
          <ul class="song-list">
            ${state.songs.filter((s) => s.cover).map((s) => `
              <li class="card song-row">
                <span><strong>${esc(s.title)}</strong><span class="muted small">Cover · ${esc(s.artist)} · practised ${s.practice}/5</span></span>
                ${icon("record")}
              </li>`).join("")}
          </ul>
        </section>`;
      $("#write-form").onsubmit = (e) => { e.preventDefault(); writeSong(new FormData(e.target)); };
    },

    gigs(el) {
      const venue = DATA.venues.pub;
      const n = state.next;
      const low = tired(DATA.costs.gig);
      el.innerHTML = `
        <section class="gigs">
          <article class="card venue-card">
            <img class="venue-img" src="${DATA.scenes.pub.src}" alt="">
            <div class="venue-body">
              <span class="badge">Pub · Act 1</span>
              <h2>${venue.name}</h2>
              <div class="chips"><span class="chip">${icon("ticket")}€${venue.ticket} tickets</span><span class="chip">${icon("fans")}${venue.capacity} capacity</span></div>
            </div>
          </article>
          <form class="stack" id="gig-form">
            <fieldset class="field"><legend>Song</legend>
              <div class="stack-sm">${state.songs.map((s) => `
                <label class="pick pick-row"><input type="radio" name="song" value="${s.id}" ${s.id === n.song ? "checked" : ""}>
                  <span><strong>${esc(s.title)}</strong><em class="muted small">${s.cover ? `Cover · ${esc(s.artist)}` : `Your song · quality ${s.quality}`} · practised ${s.practice}/5</em></span></label>`).join("")}
              </div>
            </fieldset>
            <fieldset class="field"><legend>Your part</legend>
              <div class="chips">${members().map((m) => `<label class="pick"><input type="radio" name="role" value="${m.role}" ${m.role === n.role ? "checked" : ""}><span>${m.roleLabel}</span></label>`).join("")}</div>
              <span class="small muted">Each part has its own chart.</span>
            </fieldset>
            <fieldset class="field"><legend>Difficulty</legend>
              <div class="chips">${Object.entries(DATA.rhythm.difficulties).map(([k, d]) => `<label class="pick"><input type="radio" name="difficulty" value="${k}" ${k === n.difficulty ? "checked" : ""}><span>${d.label}</span></label>`).join("")}</div>
              <span class="small muted">Harder charts pay more, and lose the crowd faster.</span>
            </fieldset>
            <div class="card">
              <h3>Before you go on</h3>
              <div class="chips"><span class="chip">${icon("energy")}${DATA.costs.gig} energy each</span><span class="chip">${icon("clock")}1 day</span><span class="chip">${icon("settings")}Timing ${state.settings.calibrated ? `${state.settings.offsetMs > 0 ? "+" : ""}${state.settings.offsetMs} ms` : "not calibrated"}</span></div>
              <p class="small muted">Crowd starts at ${crowdStart(song(n.song))}% energy (practice raises this). Your player's skill makes timing a little more forgiving.</p>
              <p class="small muted">Keys ${state.settings.keys.map((k) => k.toUpperCase()).join(" ")} or tap the lanes. Sound on.</p>
            </div>
            <p class="small error" role="alert">${low.length ? `Too tired to play: ${low.join(", ")}. Take a rest day first.` : ""}</p>
            <button class="btn btn-primary" type="submit" ${low.length ? "disabled" : ""}>Play the gig ${icon("play")}</button>
          </form>
        </section>`;
      $("#gig-form").onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        state.next = { song: f.get("song"), role: f.get("role"), difficulty: f.get("difficulty") };
        save();
        if (!state.settings.calibrated && !sessionSkipCalibration) openCalibration(true);
        else startGig();
      };
    },

    shop(el) {
      el.innerHTML = `
        <section class="shop">
          <article class="card locked-card">
            ${icon("lock")}
            <h2>The gear shop is not open yet.</h2>
            <p class="muted">Instruments, amps, studio kit, transport, stage effects, merch and crew arrive in a later milestone. Gear will change how gigs play, not just how they look.</p>
          </article>
        </section>`;
    }
  };

  // ---------- HQ actions ----------
  function practice() {
    const c = DATA.costs.practice;
    if (tired(c).length) return toast("Someone's exhausted. Take a rest day.");
    state.members.forEach((m) => { m.stats.skill = clamp(m.stats.skill + 1 + Math.floor(Math.random() * 3)); m.energy = clamp(m.energy - c); });
    state.songs.forEach((s) => { s.practice = Math.min(5, s.practice + 1); });
    state.res.day += 1;
    commit();
    hqScene && hqScene.burst("Skill up!");
    toast("Tight rehearsal. Skill up, and every song is a bit tighter.");
    setTimeout(() => view === "hq" && go("hq"), 1400);
  }
  function restDay() {
    state.members.forEach((m) => { m.energy = clamp(m.energy + DATA.costs.restGain); m.morale = clamp(m.morale + 3); });
    state.res.day += 1;
    commit();
    toast("A lazy day. Everyone feels better.");
    go("hq");
  }
  function writeSong(f) {
    const title = String(f.get("title") || "").trim();
    const err = $("#write-error");
    if (!title) { err.textContent = "Give your song a title."; $("[name=title]").focus(); return; }
    if (state.songs.some((s) => s.title.toLowerCase() === title.toLowerCase())) { err.textContent = "You already have a song with that title."; return; }
    const c = DATA.costs.write;
    if (tired(c).length) { err.textContent = "The band is too tired to write."; return; }
    const theme = f.get("theme"), style = f.get("style");
    const combo = DATA.songwriting.combos[`${theme}|${style}`] || 0;
    const quality = clamp(Math.round(avg("creativity") * 0.8 + combo + Math.random() * 12), 5, 100);
    state.songs.push({ id: "s-" + Date.now().toString(36), title, theme, style, quality, practice: 0 });
    state.members.forEach((m) => { m.energy = clamp(m.energy - c); m.stats.creativity = clamp(m.stats.creativity + 1); });
    state.res.day += 1;
    commit();
    toast(combo ? `"${title}" written. Quality ${quality}. That combination clicked!` : `"${title}" written. Quality ${quality}.`);
    go("music");
  }

  // ---------- member sheet ----------
  function openMember(id) {
    const dlg = $("#member-sheet");
    const render = () => {
      const m = member(id);
      const rows = { ...m.stats, energy: m.energy, morale: m.morale };
      const labels = { ...DATA.statLabels, energy: "Energy", morale: "Morale" };
      const canTrain = state.res.cash >= DATA.costs.train && m.energy >= DATA.costs.trainEnergy;
      dlg.style.setProperty("--c", m.color);
      dlg.innerHTML = `
        <div class="sheet-head">
          <img class="sheet-thumb" src="${m.sprite}" alt="">
          <div><h2 id="member-name">${esc(m.name)}</h2><span class="eyebrow">${m.roleLabel}</span></div>
          <button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button>
        </div>
        <p class="muted">${m.bio}</p>
        <dl class="stats">${Object.keys(rows).map((k) => `<dt>${labels[k]}</dt><dd><span class="mini-meter"><i style="width:${rows[k]}%"></i></span><b>${rows[k]}</b></dd>`).join("")}</dl>
        <div class="action-row two">
          <button class="btn" type="button" data-m="train" ${canTrain ? "" : "disabled"}>${icon("guitar")}Lesson · €${DATA.costs.train}</button>
          <button class="btn" type="button" data-m="rest" ${m.energy >= 100 ? "disabled" : ""}>${icon("moon")}Nap</button>
        </div>
        <p class="small muted">${canTrain ? `A lesson gives +4 skill and costs ${DATA.costs.trainEnergy} energy.` : state.res.cash < DATA.costs.train ? "Not enough cash for a lesson." : "Too tired for a lesson."}</p>`;
    };
    render();
    dlg.onclick = (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
      const b = e.target.closest("[data-m]");
      if (!b || b.disabled) return;
      const m = raw(id);
      if (b.dataset.m === "train") {
        state.res.cash -= DATA.costs.train;
        m.stats.skill = clamp(m.stats.skill + 4);
        m.energy = clamp(m.energy - DATA.costs.trainEnergy);
        toast(`${def(id).name} took a lesson. Skill +4.`);
      } else {
        m.energy = clamp(m.energy + 30);
        toast(`${def(id).name} had a nap. Energy +30.`);
      }
      commit();
      render();
    };
    dlg.onclose = () => { if (view === "hq" || view === "band") go(view); };
    dlg.showModal();
  }

  // ---------- gig ----------
  // Practised songs start with a warmer crowd.
  const crowdStart = (s) => Math.min(90, DATA.rhythm.crowd.start + s.practice * 4);
  let sessionSkipCalibration = false;
  async function startGig() {
    await A.unlock();
    applySettings();
    const n = state.next;
    const s = song(n.song);
    const m = members().find((x) => x.role === n.role);
    const gigId = "g-" + Date.now().toString(36);
    if (hqScene) { hqScene.stop(); hqScene = null; }
    A.menu.stop();
    $("#app").hidden = true;
    const layer = $("#stage-layer");
    layer.hidden = false;
    document.body.classList.add("on-stage");
    let track = null;
    if (!s.cover) {
      // load the band's recorded instruments for this song's style (the synth covers anything missing)
      layer.innerHTML = `<div class="loading" role="status"><img src="${DATA.scenes.pub.src}" alt=""><p>Tuning up…</p></div>`;
      await A.loadInstruments(A.instrumentsFor(window.AmpedComposer.compose(s)));
    }
    if (s.cover) {
      layer.innerHTML = `<div class="loading" role="status"><img src="${DATA.scenes.pub.src}" alt=""><p>Tuning up…</p></div>`;
      try {
        const meta = await fetch(`assets/music/${s.cover}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
        track = { meta, buffer: await A.load(meta.audio) };
      } catch (err) {
        leaveStage();
        toast("Couldn't load that song. Check your connection and try again.");
        go("gigs");
        return;
      }
    }
    window.AmpedRhythm.start(layer, {
      song: s, track, role: n.role, roleLabel: m.roleLabel, difficulty: n.difficulty,
      skill: m.stats.skill, crowdStart: crowdStart(s),
      settings: state.settings, scene: DATA.scenes.pub, members: members(),
      onFinish: (r) => showResults(applyGig(gigId, s, n, r), r, s),
      onQuit: () => { leaveStage(); toast("You left the stage. No pay, no energy spent."); go("gigs"); }
    });
  }
  function leaveStage() {
    const layer = $("#stage-layer");
    layer.hidden = true; layer.innerHTML = "";
    document.body.classList.remove("on-stage");
    $("#app").hidden = false;
    A.menu.resume();
  }

  // Applies rewards once per gig id, so a double click or reload can't pay twice.
  function applyGig(gigId, s, n, r) {
    if (state.gigs.lastId === gigId) return null;
    const venue = DATA.venues.pub;
    const diffMult = { easy: 1, normal: 1.3, hard: 1.6 }[n.difficulty];
    const stars = r.failed ? 0 : r.accuracy >= 0.95 ? 5 : r.accuracy >= 0.85 ? 4 : r.accuracy >= 0.7 ? 3 : r.accuracy >= 0.5 ? 2 : 1;
    const turnout = Math.round(venue.capacity * Math.min(1, 0.35 + state.res.fans / 150 + state.res.hype / 200));
    const before = { ...state.res };
    const reward = {
      stars, turnout,
      cash: r.failed ? 0 : Math.round(turnout * venue.ticket * (0.5 + 0.5 * r.accuracy) * diffMult * 0.5),
      fans: r.failed ? -Math.min(3, state.res.fans) : Math.round((4 + 20 * r.accuracy * r.accuracy) * diffMult * (1 + s.quality / 100)),
      hype: r.failed ? -8 : stars * 2
    };
    state.res.cash += reward.cash;
    state.res.fans += reward.fans;
    state.res.hype = clamp(state.res.hype + reward.hype);
    while (state.res.fans >= state.res.fame * 100) state.res.fame += 1;
    reward.fameUp = state.res.fame - before.fame;
    state.res.day += 1;
    state.members.forEach((m) => {
      m.energy = clamp(m.energy - DATA.costs.gig);
      m.morale = clamp(m.morale + (r.failed ? -8 : stars >= 4 ? 5 : 0));
    });
    state.gigs.played += 1;
    if (!r.failed) state.gigs.wins += 1;
    state.gigs.best = Math.max(state.gigs.best, r.score);
    state.gigs.lastId = gigId;
    save();
    return reward;
  }

  function showResults(reward, r, s) {
    const layer = $("#stage-layer");
    const venue = DATA.venues.pub;
    const stars = reward ? reward.stars : 0;
    const title = r.failed ? "Booed off." : ["", "Rough night.", "Not bad.", "Solid set.", "They loved it!", "Legendary!"][stars];
    const review = r.failed ? DATA.reviews.fail : DATA.reviews[stars];
    const wins = Math.min(state.gigs.wins, DATA.goal.target);
    const lowAgain = tired(DATA.costs.gig);
    const STAR = (on, i) => `<svg class="star ${on ? "on" : ""}" style="animation-delay:${i * 0.12}s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>`;
    layer.innerHTML = `
      <section class="results" aria-labelledby="results-title">
        <img class="results-bg" src="${DATA.scenes.pub.src}" alt="">
        <div class="panel results-panel">
          <span class="eyebrow">Gig result · ${venue.name}</span>
          <h2 id="results-title">${title}</h2>
          <div class="stars" role="img" aria-label="${stars} of 5 stars">${[0, 1, 2, 3, 4].map((i) => STAR(i < stars, i)).join("")}</div>
          <p class="review">${review}</p>
          <dl class="result-grid">
            <div><dt>Accuracy</dt><dd>${Math.round(r.accuracy * 100)}%</dd></div>
            <div><dt>Best streak</dt><dd>${r.maxStreak}</dd></div>
            <div><dt>Score</dt><dd>${r.score.toLocaleString()}</dd></div>
          </dl>
          <p class="small muted counts">Perfect ${r.counts.perfect} · Great ${r.counts.great} · Good ${r.counts.good} · Miss ${r.counts.miss} · ${esc(s.title)}</p>
          ${reward ? `
          <ul class="rewards">
            <li>${icon("cash")}<span>Cash</span><b class="${reward.cash ? "up" : ""}">+€${reward.cash}</b></li>
            <li>${icon("fans")}<span>Fans</span><b class="${reward.fans >= 0 ? "up" : "down"}">${reward.fans >= 0 ? "+" : ""}${reward.fans}</b></li>
            <li>${icon("hype")}<span>Hype</span><b class="${reward.hype >= 0 ? "up" : "down"}">${reward.hype >= 0 ? "+" : ""}${reward.hype}</b></li>
            ${reward.fameUp ? `<li>${icon("fame")}<span>Fame</span><b class="up">Level ${state.res.fame}!</b></li>` : ""}
          </ul>
          <p class="small muted">${reward.turnout} people came. Everyone used ${DATA.costs.gig} energy.</p>` : ""}
          <div class="progress-row"><span>${DATA.goal.label}</span><span>${wins} / ${DATA.goal.target}</span></div>
          <div class="meter"><i style="width:${100 * wins / DATA.goal.target}%"></i></div>
          <div class="action-row two">
            <button class="btn btn-primary" type="button" data-r="hq">Back to HQ ${icon("hq")}</button>
            <button class="btn" type="button" data-r="again" ${lowAgain.length ? "disabled" : ""}>Play again</button>
          </div>
          ${lowAgain.length ? `<p class="small muted">Too tired for another gig: ${lowAgain.join(", ")}.</p>` : ""}
        </div>
      </section>`;
    $("[data-r=hq]", layer).focus();
    layer.onclick = (e) => {
      const b = e.target.closest("[data-r]");
      if (!b || b.disabled) return;
      layer.onclick = null;
      leaveStage();
      buildResources();
      if (b.dataset.r === "again") startGig(); else go("hq", true);
    };
  }

  // ---------- settings ----------
  function openSettings() {
    const dlg = $("#settings-sheet");
    const S = state.settings;
    let capturing = -1;
    const render = () => {
      dlg.innerHTML = `
        <div class="sheet-head"><h2 id="settings-title">Settings</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button></div>
        <div class="stack">
          <label class="field"><span>Music volume <b>${Math.round(S.music * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value="${S.music}" data-s="music"></label>
          <label class="field"><span>Sound effects <b>${Math.round(S.sfx * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value="${S.sfx}" data-s="sfx"></label>
          <label class="field"><span>Timing offset <b>${S.offsetMs > 0 ? "+" : ""}${S.offsetMs} ms</b></span><input type="range" min="-200" max="200" step="5" value="${S.offsetMs}" data-s="offsetMs">
            <span class="small muted">Positive if you tend to hit late. Calibrate to set it for you.</span></label>
          <button class="btn" type="button" data-calibrate>${icon("clock")}Calibrate timing</button>
          <fieldset class="field"><legend>Lane keys</legend>
            <div class="chips">${S.keys.map((k, i) => `<button class="key-btn" type="button" data-key="${i}" aria-label="Lane ${i + 1} key, currently ${k.toUpperCase()}. Press to change">${capturing === i ? "Press a key…" : k.toUpperCase()}</button>`).join("")}</div>
          </fieldset>
          <label class="field"><span>Motion</span>
            <select data-s="motion">
              <option value="system" ${S.motion === "system" ? "selected" : ""}>Follow my device</option>
              <option value="reduce" ${S.motion === "reduce" ? "selected" : ""}>Reduce motion</option>
              <option value="full" ${S.motion === "full" ? "selected" : ""}>Full motion</option>
            </select></label>
          <details class="credits">
            <summary>Music credits</summary>
            <ul>${TRACKS.map((t) => `<li><strong>${esc(t.title)}</strong> by ${esc(t.artist)} · <a href="${t.licenseUrl}" target="_blank" rel="noopener">${esc(t.license)}</a> · <a href="${t.page}" target="_blank" rel="noopener">source</a>${t.changes ? `<br><span class="muted">${esc(t.changes)}</span>` : ""}</li>`).join("")}
              <li>Band instruments: <strong>GeneralUser GS</strong> SoundFont by S. Christian Collins · <a href="https://www.schristiancollins.com/generaluser" target="_blank" rel="noopener">source</a></li>
              <li>Songs and the menu theme are generated by the game.</li></ul>
          </details>
          <button class="btn btn-danger" type="button" data-reset>Reset progress</button>
        </div>`;
    };
    render();
    dlg.oninput = (e) => {
      const k = e.target.dataset.s;
      if (!k) return;
      S[k] = k === "motion" ? e.target.value : Number(e.target.value);
      if (k === "offsetMs") S.calibrated = true;
      applySettings(); save();
      const b = e.target.closest("label").querySelector("b");
      if (b) b.textContent = k === "offsetMs" ? `${S.offsetMs > 0 ? "+" : ""}${S.offsetMs} ms` : `${Math.round(S[k] * 100)}%`;
    };
    dlg.onchange = dlg.oninput;
    dlg.onkeydown = (e) => {
      if (capturing < 0) return;
      e.preventDefault();
      const k = e.key.toLowerCase();
      if (k === "escape") { capturing = -1; return render(); }
      if (!/^[a-z0-9;,.\/]$/.test(k)) return toast("Use a letter, number or ; , . /");
      if (S.keys.includes(k) && S.keys[capturing] !== k) return toast(`${k.toUpperCase()} is already used by another lane.`);
      S.keys[capturing] = k; capturing = -1; save(); render();
    };
    dlg.onclick = (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
      const kb = e.target.closest("[data-key]");
      if (kb) { capturing = Number(kb.dataset.key); render(); $(`[data-key="${capturing}"]`, dlg).focus(); return; }
      if (e.target.closest("[data-calibrate]")) { dlg.close(); openCalibration(false); return; }
      if (e.target.closest("[data-reset]")) {
        confirmAction("Reset all progress?", "Your band, songs, cash and fans go back to day 1. This cannot be undone.", "Reset", () => {
          const keep = state.settings;
          state = fresh(); state.settings = keep; save(); buildResources(); dlg.close(); go("hq"); toast("Progress reset.");
        });
      }
    };
    dlg.onclose = () => { if (view === "gigs") go("gigs"); };
    dlg.showModal();
  }

  function confirmAction(title, body, label, onYes) {
    const dlg = $("#confirm-sheet");
    dlg.innerHTML = `
      <h2 id="confirm-title">${title}</h2>
      <p class="muted">${body}</p>
      <div class="action-row two">
        <button class="btn" type="button" data-c="no">Cancel</button>
        <button class="btn btn-danger" type="button" data-c="yes">${label}</button>
      </div>`;
    dlg.onclick = (e) => {
      const b = e.target.closest("[data-c]");
      if (e.target === dlg || (b && b.dataset.c === "no")) return dlg.close();
      if (b && b.dataset.c === "yes") { dlg.close(); onYes(); }
    };
    dlg.showModal();
    $("[data-c=no]", dlg).focus();
  }

  // ---------- calibration ----------
  // Plays clicks on the audio clock and measures how early/late the player taps.
  function openCalibration(beforeGig) {
    const dlg = $("#calibrate-sheet");
    const BPM = 100, CLICKS = 12, WARMUP = 3;
    let clicks = [], taps = [], running = false, result = null;
    const render = () => {
      dlg.innerHTML = `
        <div class="sheet-head"><h2 id="calibrate-title">Timing check</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button></div>
        <p class="muted">Tap along to ${CLICKS} clicks. We measure how early or late you tap, so notes line up with what you hear on this device.</p>
        ${running ? `<button class="btn btn-primary tap-pad" type="button" data-tap>Tap on every click</button><p class="small muted">Or press Space.</p>`
          : result ? `<div class="card"><h3>${result.text}</h3><p class="muted small">${result.detail}</p></div>
            <div class="action-row two"><button class="btn" type="button" data-start>Try again</button><button class="btn btn-primary" type="button" data-save ${result.ok ? "" : "disabled"}>Use this</button></div>`
          : `<button class="btn btn-primary" type="button" data-start>${icon("play")}Start (sound on)</button>`}
        ${beforeGig && !running ? `<button class="btn btn-ghost" type="button" data-skip>Skip for now and play</button>` : ""}`;
    };
    async function begin() {
      await A.unlock(); applySettings();
      const spb = 60 / BPM, t0 = A.now() + 0.6;
      clicks = Array.from({ length: CLICKS }, (_, i) => t0 + i * spb);
      clicks.forEach((t, i) => A.click(t, i % 4 === 0));
      taps = []; running = true; result = null; render();
      $("[data-tap]", dlg).focus();
      setTimeout(finish, (CLICKS * spb + 1) * 1000);
    }
    function tap() { if (running) taps.push(A.now()); }
    function finish() {
      running = false;
      const spb = 60 / BPM;
      const diffs = taps.map((t) => {
        const nearest = clicks.reduce((a, c) => (Math.abs(c - t) < Math.abs(a - t) ? c : a), clicks[0]);
        return { d: t - nearest, i: clicks.indexOf(nearest) };
      }).filter((x) => x.i >= WARMUP && Math.abs(x.d) < spb * 0.45).map((x) => x.d).sort((a, b) => a - b);
      if (diffs.length < 4) {
        result = { ok: false, text: "Not enough taps.", detail: "Tap on each click you hear, then try again." };
      } else {
        const median = diffs[Math.floor(diffs.length / 2)];
        const ms = Math.round(median * 1000 / 5) * 5;
        result = { ok: true, ms, text: ms === 0 ? "Right on time." : `You tap ${Math.abs(ms)} ms ${ms > 0 ? "late" : "early"}.`, detail: `Offset will be ${ms > 0 ? "+" : ""}${ms} ms, measured from ${diffs.length} taps.` };
      }
      if (dlg.open) render();
    }
    render();
    dlg.onkeydown = (e) => { if (running && (e.code === "Space" || state.settings.keys.includes(e.key.toLowerCase()))) { e.preventDefault(); if (!e.repeat) tap(); } };
    dlg.onpointerdown = (e) => { if (e.target.closest("[data-tap]")) { e.preventDefault(); tap(); } };
    dlg.onclick = (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
      if (e.target.closest("[data-start]")) begin();
      if (e.target.closest("[data-save]")) {
        state.settings.offsetMs = result.ms; state.settings.calibrated = true; save(); dlg.close();
        toast(`Timing set to ${result.ms > 0 ? "+" : ""}${result.ms} ms.`);
        if (beforeGig) startGig();
      }
      if (e.target.closest("[data-skip]")) { sessionSkipCalibration = true; dlg.close(); startGig(); }
    };
    dlg.onclose = () => { running = false; if (view === "gigs" && !beforeGig) go("gigs"); };
    dlg.showModal();
  }

  // ---------- title & boot ----------
  function enterGame() {
    ensureCovers();
    save();
    $("#title").hidden = true;
    $("#app").hidden = false;
    buildResources();
    go("hq", true);
  }
  // Browsers only allow sound after the first tap or key press.
  // The menu plays the band's own theme: a generated instrumental rendered once, then looped.
  const MENU_THEME = { id: "menu-theme", title: "AMPED Theme", theme: "Love", style: "Ballad" };
  function startMenuMusicOnFirstGesture() {
    const onFirstGesture = async () => {
      document.removeEventListener("pointerdown", onFirstGesture, true);
      document.removeEventListener("keydown", onFirstGesture, true);
      await A.unlock(); applySettings();
      const menuTrack = TRACKS.find((t) => t.role === "menu");
      const source = menuTrack ? `assets/music/${menuTrack.id}.mp3` : () => {
        const arr = window.AmpedComposer.compose(MENU_THEME);
        return A.renderOffline({ ...arr, events: arr.events.filter((e) => e.part !== "vocals") }, 0);
      };
      if (!document.body.classList.contains("on-stage")) A.menu.play(source).catch(() => {});
    };
    document.addEventListener("pointerdown", onFirstGesture, true);
    document.addEventListener("keydown", onFirstGesture, true);
  }
  async function boot() {
    try { TRACKS = await fetch("assets/music/index.json").then((r) => r.json()); } catch { TRACKS = []; }
    startMenuMusicOnFirstGesture();
    applySettings();
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applySettings);
    const hasSave = !!load();
    const cont = $("#title-continue");
    cont.disabled = !hasSave;
    cont.textContent = hasSave ? `Continue · Day ${state.res.day}` : "Continue";
    cont.onclick = enterGame;
    $("#title-new").onclick = () => {
      const start = () => { const keep = state.settings; state = fresh(); state.settings = keep; enterGame(); };
      hasSave ? confirmAction("Start a new game?", "Your saved band will be replaced.", "Start over", start) : start();
    };
    (hasSave ? cont : $("#title-new")).focus();
    document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab, true)));
    $("#open-settings").onclick = openSettings;
  }
  boot();
})();
