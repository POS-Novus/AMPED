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
  // ---------- looks: who plays each role and what they wear (cosmetic only) ----------
  const familyName = (id) => (DATA.families.find((f) => f.id === id) || {}).name || "";
  // everyone who could play a role: the role's original member first, then the tribe characters
  function castFor(role) {
    const orig = DATA.members.find((m) => m.role === role);
    const own = { id: orig.id, family: "band", name: orig.name, looks: [{ id: orig.id, outfit: "Original", sprite: orig.sprite, aspect: orig.aspect }, ...(DATA.outfits[orig.id] || [])] };
    return [own, ...DATA.characters];
  }
  function lookOf(m) {
    const L = m.look || { character: m.id, look: m.id };
    const c = castFor(m.role).find((x) => x.id === L.character);
    if (!c) return {};
    const o = c.looks.find((x) => x.id === L.look) || c.looks[0];
    const guest = c.id !== m.id;
    return { name: c.name, sprite: o.sprite, aspect: o.aspect, character: c.id, outfit: o.outfit, guest, family: c.family, lookId: o.id,
      ...(guest ? { bio: `${c.name} plays ${m.roleLabel.toLowerCase()} now. ${familyName(c.family)} style, all the way.` } : {}) };
  }
  const members = () => state.members.map((m) => { const base = { ...def(m.id), ...m }; return { ...base, ...lookOf(base) }; });
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
            <img class="map-band" src="${member("nia").sprite}" alt="" style="left:${pos[hereIdx].x}%;top:${pos[hereIdx].y}px">
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
  // ---------- studio: build a song from sample clips on four tracks ----------
  // Easy: pick clips for each section from plain-language libraries, pick a mood and speed.
  // Pro (fame level 3, or Hard difficulty): edit clips step by step, change the song's structure,
  // chords per section and key.
  const C = window.AmpedComposer;
  const TONES = [
    { id: "clean", label: "Clean", hint: "Bright, no distortion" },
    { id: "crunch", label: "Crunch", hint: "Classic rock overdrive" },
    { id: "dist", label: "Distortion", hint: "Punk and hard rock" },
    { id: "metal", label: "Metal", hint: "High gain, tight chugs, low tuning" },
    { id: "synth", label: "Synth", hint: "Saw lead instead of guitar" }
  ];
  const KITS = [{ id: "power", label: "Rock kit" }, { id: "standard", label: "Standard kit" }, { id: "electronic", label: "Electronic kit" }];
  const TRACK_INFO = { drums: { label: "Drums", icon: "drums" }, guitar: { label: "Guitar", icon: "guitar" }, bass: { label: "Bass", icon: "bass" }, vocals: { label: "Vocals", icon: "mic" } };
  const DRUM_LABELS = { kick: "Kick", snare: "Snare", hat: "Hi-hat", crash: "Crash" };
  const CYCLES = {
    drums: [".", "x", "X", "o"],
    guitar: [".", "m", "P", "H", "L", "A"],
    bass: [".", "r", "f", "o", "m"]
  };
  const STEP_NAMES = {
    drums: { ".": "off", x: "hit", X: "accent", o: "ghost (soft)" },
    guitar: { ".": "rest", m: "chug (palm mute)", P: "power chord", H: "high note", L: "lead lick", A: "arpeggio" },
    bass: { ".": "rest", r: "root", f: "fifth", o: "octave", m: "short muted note" }
  };
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const COMBOS = { "Rebellion|punk": 16, "Rebellion|metal": 16, "Rebellion|rock": 12, "Heartbreak|indie": 14, "Heartbreak|rock": 10, "Party|pop": 14, "Party|electronic": 14, "Love|pop": 10 };
  const PRO_FAME = 3;
  const proUnlocked = () => state.band.difficulty === "hard" || state.res.fame >= PRO_FAME;

  // A small picture of a clip: drum hits, chord stabs, bass notes or the melody's shape, with a playhead
  function mini(track, p, guitarP) {
    if (track === "bass" && p === "follow") p = [...(guitarP || "")].map((c) => (c === "." ? "." : c === "m" ? "m" : "r")).join("");
    const n = track === "vocals" ? 32 : 16;
    let r = "";
    const bar = (i, y, h, cls) => { r += `<rect class="${cls}" x="${i + 0.12}" y="${y}" width="0.76" height="${h}" rx="0.2"/>`; };
    if (track === "drums") {
      for (let i = 0; i < 16; i++) {
        if (p.crash[i] !== "." ) bar(i, 0, 1.6, "m-c");
        else if (p.hat[i] !== ".") bar(i, 0.4, 1.2, p.hat[i] === "X" ? "m-c" : "m-h");
        if (p.snare[i] !== ".") bar(i, 2.6, 2.4, p.snare[i] === "o" ? "m-g" : "m-s");
        if (p.kick[i] !== ".") bar(i, 5.6, 2.4, p.kick[i] === "o" ? "m-g" : "m-k");
      }
    } else if (track === "vocals") {
      let last = 0;
      [...p].forEach((c, i) => {
        if (/[1-8]/.test(c)) last = Number(c); else if (c === "_") last = 0;
        if (last) r += `<rect class="${/[1-8]/.test(c) ? "m-v" : "m-vh"}" x="${i}" y="${8 - last}" width="1" height="1" rx="0.3"/>`;
      });
    } else {
      const shape = track === "guitar" ? { P: [0, 8], m: [5.5, 2.5], H: [0.5, 3], L: [1.5, 3], A: [3, 3] } : { r: [5, 3], f: [3, 3], o: [0.5, 3], m: [6, 2] };
      [...p].forEach((c, i) => { if (shape[c]) bar(i, shape[c][0], shape[c][1], `m-${track === "guitar" ? "g" + c : "b"}`); });
    }
    return `<span class="mini" style="--n:${n}"><svg viewBox="0 0 ${n} 8" preserveAspectRatio="none" aria-hidden="true">${r}</svg><i class="ph"></i></span>`;
  }

  const studio = (() => {
    let draft = null, play = null, raf = 0;
    const mute = {};
    const bandGenre = () => state.band.genre || "rock";
    const isPro = () => proUnlocked() && (state.studioPro ?? state.band.difficulty === "hard");
    function reset(genre) {
      const keep = draft ? { title: draft.title, theme: draft.theme } : { title: "", theme: "Rebellion" };
      draft = { ...keep, arr: C.defaultArrangement(genre || bandGenre()), sel: { track: "drums", sec: 1 }, linked: true };
    }
    const A_ = () => draft.arr;
    const secOf = (i) => A_().sections[i];
    const sameType = (i) => (draft.linked ? A_().sections.map((s, j) => (s.type === secOf(i).type ? j : -1)).filter((j) => j >= 0) : [i]);
    const typeNumber = (i) => A_().sections.slice(0, i + 1).filter((s) => s.type === secOf(i).type).length;
    const secLabel = (i) => { const n = A_().sections.filter((s) => s.type === secOf(i).type).length; return n > 1 ? `${secOf(i).type} ${typeNumber(i)}` : secOf(i).type; };
    const songSeconds = () => Math.round(C.totalBars(A_()) * 4 * 60 / A_().bpm);
    const speedWord = (bpm) => (bpm < 90 ? "Slow" : bpm < 120 ? "Medium" : bpm < 160 ? "Fast" : "Very fast");

    function render(el) {
      if (!draft) reset();
      const a = A_(), G = C.GENRES[a.genre], low = tired(DATA.costs.write), pro = isPro();
      if (draft.sel.sec >= a.sections.length) draft.sel.sec = a.sections.length - 1;
      const sel = draft.sel, sec = secOf(sel.sec), clip = sec.clips[sel.track];
      const moodIndex = G.progs.findIndex((p) => p.name === a.sections[Math.min(1, a.sections.length - 1)].prog.name);
      el.innerHTML = `
        <section class="studio">
          <div class="row-between studio-top">
            <div><span class="badge">Studio</span><h2 class="display">Write a song.</h2></div>
            <div class="seg" role="group" aria-label="Studio mode">
              <button type="button" data-mode="easy" aria-pressed="${!pro}">Easy</button>
              <button type="button" data-mode="pro" aria-pressed="${pro}" ${proUnlocked() ? "" : "disabled"}>${proUnlocked() ? "" : icon("lock")}Pro</button>
            </div>
          </div>
          <p class="small muted">${pro
            ? "Pro: edit every sample step by step, add and move sections, pick chords and key."
            : `Pick a sample for each track in each part of the song. No music theory needed.${proUnlocked() ? "" : ` Pro tools unlock at fame level ${PRO_FAME}, or straight away on Hard difficulty (Settings).`}`}</p>
          <form class="stack" id="write-form" novalidate>
            <label class="field"><span>Song title</span><input name="title" maxlength="40" autocomplete="off" placeholder="Name your song" value="${esc(draft.title)}"></label>
            <fieldset class="field"><legend>Theme</legend><div class="chips">${DATA.songwriting.themes.map((t) => `<label class="pick"><input type="radio" name="theme" value="${t}" ${t === draft.theme ? "checked" : ""}><span>${t}</span></label>`).join("")}</div></fieldset>
            <fieldset class="field"><legend>Genre</legend><div class="chips">${C.GENRE_IDS.map((id) => `<label class="pick"><input type="radio" name="genre" value="${id}" ${id === a.genre ? "checked" : ""}><span>${C.GENRES[id].label}</span></label>`).join("")}</div>
              <span class="small muted">${G.blurb} Changing genre starts the song again from that genre's sound.</span></fieldset>

            <div class="card stack">
              <div class="row-between"><h3>Tracks</h3><span class="small muted">${C.totalBars(a)} bars · ${Math.floor(songSeconds() / 60)}:${String(songSeconds() % 60).padStart(2, "0")}</span></div>
              <p class="small muted">Each column is a part of the song. Tap a box to choose its sample.</p>
              <div class="arranger" style="--cols:${a.sections.length}">
                <div class="arr-row arr-head">
                  <span class="trk-name"></span>
                  ${a.sections.map((s, i) => `<button type="button" class="sec-head ${i === sel.sec ? "is-sel" : ""}" data-sec="${i}"><b>${secLabel(i)}</b><small>${s.bars} bar${s.bars > 1 ? "s" : ""}</small></button>`).join("")}
                  ${pro && a.sections.length < C.MAX_SECTIONS ? `<button type="button" class="sec-add" data-add-sec aria-label="Add a section">${icon("plus")}</button>` : ""}
                </div>
                ${C.TRACKS.map((t) => `<div class="arr-row ${mute[t] ? "is-muted" : ""}">
                  <span class="trk-name">${icon(TRACK_INFO[t].icon)}<span>${TRACK_INFO[t].label}</span>
                    <button type="button" class="mute" data-mute="${t}" aria-pressed="${!!mute[t]}" aria-label="Mute ${TRACK_INFO[t].label}">M</button></span>
                  ${a.sections.map((s, i) => `<button type="button" class="clip-cell trk-${t} ${i === sel.sec && t === sel.track ? "is-sel" : ""} ${C.isSilent(t, s.clips[t]) ? "is-silent" : ""}" data-cell="${t}:${i}" aria-label="${TRACK_INFO[t].label}, ${secLabel(i)}: ${esc(s.clips[t].name)}">
                    <b>${esc(s.clips[t].name)}</b>${mini(t, s.clips[t].p, s.clips.guitar.p)}</button>`).join("")}
                </div>`).join("")}
              </div>
            </div>

            <div class="card stack lib">
              <div class="row-between"><h3>${icon(TRACK_INFO[sel.track].icon)}${TRACK_INFO[sel.track].label} · ${secLabel(sel.sec)}</h3>
                <label class="check"><input type="checkbox" name="linked" ${draft.linked ? "checked" : ""}><span>Same for every ${sec.type}</span></label></div>
              <p class="small muted">${icon("play")} hears a sample on its own. Tap its name to use it here.</p>
              ${libraryHtml(sel.track, a.genre, clip, pro, sec.clips.guitar.p)}
              ${pro ? editorHtml(sel.track, clip, sec.clips.guitar.p) : ""}
            </div>

            ${pro ? sectionHtml(sel.sec) : ""}

            <div class="card stack">
              <h3>Sound</h3>
              <fieldset class="field"><legend>Guitar sound</legend><div class="chips">${TONES.map((t) => `<label class="pick"><input type="radio" name="tone" value="${t.id}" ${t.id === a.tone ? "checked" : ""}><span>${t.label}</span></label>`).join("")}</div>
                <span class="small muted">${TONES.find((t) => t.id === a.tone).hint}</span></fieldset>
              <fieldset class="field"><legend>Drum kit</legend><div class="chips">${KITS.map((k) => `<label class="pick"><input type="radio" name="kit" value="${k.id}" ${k.id === a.kit ? "checked" : ""}><span>${k.label}</span></label>`).join("")}</div></fieldset>
              <label class="field"><span>Speed <b data-bpm>${pro ? `${a.bpm} BPM` : `${speedWord(a.bpm)} · ${a.bpm} BPM`}</b></span><input type="range" name="bpm" min="60" max="230" step="1" value="${a.bpm}"></label>
              ${pro
                ? `<label class="field"><span>Key</span><select name="root">${Array.from({ length: 12 }, (_, i) => 36 + i).map((r) => `<option value="${r}" ${r === a.root ? "selected" : ""}>${NOTE_NAMES[r % 12]}</option>`).join("")}</select></label>`
                : `<fieldset class="field"><legend>Mood</legend><div class="chips">${G.progs.map((p, i) => `<label class="pick"><input type="radio" name="mood" value="${i}" ${i === moodIndex ? "checked" : ""}><span>${p.mood}</span></label>`).join("")}</div>
                  <span class="small muted">Sets the chords for the whole song.</span></fieldset>`}
            </div>

            <div class="preview-bar">
              <button class="btn btn-primary" type="button" data-play="song">${play && play.kind === "song" ? `${icon("pause")}Stop` : `${icon("play")}Play song`}</button>
              <button class="btn" type="button" data-play="section">${play && play.kind === "section" ? `${icon("pause")}Stop` : `${icon("play")}${secLabel(sel.sec)}`}</button>
              <span class="small muted" data-now aria-live="off"></span>
            </div>

            <div class="card">
              <h3>Writing session</h3>
              <div class="chips"><span class="chip">${icon("clock")}1 day</span><span class="chip">${icon("energy")}${DATA.costs.write} energy each</span><span class="chip">${icon("record")}Creativity ${Math.round(avg("creativity"))}</span></div>
              <p class="small muted">The band's creativity, a theme that suits the genre, a mix of different samples and a vocal line all raise the song's quality${pro ? ", and so do samples you edit yourself" : ""}.</p>
            </div>
            <p class="small error" id="write-error" role="alert">${low.length ? `Too tired to write: ${low.join(", ")}.` : ""}</p>
            <button class="btn btn-primary" type="submit" ${low.length ? "disabled" : ""}>Record this song ${icon("arrow")}</button>
          </form>
          <h3 class="section-title">Your songs</h3>
          <ul class="song-list">
            ${state.songs.filter((x) => !x.cover).map((x) => {
              const sa = C.arrangementFor(x, bandGenre());
              return `<li class="card song-row">
                <span><strong>${esc(x.title)}</strong><span class="muted small">${C.GENRES[sa.genre].label} · ${TONES.find((t) => t.id === sa.tone).label} · ${sa.bpm} BPM · practised ${x.practice}/5</span></span>
                <span class="song-q" aria-label="Quality ${x.quality}"><span class="mini-meter"><i style="width:${x.quality}%"></i></span><b>${x.quality}</b></span>
              </li>`;
            }).join("")}
          </ul>
        </section>`;
      wire(el);
      if (play) startPlayhead();
    }

    function libraryHtml(track, genre, current, pro, guitarP) {
      const card = (c) => `<div class="lib-card ${c.name === current.name ? "is-on" : ""} ${play && play.kind === "clip" && play.name === c.name ? "is-playing" : ""}" data-lib="${esc(c.name)}">
          <button type="button" class="lib-play" data-hear="${esc(c.name)}" aria-label="Hear ${esc(c.name)}">${icon(play && play.kind === "clip" && play.name === c.name ? "pause" : "play")}</button>
          <button type="button" class="lib-use" data-use="${esc(c.name)}"><b>${esc(c.name)}</b>${C.HINTS[c.name] ? `<small>${C.HINTS[c.name]}</small>` : ""}${mini(track, c.p, guitarP)}</button>
        </div>`;
      if (!pro) return `<div class="lib-grid">${C.library(track, genre).map(card).join("")}</div>`;
      // Pro: every genre's samples, the song's genre first
      const groups = [genre, ...C.GENRE_IDS.filter((g) => g !== genre)].map((g) => [C.GENRES[g].label, C.library(track, g).filter((c) => c.from === g)]);
      groups.push(["Any genre", C.library(track, genre).filter((c) => c.from === "any")]);
      // the song's genre and the shared samples stay open; other genres fold away
      return groups.filter(([, cs]) => cs.length).map(([label, cs], i) => {
        const open = i === 0 || i === groups.length - 1 || cs.some((c) => c.name === current.name);
        return `<details class="lib-fold" ${open ? "open" : ""}><summary class="lib-group">${label} <small>${cs.length}</small></summary><div class="lib-grid">${cs.map(card).join("")}</div></details>`;
      }).join("");
    }

    function editorHtml(track, clip, guitarP) {
      const head = `<div class="row-between"><h4>Edit ${esc(clip.name)}</h4><span class="small muted">${track === "vocals" ? "Two bars" : "One bar, four beats"}</span></div>`;
      if (track === "drums") {
        return `<div class="editor stack">${head}<p class="small muted">Tap a step: hit, accent (hi-hat: open), ghost (soft), off.</p>
          ${C.DRUM_ROWS.map((row) => `<div class="step-row"><span class="step-label">${DRUM_LABELS[row]}</span><div class="step-grid">${[...clip.p[row]].map((c, i) =>
            `<button type="button" class="step ${{ x: "on", X: "acc", o: "ghost" }[c] || ""} ${i % 4 === 0 ? "beat" : ""}" data-step="${row}:${i}" aria-label="${DRUM_LABELS[row]} step ${i + 1}: ${STEP_NAMES.drums[c]}"></button>`).join("")}</div></div>`).join("")}</div>`;
      }
      if (track === "vocals") {
        const rows = [8, 7, 6, 5, 4, 3, 2, 1];
        let held = 0;
        const state2 = [...clip.p].map((c) => { if (/[1-8]/.test(c)) held = Number(c); else if (c === "_") held = 0; return { c, held }; });
        return `<div class="editor stack">${head}<p class="small muted">Tap a box to sing that note. Higher rows are higher notes; a note lasts until the next one. The bottom row is silence.</p>
          ${[0, 1].map((b) => `<div class="roll"><span class="roll-bar small muted">Bar ${b + 1}</span>
            ${rows.map((d) => `<div class="roll-row"><span class="step-label">${d === 8 ? "High" : d === 1 ? "Low" : ""}</span><div class="step-grid">${Array.from({ length: 16 }, (_, i) => {
              const k = b * 16 + i, s = state2[k], on = s.c === String(d), hold = !on && s.held === d && s.c === ".";
              return `<button type="button" class="step ${on ? "on" : hold ? "hold" : ""} ${i % 4 === 0 ? "beat" : ""}" data-note="${d}:${k}" aria-label="Note ${d}, step ${k + 1}${on ? ", on" : ""}"></button>`;
            }).join("")}</div></div>`).join("")}
            <div class="roll-row"><span class="step-label">Rest</span><div class="step-grid">${Array.from({ length: 16 }, (_, i) => {
              const k = b * 16 + i;
              return `<button type="button" class="step rest ${state2[k].c === "_" ? "on" : ""} ${i % 4 === 0 ? "beat" : ""}" data-note="_:${k}" aria-label="Silence, step ${k + 1}"></button>`;
            }).join("")}</div></div></div>`).join("")}</div>`;
      }
      if (track === "bass" && clip.p === "follow") {
        return `<div class="editor stack">${head}<p class="small muted">This bass line copies the guitar's rhythm.</p><button class="btn" type="button" data-unfollow>Write my own bass line</button></div>`;
      }
      const cyc = CYCLES[track];
      return `<div class="editor stack">${head}<p class="small muted">Tap a step to change it: ${cyc.slice(1).map((c) => `<b>${c}</b> ${STEP_NAMES[track][c]}`).join(" · ")}.</p>
        <div class="step-row"><span class="step-label">${TRACK_INFO[track].label}</span><div class="step-grid">${[...clip.p].map((c, i) =>
          `<button type="button" class="step riff riff-${c === "." ? "rest" : c} ${i % 4 === 0 ? "beat" : ""}" data-step="${track}:${i}" aria-label="Step ${i + 1}: ${STEP_NAMES[track][c]}">${c === "." ? "" : c}</button>`).join("")}</div></div>
        ${track === "bass" ? `<button class="btn" type="button" data-follow>Follow the guitar</button>` : ""}</div>`;
    }

    function sectionHtml(i) {
      const s = secOf(i), a = A_();
      return `<div class="card stack">
        <h3>Section: ${secLabel(i)}</h3>
        <div class="sec-fields">
          <label class="field"><span>Part</span><select name="secType">${C.SECTION_TYPES.map((t) => `<option ${t === s.type ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          <label class="field"><span>Length</span><select name="secBars">${[1, 2, 4, 8].map((b) => `<option value="${b}" ${b === s.bars ? "selected" : ""}>${b} bar${b > 1 ? "s" : ""}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Chords</span><select name="secProg">${C.ALL_PROGS.map((p, k) => `<option value="${k}" ${p.name === s.prog.name ? "selected" : ""}>${p.name}</option>`).join("")}</select></label>
        <div class="chips">
          <button class="btn btn-small" type="button" data-sec-op="left" ${i === 0 ? "disabled" : ""}>${icon("back")}Move</button>
          <button class="btn btn-small" type="button" data-sec-op="right" ${i === a.sections.length - 1 ? "disabled" : ""}>Move${icon("arrow")}</button>
          <button class="btn btn-small" type="button" data-sec-op="copy" ${a.sections.length >= C.MAX_SECTIONS || C.totalBars(a) + s.bars > C.MAX_BARS ? "disabled" : ""}>${icon("plus")}Duplicate</button>
          <button class="btn btn-small btn-danger" type="button" data-sec-op="delete" ${a.sections.length <= 1 ? "disabled" : ""}>${icon("close")}Delete</button>
        </div>
        <p class="small muted">Up to ${C.MAX_SECTIONS} sections and ${C.MAX_BARS} bars.</p>
      </div>`;
    }

    // ---------- editing ----------
    function setClip(track, i, clip) {
      sameType(i).forEach((j) => { A_().sections[j].clips[track] = { name: clip.name, p: typeof clip.p === "string" ? clip.p : { ...clip.p } }; });
    }
    const edited = (name) => (/\(edited\)$/.test(name) ? name : `${name.slice(0, 21)} (edited)`);
    function editClip(fn) {
      const { track, sec } = draft.sel, c = secOf(sec).clips[track];
      const p = typeof c.p === "string" ? c.p : { ...c.p };
      setClip(track, sec, { name: edited(c.name), p: fn(p) });
    }
    const setAt = (str, i, ch) => str.slice(0, i) + ch + str.slice(i + 1);

    function wire(el) {
      const form = $("#write-form", el), a = () => A_();
      $("[data-mode=easy]", el).onclick = () => { state.studioPro = false; save(); render(el); };
      $("[data-mode=pro]", el).onclick = () => { if (!proUnlocked()) return; state.studioPro = true; save(); render(el); };
      form.oninput = (e) => {
        const n = e.target.name;
        if (n === "title") draft.title = e.target.value;
        if (n === "bpm") { a().bpm = Number(e.target.value); $("[data-bpm]", el).textContent = isPro() ? `${a().bpm} BPM` : `${speedWord(a().bpm)} · ${a().bpm} BPM`; }
      };
      form.onchange = (e) => {
        const n = e.target.name, v = e.target.value, s = secOf(draft.sel.sec);
        if (n === "theme") draft.theme = v;
        else if (n === "genre") { draft.arr = C.defaultArrangement(v); draft.sel = { track: draft.sel.track, sec: 1 }; loadSounds(); render(el); }
        else if (n === "tone" || n === "kit") { a()[n] = v; loadSounds(); render(el); }
        else if (n === "root") a().root = Number(v);
        else if (n === "mood") { const p = C.GENRES[a().genre].progs[Number(v)]; a().sections.forEach((x) => { x.prog = { ...p }; }); }
        else if (n === "linked") draft.linked = e.target.checked;
        else if (n === "secType") { s.type = v; render(el); }
        else if (n === "secBars") {
          const nb = Number(v);
          if (C.totalBars(a()) - s.bars + nb > C.MAX_BARS) { toast(`Songs can be up to ${C.MAX_BARS} bars.`); return render(el); }
          s.bars = nb; render(el);
        }
        else if (n === "secProg") { s.prog = { ...C.ALL_PROGS[Number(v)] }; }
      };
      form.onclick = (e) => {
        const t = e.target;
        const cell = t.closest("[data-cell]"), head = t.closest("[data-sec]"), m = t.closest("[data-mute]");
        if (m) { mute[m.dataset.mute] = !mute[m.dataset.mute]; return render(el); }
        if (cell) { const [track, i] = cell.dataset.cell.split(":"); draft.sel = { track, sec: Number(i) }; if (play && play.kind === "section") play.sec = draft.sel.sec; return render(el); }
        if (head) { draft.sel.sec = Number(head.dataset.sec); if (play && play.kind === "section") play.sec = draft.sel.sec; return render(el); }
        if (t.closest("[data-add-sec]")) return addSection(el);
        const hear = t.closest("[data-hear]"), use = t.closest("[data-use]");
        if (hear) return hearClip(el, hear.dataset.hear);
        if (use) return useClip(el, use.dataset.use);
        const play_ = t.closest("[data-play]");
        if (play_) return togglePlay(el, play_.dataset.play);
        const op = t.closest("[data-sec-op]");
        if (op) return sectionOp(el, op.dataset.secOp);
        const step = t.closest("[data-step]");
        if (step) {
          const [row, i] = step.dataset.step.split(":"), k = Number(i), track = draft.sel.track, cyc = CYCLES[track];
          editClip((p) => {
            if (track === "drums") { p[row] = setAt(p[row], k, cyc[(cyc.indexOf(p[row][k]) + 1) % cyc.length]); return p; }
            return setAt(p, k, cyc[(cyc.indexOf(p[k]) + 1) % cyc.length]);
          });
          return render(el);
        }
        const nt = t.closest("[data-note]");
        if (nt) {
          const [d, i] = nt.dataset.note.split(":"), k = Number(i);
          editClip((p) => setAt(p, k, p[k] === d ? "." : d));
          return render(el);
        }
        if (t.closest("[data-unfollow]")) { const g = secOf(draft.sel.sec).clips.guitar.p; setClip("bass", draft.sel.sec, { name: "My bass line (edited)", p: [...g].map((c) => (c === "." ? "." : c === "m" ? "m" : "r")).join("") }); return render(el); }
        if (t.closest("[data-follow]")) { setClip("bass", draft.sel.sec, C.clipNamed("bass", "Follow guitar", a().genre)); return render(el); }
      };
      form.onsubmit = (e) => { e.preventDefault(); record(el); };
    }

    function addSection(el) {
      const a = A_(), last = a.sections[a.sections.length - 1];
      if (a.sections.length >= C.MAX_SECTIONS || C.totalBars(a) + 4 > C.MAX_BARS) return toast("The song is as long as it can be.");
      // a new verse-like section built from the genre's verse samples, before the outro if there is one
      const at = last.type === "Outro" ? a.sections.length - 1 : a.sections.length;
      const fresh = C.defaultArrangement(a.genre).sections[1];
      a.sections.splice(at, 0, { ...fresh, type: "Bridge", prog: { ...a.sections[Math.max(0, at - 1)].prog } });
      draft.sel.sec = at;
      render(el);
    }
    function sectionOp(el, op) {
      const a = A_(), i = draft.sel.sec, s = a.sections[i];
      const clone = () => JSON.parse(JSON.stringify(s));
      if (op === "left" && i > 0) { a.sections.splice(i, 1); a.sections.splice(i - 1, 0, s); draft.sel.sec = i - 1; }
      if (op === "right" && i < a.sections.length - 1) { a.sections.splice(i, 1); a.sections.splice(i + 1, 0, s); draft.sel.sec = i + 1; }
      if (op === "copy" && a.sections.length < C.MAX_SECTIONS && C.totalBars(a) + s.bars <= C.MAX_BARS) { a.sections.splice(i + 1, 0, clone()); draft.sel.sec = i + 1; }
      if (op === "delete" && a.sections.length > 1) { a.sections.splice(i, 1); draft.sel.sec = Math.min(i, a.sections.length - 1); }
      if (play && play.kind === "section") play.sec = draft.sel.sec;
      render(el);
    }

    function useClip(el, name) {
      const c = C.clipNamed(draft.sel.track, name, A_().genre);
      if (!c) return;
      setClip(draft.sel.track, draft.sel.sec, c);
      // hear it straight away with the band, unless the whole song is already playing
      if (!play || play.kind === "clip") startPlay(el, { kind: "section", sec: draft.sel.sec });
      else render(el);
    }
    function hearClip(el, name) {
      if (play && play.kind === "clip" && play.name === name) { stop(); return render(el); }
      startPlay(el, { kind: "clip", name, track: draft.sel.track });
    }
    function togglePlay(el, kind) {
      if (play && play.kind === kind) { stop(); return render(el); }
      startPlay(el, kind === "song" ? { kind } : { kind, sec: draft.sel.sec });
    }

    // ---------- playback ----------
    const audible = (arr) => ({ ...arr, events: arr.events.filter((e) => !mute[e.part]) });
    function current() {
      const a = A_();
      if (play.kind === "song") return audible(C.compose({ id: "draft", title: draft.title || "Draft", arr: a }));
      if (play.kind === "section") return audible(C.composeSection(a, Math.min(play.sec, a.sections.length - 1)));
      const c = C.clipNamed(play.track, play.name, a.genre);
      return C.composeClip(a, play.track, c, draft.sel.sec);
    }
    function loadSounds() { return A.loadInstruments(A.instrumentsFor({ groove: A_() })); }
    async function startPlay(el, what) {
      if (play) stop();
      play = what;
      await A.unlock(); applySettings();
      render(el);
      const now = $("[data-now]", el); if (now) now.textContent = "Loading sounds…";
      await loadSounds();
      if (play !== what) return;
      play.loop = A.playLoop(current);
      startPlayhead();
    }
    function startPlayhead() {
      cancelAnimationFrame(raf);
      const setStep = (node, s) => { if (node) { node.style.setProperty("--s", s); node.classList.toggle("is-play", s >= 0); } };
      const tick = () => {
        if (!play || !play.loop) return;
        const pos = Math.max(0, play.loop.position()), a = A_();
        document.querySelectorAll(".mini").forEach((m) => setStep(m, -1));
        document.querySelectorAll(".sec-head.is-now").forEach((h) => h.classList.remove("is-now"));
        const nowText = $("[data-now]");
        if (play.kind === "clip") {
          const card = document.querySelector(`.lib-card[data-lib="${CSS.escape(play.name)}"] .mini`);
          setStep(card, pos % (play.track === "vocals" ? 32 : 16));
          if (nowText) nowText.textContent = `Hearing ${play.name}`;
        } else {
          let beat = pos / 4, idx = play.kind === "section" ? Math.min(play.sec, a.sections.length - 1) : 0;
          if (play.kind === "song") { while (idx < a.sections.length - 1 && beat >= a.sections[idx].bars * 4) { beat -= a.sections[idx].bars * 4; idx++; } }
          else beat %= a.sections[idx].bars * 4;
          const barIn = Math.floor(beat / 4), step = Math.floor(beat * 4) % 16;
          const head = document.querySelector(`.sec-head[data-sec="${idx}"]`);
          if (head) head.classList.add("is-now");
          C.TRACKS.forEach((t) => setStep(document.querySelector(`[data-cell="${t}:${idx}"] .mini`), t === "vocals" ? (barIn % 2) * 16 + step : step));
          if (idx === draft.sel.sec) {
            const libMini = document.querySelector(".lib-card.is-on .mini");
            setStep(libMini, draft.sel.track === "vocals" ? (barIn % 2) * 16 + step : step);
            document.querySelectorAll(".editor .step-grid").forEach((g, gi) => {
              const want = draft.sel.track === "vocals" ? (Math.floor(gi / 9) === barIn % 2 ? step : -1) : step;
              [...g.children].forEach((c, i) => c.classList.toggle("now", i === want));
            });
          }
          if (nowText) nowText.textContent = `${secLabel(idx)} · bar ${Math.min(barIn + 1, a.sections[idx].bars)} of ${a.sections[idx].bars}`;
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
    }
    function stop() {
      if (play && play.loop) play.loop.stop();
      play = null;
      cancelAnimationFrame(raf);
    }

    function record(el) {
      const err = $("#write-error", el), title = draft.title.trim();
      if (!title) { err.textContent = "Give your song a title."; $("[name=title]", el).focus(); return; }
      if (state.songs.some((x) => x.title.toLowerCase() === title.toLowerCase())) { err.textContent = "You already have a song with that title."; return; }
      if (tired(DATA.costs.write).length) { err.textContent = "The band is too tired to write."; return; }
      const a = C.normaliseArr(draft.arr), silentAll = (t) => a.sections.every((s) => C.isSilent(t, s.clips[t]));
      if (silentAll("drums")) { err.textContent = "The song needs drums somewhere."; return; }
      if (silentAll("guitar") && silentAll("bass")) { err.textContent = "The song needs a guitar or bass part."; return; }
      if (C.totalBars(a) > C.MAX_BARS) { err.textContent = `Songs can be up to ${C.MAX_BARS} bars.`; return; }
      const combo = COMBOS[`${draft.theme}|${a.genre}`] || 0;
      const names = new Set(a.sections.flatMap((s) => C.TRACKS.map((t) => `${t}:${s.clips[t].name}`)));
      const variety = Math.min(14, names.size);
      const vocals = silentAll("vocals") ? -6 : 4;
      const own = a.sections.some((s) => C.TRACKS.some((t) => /\(edited\)$/.test(s.clips[t].name))) ? 5 : 0;
      const quality = clamp(Math.round(avg("creativity") * 0.7 + combo + variety + vocals + own + Math.random() * 8), 5, 100);
      stop();
      state.songs.push({ id: "s-" + Date.now().toString(36), title, theme: draft.theme, genre: a.genre, arr: a, quality, practice: 0 });
      state.members.forEach((m) => { m.energy = clamp(m.energy - DATA.costs.write); m.stats.creativity = clamp(m.stats.creativity + 1); });
      state.res.day += 1;
      commit();
      toast(combo ? `"${title}" recorded. Quality ${quality}. That theme suits the genre!` : `"${title}" recorded. Quality ${quality}.`);
      draft = null;
      go("music");
    }
    return { render, stop, reset };
  })();

  // ---------- wardrobe: pick who plays a role and their outfit ----------
  function openWardrobe(id) {
    const dlg = $("#wardrobe-sheet"), me = member(id);
    const cast = castFor(me.role);
    let pickChar = me.character, pickLook = (me.look && me.look.look) || id;
    let fam = (cast.find((c) => c.id === pickChar) || cast[0]).family;
    // who else in the band already is this character
    const takenBy = (charId) => members().find((m) => m.id !== id && m.character === charId);
    const render = () => {
      const c = cast.find((x) => x.id === pickChar) || cast[0];
      const look = c.looks.find((l) => l.id === pickLook) || c.looks[0];
      const taken = takenBy(c.id);
      const equipped = me.character === c.id && (me.look ? me.look.look : id) === look.id;
      const inFam = cast.filter((x) => x.family === fam);
      dlg.style.setProperty("--c", me.color);
      dlg.innerHTML = `
        <div class="sheet-head">
          <div><span class="eyebrow">Wardrobe · ${me.roleLabel}</span><h2 id="wardrobe-title">Who plays ${me.roleLabel.toLowerCase()}?</h2></div>
          <button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button>
        </div>
        <div class="chips" role="group" aria-label="Style family">${DATA.families.map((f) => `<label class="pick"><input type="radio" name="fam" value="${f.id}" ${f.id === fam ? "checked" : ""}><span>${f.name}</span></label>`).join("")}</div>
        <div class="ward-cast">${inFam.map((x) => {
          const t = takenBy(x.id);
          return `<button type="button" class="ward-card ${x.id === c.id ? "is-sel" : ""}" data-char="${x.id}" ${t ? "disabled" : ""}>
            <img src="${x.looks[0].sprite}" alt="" loading="lazy"><b>${esc(x.name)}</b>
            <small>${t ? `In the band on ${t.roleLabel.toLowerCase()}` : me.character === x.id ? "Playing now" : `${x.looks.length} outfits`}</small></button>`;
        }).join("")}</div>
        ${fam === "band" ? `<p class="small muted">The original band hold their own instruments, so each stays in their own role.</p>` : `<p class="small muted">Tribe characters can play any role. Their art has no instrument yet.</p>`}
        <div class="ward-preview"><img src="${look.sprite}" alt="${esc(c.name)} in the ${esc(look.outfit)} outfit"></div>
        <fieldset class="field"><legend>Outfit</legend><div class="chips">${c.looks.map((l) => `<label class="pick"><input type="radio" name="look" value="${l.id}" ${l.id === look.id ? "checked" : ""}><span>${esc(l.outfit)}</span></label>`).join("")}</div></fieldset>
        <p class="small muted">Looks are cosmetic: ${esc(me.name)}'s skills, energy and role stay the same.</p>
        <button class="btn btn-primary" type="button" data-wear ${equipped || taken ? "disabled" : ""}>${equipped ? `${icon("check")}Wearing this now` : taken ? `${esc(c.name)} is already in the band` : `Put ${esc(c.name)} on ${me.roleLabel.toLowerCase()} ${icon("arrow")}`}</button>`;
    };
    render();
    dlg.onchange = (e) => {
      if (e.target.name === "fam") { fam = e.target.value; const first = cast.find((x) => x.family === fam && !takenBy(x.id)) || cast.find((x) => x.family === fam); pickChar = first.id; pickLook = first.looks[0].id; render(); }
      if (e.target.name === "look") { pickLook = e.target.value; render(); }
    };
    dlg.onclick = (e) => {
      if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
      const card = e.target.closest("[data-char]");
      if (card && !card.disabled) { pickChar = card.dataset.char; const c = cast.find((x) => x.id === pickChar); pickLook = c.looks[0].id; return render(); }
      const wear = e.target.closest("[data-wear]");
      if (wear && !wear.disabled) {
        const c = cast.find((x) => x.id === pickChar), look = c.looks.find((l) => l.id === pickLook) || c.looks[0];
        if (c.id === id && look.id === id) delete raw(id).look; else raw(id).look = { character: c.id, look: look.id };
        save();
        dlg.close();
        toast(`${c.name} is on ${me.roleLabel.toLowerCase()} in the ${look.outfit.toLowerCase()} outfit.`);
        go(view);
      }
    };
    dlg.showModal();
  }

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
        <p class="muted">${esc(m.bio)}</p>
        <button class="btn" type="button" data-m="look">${icon("crew")}Change look · <span class="muted">${esc(m.outfit)}</span></button>
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
      if (b.dataset.m === "look") { dlg.close(); return openWardrobe(id); }
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
          <label class="field"><span>Difficulty</span>
            <select data-difficulty>
              <option value="normal" ${state.band.difficulty !== "hard" ? "selected" : ""}>Normal: Pro studio unlocks at fame level 3</option>
              <option value="hard" ${state.band.difficulty === "hard" ? "selected" : ""}>Hard: Pro studio now</option>
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
      if (e.target.matches("[data-difficulty]")) { state.band.difficulty = e.target.value; save(); if (view === "music") go("music"); return; }
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
        <fieldset class="field"><legend>Difficulty</legend>
          <div class="chips">
            <label class="pick"><input type="radio" name="difficulty" value="normal" checked><span>Normal</span></label>
            <label class="pick"><input type="radio" name="difficulty" value="hard"><span>Hard</span></label>
          </div>
          <span class="small muted">Normal: the studio starts simple and Pro tools unlock as you get famous. Hard: Pro studio from day one and gigs start on Hard.</span>
        </fieldset>
        <button class="btn btn-primary" type="submit">Start in the garage ${icon("arrow")}</button>
      </form>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); };
    $("#band-form", dlg).onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim() || DATA.band.name;
      dlg.close();
      onDone(name, f.get("genre"), f.get("difficulty") === "hard" ? "hard" : "normal");
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
    // animated performances made from Runway clips (tools/prepare_animations.py); optional
    try { window.AMPED_ANIMS = (await fetch("assets/characters/anim/index.json").then((r) => r.json())).clips || {}; } catch { window.AMPED_ANIMS = {}; }
    applySettings();
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applySettings);
    const hasSave = !!load();
    const cont = $("#title-continue");
    cont.disabled = !hasSave;
    cont.textContent = hasSave ? `Continue · Day ${state.res.day}` : "Continue";
    cont.onclick = enterGame;
    $("#title-new").onclick = () => {
      const start = () => openBandSetup((name, genre, difficulty) => {
        const keep = state.settings; state = fresh(); state.settings = keep;
        state.band = { name, genre, difficulty };
        if (difficulty === "hard") state.next.difficulty = "hard";
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
