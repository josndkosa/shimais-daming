import os, io
from PIL import Image
SRC = "images-backup"
def enc(im, q):
    b = io.BytesIO(); im.save(b, "JPEG", quality=q, optimize=True); return b.tell()
def load(rel):
    im = Image.open(os.path.join(SRC, rel)).convert("RGB"); return im
def scaled(im, cap):
    w, h = im.size
    if w > cap: im = im.resize((cap, round(h*cap/w)), Image.LANCZOS)
    return im
groups = {"carousel": [], "qinli": [], "person": []}
for dp, _, fs in os.walk(SRC):
    for f in sorted(fs):
        if not f.endswith(".jpg"): continue
        rel = os.path.relpath(os.path.join(dp, f), SRC).replace("\\", "/")
        g = "carousel" if rel.startswith("carousel/") else "qinli" if rel.startswith("qinli/") else "person"
        groups[g].append(rel)
for name, cq, cc, qc, pq in [("B q75 cap1600/1200",75,1600,1200,80),("C q70 cap1600/1200",70,1600,1200,80),("D q75 cap1280/1024",75,1280,1024,80),("E q65 cap1920/1672",65,1920,1672,80),("F q72 cap1440/1100",72,1440,1100,80)]:
    tot = 0
    for rel in groups["carousel"]: tot += enc(scaled(load(rel), cc), cq)
    for rel in groups["qinli"]: tot += enc(scaled(load(rel), qc), cq)
    for rel in groups["person"]: tot += enc(load(rel), pq)
    print(f"{name}: {tot} ({tot/1048576:.2f}MB)")
for name, cq, cc, qc, pq in [("G q75 cap1600/900",75,1600,900,80),("H q78 cap1600/880",78,1600,880,80),("I q75 cap1920/800",75,1920,800,80)]:
    tot = 0
    for rel in groups["carousel"]: tot += enc(scaled(load(rel), cc), cq)
    for rel in groups["qinli"]: tot += enc(scaled(load(rel), qc), cq)
    for rel in groups["person"]: tot += enc(load(rel), pq)
    print(f"{name}: {tot} ({tot/1048576:.2f}MB)")
for name, cq, cc, qc, pq in [("J q75 cap1500/900",75,1500,900,80),("K q72 cap1600/900",72,1600,900,80),("L q75 cap1600/860",75,1600,860,80),("M q74 cap1600/880",74,1600,880,80)]:
    tot = 0
    for rel in groups["carousel"]: tot += enc(scaled(load(rel), cc), cq)
    for rel in groups["qinli"]: tot += enc(scaled(load(rel), qc), cq)
    for rel in groups["person"]: tot += enc(load(rel), pq)
    print(f"{name}: {tot} ({tot/1000000:.3f}MB dec, {tot/1048576:.3f}MiB)")
