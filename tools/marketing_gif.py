"""Assemble the captured demo frames into one GIF.

Frames come from tools/marketing.mjs --capture. Pillow is the only requirement; it ships with the
harness runtime.

Usage:
  <python> tools/marketing_gif.py [--width 720] [--fps 10]
"""

import argparse
import glob
import os
import sys

from PIL import Image


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--width", type=int, default=720)
    parser.add_argument("--fps", type=int, default=10)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frames_dir = os.path.join(root, "exports", "marketing", "frames")
    out = args.out or os.path.join(root, "exports", "marketing", "dsh-notes-demo.gif")

    paths = sorted(glob.glob(os.path.join(frames_dir, "f*.png")))
    if not paths:
        print(f"no frames in {frames_dir}; run: node tools/marketing.mjs --capture")
        return 1

    first = Image.open(paths[0]).convert("RGB")
    ratio = args.width / first.width
    height = max(1, round(first.height * ratio))
    size = (args.width, height)

    images = []
    for path in paths:
        with Image.open(path) as image:
            images.append(image.convert("RGB").resize(size, Image.LANCZOS))

    # A shared palette keeps the size down and avoids per-frame colour drift.
    sample = images[len(images) // 2]
    palette = sample.quantize(colors=128, method=Image.MEDIANCUT)
    quantized = [image.quantize(palette=palette, dither=Image.NONE) for image in images]

    duration = max(20, round(1000 / args.fps))
    quantized[0].save(
        out,
        save_all=True,
        append_images=quantized[1:],
        duration=duration,
        loop=0,
        optimize=True,
        disposal=2,
    )

    size_kb = os.path.getsize(out) / 1024
    print(f"gif: {out}")
    print(f"frames: {len(quantized)}  size: {size[0]}x{size[1]}  {size_kb:.0f} KB  {len(quantized) / args.fps:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
