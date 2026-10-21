// Four-lane rhythm gig. Timing comes from the Web Audio clock, never from frame rate.
// The chart is generated from the song, role and difficulty (deterministic), on a temporary beat.
window.AmpedRhythm = (() => {
  const D = () => window.AMPED_DATA.rhythm;
  const reduced = () => document.documentElement.classList.contains("reduce-motion");

  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }

  // Returns [{ beat, lane }] sorted by beat. Beats are counted from the end of the count-in.
  function makeChart(songId, role, difficulty) {
    const cfg = D().difficulties[difficulty];
    const bias = D().laneBias[role] || D().laneBias.guitar;
    const rnd = seeded(`${songId}|${role}|${difficulty}`);
    const pickLane = (avoid) => {
      for (let tries = 0; tries < 6; tries++) {
        let r = rnd(), lane = 0;
        while (lane < 3 && r > bias[lane]) { r -= bias[lane]; lane++; }
        if (lane !== avoid) return lane;
      }
      return (avoid + 1 + Math.floor(rnd() * 3)) % 4;
    };
    const notes = [];
    let last = -1, run = 0;
    const total = D().beats;
    for (let b = 0; b < total - 2; b++) {
      const intro = b < 8 ? 0.6 : 1;
      const add = (beat) => {
        const avoid = run >= 2 ? last : -1;
        const lane = pickLane(avoid);
        run = lane === last ? run + 1 : 0; last = lane;
        notes.push({ beat, lane });
        if (rnd() < cfg.chord && b >= 8) notes.push({ beat, lane: (lane + 2) % 4 });
      };
      if (b % 4 === 0 || rnd() < cfg.quarter * intro) add(b);
      if (rnd() < cfg.eighth * intro) add(b + 0.5);
    }
    return notes;
  }

  function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }

  // opts: { song, role, roleLabel, difficulty, skill, crowdStart, settings, scene, members, onFinish(result), onQuit() }
  function start(host, opts) {
    const R = D(), A = window.AmpedAudio;
    const lanes = R.lanes;
    // Skill of the member you play widens the timing windows a little (up to +25%).
    const assist = 1 + Math.max(0, Math.min(0.25, ((opts.skill || 25) - 25) / 200));
    const win = { perfect: R.windows.perfect * assist, great: R.windows.great * assist, good: R.windows.good * assist };
    const diff = R.difficulties[opts.difficulty];
    const spb = 60 / R.bpm;
    const offset = (opts.settings.offsetMs || 0) / 1000;
    const keys = opts.settings.keys || lanes.map((l) => l.key);

    host.innerHTML = `
      <div class="rh" role="application" aria-label="Rhythm gig">
        <div class="rh-stage"></div>
        <div class="rh-shade"></div>
        <header class="rh-top">
          <button class="icon-btn rh-pause" type="button" aria-label="Pause"><span class="icon" style="-webkit-mask-image:url(assets/icons/pause.svg);mask-image:url(assets/icons/pause.svg)"></span></button>
          <div class="rh-title"><strong>${esc(opts.song.title)}</strong><span>${esc(opts.roleLabel)} · ${diff.label}</span></div>
          <div class="rh-score"><strong data-score>000000</strong><span>Score</span></div>
        </header>
        <div class="rh-crowd"><span>Crowd energy</span><div class="meter"><i data-crowd></i></div><b data-crowd-num></b></div>
        <div class="rh-side"><strong data-streak>0</strong><span>Note streak</span><em class="rh-judge" data-judge></em></div>
        <div class="rh-highway">
          <div class="rh-lanes">
            ${lanes.map((l, i) => `
              <button class="rh-lane" type="button" data-lane="${i}" style="--lane:${l.color}" aria-label="Lane ${i + 1}, key ${keys[i].toUpperCase()}">
                <span class="rh-receptor"><img src="${l.note}" alt=""><kbd>${keys[i].toUpperCase()}</kbd></span>
              </button>`).join("")}
          </div>
          <div class="rh-hitline"></div>
          <div class="rh-notes" aria-hidden="true"></div>
        </div>
        <div class="rh-foot"><span data-time></span><span class="rh-temp">Temporary beat · placeholder music</span></div>
        <div class="rh-overlay" hidden></div>
      </div>`;

    const root = host.querySelector(".rh");
    const $ = (sel) => root.querySelector(sel);
    const notesLayer = $(".rh-notes"), highway = $(".rh-highway"), overlay = $(".rh-overlay");
    const laneEls = [...root.querySelectorAll(".rh-lane")];

    const scene = window.AmpedScene.mount($(".rh-stage"), { scene: opts.scene, members: opts.members, ambience: false });
    scene.setLive(true);

    const chart = makeChart(opts.song.id, opts.role, opts.difficulty);
    const t0 = A.now() + 0.8;                       // count-in starts here
    const songStart = t0 + R.countIn * spb;
    const notes = chart.map((n) => ({ ...n, t: songStart + n.beat * spb, el: null, done: false }));
    const lastT = notes.length ? notes[notes.length - 1].t : songStart;
    const songEnd = songStart + R.beats * spb;
    const stopMusic = A.playTempBeat({ bpm: R.bpm, startAt: t0, countIn: R.countIn, beats: R.beats });

    const st = { score: 0, streak: 0, maxStreak: 0, crowd: opts.crowdStart || R.crowd.start, counts: { perfect: 0, great: 0, good: 0, miss: 0 }, paused: false, over: false };
    let raf = 0, finishTimer = 0;

    // ---------- judging ----------
    const inputTime = () => A.now() - offset;

    function press(lane) {
      if (st.paused || st.over) return;
      const t = inputTime();
      laneEls[lane].classList.remove("is-pressed"); void laneEls[lane].offsetWidth; laneEls[lane].classList.add("is-pressed");
      let best = null, bestD = Infinity;
      for (const n of notes) {
        if (n.done || n.lane !== lane) continue;
        const d = Math.abs(n.t - t);
        if (d < bestD) { best = n; bestD = d; }
        if (n.t - t > win.good) break;
      }
      if (!best || bestD > win.good) return;     // empty press: no penalty
      const grade = bestD <= win.perfect ? "perfect" : bestD <= win.great ? "great" : "good";
      judge(best, grade);
    }

    function judge(n, grade) {
      n.done = true;
      if (n.el) { n.el.remove(); n.el = null; }
      st.counts[grade]++;
      if (grade === "miss") {
        st.streak = 0;
        A.sfx.miss();
        laneEls[n.lane].classList.remove("is-miss"); void laneEls[n.lane].offsetWidth; laneEls[n.lane].classList.add("is-miss");
      } else {
        st.streak++;
        st.maxStreak = Math.max(st.maxStreak, st.streak);
        const mult = 1 + Math.min(3, Math.floor(st.streak / 10));
        st.score += R.points[grade] * mult;
        A.sfx.hit(n.lane);
        effect(n.lane, grade);
        if (st.streak % 10 === 0) scene.cheerAll();
      }
      st.crowd = Math.max(0, Math.min(100, st.crowd + R.crowd[grade]));
      showJudge(grade);
      hud();
      if (st.crowd <= 0) fail();
    }

    function effect(lane, grade) {
      const rec = laneEls[lane].querySelector(".rh-receptor");
      const fx = document.createElement("img");
      fx.className = "rh-fx " + (grade === "perfect" ? "burst" : "ring");
      fx.src = grade === "perfect" ? "assets/rhythm/hit-burst.svg" : "assets/rhythm/hit-ring.svg";
      fx.alt = "";
      rec.appendChild(fx);
      setTimeout(() => fx.remove(), 320);
    }

    let judgeTimer = 0;
    function showJudge(grade) {
      const el = $("[data-judge]");
      el.textContent = grade.toUpperCase();
      el.dataset.grade = grade;
      el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
      clearTimeout(judgeTimer);
      judgeTimer = setTimeout(() => { el.textContent = ""; }, 600);
    }

    function hud() {
      $("[data-score]").textContent = String(st.score).padStart(6, "0");
      $("[data-streak]").textContent = st.streak;
      $("[data-crowd]").style.width = st.crowd + "%";
      $("[data-crowd-num]").textContent = Math.round(st.crowd) + "%";
      root.classList.toggle("crowd-low", st.crowd < 25);
    }

    // ---------- frame loop (visuals only) ----------
    function frame() {
      if (st.over) return;
      const vis = A.now() - offset;
      const H = highway.clientHeight, hitY = H * 0.86;
      for (const n of notes) {
        if (n.done) continue;
        const dt = n.t - vis;
        if (dt > diff.travel * 1.1) break;
        if (vis - n.t > win.good) { judge(n, "miss"); if (st.over) return; continue; }
        if (!n.el) {
          n.el = document.createElement("img");
          n.el.className = "rh-note";
          n.el.src = lanes[n.lane].note;
          n.el.alt = "";
          n.el.style.left = `calc(${n.lane * 25 + 12.5}% )`;
          notesLayer.appendChild(n.el);
        }
        n.el.style.transform = `translate(-50%, ${hitY - (dt / diff.travel) * hitY}px) translateY(-50%)`;
      }
      const songPos = Math.max(0, vis - songStart);
      $("[data-time]").textContent = `${fmt(songPos)} / ${fmt(songEnd - songStart)}`;
      if (vis > Math.max(lastT, songEnd) + 0.6 && !finishTimer) finishTimer = setTimeout(finish, 400);
      raf = requestAnimationFrame(frame);
    }

    // ---------- countdown ----------
    function countdownLabel() {
      const vis = A.now() - offset;
      const beatsLeft = Math.ceil((songStart - vis) / spb);
      if (beatsLeft > 0 && beatsLeft <= R.countIn) {
        overlay.hidden = false;
        overlay.className = "rh-overlay count";
        overlay.innerHTML = `<strong>${beatsLeft}</strong>`;
        setTimeout(countdownLabel, 40);
      } else if (beatsLeft > R.countIn) {
        setTimeout(countdownLabel, 40);
      } else if (overlay.classList.contains("count")) {
        overlay.hidden = true; overlay.className = "rh-overlay";
      }
    }

    // ---------- pause ----------
    function pause() {
      if (st.paused || st.over) return;
      st.paused = true;
      A.suspend();
      overlay.hidden = false;
      overlay.className = "rh-overlay menu";
      overlay.innerHTML = `
        <div class="panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <h2 id="pause-title">Paused</h2>
          <p class="muted">The music stopped with you. Nothing is lost.</p>
          <button class="btn btn-primary" data-r="resume" type="button">Resume</button>
          <button class="btn" data-r="quit" type="button">Leave the stage</button>
          <p class="small muted">Leaving ends the gig with no pay and no energy spent.</p>
        </div>`;
      overlay.querySelector("[data-r=resume]").focus();
    }
    function resume() {
      if (!st.paused) return;
      overlay.className = "rh-overlay count";
      let n = 3;
      overlay.innerHTML = `<strong>${n}</strong>`;
      const tick = setInterval(() => {
        n--;
        if (n > 0) { overlay.innerHTML = `<strong>${n}</strong>`; return; }
        clearInterval(tick);
        overlay.hidden = true; overlay.className = "rh-overlay";
        st.paused = false;
        A.resume();
      }, 450);
    }

    // ---------- endings ----------
    function result(failed) {
      const total = notes.length;
      const c = st.counts;
      const acc = total ? (c.perfect + c.great * 0.7 + c.good * 0.4) / total : 0;
      return { failed, score: st.score, accuracy: acc, counts: { ...c }, total, maxStreak: st.maxStreak, crowd: st.crowd };
    }
    function finish() {
      if (st.over) return;
      st.over = true;
      cleanup();
      A.sfx.cheer();
      opts.onFinish(result(false));
    }
    function fail() {
      if (st.over) return;
      st.over = true;
      stopMusic();
      A.sfx.boo();
      overlay.hidden = false;
      overlay.className = "rh-overlay menu";
      overlay.innerHTML = `
        <div class="panel" role="alertdialog" aria-modal="true" aria-labelledby="fail-title">
          <span class="badge badge-red">Crowd lost</span>
          <h2 id="fail-title">Booed off.</h2>
          <p class="muted">The crowd energy hit zero. Practise the song and try again.</p>
          <button class="btn btn-primary" data-r="done" type="button">See what happened</button>
        </div>`;
      const btn = overlay.querySelector("[data-r=done]");
      btn.focus();
      btn.addEventListener("click", () => { cleanup(); opts.onFinish(result(true)); });
    }
    function quit() {
      st.over = true;
      stopMusic();
      cleanup();
      opts.onQuit();
    }

    // ---------- input ----------
    function onKey(e) {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "escape" || k === "p") { e.preventDefault(); st.paused ? resume() : pause(); return; }
      const lane = keys.indexOf(k);
      if (lane >= 0) { e.preventDefault(); press(lane); }
    }
    laneEls.forEach((el, i) => el.addEventListener("pointerdown", (e) => { e.preventDefault(); press(i); }));
    $(".rh-pause").addEventListener("click", pause);
    overlay.addEventListener("click", (e) => {
      const r = e.target.closest("[data-r]");
      if (!r) return;
      if (r.dataset.r === "resume") resume();
      if (r.dataset.r === "quit") quit();
    });
    const onHide = () => { if (document.hidden) pause(); };
    const onBlur = () => pause();
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("blur", onBlur);

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      cancelAnimationFrame(raf);
      clearTimeout(finishTimer);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onBlur);
      scene.stop();
      if (st.paused) A.resume();   // the audio clock is shared with SFX and menus
    }

    hud();
    countdownLabel();
    raf = requestAnimationFrame(frame);
    root.focus();
    return { pause, quit, _state: st, _notes: notes };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  return { start, makeChart };
})();
