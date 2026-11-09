"""Install the four marketing stills from the recorder captures.

The window captures are 1920x1080 with the Windows taskbar at the bottom; the plugin's own frames are
1920x1020 (the client area). The immersive capture is already clean full-screen.
"""
from pathlib import Path
from PIL import Image

workspace = Path(r"C:\Users\dwwekfd\OneDrive - Dr. Ing. h.c. F. Porsche AG\Documents\deepseek-harness\default-workspace")
recordings = workspace / "recordings"
out = workspace / "dsh-notes" / "docs" / "marketing"

shots = [
    (recordings / "rec-20261109-171319" / "stills" / "still-2.6s.png", "shot-01-writing.png", (0, 0, 1920, 1020)),
    (recordings / "rec-20261109-171311" / "stills" / "still-1.2s.png", "shot-02-immersive.png", None),
    (recordings / "rec-20261109-171335" / "stills" / "still-2.4s.png", "shot-05-history-edit.png", None),
    (recordings / "rec-20261109-171344" / "stills" / "still-2.6s.png", "shot-07-board-chart.png", None),
]

for source, name, crop in shots:
    if not source.exists():
        raise SystemExit(f"missing capture: {source}")
    image = Image.open(source).convert("RGB")
    if crop is not None:
        image = image.crop(crop)
    target = out / name
    image.save(target, "PNG", optimize=True)
    print(f"{name:28} {image.size[0]}x{image.size[1]}  {target.stat().st_size / 1024:.0f} KB")
