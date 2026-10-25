// Live-concert camera for gigs: cuts on the beat between wide shots, close-ups of each player,
// two-shots and a low angle from the crowd, each with a slow push-in. Section changes cut to a
// wide shot with a light flash; choruses pulse the lights on every beat. Beams and crowd colours
// follow the genre. The band art is static: the movement is all camera, light and crowd.
window.AmpedDirector = (() => {
  const LIGHTS = {
    metal: ["#ff4b2b", "#ffb02e"], rock: ["#ffb347", "#ff648e"], punk: ["#ff648e", "#75e3b0"],
    pop: ["#ff8ad8", "#46d9e8"], indie: ["#a792ff", "#ffcf6e"], electronic: ["#46d9e8", "#ff3df2"]
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // A row of fans in the foreground, in front of the stage art but outside the camera, so the
  // band is always seen over the crowd's heads. More people at bigger venues.
  function crowd(capacity, colors) {
    const n = clamp(Math.round(Math.log10(Math.max(capacity, 10)) * 7), 8, 30);
    let shapes = "";
    for (let i = 0; i < n; i++) {
      const sc = 0.8 + ((i * 37) % 10) / 25;
      const x = (i + 0.5) / n * 200 + Math.sin(i * 12.9) * (60 / n), r = 4.2 * sc, y = 40 - r * 4.6;
      const arm = i % 3 !== 1;
      shapes += `<g class="fan" style="--d:${((i * 7) % 5) / 10}s">
        ${arm ? `<rect class="arm" x="${x + (i % 2 ? r * 0.6 : -r * 1.2)}" y="${y - r * 3.2}" width="${r * 0.55}" height="${r * 3}" rx="${r * 0.27}"/>` : ""}
        <circle cx="${x}" cy="${y}" r="${r}"/>
        <rect x="${x - r * 1.7}" y="${y + r * 0.8}" width="${r * 3.4}" height="${r * 6}" rx="${r}"/>
      </g>`;
    }
    return `<svg class="rh-crowd-fg" viewBox="0 0 200 40" preserveAspectRatio="xMidYMax slice" aria-hidden="true" style="--rim:${colors[0]}">${shapes}</svg>`;
  }

  // o: { stage, cam, scene, role, genre, sections, spb, capacity, reduced }
  function create(o) {
    const colors = LIGHTS[o.genre] || LIGHTS.rock;
    o.stage.style.setProperty("--b1", colors[0]);
    o.stage.style.setProperty("--b2", colors[1]);
    o.stage.style.setProperty("--beat", o.spb + "s");
    o.cam.insertAdjacentHTML("afterend", crowd(o.capacity || 80, colors));
    const crowdEl = o.stage.querySelector(".rh-crowd-fg");
    const flashEl = o.stage.querySelector(".rh-flash"), lightsEl = o.stage.querySelector(".rh-beams");

    const slots = o.scene.slots, roles = Object.keys(slots);
    const stageX = avg(roles.map((r) => slots[r].x));
    const feet = avg(roles.map((r) => slots[r].y)), h = avg(roles.map((r) => slots[r].h));
    const shot = {
      establish: () => ({ x: 50, y: 50, s: 1 }),
      wide: () => ({ x: stageX, y: feet - h * 0.55, s: clamp(60 / (h * 1.6), 1, 3) }),
      close: (r) => ({ x: slots[r].x, y: slots[r].y - slots[r].h * 0.55, s: clamp(62 / slots[r].h, 1.5, 6) }),
      two: (a, b) => ({ x: (slots[a].x + slots[b].x) / 2, y: (slots[a].y + slots[b].y) / 2 - h * 0.55, s: clamp(50 / h, 1.3, 4.5) }),
      crowd: () => ({ x: stageX, y: feet - h * 0.4, s: clamp(40 / h, 1.15, 2.6), pit: true })
    };
    // keep the frame inside the art: the subject can't pull an edge into view
    const css = (p) => {
      const lim = (p.s - 1) * 50;
      const tx = clamp(-(p.x - 50) * p.s, -lim, lim), ty = clamp(-(p.y - 50) * p.s, -lim, lim);
      return `translate(-50%, -50%) translate(${tx}%, ${ty}%) scale(${p.s})`;
    };

    let anim = null, nextCut = -Infinity, last = "", lastBeat = -1, section = "";
    function cut(p, beats, push = 1.07, drift = 0) {
      if (anim) anim.cancel();
      crowdEl.animate([{ transform: `scale(${p.pit ? 1.5 : 1})` }], { duration: 0, fill: "forwards" });
      const end = { ...p, s: p.s * push, x: p.x + drift };
      anim = o.cam.animate([{ transform: css(p) }, { transform: css(end) }], { duration: beats * o.spb * 1000, fill: "forwards", easing: "linear" });
    }
    function flash(strength = 0.5) {
      if (o.reduced) return;
      flashEl.animate([{ opacity: strength }, { opacity: 0 }], { duration: 260, easing: "ease-out" });
    }
    const others = roles.filter((r) => r !== o.role);
    const rnd = (xs) => xs[Math.floor(Math.random() * xs.length)];
    function choose(inChorus) {
      const roll = Math.random();
      const table = inChorus
        ? [[0.3, "mine"], [0.6, "other"], [0.75, "two"], [0.9, "crowd"], [1, "wide"]]
        : [[0.2, "wide"], [0.5, "mine"], [0.8, "other"], [0.9, "two"], [1, "crowd"]];
      let kind = table.find(([p]) => roll < p)[1];
      if (kind === last) kind = kind === "wide" ? "mine" : "wide";
      last = kind;
      if (kind === "mine") return shot.close(o.role);
      if (kind === "other") return shot.close(rnd(others));
      if (kind === "two") { const a = rnd(roles); return shot.two(a, rnd(roles.filter((r) => r !== a))); }
      return shot[kind]();
    }

    if (o.reduced) o.cam.style.transform = css(shot.wide());
    else cut(shot.establish(), 6, 1.12);

    return {
      // called every frame with the song position in beats (negative during the count-in)
      update(beat) {
        if (o.reduced || beat < 0) return;
        const secs = o.sections || [];
        const sec = secs.filter((x) => x.beat <= beat).pop();
        const name = sec ? sec.name : "Live";
        const chorus = name === "Chorus";
        if (name !== section) {
          section = name;
          cut(name === "Outro" ? shot.establish() : shot.wide(), chorus ? 4 : 6, 1.1, chorus ? 0 : 2);
          flash(chorus ? 0.6 : 0.35);
          nextCut = Math.floor(beat) + (chorus ? 4 : 6);
        } else if (beat >= nextCut) {
          const len = chorus ? 4 : name === "Intro" ? 4 : 8;
          cut(choose(chorus), len, 1.06 + Math.random() * 0.04, (Math.random() - 0.5) * 3);
          nextCut = Math.floor(beat) + len;
        }
        const b = Math.floor(beat);
        if (b !== lastBeat) {
          lastBeat = b;
          if (chorus) lightsEl.animate([{ opacity: 1 }, { opacity: 0.45 }], { duration: o.spb * 900, easing: "ease-out" });
        }
      },
      flash,
      pause() { if (anim) anim.pause(); },
      resume() { if (anim) anim.play(); },
      stop() { if (anim) anim.cancel(); }
    };
  }

  return { create };
})();
