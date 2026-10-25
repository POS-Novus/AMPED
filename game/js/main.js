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
      next: { song: DATA.starterSongs[0].id, role: "guitar", difficulty: "easy", venue: "pub" },
      venues: {},            // id -> { played, wins, stars }
      seen: ["street", "pub"],   // venues the player has already been shown as unlocked
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
  // saves from before the map: all earlier gigs were at the pub
  if (!state.venues) state.venues = { pub: { played: state.gigs.played, wins: state.gigs.wins, stars: 0 } };
  if (!state.seen) state.seen = ["street", "pub"];
  if (!state.next.venue) state.next.venue = "pub";
  if (!state.band.genre) state.band.genre = "rock";
  while (state.res.fans >= DATA.fameFans(state.res.fame + 1)) state.res.fame += 1;
  // Recorded songs (covers), listed in assets/music/index.json at boot.
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

  // ---------- the road (venues & unlocks) ----------
  const venueById = (id) => DATA.venues.find((v) => v.id === id) || DATA.venues[1];
  const vstate = (id) => state.venues[id] || { played: 0, wins: 0, stars: 0 };
  const ownSongs = () => state.songs.filter((x) => !x.cover).length;
  function requirements(v) {
    const n = v.needs || {}, out = [];
    if (n.fame) out.push({ label: `Fame level ${n.fame}`, ok: state.res.fame >= n.fame, have: `you're level ${state.res.fame}` });
    if (n.songs) out.push({ label: `${n.songs} songs of your own`, ok: ownSongs() >= n.songs, have: `you have ${ownSongs()}` });
    Object.entries(n.winsAt || {}).forEach(([id, count]) => {
      const w = vstate(id).wins;
      out.push({ label: `Win ${count} gig${count > 1 ? "s" : ""} at ${venueById(id).name}`, ok: w >= count, have: `${Math.min(w, count)} of ${count}` });
    });
    return out;
  }
  const unlocked = (v) => requirements(v).every((r) => r.ok);
  // the furthest stage the band has reached: where the van is parked on the map
  const frontier = () => [...DATA.venues].reverse().find(unlocked) || DATA.venues[0];
  const nextLocked = () => DATA.venues.find((v) => !unlocked(v));
  const toughLabel = (v) => (v.tough <= 0.9 ? "friendly" : v.tough <= 1.1 ? "fair" : v.tough <= 1.3 ? "demanding" : v.tough <= 1.5 ? "tough" : "brutal");
  function syncFame() {
    while (state.res.fans >= DATA.fameFans(state.res.fame + 1)) state.res.fame += 1;
  }

  // ---------- motion & audio settings ----------
  function applySettings() {
    const sysReduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reduce = state.settings.motion === "reduce" || (state.settings.motion === "system" && sysReduce);
    document.documentElement.classList.toggle("reduce-motion", reduce);
    A.setVolumes(state.settings.music, state.settings.sfx);
  }

  // ---------- shell ----------
  const TITLES = {
    hq: "Home, loud home.", band: "Your band.", map: "Road to Solstice.", gigs: "Book a gig.", music: "Make some noise.", shop: "Better gear."
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
    if (typeof studio !== "undefined" && next !== "music") studio.stop();
    view = next;
    $("#head-eyebrow").textContent = state.band.name;
    $("#head-title").textContent = TITLES[view];
    document.querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === (view === "gigs" ? "map" : view);
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
      const venue = frontier(), goal = nextLocked();
      const reached = DATA.venues.filter(unlocked).length;
      const lowP = tired(DATA.costs.practice);
      el.innerHTML = `
        <section class="hq">
          <div class="scene-card">
            <div class="scene-host" id="hq-scene"></div>
            <span class="badge badge-on-art">${DATA.scenes.garage.label}</span>
          </div>
          <div class="hq-panel">
            <span class="badge">Act ${venue.act} · ${DATA.acts[venue.act]}</span>
            <h2 class="display">Small room.<br>Big plans.</h2>
            <article class="card gig-card">
              <h3>Biggest stage so far</h3>
              <p class="muted">${venue.name} · ${venue.type} · Day ${state.res.day}</p>
              <div class="chips">
                <span class="chip">${icon("fans")}${venue.capacity.toLocaleString()} capacity</span>
                <span class="chip">${icon("map")}${reached} of ${DATA.venues.length} stages open</span>
              </div>
              ${goal ? `<p class="small muted">Next: <strong>${goal.name}</strong> · ${requirements(goal).filter((r) => !r.ok).map((r) => r.label).join(" · ")}</p>` : `<p class="small muted">Every stage is open. Headline Solstice.</p>`}
              <div class="meter"><i style="width:${100 * reached / DATA.venues.length}%"></i></div>
              <button class="btn btn-primary" type="button" data-act="book">Open the map ${icon("arrow")}</button>
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
        ({ book: () => go("map", true), write: () => go("music", true), practice, rest: restDay })[b.dataset.act]();
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
      studio.render(el);
    },

    gigs(el) {
      const n = state.next;
      const venue = venueById(n.venue);
      // parts with almost nothing to play in this song are switched off
      const arrNow = window.AmpedComposer.compose(song(n.song), state.band.genre);
      const secs = arrNow.beats * 60 / arrNow.bpm;
      const playable = (role) => window.AmpedComposer.chart(arrNow, role, "normal").length / secs >= 0.3;
      if (!playable(n.role)) n.role = "guitar";
      const low = tired(DATA.costs.gig);
      el.innerHTML = `
        <section class="gigs">
          <article class="card venue-card">
            <img class="venue-img" src="${DATA.scenes[venue.scene].src}" alt="">
            <div class="venue-body">
              <span class="badge">${venue.type} · Act ${venue.act}</span>
              <h2>${venue.name}</h2>
              <div class="chips"><span class="chip">${icon("ticket")}${venue.ticket ? `€${venue.ticket} tickets` : "Tips only"}</span><span class="chip">${icon("fans")}${venue.capacity.toLocaleString()} capacity</span><span class="chip">${icon("shield")}Crowd ${toughLabel(venue)}</span></div>
              <button class="btn btn-ghost" type="button" data-change-venue>${icon("map")}Change venue</button>
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
              <div class="chips">${members().map((m) => `<label class="pick ${playable(m.role) ? "" : "is-off"}"><input type="radio" name="role" value="${m.role}" ${m.role === n.role ? "checked" : ""} ${playable(m.role) ? "" : "disabled"}><span>${m.roleLabel}</span></label>`).join("")}</div>
              <span class="small muted">Each part has its own chart. ${members().filter((m) => !playable(m.role)).map((m) => m.roleLabel).join(", ") || "Every part"} ${members().some((m) => !playable(m.role)) ? "barely plays in this song." : "can be played."}</span>
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
      $("[data-change-venue]").onclick = () => go("map", true);
      $("#gig-form").onchange = (e) => { if (e.target.name === "song") { state.next.song = e.target.value; go("gigs"); } };
      $("#gig-form").onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        state.next = { ...state.next, song: f.get("song"), role: f.get("role"), difficulty: f.get("difficulty") };
        save();
        if (!state.settings.calibrated && !sessionSkipCalibration) openCalibration(true);
        else startGig();
      };
    },

    map(el) {
      const ROW = 150, X = [50, 28, 70, 32, 68, 30, 64, 34, 70, 30, 62, 50];
      const stops = [{ id: "garage", name: "The Garage", type: "Home", act: 1, scene: "garage" }, ...DATA.venues];
      const H = stops.length * ROW + 120;
      const pos = stops.map((v, i) => ({ x: X[i % X.length], y: H - 90 - i * ROW }));
      const here = frontier(), hereIdx = stops.findIndex((v) => v.id === here.id);
      const seg = (a, b) => `M${a.x} ${a.y} C${a.x} ${a.y - ROW / 2} ${b.x} ${b.y + ROW / 2} ${b.x} ${b.y}`;
      const done = pos.slice(0, hereIdx + 1).map((p, i) => (i ? seg(pos[i - 1], p) : "")).join(" ");
      const ahead = pos.slice(hereIdx).map((p, i, arr) => (i ? seg(arr[i - 1], p) : "")).join(" ");
      const fameNext = DATA.fameFans(state.res.fame + 1), fameNow = DATA.fameFans(state.res.fame);
      const actTops = {};
      // act titles sit beside the act's first stop, on the side away from it
      stops.forEach((v, i) => { if (v.id !== "garage" && actTops[v.act] === undefined) actTops[v.act] = { y: pos[i].y - 10, right: pos[i].x < 50 }; });
      el.innerHTML = `
        <section class="map">
          <div class="card map-head">
            <div class="progress-row"><span>Fame level ${state.res.fame}</span><span>${state.res.fans.toLocaleString()} / ${fameNext.toLocaleString()} fans</span></div>
            <div class="meter"><i style="width:${clamp(100 * (state.res.fans - fameNow) / (fameNext - fameNow))}%"></i></div>
            <p class="small muted">Win gigs to grow your fans. Fame opens bigger stages.</p>
          </div>
          <div class="map-board" style="height:${H}px">
            <svg class="map-path" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">
              <path class="ahead" d="${ahead}"/><path class="done" d="${done}"/>
            </svg>
            ${Object.entries(actTops).map(([act, t]) => `<div class="map-act ${t.right ? "on-right" : ""}" style="top:${t.y}px"><span>Act ${act}</span>${DATA.acts[act]}</div>`).join("")}
            ${stops.map((v, i) => {
              const isHome = v.id === "garage", open = isHome || unlocked(v), st = vstate(v.id);
              const isNew = !isHome && open && !state.seen.includes(v.id);
              const cls = ["map-node", open ? "is-open" : "is-locked", isNew ? "is-new" : "", v.type === "Festival" ? "is-fest" : "", i === hereIdx ? "is-here" : ""].join(" ");
              return `<button type="button" class="${cls}" data-stop="${v.id}" style="left:${pos[i].x}%;top:${pos[i].y}px" aria-label="${esc(v.name)}, ${v.type}${open ? "" : ", locked"}">
                <span class="map-thumb"><img src="${DATA.scenes[v.scene].src}" alt="" loading="lazy">${open ? "" : `<span class="map-lock">${icon("lock")}</span>`}</span>
                <span class="map-label"><strong>${esc(v.name)}</strong><small>${isHome ? "Your HQ" : `${v.type} · ${v.capacity.toLocaleString()}`}</small>
                  ${st.stars ? `<small class="map-stars">${"★".repeat(st.stars)}${"☆".repeat(5 - st.stars)}</small>` : ""}${isNew ? `<small class="map-new">New!</small>` : ""}</span>
              </button>`;
            }).join("")}
            <img class="map-band" src="${def("nia").sprite}" alt="" style="left:${pos[hereIdx].x}%;top:${pos[hereIdx].y}px">
          </div>
        </section>`;
      el.onclick = (e) => {
        const b = e.target.closest("[data-stop]");
        if (!b) return;
        if (b.dataset.stop === "garage") return go("hq", true);
        openVenue(b.dataset.stop);
      };
      // centre the band on screen, then mark newly opened stages as seen
      const band = $(".map-band", el);
      requestAnimationFrame(() => band.scrollIntoView({ block: "center" }));
      const newly = DATA.venues.filter((v) => unlocked(v) && !state.seen.includes(v.id)).map((v) => v.id);
      if (newly.length) { state.seen.push(...newly); save(); }
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
  // ---------- studio: write a song by building its groove ----------
  const C = window.AmpedComposer;
  const TONES = [
    { id: "clean", label: "Clean", hint: "Bright, no distortion" },
    { id: "crunch", label: "Crunch", hint: "Classic rock overdrive" },
    { id: "dist", label: "Distortion", hint: "Punk and hard rock" },
    { id: "metal", label: "Metal", hint: "High gain, tight chugs, low tuning" },
    { id: "synth", label: "Synth", hint: "Saw lead instead of guitar" }
  ];
  const KITS = [{ id: "power", label: "Rock kit" }, { id: "standard", label: "Standard kit" }, { id: "electronic", label: "Electronic kit" }];
  const CHORUS = [{ id: "open", label: "Open chords" }, { id: "double", label: "Double kick" }, { id: "half", label: "Half-time" }, { id: "four", label: "Four on the floor" }];
  const DRUM_ROWS = [{ id: "kick", label: "Kick" }, { id: "snare", label: "Snare / clap" }, { id: "hat", label: "Hi-hat", accent: "open" }, { id: "crash", label: "Crash" }];
  const RIFF_CYCLE = [".", "m", "P", "H", "L", "A"];
  const RIFF_NAMES = { ".": "rest", m: "chug (palm mute)", P: "power chord", H: "high note", L: "lead lick", A: "arpeggio" };
  const RIFF_GLYPH = { ".": "", m: "m", P: "P", H: "H", L: "L", A: "A" };
  const COMBOS = { "Rebellion|punk": 16, "Rebellion|metal": 16, "Rebellion|rock": 12, "Heartbreak|indie": 14, "Heartbreak|rock": 10, "Party|pop": 14, "Party|electronic": 14, "Love|pop": 10 };

  const studio = (() => {
    let draft = null, loop = null, raf = 0, section = "Verse";
    const bandGenre = () => state.band.genre || "rock";
    function reset(genre) {
      const keep = draft ? { title: draft.title, theme: draft.theme } : { title: "", theme: "Rebellion" };
      draft = { ...keep, groove: C.defaultGroove(genre || bandGenre()) };
    }
    const G = () => C.GENRES[draft.groove.genre];
    function render(el) {
      if (!draft) reset();
      const g = draft.groove, low = tired(DATA.costs.write);
      const grid = (row, pattern, cell) => `<div class="step-grid" role="group" aria-label="${row}">${[...pattern].map((c, i) => cell(c, i)).join("")}</div>`;
      el.innerHTML = `
        <section class="studio">
          <span class="badge">Studio</span>
          <h2 class="display">Write a song.</h2>
          <form class="stack" id="write-form" novalidate>
            <label class="field"><span>Song title</span><input name="title" maxlength="40" autocomplete="off" placeholder="Name your song" value="${esc(draft.title)}"></label>
            <fieldset class="field"><legend>Theme</legend><div class="chips">${DATA.songwriting.themes.map((t) => `<label class="pick"><input type="radio" name="theme" value="${t}" ${t === draft.theme ? "checked" : ""}><span>${t}</span></label>`).join("")}</div></fieldset>
            <fieldset class="field"><legend>Genre</legend><div class="chips">${C.GENRE_IDS.map((id) => `<label class="pick"><input type="radio" name="genre" value="${id}" ${id === g.genre ? "checked" : ""}><span>${C.GENRES[id].label}</span></label>`).join("")}</div>
              <span class="small muted">${G().blurb} Changing genre loads its sound.</span></fieldset>

            <div class="card stack">
              <h3>Sound</h3>
              <fieldset class="field"><legend>Guitar tone</legend><div class="chips">${TONES.map((t) => `<label class="pick"><input type="radio" name="tone" value="${t.id}" ${t.id === g.tone ? "checked" : ""}><span>${t.label}</span></label>`).join("")}</div>
                <span class="small muted">${TONES.find((t) => t.id === g.tone).hint}</span></fieldset>
              <fieldset class="field"><legend>Drum kit</legend><div class="chips">${KITS.map((k) => `<label class="pick"><input type="radio" name="kit" value="${k.id}" ${k.id === g.kit ? "checked" : ""}><span>${k.label}</span></label>`).join("")}</div></fieldset>
              <label class="field"><span>Tempo <b data-bpm>${g.bpm} BPM</b></span><input type="range" name="bpm" min="60" max="230" step="1" value="${g.bpm}"></label>
              <label class="field"><span>Chords</span><select name="prog">${G().progs.map((p, i) => `<option value="${i}" ${p.name === g.prog.name ? "selected" : ""}>${p.name}</option>`).join("")}</select></label>
              <label class="field"><span>Chorus</span><select name="chorus">${CHORUS.map((c) => `<option value="${c.id}" ${c.id === g.chorus ? "selected" : ""}>${c.label}</option>`).join("")}</select></label>
            </div>

            <div class="card stack">
              <div class="row-between"><h3>Beat</h3><select name="beatPreset" aria-label="Beat presets"><option value="">Presets…</option>${Object.keys(G().beats).map((n) => `<option>${n}</option>`).join("")}</select></div>
              <p class="small muted">Tap a step to hit it, again for an accent (hi-hat: open), again to clear. One bar, four beats.</p>
              ${DRUM_ROWS.map((r) => `<div class="step-row"><span class="step-label">${r.label}</span>${grid(r.label, g.beat[r.id], (c, i) =>
                `<button type="button" class="step ${c === "x" ? "on" : c === "X" ? "acc" : ""} ${i % 4 === 0 ? "beat" : ""}" data-drum="${r.id}" data-i="${i}" aria-label="${r.label} step ${i + 1}: ${c === "." ? "off" : c === "x" ? "on" : r.accent || "accent"}"></button>`)}</div>`).join("")}
            </div>

            <div class="card stack">
              <div class="row-between"><h3>Guitar riff</h3><select name="riffPreset" aria-label="Riff presets"><option value="">Presets…</option>${Object.keys(G().riffs).map((n) => `<option>${n}</option>`).join("")}</select></div>
              <p class="small muted">Tap a step to cycle: ${RIFF_CYCLE.slice(1).map((c) => `<b>${c}</b> ${RIFF_NAMES[c]}`).join(" · ")}. The riff plays over each chord.</p>
              <div class="step-row"><span class="step-label">Riff</span>${grid("Riff", g.riff, (c, i) =>
                `<button type="button" class="step riff riff-${c === "." ? "rest" : c} ${i % 4 === 0 ? "beat" : ""}" data-riff="${i}" aria-label="Riff step ${i + 1}: ${RIFF_NAMES[c]}">${RIFF_GLYPH[c]}</button>`)}</div>
            </div>

            <div class="preview-bar">
              <button class="btn btn-primary" type="button" data-preview>${loop ? `${icon("pause")}Stop` : `${icon("play")}Hear it`}</button>
              <div class="chips">${["Verse", "Chorus", "Both"].map((n) => `<label class="pick"><input type="radio" name="section" value="${n}" ${n === section ? "checked" : ""}><span>${n}</span></label>`).join("")}</div>
            </div>

            <div class="card">
              <h3>Writing session</h3>
              <div class="chips"><span class="chip">${icon("clock")}1 day</span><span class="chip">${icon("energy")}${DATA.costs.write} energy each</span><span class="chip">${icon("record")}Creativity ${Math.round(avg("creativity"))}</span></div>
              <p class="small muted">The band's creativity, a theme that suits the genre and a riff with some variety all raise the song's quality.</p>
            </div>
            <p class="small error" id="write-error" role="alert">${low.length ? `Too tired to write: ${low.join(", ")}.` : ""}</p>
            <button class="btn btn-primary" type="submit" ${low.length ? "disabled" : ""}>Record this song ${icon("arrow")}</button>
          </form>
          <h3 class="section-title">Your songs</h3>
          <ul class="song-list">
            ${state.songs.filter((x) => !x.cover).map((x) => {
              const gg = C.grooveFor(x, bandGenre());
              return `<li class="card song-row">
                <span><strong>${esc(x.title)}</strong><span class="muted small">${C.GENRES[gg.genre].label} · ${TONES.find((t) => t.id === gg.tone).label} · ${gg.bpm} BPM · practised ${x.practice}/5</span></span>
                <span class="song-q" aria-label="Quality ${x.quality}"><span class="mini-meter"><i style="width:${x.quality}%"></i></span><b>${x.quality}</b></span>
              </li>`;
            }).join("")}
          </ul>
        </section>`;
      wire(el);
      if (loop) startPlayhead();
    }

    function wire(el) {
      const form = $("#write-form", el), g = () => draft.groove;
      form.oninput = (e) => {
        const n = e.target.name;
        if (n === "title") draft.title = e.target.value;
        if (n === "bpm") { g().bpm = Number(e.target.value); $("[data-bpm]", el).textContent = `${g().bpm} BPM`; }
      };
      form.onchange = (e) => {
        const n = e.target.name, v = e.target.value;
        if (n === "theme") draft.theme = v;
        else if (n === "genre") { draft.groove = C.defaultGroove(v); render(el); }
        else if (n === "tone" || n === "kit") { g()[n] = v; render(el); }
        else if (n === "prog") g().prog = { ...G().progs[Number(v)] };
        else if (n === "chorus") g().chorus = v;
        else if (n === "beatPreset" && v) { g().beat = { ...G().beats[v] }; render(el); }
        else if (n === "riffPreset" && v) { g().riff = G().riffs[v]; render(el); }
        else if (n === "section") section = v;
      };
      form.onclick = (e) => {
        const d = e.target.closest("[data-drum]"), r = e.target.closest("[data-riff]");
        if (d) {
          const row = d.dataset.drum, i = Number(d.dataset.i), cur = g().beat[row][i];
          const nxt = { ".": "x", x: "X", X: "." }[cur];
          g().beat[row] = g().beat[row].slice(0, i) + nxt + g().beat[row].slice(i + 1);
          d.className = `step ${nxt === "x" ? "on" : nxt === "X" ? "acc" : ""} ${i % 4 === 0 ? "beat" : ""}`;
          d.setAttribute("aria-label", d.getAttribute("aria-label").replace(/: .*/, `: ${nxt === "." ? "off" : nxt === "x" ? "on" : "accent"}`));
        }
        if (r) {
          const i = Number(r.dataset.riff), cur = g().riff[i], nxt = RIFF_CYCLE[(RIFF_CYCLE.indexOf(cur) + 1) % RIFF_CYCLE.length];
          g().riff = g().riff.slice(0, i) + nxt + g().riff.slice(i + 1);
          r.className = `step riff riff-${nxt === "." ? "rest" : nxt} ${i % 4 === 0 ? "beat" : ""}`;
          r.textContent = RIFF_GLYPH[nxt];
          r.setAttribute("aria-label", `Riff step ${i + 1}: ${RIFF_NAMES[nxt]}`);
        }
        if (e.target.closest("[data-preview]")) toggle(el);
      };
      form.onsubmit = (e) => { e.preventDefault(); record(el); };
    }

    async function toggle(el) {
      if (loop) { stop(); render(el); return; }
      await A.unlock(); applySettings();
      const btn = $("[data-preview]", el); if (btn) btn.textContent = "Loading sounds…";
      await A.loadInstruments(A.instrumentsFor({ groove: C.normalise(draft.groove) }));
      loop = A.playLoop(() => {
        const both = section === "Both";
        return C.composeLoop(draft.groove, both ? null : section);
      });
      render(el);
    }
    function startPlayhead() {
      cancelAnimationFrame(raf);
      const tick = () => {
        if (!loop) return;
        const step = ((loop.position() % 16) + 16) % 16;
        document.querySelectorAll(".step-grid").forEach((gEl) => [...gEl.children].forEach((c, i) => c.classList.toggle("now", i === step)));
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    function stop() {
      if (loop) { loop.stop(); loop = null; }
      cancelAnimationFrame(raf);
    }

    function record(el) {
      const err = $("#write-error", el), title = draft.title.trim();
      if (!title) { err.textContent = "Give your song a title."; $("[name=title]", el).focus(); return; }
      if (state.songs.some((x) => x.title.toLowerCase() === title.toLowerCase())) { err.textContent = "You already have a song with that title."; return; }
      if (tired(DATA.costs.write).length) { err.textContent = "The band is too tired to write."; return; }
      const g = C.normalise(draft.groove);
      if (!/[xX]/.test(g.beat.kick + g.beat.snare)) { err.textContent = "The beat needs at least a kick or a snare."; return; }
      if (!/[^.]/.test(g.riff)) { err.textContent = "The riff needs at least one note."; return; }
      const combo = COMBOS[`${draft.theme}|${g.genre}`] || 0;
      const variety = new Set(g.riff.replace(/\./g, "")).size * 3 + (/[xX]/.test(g.beat.hat) ? 3 : 0);
      const quality = clamp(Math.round(avg("creativity") * 0.7 + combo + variety + Math.random() * 8), 5, 100);
      stop();
      state.songs.push({ id: "s-" + Date.now().toString(36), title, theme: draft.theme, genre: g.genre, groove: g, quality, practice: 0 });
      state.members.forEach((m) => { m.energy = clamp(m.energy - DATA.costs.write); m.stats.creativity = clamp(m.stats.creativity + 1); });
      state.res.day += 1;
      commit();
      toast(combo ? `"${title}" recorded. Quality ${quality}. That theme suits the genre!` : `"${title}" recorded. Quality ${quality}.`);
      draft = null;
      go("music");
    }
    return { render, stop, reset };
  })();

  // ---------- venue sheet ----------
  function openVenue(id) {
    const v = venueById(id), dlg = $("#venue-sheet"), open = unlocked(v), st = vstate(id), req = requirements(v);
    const low = tired(DATA.costs.gig);
    dlg.innerHTML = `
      <img class="venue-banner" src="${DATA.scenes[v.scene].src}" alt="">
      <div class="sheet-head">
        <div><span class="eyebrow">Act ${v.act} · ${DATA.acts[v.act]} · ${v.type}</span><h2 id="venue-name">${esc(v.name)}</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button>
      </div>
      <p class="muted">${esc(v.blurb)}</p>
      <div class="chips">
        <span class="chip">${icon("fans")}${v.capacity.toLocaleString()} capacity</span>
        <span class="chip">${icon("ticket")}${v.ticket ? `€${v.ticket} tickets` : "Tips only"}</span>
        <span class="chip">${icon("shield")}Crowd ${toughLabel(v)}</span>
      </div>
      ${st.played ? `<p class="small muted">Played ${st.played} · won ${st.wins} · best ${"★".repeat(st.stars) || "no stars yet"}</p>` : ""}
      ${req.length ? `<ul class="req-list">${req.map((r) => `<li class="${r.ok ? "ok" : ""}">${icon(r.ok ? "check" : "lock")}<span>${r.label}</span><small>${r.ok ? "done" : r.have}</small></li>`).join("")}</ul>` : ""}
      ${open ? `<button class="btn btn-primary" type="button" data-book ${low.length ? "disabled" : ""}>Book this gig ${icon("arrow")}</button>
        ${low.length ? `<p class="small error">Too tired: ${low.join(", ")}. Rest at HQ first.</p>` : ""}`
        : `<p class="small muted">Locked. Meet the goals above to open this stage.</p>`}`;
    dlg.onclick = (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
      const b = e.target.closest("[data-book]");
      if (b && !b.disabled) { state.next.venue = id; save(); dlg.close(); go("gigs", true); }
    };
    dlg.showModal();
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
    const venue = venueById(n.venue);
    const scene = DATA.scenes[venue.scene];
    if (hqScene) { hqScene.stop(); hqScene = null; }
    $("#app").hidden = true;
    const layer = $("#stage-layer");
    layer.hidden = false;
    document.body.classList.add("on-stage");
    let track = null;
    if (!s.cover) {
      // load the band's recorded instruments for this song's style (the synth covers anything missing)
      layer.innerHTML = `<div class="loading" role="status"><img src="${scene.src}" alt=""><p>Tuning up for ${esc(venue.name)}…</p></div>`;
      await A.loadInstruments(A.instrumentsFor(window.AmpedComposer.compose(s, state.band.genre)));
    }
    if (s.cover) {
      layer.innerHTML = `<div class="loading" role="status"><img src="${scene.src}" alt=""><p>Tuning up for ${esc(venue.name)}…</p></div>`;
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
      skill: m.stats.skill, crowdStart: crowdStart(s), tough: venue.tough, venueName: venue.name, bandGenre: state.band.genre, capacity: venue.capacity,
      settings: state.settings, scene, members: members(),
      onFinish: (r) => showResults(applyGig(gigId, s, n, r), r, s),
      onQuit: () => { leaveStage(); toast("You left the stage. No pay, no energy spent."); go("gigs"); }
    });
  }
  function leaveStage() {
    const layer = $("#stage-layer");
    layer.hidden = true; layer.innerHTML = "";
    document.body.classList.remove("on-stage");
    $("#app").hidden = false;
  }

  // Applies rewards once per gig id, so a double click or reload can't pay twice.
  function applyGig(gigId, s, n, r) {
    if (state.gigs.lastId === gigId) return null;
    const venue = venueById(n.venue);
    const diffMult = { easy: 1, normal: 1.3, hard: 1.6 }[n.difficulty];
    const stars = r.failed ? 0 : r.accuracy >= 0.95 ? 5 : r.accuracy >= 0.85 ? 4 : r.accuracy >= 0.7 ? 3 : r.accuracy >= 0.5 ? 2 : 1;
    // who shows up: a base walk-in crowd, your fans and your hype, capped by the room
    const turnout = Math.min(venue.capacity, Math.round(venue.capacity * 0.15 + state.res.fans * 1.5 + state.res.hype * 2));
    const before = { ...state.res };
    const wasOpen = DATA.venues.filter(unlocked).map((v) => v.id);
    const pay = venue.ticket ? turnout * venue.ticket * 0.5 : turnout * venue.tips * (0.5 + r.accuracy);
    const reward = {
      stars, turnout,
      cash: r.failed ? 0 : Math.round(pay * (0.5 + 0.5 * r.accuracy) * diffMult),
      fans: r.failed ? -Math.min(Math.ceil(turnout * 0.02), state.res.fans) : Math.max(2, Math.round(turnout * (0.06 + 0.3 * r.accuracy * r.accuracy) * diffMult * (1 + s.quality / 200))),
      hype: r.failed ? -8 : stars * 2
    };
    state.res.cash += reward.cash;
    state.res.fans += reward.fans;
    state.res.hype = clamp(state.res.hype + reward.hype);
    syncFame();
    reward.fameUp = state.res.fame - before.fame;
    const vs = state.venues[venue.id] = { ...vstate(venue.id) };
    vs.played += 1;
    if (!r.failed) vs.wins += 1;
    vs.stars = Math.max(vs.stars, stars);
    reward.unlocked = DATA.venues.filter((v) => unlocked(v) && !wasOpen.includes(v.id)).map((v) => v.id);
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
    const venue = venueById(state.next.venue);
    const stars = reward ? reward.stars : 0;
    const title = r.failed ? "Booed off." : ["", "Rough night.", "Not bad.", "Solid set.", "They loved it!", "Legendary!"][stars];
    const review = r.failed ? DATA.reviews.fail : DATA.reviews[stars];
    const reached = DATA.venues.filter(unlocked).length;
    const opened = reward && reward.unlocked.length ? reward.unlocked.map(venueById) : [];
    const lowAgain = tired(DATA.costs.gig);
    const STAR = (on, i) => `<svg class="star ${on ? "on" : ""}" style="animation-delay:${i * 0.12}s" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>`;
    layer.innerHTML = `
      <section class="results" aria-labelledby="results-title">
        <img class="results-bg" src="${DATA.scenes[venue.scene].src}" alt="">
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
          ${opened.map((v) => `
          <article class="unlock-card">
            <img src="${DATA.scenes[v.scene].src}" alt="">
            <div><span class="badge">New stage unlocked</span><h3>${esc(v.name)}</h3><p class="small muted">${v.type} · ${v.capacity.toLocaleString()} capacity</p></div>
          </article>`).join("")}
          <div class="progress-row"><span>Road to Solstice</span><span>${reached} / ${DATA.venues.length} stages</span></div>
          <div class="meter"><i style="width:${100 * reached / DATA.venues.length}%"></i></div>
          <div class="action-row two">
            <button class="btn btn-primary" type="button" data-r="${opened.length ? "map" : "hq"}">${opened.length ? `See the map ${icon("map")}` : `Back to HQ ${icon("hq")}`}</button>
            <button class="btn" type="button" data-r="again" ${lowAgain.length ? "disabled" : ""}>Play again</button>
          </div>
          ${lowAgain.length ? `<p class="small muted">Too tired for another gig: ${lowAgain.join(", ")}.</p>` : ""}
        </div>
      </section>`;
    $("[data-r=hq]", layer).focus();
    layer.onclick = (e) => {
      const b = e.target.closest("[data-r]");
      // the fail screen's button is gone by the time its click bubbles up here
      if (!b || b.disabled || !layer.contains(b)) return;
      layer.onclick = null;
      leaveStage();
      buildResources();
      if (b.dataset.r === "again") startGig(); else go(b.dataset.r, true);
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
              <li>Songs are generated by the game.</li></ul>
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
  // New game: name the band and pick its sound.
  function openBandSetup(onDone) {
    const dlg = $("#band-sheet");
    let genre = "rock";
    dlg.innerHTML = `
      <div class="sheet-head"><div><span class="eyebrow">New band</span><h2 id="band-title">Who are you?</h2></div>
        <button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button></div>
      <form class="stack" id="band-form">
        <label class="field"><span>Band name</span><input name="name" maxlength="32" autocomplete="off" value="${esc(DATA.band.name)}"></label>
        <fieldset class="field"><legend>Your sound</legend>
          <div class="genre-grid">${window.AmpedComposer.GENRE_IDS.map((id) => {
            const G = window.AmpedComposer.GENRES[id];
            return `<label class="genre-card"><input type="radio" name="genre" value="${id}" ${id === genre ? "checked" : ""}><span><strong>${G.label}</strong><small>${G.blurb}</small></span></label>`;
          }).join("")}</div>
          <span class="small muted">Your songs, drums and guitar tone start from this. You can write in any genre later.</span>
        </fieldset>
        <button class="btn btn-primary" type="submit">Start in the garage ${icon("arrow")}</button>
      </form>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); };
    $("#band-form", dlg).onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim() || DATA.band.name;
      dlg.close();
      onDone(name, f.get("genre"));
    };
    dlg.showModal();
  }

  function enterGame() {
    ensureCovers();
    save();
    $("#title").hidden = true;
    $("#app").hidden = false;
    buildResources();
    go("hq", true);
  }
  async function boot() {
    try { TRACKS = await fetch("assets/music/index.json").then((r) => r.json()); } catch { TRACKS = []; }
    applySettings();
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applySettings);
    const hasSave = !!load();
    const cont = $("#title-continue");
    cont.disabled = !hasSave;
    cont.textContent = hasSave ? `Continue · Day ${state.res.day}` : "Continue";
    cont.onclick = enterGame;
    $("#title-new").onclick = () => {
      const start = () => openBandSetup((name, genre) => {
        const keep = state.settings; state = fresh(); state.settings = keep;
        state.band = { name, genre };
        enterGame();
      });
      hasSave ? confirmAction("Start a new game?", "Your saved band will be replaced.", "Start over", start) : start();
    };
    (hasSave ? cont : $("#title-new")).focus();
    document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab, true)));
    $("#open-settings").onclick = openSettings;
  }
  boot();
})();
