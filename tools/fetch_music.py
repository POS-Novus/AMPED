#!/usr/bin/env python3
"""Fetch candidate music pages from OpenGameArt: save the page, its title, author,
licence text and audio files, so licences can be checked before anything is used.

Usage: python3 tools/fetch_music.py OUT_DIR URL [URL ...]
Run by .github/workflows/fetch-music.yml (the cloud session cannot reach these hosts).
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

AUDIO = re.compile(r'href="(https?://opengameart\.org/sites/default/files/[^"]+\.(?:mp3|ogg|wav|flac|zip))"', re.I)
MAX_BYTES = 40 * 1024 * 1024


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "AMPED-music-check/1.0 (game prototype)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.geturl(), r.read()


def text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", " ", fragment)).split()


def field(page, label):
    m = re.search(label + r".*?</div>(.*?)</div>\s*</div>", page, re.S | re.I)
    return " ".join(text(m.group(1))) if m else ""


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    report = []
    for i, url in enumerate(sys.argv[2:]):
        entry = {"page": url}
        try:
            final, body = get(url)
            page = body.decode("utf-8", "replace")
            slug = f"{i:02d}-" + re.sub(r"[^a-z0-9]+", "-", urllib.parse.urlparse(final).path.lower()).strip("-")[:60]
            (out / f"{slug}.html").write_text(page)
            title = re.search(r"<title>(.*?)</title>", page, re.S)
            entry.update({
                "final": final, "slug": slug,
                "title": html.unescape(title.group(1)).strip() if title else "",
                "author": field(page, r"Author:"),
                "licenses": field(page, r"License\(s\):"),
                "attribution": field(page, r"Attribution Instructions:"),
                "files": [],
            })
            for f in dict.fromkeys(AUDIO.findall(page)):
                name = urllib.parse.unquote(f.rsplit("/", 1)[1])
                try:
                    _, data = get(f)
                    if len(data) > MAX_BYTES:
                        entry["files"].append({"url": f, "skipped": f"{len(data)} bytes"})
                        continue
                    (out / f"{slug}__{name}").write_bytes(data)
                    entry["files"].append({"url": f, "saved": f"{slug}__{name}", "bytes": len(data)})
                except Exception as e:  # keep going; report the failure
                    entry["files"].append({"url": f, "error": str(e)})
        except Exception as e:
            entry["error"] = str(e)
        report.append(entry)
        print(json.dumps(entry)[:400])
    (out / "report.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
