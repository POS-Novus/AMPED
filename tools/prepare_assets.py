#!/usr/bin/env python3
"""Build runtime assets for game/ from the untouched originals in design/kit/.

Run from the repository root:  python3 tools/prepare_assets.py
Writes game/assets/ and game/assets/derived.json (what was made, from what, how).
Needs Pillow.
"""
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
KIT = ROOT / "design" / "kit"
OUT = ROOT / "game" / "assets"

CHARACTERS = ["band-guitar", "band-vocals", "band-bass", "band-drums", "band-keys"]
CHARACTER_HEIGHT = 900          # px, after trimming transparent margins
ALPHA_TRIM = 20                 # ignore faint edge haze when finding the figure's bounds
BACKDROPS = {
    "hq-garage-backdrop": "world/hq-garage-backdrop.png",
    "venue-pub-backdrop": "world/venue-pub-backdrop.png",
    "keyart-garage": "marketing/keyart-garage.png",
}
SVG_FOLDERS = ["brand", "icons", "rhythm"]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    manifest = {e["id"]: e for e in json.loads((KIT / "design" / "asset-manifest.json").read_text())["assets"]}
    derived = {"source": "design/kit (AMPED design kit v1)", "script": "tools/prepare_assets.py", "files": []}

    (OUT / "characters").mkdir(parents=True, exist_ok=True)
    for cid in CHARACTERS:
        src = KIT / manifest[cid]["path"]
        assert sha256(src) == manifest[cid]["sha256"], f"{src} does not match the manifest"
        im = Image.open(src).convert("RGBA")
        bounds = im.getchannel("A").point(lambda a: 255 if a > ALPHA_TRIM else 0).getbbox()
        im = im.crop(bounds)
        scale = CHARACTER_HEIGHT / im.height
        im = im.resize((round(im.width * scale), CHARACTER_HEIGHT), Image.LANCZOS)
        dst = OUT / "characters" / f"{cid}.webp"
        im.save(dst, quality=90, method=6)
        derived["files"].append({
            "id": cid, "path": f"assets/characters/{cid}.webp", "from": manifest[cid]["path"],
            "trimBounds": list(bounds), "size": [im.width, im.height], "aspect": round(im.width / im.height, 4),
            "pivot": "bottom-centre (feet)", "process": f"trim alpha>{ALPHA_TRIM}, resize to {CHARACTER_HEIGHT}px high, webp q90",
        })

    (OUT / "world").mkdir(parents=True, exist_ok=True)
    for bid, rel in BACKDROPS.items():
        src = KIT / "assets" / rel
        assert sha256(src) == manifest[bid]["sha256"], f"{src} does not match the manifest"
        im = Image.open(src).convert("RGB")
        dst = OUT / "world" / f"{bid}.webp"
        im.save(dst, quality=86, method=6)
        derived["files"].append({
            "id": bid, "path": f"assets/world/{bid}.webp", "from": f"assets/{rel}",
            "size": [im.width, im.height], "process": "webp q86, no resize",
        })

    for folder in SVG_FOLDERS:
        dst_dir = OUT / folder
        dst_dir.mkdir(parents=True, exist_ok=True)
        for svg in sorted((KIT / "assets" / folder).glob("*.svg")):
            shutil.copy2(svg, dst_dir / svg.name)
        derived["files"].append({"folder": f"assets/{folder}/", "from": f"assets/{folder}/", "process": "copied unchanged"})

    fonts = OUT / "fonts"
    fonts.mkdir(parents=True, exist_ok=True)
    for f in (KIT / "assets" / "fonts").iterdir():
        shutil.copy2(f, fonts / f.name)
    derived["files"].append({"folder": "assets/fonts/", "from": "assets/fonts/", "process": "copied unchanged, licence included"})

    (OUT / "derived.json").write_text(json.dumps(derived, indent=2) + "\n")
    print(f"Wrote {len(derived['files'])} entries to {OUT / 'derived.json'}")


if __name__ == "__main__":
    main()
