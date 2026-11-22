import os, sys
from PIL import Image
ROOT = "D:/shimais-daming/frontend/images"
Q = int(sys.argv[1]) if len(sys.argv) > 1 else 80
total_before = total_after = 0
rows = []
for dirpath, _, files in os.walk(ROOT):
    for f in sorted(files):
        if not f.lower().endswith(".jpg"): continue
        p = os.path.join(dirpath, f)
        b = os.path.getsize(p); total_before += b
        im = Image.open(p); im = im.convert("RGB")
        w, h = im.size
        if w > 1920:
            im = im.resize((1920, round(h * 1920 / w)), Image.LANCZOS)
        im.save(p, "JPEG", quality=Q, optimize=True)
        a = os.path.getsize(p); total_after += a
        rows.append((f, w, b, a))
for f, w, b, a in rows: print(f"{f}: {w}px {b} -> {a}")
print(f"TOTAL before={total_before} after={total_after} ({total_after/1048576:.2f}MB) Q={Q}")
