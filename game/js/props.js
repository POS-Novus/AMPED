// Instruments drawn in code, in the kit's style (dark outline, flat colour, one highlight), for players
// whose art doesn't include one: every drummer gets a kit; characters from the tribe sheets get the
// instrument for their role. Coordinates: the actor's box, 0..W across (W = 100 x aspect) and 0..100
// down from the top of the head to the feet. Shapes may reach outside the box (the kit is wider).
window.AmpedProps = (() => {
  const INK = "#17131f";
  const FAMILY_FINISH = {
    headbangers: { body: "#2a2633", guard: "#d8333f" }, punks: { body: "#ff648e", guard: "#17131f" },
    hippies: { body: "#e09a3a", guard: "#fff1d6" }, kpop: { body: "#a792ff", guard: "#fff1d6" },
    trappers: { body: "#75e3b0", guard: "#2a2633" }, band: { body: "#46d9e8", guard: "#fff1d6" }
  };
  const line = (x1, y1, x2, y2, w, c = INK) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;

  // A guitar or bass lying along the x axis: body at x 0..36, headstock at the far end. Length 100.
  function guitar(finish, bass) {
    const neckEnd = 88, frets = [];
    for (let x = 40; x < neckEnd; x += bass ? 6.5 : 5.5) frets.push(line(x, 17.8, x, 22.2, 0.5, "#d9c9a3"));
    const strings = (bass ? [18.8, 19.9, 21.0, 22.1] : [18.6, 19.4, 20.2, 21.0, 21.8]).map((y) => line(10, y - 0.4, 98, y - 0.4, 0.25, "#f5ecd7")).join("");
    const body = bass
      ? "M3,20 C3,7 12,3 19,6 C24,8 27,4 31,6 C33,8 31,12 33,15 L35,17 L35,23 L33,25 C31,28 34,33 30,34 C25,36 22,33 18,35 C10,38 3,32 3,20 Z"
      : "M4,20 C4,6 13,2 21,6 C25,8 28,5 32,8 C34,10 32,13 34,15 L36,17 L36,23 L34,25 C32,27 34,30 32,32 C28,35 25,32 21,34 C13,38 4,34 4,20 Z";
    return `<g stroke-linejoin="round">
      <path d="${body}" fill="${finish.body}" stroke="${INK}" stroke-width="1.1"/>
      <path d="M8,13 C10,8 16,8 18,11" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M12,26 C14,31 22,31 26,27 L29,23 L22,22 Z" fill="${finish.guard}" stroke="${INK}" stroke-width=".6"/>
      <rect x="34" y="17.6" width="${neckEnd - 34}" height="4.8" fill="#7a4a26" stroke="${INK}" stroke-width=".8"/>
      ${frets.join("")}
      <path d="M${neckEnd},16.4 L99,14.2 L100,25.6 L${neckEnd},23.6 Z" fill="${finish.body}" stroke="${INK}" stroke-width=".9"/>
      ${[0, 1, 2].map((i) => `<circle cx="${91 + i * 3}" cy="15.3" r=".9" fill="#e8e1d0" stroke="${INK}" stroke-width=".4"/>`).join("")}
      <rect x="${bass ? 17 : 15}" y="15" width="3" height="10" rx=".6" fill="#2a2633" stroke="${INK}" stroke-width=".5"/>
      ${bass ? "" : `<rect x="23" y="15.5" width="3" height="9" rx=".6" fill="#2a2633" stroke="${INK}" stroke-width=".5"/>`}
      <rect x="8.5" y="16" width="2.6" height="8" rx=".5" fill="#c9c2b3" stroke="${INK}" stroke-width=".5"/>
      ${strings}
    </g>`;
  }

  // the instrument slung across the body, on a strap, hanging at the hip
  function slung(m, W) {
    const bass = m.role === "bass", cx = W / 2, f = FAMILY_FINISH[m.family] || FAMILY_FINISH.band;
    const len = bass ? 68 : 60, s = len / 100, bx = cx - len * 0.36, by = 66;
    return `<svg class="prop prop-held" viewBox="0 0 ${W} 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M${cx + 9},21 C${cx + 4},32 ${cx - 6},44 ${bx + 2},${by - 1}" fill="none" stroke="#2a2633" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M${cx + 9},21 C${cx + 4},32 ${cx - 6},44 ${bx + 2},${by - 1}" fill="none" stroke="${f.guard}" stroke-opacity=".5" stroke-width=".6" stroke-dasharray="1.5 2"/>
      <g transform="translate(${bx},${by}) rotate(-24) scale(${s}) translate(0,-20)">${guitar(f, bass)}</g>
    </svg>`;
  }

  function kit(m, W) {
    const cx = W / 2;
    const shell = (x, y, rx, ry, h, fill) => `<g><rect x="${x - rx}" y="${y}" width="${rx * 2}" height="${h}" fill="${fill}" stroke="${INK}" stroke-width=".9"/>
      <ellipse cx="${x}" cy="${y + h}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width=".9"/>
      <ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#efe6d2" stroke="${INK}" stroke-width=".9"/>
      ${line(x - rx, y + h * 0.5, x + rx, y + h * 0.5, 0.5, "#fff")}</g>`;
    const cymbal = (x, y, r, tilt, cls) => `<g class="${cls}" style="transform-origin:${x}px ${y}px">${line(x, y, x, 100, 0.8, "#8e889b")}
      <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.22}" transform="rotate(${tilt} ${x} ${y})" fill="#f2c14e" stroke="${INK}" stroke-width=".8"/>
      <ellipse cx="${x}" cy="${y - 0.4}" rx="${r * 0.5}" ry="${r * 0.09}" transform="rotate(${tilt} ${x} ${y})" fill="#fff3b8" opacity=".7"/></g>`;
    return `<svg class="prop prop-front prop-kit" viewBox="0 0 ${W} 100" preserveAspectRatio="none" aria-hidden="true">
      ${cymbal(cx - 30, 58, 9, -6, "hat")}
      ${cymbal(cx + 31, 40, 12, 8, "crash")}
      ${shell(cx + 20, 70, 9, 2.6, 13, "#d8333f")}
      ${shell(cx + 7, 54, 6.5, 2, 7, "#d8333f")}
      <circle cx="${cx}" cy="82" r="17" fill="#d8333f" stroke="${INK}" stroke-width="1.1"/>
      <circle cx="${cx}" cy="82" r="13.5" fill="#efe6d2" stroke="${INK}" stroke-width=".8"/>
      <text x="${cx}" y="84.5" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="6" fill="${INK}">AMPED</text>
      <path d="M${cx - 6},79 L${cx + 6},79" stroke="#f2c14e" stroke-width="1.2"/>
      ${shell(cx - 20, 66, 7.5, 2.2, 5, "#c9c2b3")}
      ${line(cx - 20, 73, cx - 24, 100, 0.8, "#8e889b")}${line(cx - 20, 73, cx - 16, 100, 0.8, "#8e889b")}
    </svg>`;
  }

  // two drumsticks for drummers whose art has none; each pivots at the hand
  function sticks(W) {
    const cx = W / 2;
    const stick = (x, y, side) => `<g class="stick stick-${side}" style="transform-origin:${x}px ${y}px">${line(x, y, x + (side === "l" ? -5 : 5), y - 15, 1.6, INK)}${line(x, y, x + (side === "l" ? -5 : 5), y - 15, 0.9, "#e9c88f")}</g>`;
    return `<svg class="prop prop-held prop-sticks" viewBox="0 0 ${W} 100" preserveAspectRatio="none" aria-hidden="true">${stick(cx - 11, 55, "l")}${stick(cx + 11, 55, "r")}</svg>`;
  }

  function keyboard(m, W) {
    const cx = W / 2, x0 = cx - 26, w = 52, y = 52, whites = [];
    for (let i = 0; i < 21; i++) whites.push(`<rect x="${x0 + 3 + i * 2.2}" y="${y + 2.5}" width="2.2" height="5" fill="#fff" stroke="${INK}" stroke-width=".25"/>`);
    const blacks = [];
    for (let i = 0; i < 20; i++) if (![2, 6, 9, 13, 16].includes(i % 21) && i % 7 !== 2 && i % 7 !== 6) blacks.push(`<rect x="${x0 + 4.5 + i * 2.2}" y="${y + 2.5}" width="1.3" height="3" fill="${INK}"/>`);
    return `<svg class="prop prop-front" viewBox="0 0 ${W} 100" preserveAspectRatio="none" aria-hidden="true">
      ${line(cx - 14, y + 8, cx + 14, 100, 1.4, "#8e889b")}${line(cx + 14, y + 8, cx - 14, 100, 1.4, "#8e889b")}
      <rect x="${x0}" y="${y}" width="${w}" height="9" rx="1.5" fill="#a792ff" stroke="${INK}" stroke-width="1"/>
      ${whites.join("")}${blacks.join("")}
      <rect x="${x0 + 2}" y="${y + 0.6}" width="10" height="1.4" rx=".6" fill="#46d9e8"/>
    </svg>`;
  }

  function micStand(m, W) {
    const cx = W / 2, px = cx + 13;
    return `<svg class="prop prop-front" viewBox="0 0 ${W} 100" preserveAspectRatio="none" aria-hidden="true">
      ${line(px, 34, px, 99, 1.2, "#8e889b")}${line(px, 99, px - 6, 100, 1.2, "#8e889b")}${line(px, 99, px + 6, 100, 1.2, "#8e889b")}
      ${line(px, 34, cx + 4, 17.5, 1.1, "#8e889b")}
      <g transform="rotate(-50 ${cx + 3} 16.5)"><rect x="${cx + 1.4}" y="13.5" width="3.4" height="6.5" rx="1.6" fill="#2a2633" stroke="${INK}" stroke-width=".6"/>
      <rect x="${cx + 1.4}" y="13.5" width="3.4" height="3" rx="1.6" fill="#c9c2b3" stroke="${INK}" stroke-width=".5"/></g>
    </svg>`;
  }

  // What to draw for a member. m: { role, guest, family }
  function forMember(m, aspect) {
    const W = Math.round(100 * aspect * 100) / 100, out = { held: "", front: "" };
    if (m.role === "drums") { out.front = kit(m, W); if (m.guest) out.held = sticks(W); }
    else if (m.guest && (m.role === "guitar" || m.role === "bass")) out.held = slung(m, W);
    else if (m.guest && m.role === "keys") out.front = keyboard(m, W);
    else if (m.guest && m.role === "vocals") out.front = micStand(m, W);
    return out;
  }

  return { forMember };
})();
