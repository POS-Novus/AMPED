#!/usr/bin/env python3
"""Turn Runway clips into beat-synced character animations for the game.

Put each clip in design/animations/clips/ named  <look>__<role>__<move>.<mp4|mov|webm>
  look:  the input still it was made from (design/animations/inputs/<look>__<role>.png)
  move:  play | headbang | fist | dance | jump | crowd
Clips made from the green input stills are keyed automatically; clips exported with
transparency (e.g. Runway's background removal, as WebM/MOV with alpha) are used as they are.

For each clip: frames are read at 24 fps, the background removed (soft edges, green spill
removed), the loop point found (the frame that best matches the first), FRAMES frames sampled
over one loop, and written as one horizontal sprite strip:
  game/assets/characters/anim/<look>__<role>__<move>.webp
plus game/assets/characters/anim/index.json, which tells the game how many frames there are,
how many beats one loop lasts, and where the frames sit relative to the character's feet.

Run from the repository root:  python3 tools/prepare_animations.py
Needs ffmpeg, Pillow, numpy.
"""
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CLIPS = ROOT / "design" / "animations" / "clips"
OUT = ROOT / "game" / "assets" / "characters" / "anim"
FRAMES = 24
HEIGHT = 480                       # strip height in px
# where the character stands in the input stills (tools/runway/make_inputs.js)
STILL = {"feet": 0.94, "height": 0.66}
BEATS = {"play": 4, "headbang": 2, "fist": 4, "dance": 4, "jump": 2, "crowd": 4}
KEY_HARD, KEY_SOFT = 70, 30        # colour distance from the background: surely figure / surely background


def read_frames(path, tmp):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(path), "-vf", "fps=24", "-pix_fmt", "rgba", f"{tmp}/f%04d.png"], check=True)
    return [np.asarray(Image.open(f).convert("RGBA")).astype(np.float32) for f in sorted(Path(tmp).glob("f*.png"))]


def key(frames):
    """Alpha from the background colour when the clip has none."""
    if frames[0][..., 3].min() < 250:
        return frames
    f0 = frames[0]
    border = np.concatenate([f0[0, :, :3], f0[-1, :, :3], f0[:, 0, :3], f0[:, -1, :3]])
    bg = np.median(border, axis=0)
    out = []
    for f in frames:
        rgb = f[..., :3]
        d = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
        a = np.clip((d - KEY_SOFT) / (KEY_HARD - KEY_SOFT), 0, 1)
        # remove the background's colour cast from soft edges, then green spill
        am = np.maximum(a, 1e-3)[..., None]
        rgb = np.clip((rgb - (1 - am) * bg) / am, 0, 255)
        g = bg.argmax()
        others = [c for c in range(3) if c != g]
        cap = rgb[..., others].max(axis=2)
        rgb[..., g] = np.minimum(rgb[..., g], cap + 12)
        out.append(np.dstack([rgb, a * 255]))
    return out


def loop_end(frames):
    """Index of the frame most like the first, in the clip's second half (a natural loop point)."""
    small = [np.asarray(Image.fromarray(f.astype(np.uint8)).resize((64, 64))).astype(np.float32) for f in frames]
    start = max(2, int(len(frames) * 0.3))
    if len(frames) - start < 2:
        return len(frames)
    diffs = np.array([np.abs(small[i] - small[0]).mean() for i in range(start, len(frames))])
    # the earliest frame that is about as good a match as the best one (clips often hold two loops)
    good = np.nonzero(diffs <= diffs.min() * 1.15 + 0.5)[0]
    return start + int(good[0])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"clips": {}}
    clips = sorted([p for p in CLIPS.glob("*") if p.suffix.lower() in (".mp4", ".mov", ".webm")]) if CLIPS.exists() else []
    if not clips:
        print(f"No clips in {CLIPS.relative_to(ROOT)}. Name them <look>__<role>__<move>.mp4")
    for path in clips:
        parts = path.stem.split("__")
        if len(parts) != 3 or parts[2] not in BEATS:
            print(f"skip {path.name}: name it <look>__<role>__<move> with move one of {', '.join(BEATS)}")
            continue
        look, role, move = parts
        with tempfile.TemporaryDirectory() as tmp:
            frames = key(read_frames(path, tmp))
        end = loop_end(frames)
        pick = [frames[int(i * end / FRAMES)] for i in range(FRAMES)]
        H, W = pick[0].shape[:2]
        # one crop box for all frames, so the character doesn't jitter
        alpha = np.max([f[..., 3] for f in pick], axis=0) > 20
        ys, xs = np.nonzero(alpha)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        scale = HEIGHT / (y1 - y0)
        fw = max(1, round((x1 - x0) * scale))
        strip = Image.new("RGBA", (fw * FRAMES, HEIGHT))
        for i, f in enumerate(pick):
            im = Image.fromarray(f[y0:y1, x0:x1].astype(np.uint8), "RGBA").resize((fw, HEIGHT), Image.LANCZOS)
            strip.paste(im, (i * fw, 0))
        name = f"{look}__{role}__{move}"
        strip.save(OUT / f"{name}.webp", quality=82, method=6)
        # the crop box in units of the character's height, measured from the feet (centre, bottom)
        ch, feet, cx = STILL["height"] * H, STILL["feet"] * H, W / 2
        index["clips"][name] = {
            "file": f"assets/characters/anim/{name}.webp", "frames": FRAMES, "fw": fw, "fh": HEIGHT, "beats": BEATS[move],
            "box": {"left": round((x0 - cx) / ch, 4), "top": round((y0 - feet) / ch, 4), "width": round((x1 - x0) / ch, 4), "height": round((y1 - y0) / ch, 4)},
            "from": f"design/animations/clips/{path.name}", "loopFrames": end,
        }
        print(f"{name}: {FRAMES} frames from a {end}-frame loop, {fw}x{HEIGHT} each")
    index_path.write_text(json.dumps(index, indent=1) + "\n")


if __name__ == "__main__":
    main()
