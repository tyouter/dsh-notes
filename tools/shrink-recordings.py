#!/usr/bin/env python3
"""Re-encode the final recordings to repo-friendly GIFs.

The recorder writes 1600px GIFs (5-10 MB). README images do not need that: 900px with one shared
palette per clip is a few times smaller and still readable.

  <python> tools/shrink-recordings.py
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(ROOT)
RECORDINGS = os.path.join(WORKSPACE, "recordings")
OUT = os.path.join(ROOT, "docs", "marketing")

CLIP_START = {
    "rec-20261104-140544": 16,  # the first ~2.5s show the recorder panel that filmed it
}

CLIPS = {
    "rec-20261104-113436": "demo-a-write.gif",
    "rec-20261104-115008": "demo-b-history.gif",
    "rec-20261104-140544": "demo-c-board.gif",
}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for source, target in CLIPS.items():
        frames = sorted(glob.glob(os.path.join(RECORDINGS, source, "frames", "*.png")))[CLIP_START.get(source, 0):]
        if not frames:
            print(f"no frames for {source}")
            continue
        first = Image.open(frames[0]).convert("RGB")
        ratio = 900 / first.width
        size = (900, max(1, round(first.height * ratio)))
        images = [Image.open(path).convert("RGB").resize(size, Image.LANCZOS) for path in frames]
        palette = images[len(images) // 2].quantize(colors=96, method=Image.MEDIANCUT)
        quantized = [image.quantize(palette=palette, dither=Image.NONE) for image in images]
        # 6 fps: the recordings were captured at that rate.
        duration = 167
        path = os.path.join(OUT, target)
        quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=duration, loop=0, optimize=True, disposal=2)
        print(f"{target}: {len(quantized)} frames, {size[0]}x{size[1]}, {os.path.getsize(path) / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
