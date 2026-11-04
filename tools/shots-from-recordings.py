#!/usr/bin/env python3
"""Extract the three stills the README shows, one per tab, from the recorded clips.

A still is a frame of a real recording, resized to 900px so the documentation stays light.

  <python> tools/shots-from-recordings.py
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORDINGS = os.path.join(os.path.dirname(ROOT), "recordings")
OUT = os.path.join(ROOT, "docs", "marketing")

# (clip, frame index inside the clip's frames dir, output name)
SHOTS = [
    ("rec-20261104-113436", 62, "shot-01-writing.png"),
    ("rec-20261104-115008", 32, "shot-05-history-edit.png"),
    ("rec-20261104-140544", 72, "shot-07-board-chart.png"),
]


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for clip, index, name in SHOTS:
        frames = sorted(glob.glob(os.path.join(RECORDINGS, clip, "frames", "*.png")))
        if not frames:
            print(f"no frames for {clip}")
            continue
        pick = frames[min(index, len(frames) - 1)]
        image = Image.open(pick).convert("RGB")
        ratio = 900 / image.width
        image = image.resize((900, max(1, round(image.height * ratio))), Image.LANCZOS)
        path = os.path.join(OUT, name)
        image.save(path, optimize=True)
        print(f"{name}: {os.path.basename(pick)}, {os.path.getsize(path) / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
