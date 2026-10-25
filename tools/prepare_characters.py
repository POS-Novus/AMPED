#!/usr/bin/env python3
"""Cut the character concept sheets in design/kit/ into transparent full-body sprites for the wardrobe.

- Five tribe sheets (headbangers, punks, hippies, kpop, trappers): three people per sheet,
  base outfit on the top row, stage outfit below. 30 looks.
- genre-wardrobe.png: Nia (guitar) in six genre outfits. 6 looks.

The sheets have a flat cream background. It is removed by flood-filling from the sheet edges
(plus enclosed cream pockets, e.g. between arms and body), with soft, colour-decontaminated
edges so no cream fringe shows on dark stages. Each figure is found as a connected shape,
trimmed, and scaled to the same height as the band cutouts (feet on the bottom edge).

Run from the repository root:  python3 tools/prepare_characters.py
Writes game/assets/characters/looks/*.webp, a contact sheet for review in tools/out/,
and game/assets/characters/looks/index.json. Needs Pillow, numpy, scipy.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "design" / "kit"
OUT = ROOT / "game" / "assets" / "characters" / "looks"
REVIEW = ROOT / "tools" / "out"
HEIGHT = 900            # same as the band cutouts (tools/prepare_assets.py)
HARD = 34               # colour distance from the background above which a pixel is surely figure
SOFT = 10               # below this it is surely background; between the two the edge is blended
POCKET_MIN = 120        # enclosed cream areas at least this big (px) are background too
POCKET_FLAT = 6         # ...if their colour is this close to the background on average

TRIBES = ["headbangers", "punks", "hippies", "kpop", "trappers"]
WARDROBE = ["rock", "punk", "indie", "metal", "pop", "electronic"]   # row by row, as in the kit README


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cut_sheet(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))

    # background = cream pixels connected to the sheet edge
    creamish = dist < HARD
    lab, _ = ndimage.label(creamish)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(edge_labels))
    # plus enclosed pockets of flat cream (gaps between arms and body, between legs)
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if i in edge_labels or sl is None:
            continue
        comp = lab[sl] == i
        if comp.sum() >= POCKET_MIN and dist[sl][comp].mean() < POCKET_FLAT:
            outside[sl] |= comp

    # alpha: 1 inside the figure; on the boundary, blend by colour distance
    alpha = np.where(outside, 0.0, 1.0)
    edge = outside & ndimage.binary_dilation(~outside, iterations=2)
    alpha[edge] = np.clip((dist[edge] - SOFT) / (HARD - SOFT), 0, 1)
    # remove the cream that is mixed into soft edge pixels
    a = np.maximum(alpha, 1e-3)[..., None]
    clean = np.clip((rgb - (1 - a) * bg) / a, 0, 255)
    rgba = np.dstack([np.where(alpha[..., None] > 0, clean, 0), alpha * 255]).astype(np.uint8)

    # figures: big connected shapes; small loose bits (hair strands, sparkles) join the nearest figure
    solid = alpha > 0.5
    flab, n = ndimage.label(ndimage.binary_closing(solid, iterations=3))
    sizes = ndimage.sum(solid, flab, range(1, n + 1))
    big = {i + 1 for i, s in enumerate(sizes) if s > 8000}
    return rgba, flab, big, ndimage.find_objects(flab)


def figures(path, rows, cols):
    rgba, flab, big, objects = cut_sheet(path)
    h, w = flab.shape
    # assign every labelled shape to a grid cell by its centre; merge the shapes in each cell
    cells = {}
    for i, sl in enumerate(objects, start=1):
        if sl is None:
            continue
        ys, xs = sl
        cy, cx = (ys.start + ys.stop) / 2, (xs.start + xs.stop) / 2
        r, c = min(rows - 1, int(cy / h * rows)), min(cols - 1, int(cx / w * cols))
        if i not in big and (ys.stop - ys.start) * (xs.stop - xs.start) < 30:
            continue
        cells.setdefault((r, c), []).append(i)
    out = {}
    for (r, c), ids in cells.items():
        mask = np.isin(flab, ids)
        ys, xs = np.nonzero(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = rgba[y0:y1, x0:x1].copy()
        crop[..., 3] = np.where(mask[y0:y1, x0:x1], crop[..., 3], 0)
        out[(r, c)] = (crop, [int(x0), int(y0), int(x1), int(y1)])
    return out


def save(crop, dst):
    im = Image.fromarray(crop, "RGBA")
    scale = HEIGHT / im.height
    im = im.resize((max(1, round(im.width * scale)), HEIGHT), Image.LANCZOS)
    im.save(dst, quality=90, method=6)
    return im


def main():
    manifest = {e["id"]: e for e in json.loads((KIT / "design" / "asset-manifest.json").read_text())["assets"]}
    OUT.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    index = {"source": "design/kit (AMPED design kit v1)", "script": "tools/prepare_characters.py", "height": HEIGHT, "looks": []}
    review = []

    sheets = [(f"tribe-{t}", t, 2, 3) for t in TRIBES] + [("genre-wardrobe", "wardrobe", 2, 3)]
    for sheet_id, family, rows, cols in sheets:
        src = KIT / manifest[sheet_id]["path"]
        assert sha256(src) == manifest[sheet_id]["sha256"], f"{src} does not match the manifest"
        figs = figures(src, rows, cols)
        assert len(figs) == rows * cols, f"{sheet_id}: found {len(figs)} figures, expected {rows * cols}"
        for (r, c), (crop, bounds) in sorted(figs.items()):
            if family == "wardrobe":
                look_id, char_id, outfit = f"nia-{WARDROBE[r * cols + c]}", "nia", WARDROBE[r * cols + c]
            else:
                char_id = f"{family}_{'abc'[c]}"
                outfit = "base" if r == 0 else "stage"
                look_id = f"{char_id}_{outfit}"
            im = save(crop, OUT / f"{look_id}.webp")
            review.append(im)
            index["looks"].append({
                "id": look_id, "character": char_id, "family": family, "outfit": outfit,
                "path": f"assets/characters/looks/{look_id}.webp", "from": manifest[sheet_id]["path"],
                "cropBounds": bounds, "size": [im.width, im.height], "aspect": round(im.width / im.height, 4),
                "pivot": "bottom-centre (feet)",
            })
        print(f"{sheet_id}: {len(figs)} looks")

    (OUT / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    # contact sheet on the game's navy, to check edges
    th = 300
    thumbs = [im.resize((round(im.width * th / im.height), th), Image.LANCZOS) for im in review]
    per = 12
    width = max(sum(t.width for t in thumbs[i:i + per]) for i in range(0, len(thumbs), per)) + per * 8
    sheet = Image.new("RGB", (width, (th + 10) * ((len(thumbs) + per - 1) // per)), (22, 25, 43))
    for i, t in enumerate(thumbs):
        row = i // per
        x = sum(u.width + 8 for u in thumbs[row * per:i])
        sheet.paste(t, (x, row * (th + 10)), t)
    sheet.save(REVIEW / "looks-contact.png")
    print(f"Wrote {len(index['looks'])} looks to {OUT}")


if __name__ == "__main__":
    main()
