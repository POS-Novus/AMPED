// Makes the still images to upload to Runway (image to video), one per character look and role:
// the cutout, plus the instrument the game draws for it, standing on a flat chroma-green background,
// with headroom for raised arms and jumps. Also writes prompts.md next to them.
//
// Run from the repository root with the game served on port 8800:
//   (cd game && python3 -m http.server 8800) &
//   NODE_PATH=$(npm root -g) node tools/runway/make_inputs.js            # the default set
//   NODE_PATH=$(npm root -g) node tools/runway/make_inputs.js punks_a_base:drums nia-metal:guitar
// Output: design/animations/inputs/<look>__<role>.png (832x1104, Runway's 3:4 portrait size)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "design", "animations", "inputs");
const W = 832, H = 1104, GREEN = "#00b140";
const ROLES = ["vocals", "drums", "guitar", "bass", "keys"];

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  await p.goto("http://localhost:8800/");
  const cast = await p.evaluate(() => {
    const D = window.AMPED_DATA, out = [];
    D.members.forEach((m) => {
      out.push({ look: m.id, role: m.role, sprite: m.sprite, aspect: m.aspect, guest: false, family: "band" });
      (D.outfits[m.id] || []).forEach((o) => out.push({ look: o.id, role: m.role, sprite: o.sprite, aspect: o.aspect, guest: false, family: "band" }));
    });
    D.characters.forEach((c) => c.looks.forEach((l) => out.push({ look: l.id, role: null, sprite: l.sprite, aspect: l.aspect, guest: true, family: c.family, character: c.id })));
    return out;
  });
  // default: every original look in its own role, and each tribe character's base look in one role (spread over the five)
  let jobs = process.argv.slice(2).map((a) => { const [look, role] = a.split(":"); return { ...cast.find((c) => c.look === look), role }; });
  if (!jobs.length) {
    jobs = cast.filter((c) => !c.guest);
    cast.filter((c) => c.guest && c.look.endsWith("_base")).forEach((c, i) => jobs.push({ ...c, role: ROLES[i % ROLES.length] }));
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const j of jobs) {
    if (!j.sprite || !ROLES.includes(j.role)) { console.log("skip", j.look, j.role); continue; }
    const h = Math.round(H * 0.66), w = Math.round(h * j.aspect);
    await p.setContent(`<html><body style="margin:0;background:${GREEN};width:${W}px;height:${H}px;overflow:hidden">
      <div id="a" style="position:absolute;left:${(W - w) / 2}px;top:${H * 0.94 - h}px;width:${w}px;height:${h}px"></div></body></html>`);
    await p.addScriptTag({ url: "http://localhost:8800/js/props.js" });
    await p.evaluate((j) => {
      const pr = window.AmpedProps.forMember({ role: j.role, guest: j.guest, family: j.family }, j.aspect);
      const fix = (svg) => svg.replace("<svg ", '<svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible" ');
      document.getElementById("a").innerHTML = `<img src="http://localhost:8800/${j.sprite}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:bottom">${fix(pr.held)}${fix(pr.front)}`;
    }, j);
    await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
    const file = path.join(OUT, `${j.look}__${j.role}.png`);
    await p.screenshot({ path: file });
    console.log(path.relative(ROOT, file));
  }
  await b.close();
})();
