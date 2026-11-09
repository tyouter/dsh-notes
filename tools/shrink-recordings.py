#!/usr/bin/env python3
"""Re-encode the final recordings to repo-friendly GIFs.

The recorder writes 1600px GIFs (5-10 MB). README images do not need that: 900px with one shared
palette per clip is a few times smaller and still readable.

  <python> tools/shrink-recordings.py

`CLIP_START` skips a clip's opening frames (the first moment shows the panel sliding in, or the tool that
filmed it); `CLIP_END` drops a tail that ends on something other than the feature — the board clip's last
second flips back to another tab.
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
    "rec-20261109-171659": 2,  # the panel is already open; skip the first hover frames
    "rec-20261109-171747": 2,
    "rec-20261109-171804": 8,  # the tab switch itself is not the point of the clip
}

CLIP_END = {
    "rec-20261109-171804": 118,  # stop on the answer, before the view flips back
}

FRAME_STEP = {
    "rec-20261109-171804": 2,  # the board changes slowly; 3 fps halves the file
}

CLIPS = {
    "rec-20261109-171659": "demo-a-write.gif",
    "rec-20261109-171747": "demo-b-history.gif",
    "rec-20261109-171804": "demo-c-board.gif",
}


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    for source, target in CLIPS.items():
        frames = sorted(glob.glob(os.path.join(RECORDINGS, source, "frames", "*.png")))
        frames = frames[CLIP_START.get(source, 0):CLIP_END.get(source)]
        step = FRAME_STEP.get(source, 1)
        frames = frames[::step]
        if not frames:
            print(f"no frames for {source}")
            continue
        first = Image.open(frames[0]).convert("RGB")
        ratio = 900 / first.width
        size = (900, max(1, round(first.height * ratio)))
        images = [Image.open(path).convert("RGB").resize(size, Image.LANCZOS) for path in frames]
        palette = images[len(images) // 2].quantize(colors=96, method=Image.MEDIANCUT)
        quantized = [image.quantize(palette=palette, dither=Image.NONE) for image in images]
        # 6 fps, or slower for a clip whose frames were halved.
        duration = 167 * FRAME_STEP.get(source, 1)
        path = os.path.join(OUT, target)
        quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=duration, loop=0, optimize=True, disposal=2)
        print(f"{target}: {len(quantized)} frames, {size[0]}x{size[1]}, {os.path.getsize(path) / 1024 / 1024:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
