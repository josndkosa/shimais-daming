import os
from PIL import Image
SRC = "images-backup"; ROOT = "D:/shimais-daming/frontend/images"
total = 0
for dp, _, fs in os.walk(SRC):
    for f in sorted(fs):
        if not f.endswith(".jpg"): continue
        rel = os.path.relpath(os.path.join(dp, f), SRC).replace("\\", "/")
        im = Image.open(os.path.join(SRC, rel)).convert("RGB")
        w, h = im.size
        if rel.startswith("carousel/"): cap, q = 1600, 72
        elif rel.startswith("qinli/"): cap, q = 900, 72
        else: cap, q = 10**9, 80
        if w > cap: im = im.resize((cap, round(h*cap/w)), Image.LANCZOS)
        out = os.path.join(ROOT, rel)
        im.save(out, "JPEG", quality=q, optimize=True)
        total += os.path.getsize(out)
print("ON-DISK TOTAL", total, f"{total/1000000:.3f}MB dec {total/1048576:.3f}MiB")
