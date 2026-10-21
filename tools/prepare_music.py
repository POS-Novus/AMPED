#!/usr/bin/env python3
"""Turn licensed music in design/music/ into game files: a loudness-normalised MP3 excerpt
and an auto-generated chart per song (game/assets/music/<id>.mp3 + <id>.json).

Run from the repository root:  python3 tools/prepare_music.py
Needs ffmpeg, numpy, librosa, soundfile.

Charts are machine-made from the mixed recording (no separate instrument tracks exist):
- drums  : percussive onsets split into kick / snare / hat / crash by frequency band
- bass   : low harmonic onsets, lane by pitch
- guitar : mid harmonic onsets, lane by pitch
- keys   : chord changes on the beat, lane by chord root
- vocals : the lead melody (these tracks are instrumental), lane by pitch
Everything is snapped to a 1/4-beat grid from a fixed tempo found by fitting the beats.
"""
import json
import subprocess
import tempfile
import warnings
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "music"
OUT = ROOT / "game" / "assets" / "music"
SR = 22050
HOP = 256

TRACKS = json.loads((SRC / "sources.json").read_text())


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *args], check=True)


def excerpt(track, tmp):
    """Cut, fade and loudness-normalise to a WAV; return its path."""
    src = SRC / track["file"]
    filters = []
    if track.get("end"):
        length = track["end"] - track.get("start", 0)
        filters.append(f"afade=t=out:st={length - track.get('fadeOut', 3):.3f}:d={track.get('fadeOut', 3)}")
    filters.append("loudnorm=I=-16:TP=-1.5:LRA=11")
    out = Path(tmp) / f"{track['id']}.wav"
    args = ["-i", str(src)]
    if track.get("start"):
        args = ["-ss", str(track["start"])] + args
    if track.get("end"):
        args += ["-t", f"{track['end'] - track.get('start', 0):.3f}"]
    ffmpeg(*args, "-af", ",".join(filters), "-ar", "44100", "-ac", "2", str(out))
    return out


def fit_grid(y, bpm_hint):
    """Fixed tempo + phase that best fit the kick and snare (they define the beat in rock),
    refined around the hint. Hi-hats are left out: busy sixteenths would pull the phase."""
    yp = librosa.effects.percussive(y)
    S = librosa.amplitude_to_db(np.abs(librosa.stft(yp, hop_length=HOP)), ref=np.max)
    rows = librosa.fft_frequencies(sr=SR) < 2500
    oenv = np.concatenate([[0], np.maximum(0, np.diff(S[rows], axis=1)).mean(axis=0)])
    oenv = oenv / (oenv.max() + 1e-9)
    fps = SR / HOP
    dur = len(y) / SR
    best = (0, bpm_hint, 0)
    for bpm in np.arange(bpm_hint - 1.0, bpm_hint + 1.0001, 0.02):
        period = 60 / bpm
        for phase in np.arange(0, period, 0.004):
            fr = np.round(np.arange(phase, dur - 0.05, period) * fps).astype(int)
            s = oenv[fr[fr < len(oenv)]].mean()
            if s > best[0]:
                best = (s, bpm, phase)
    return float(best[1]), float(best[2])


def band_onsets(S_db, freqs, lo, hi, delta):
    """Onset times (frames) and strengths from one frequency band of a dB spectrogram."""
    rows = (freqs >= lo) & (freqs < hi)
    flux = np.maximum(0, np.diff(S_db[rows], axis=1)).mean(axis=0)
    flux = np.concatenate([[0], flux])
    flux = flux / (flux.max() + 1e-9)
    peaks = librosa.util.peak_pick(flux, pre_max=3, post_max=3, pre_avg=8, post_avg=8, delta=delta, wait=4)
    return peaks, flux[peaks]


def snap(times, strengths, bpm, phase, max_err=0.06):
    """Snap to the nearest 1/4 beat; return {beat: strength} keeping the strongest per slot."""
    period = 60 / bpm
    out = {}
    for t, s in zip(times, strengths):
        q = round((t - phase) / period * 4) / 4
        if q < 0 or abs(phase + q * period - t) > max_err:
            continue
        if s > out.get(q, 0):
            out[q] = float(s)
    return out


def pitch_at(C, cqt_freqs, frame, lo, hi):
    rows = (cqt_freqs >= lo) & (cqt_freqs < hi)
    f = min(frame + 2, C.shape[1] - 1)       # just after the attack
    col = C[rows, f]
    return int(round(librosa.hz_to_midi(cqt_freqs[rows][int(np.argmax(col))])))


def pitch_lanes(pitches):
    """Lane per note from pitch quartiles (low = left), so lanes get used about equally.
    Runs of the same lane alternate with a neighbour, like a trill, instead of one long jack."""
    if not pitches:
        return []
    edges = np.percentile(pitches, [25, 50, 75])
    lanes = [int(np.searchsorted(edges, p, side="right")) for p in pitches]
    out, run = [], 0
    for i, l in enumerate(lanes):
        run = run + 1 if i and l == lanes[i - 1] and pitches[i] == pitches[i - 1] else 0
        if run % 2 == 1:
            l = l + 1 if l < 3 else l - 1
        out.append(min(3, l))
    return out


def accent(beat, s, thresh):
    return bool(beat % 1 == 0 or s >= thresh)


def chart(y, bpm, phase):
    yh, yp = librosa.effects.hpss(y)
    period = 60 / bpm
    to_time = lambda frames: librosa.frames_to_time(frames, sr=SR, hop_length=HOP)
    to_frame = lambda t: int(round(t * SR / HOP))

    Sp = librosa.amplitude_to_db(np.abs(librosa.stft(yp, hop_length=HOP)), ref=np.max)
    Sh = librosa.amplitude_to_db(np.abs(librosa.stft(yh, hop_length=HOP)), ref=np.max)
    freqs = librosa.fft_frequencies(sr=SR)
    C = np.abs(librosa.cqt(yh, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz("C1"), n_bins=84))
    cqt_freqs = librosa.cqt_frequencies(84, fmin=librosa.note_to_hz("C1"))
    parts = {}

    # drums
    kinds = {}
    for kind, lo, hi, delta in (("kick", 30, 150, 0.12), ("snare", 150, 2500, 0.12), ("hat", 6000, 11000, 0.1)):
        fr, st = band_onsets(Sp, freqs, lo, hi, delta)
        kinds[kind] = snap(to_time(fr), st, bpm, phase)
    notes = []
    lane = {"kick": 0, "snare": 1, "hat": 2}
    for kind, hits in kinds.items():
        for b, s in hits.items():
            crash = kind == "hat" and s > 0.85 and b % 4 == 0
            l = 3 if crash or (kind == "hat" and b % 0.5 != 0) else lane[kind]   # off-beat hats use lane 4
            notes.append({"b": b, "l": l, "k": "crash" if crash else kind, "a": accent(b, s, 0.5)})
    parts["drums"] = sorted(notes, key=lambda n: (n["b"], n["l"]))

    # pitched parts from the harmonic layer
    for name, lo, hi, plo, phi, delta in (("bass", 40, 250, 30, 250, 0.1),
                                          ("guitar", 250, 2000, 80, 1000, 0.12),
                                          ("vocals", 500, 4000, 200, 1500, 0.12)):
        fr, st = band_onsets(Sh, freqs, lo, hi, delta)
        hits = snap(to_time(fr), st, bpm, phase)
        if not hits:
            parts[name] = []
            continue
        thresh = float(np.percentile(list(hits.values()), 60))
        raw = [(b, s, pitch_at(C, cqt_freqs, to_frame(phase + b * period), plo, phi)) for b, s in sorted(hits.items())]
        lanes = pitch_lanes([p for _, _, p in raw])
        parts[name] = [{"b": b, "l": l, "a": accent(b, s, thresh)} for (b, s, _), l in zip(raw, lanes)]

    # keys: chord roots on beats where the harmony changes, plus every downbeat
    chroma = librosa.feature.chroma_cqt(y=yh, sr=SR, hop_length=HOP)
    n_beats = int((len(y) / SR - phase) / period)
    roots, prev = [], None
    for k in range(n_beats):
        f0, f1 = to_frame(phase + k * period), to_frame(phase + (k + 1) * period)
        v = chroma[:, f0:max(f0 + 1, f1)].mean(axis=1)
        if v.max() < 0.2:
            continue
        root = int(np.argmax(v))
        change = prev is None or np.dot(v, prev) / (np.linalg.norm(v) * np.linalg.norm(prev) + 1e-9) < 0.9
        if change or k % 4 == 0:
            roots.append((k, root, change))
        prev = v
    lanes = pitch_lanes([r for _, r, _ in roots])
    parts["keys"] = [{"b": float(k), "l": l, "a": bool(ch or k % 4 == 0)} for (k, _, ch), l in zip(roots, lanes)]
    return parts


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    credits = []
    with tempfile.TemporaryDirectory() as tmp:
        for t in TRACKS:
            wav = excerpt(t, tmp)
            mp3 = OUT / f"{t['id']}.mp3"
            ffmpeg("-i", str(wav), "-codec:a", "libmp3lame", "-b:a", "160k", str(mp3))
            y, _ = librosa.load(wav, sr=SR, mono=True)
            meta = {k: t[k] for k in ("id", "title", "artist", "license", "licenseUrl", "page") if k in t}
            meta.update({"audio": f"assets/music/{t['id']}.mp3", "duration": round(len(y) / SR, 3), "role": t["role"]})
            if t["role"] == "gig":
                bpm, phase = fit_grid(y, t["bpm"])
                parts = chart(y, bpm, phase)
                meta.update({"bpm": round(bpm, 3), "firstBeat": round(phase, 4), "style": t["style"], "parts": parts})
                counts = {k: len(v) for k, v in parts.items()}
                print(f"{t['id']}: {bpm:.2f} bpm, first beat {phase:.3f}s, {meta['duration']:.1f}s, notes {counts}")
            else:
                meta["loop"] = True
                print(f"{t['id']}: menu loop, {meta['duration']:.1f}s")
            (OUT / f"{t['id']}.json").write_text(json.dumps(meta, separators=(",", ":")))
            credits.append({k: meta[k] for k in ("id", "title", "artist", "license", "licenseUrl", "page", "role")})
            credits[-1]["changes"] = t.get("changes", "")
    (OUT / "index.json").write_text(json.dumps(credits, indent=2) + "\n")


if __name__ == "__main__":
    main()
