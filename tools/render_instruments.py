#!/usr/bin/env python3
"""Render sampled instruments for the in-game band from the GeneralUser GS SoundFont
(design/instruments/GeneralUser-GS.sf2, licence in design/instruments/LICENSE.txt).

Each instrument is rendered note by note into short mono MP3s in game/assets/instruments/<id>/,
plus game/assets/instruments/index.json describing keys, velocities and files.
The browser picks the nearest rendered note and pitch-shifts the rest.

Run from the repository root:  python3 tools/render_instruments.py
Needs: tinysoundfont (pip install --no-deps tinysoundfont), numpy, soundfile, ffmpeg.
"""
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import tinysoundfont

ROOT = Path(__file__).resolve().parent.parent
SF2 = ROOT / "design" / "instruments" / "GeneralUser-GS.sf2"
OUT = ROOT / "game" / "assets" / "instruments"
SR = 44100

# id: (bank, preset, drums?, keys, note length s, velocities)
PITCHED_STEP = 3   # render every minor third; the browser shifts by at most 1 semitone either way
INSTRUMENTS = {
    "guitar-dist":  dict(bank=0, preset=30, keys=range(40, 80, PITCHED_STEP), length=2.6, vel=[110]),
    "guitar-power": dict(bank=0, preset=30, keys=range(38, 60, 2), length=2.6, vel=[110], chord=[0, 7, 12]),
    "guitar-clean": dict(bank=0, preset=27, keys=range(40, 80, PITCHED_STEP), length=2.6, vel=[100]),
    "guitar-steel": dict(bank=0, preset=25, keys=range(40, 80, PITCHED_STEP), length=2.6, vel=[100]),
    "bass-pick":    dict(bank=0, preset=34, keys=range(28, 58, PITCHED_STEP), length=2.0, vel=[110]),
    "piano":        dict(bank=0, preset=0,  keys=range(43, 88, PITCHED_STEP), length=3.0, vel=[95]),
    "organ":        dict(bank=0, preset=18, keys=range(43, 88, PITCHED_STEP), length=3.0, vel=[95]),
    "voice-lead":   dict(bank=0, preset=85, keys=range(52, 82, PITCHED_STEP), length=3.0, vel=[100]),
    "voice-choir":  dict(bank=0, preset=52, keys=range(46, 82, PITCHED_STEP), length=3.5, vel=[90]),
}
# GM drum keys: kick, snare, side stick, closed hat, pedal hat, open hat, crash, crash 2, ride, toms high..low
DRUM_KEYS = {"kick": 36, "snare": 38, "rim": 37, "hat": 42, "pedal": 44, "ohat": 46, "crash": 49, "crash2": 57,
             "ride": 51, "tom1": 50, "tom2": 48, "tom3": 45, "tom4": 43}
KITS = {"drums-power": 16, "drums-standard": 0}
DRUM_VELS = [70, 118]


def render(synth, sfid, bank, preset, keys, length, vel, drums=False, release=0.6):
    synth.program_select(0, sfid, bank, preset, is_drums=drums)
    synth.sounds_off(0)
    synth.generate(int(SR * 0.2))                 # flush
    for k in keys:
        synth.noteon(0, k, vel)
    on = np.frombuffer(synth.generate(int(SR * length)), dtype=np.float32)
    for k in keys:
        synth.noteoff(0, k)
    off = np.frombuffer(synth.generate(int(SR * release)), dtype=np.float32)
    y = np.concatenate([on, off]).reshape(-1, 2).mean(axis=1)
    synth.sounds_off(0)
    synth.generate(int(SR * 0.3))
    # trim leading silence (keeps note onsets sample-accurate) and trailing silence
    nz = np.nonzero(np.abs(y) > 1e-4)[0]
    if len(nz) == 0:
        return None
    y = y[nz[0]:nz[-1] + 1]
    fade = min(len(y), int(SR * 0.05))
    y[-fade:] *= np.linspace(1, 0, fade)
    return y


def to_mp3(y, path, tmp):
    wav = Path(tmp) / "x.wav"
    sf.write(wav, y, SR, subtype="PCM_16")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", str(path)], check=True)


def main():
    synth = tinysoundfont.Synth(samplerate=SR)
    sfid = synth.sfload(str(SF2))
    index = {"source": "GeneralUser GS v2.0.3 by S. Christian Collins", "licence": "design/instruments/LICENSE.txt", "instruments": {}}
    peak_all = 0
    with tempfile.TemporaryDirectory() as tmp:
        for iid, spec in INSTRUMENTS.items():
            d = OUT / iid
            d.mkdir(parents=True, exist_ok=True)
            notes = []
            for k in spec["keys"]:
                for v in spec["vel"]:
                    keys = [k + iv for iv in spec.get("chord", [0])]
                    y = render(synth, sfid, spec["bank"], spec["preset"], keys, spec["length"], v)
                    if y is None:
                        continue
                    peak_all = max(peak_all, float(np.abs(y).max()))
                    name = f"{k}-{v}.mp3"
                    to_mp3(y, d / name, tmp)
                    notes.append({"key": k, "vel": v, "file": f"assets/instruments/{iid}/{name}"})
            index["instruments"][iid] = {"type": "pitched", "preset": spec["preset"], "notes": notes}
            print(f"{iid}: {len(notes)} samples")
        for kid, preset in KITS.items():
            d = OUT / kid
            d.mkdir(parents=True, exist_ok=True)
            pieces = {}
            for piece, key in DRUM_KEYS.items():
                pieces[piece] = []
                for v in DRUM_VELS:
                    y = render(synth, sfid, 128, preset, [key], 1.6 if piece in ("crash", "crash2", "ride", "ohat") else 0.8, v, drums=True, release=0.4)
                    if y is None:
                        continue
                    name = f"{piece}-{v}.mp3"
                    to_mp3(y, d / name, tmp)
                    pieces[piece].append({"vel": v, "file": f"assets/instruments/{kid}/{name}"})
            index["instruments"][kid] = {"type": "drums", "preset": preset, "pieces": pieces}
            print(f"{kid}: {sum(len(v) for v in pieces.values())} samples")
    (OUT / "index.json").write_text(json.dumps(index, indent=1) + "\n")
    print("peak level", round(peak_all, 3))


if __name__ == "__main__":
    main()
