import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, "D:/shimais-daming/backend")
import httpx
from fastapi.testclient import TestClient
import main
import retriever

DATA = Path("D:/shimais-daming/backend/data")
results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -> " + str(extra)))

ORDER = ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"]
FIELDS = {"name", "era_point", "voice", "stance", "boundaries"}
QUESTIONS = {
    "zhudi": ("为何杀方孝孺", "c3"),
    "yuqian": ("为何不南迁", "c3"),
    "hairui": ("为何要骂皇帝", "c4"),
    "zhangjuzheng": ("一条鞭法是什么", "c4"),
    "chongzhen": ("为何杀袁崇焕", "c3"),
}

personas = json.loads((DATA / "personas.json").read_text(encoding="utf-8"))
check("personas: 6 keys in required order, 5 fields each", list(personas.keys()) == ORDER and all(set(p.keys()) == FIELDS for p in personas.values()), list(personas.keys()))
struct_ok = True
for fig in ORDER:
    chunks = json.loads((DATA / (fig + ".json")).read_text(encoding="utf-8"))["chunks"]
    if len(chunks) != 8 or [c["id"] for c in chunks] != ["c%d" % i for i in range(1, 9)] or any(set(c.keys()) != {"id", "title", "text", "source"} for c in chunks):
        struct_ok = False
check("6 chunk files: 8 chunks each, ids c1-c8, exact field set", struct_ok)

for fig, (q, cid) in QUESTIONS.items():
    top = retriever.retrieve(fig, q)
    check("retrieve(%s, %s) top1=%s" % (fig, q, cid), len(top) == 3 and top[0]["id"] == cid, [c["id"] for c in top])

for fig, (q, cid) in QUESTIONS.items():
    system, chunks = main.build_system(fig, q)
    p = personas[fig]
    ok = all(p[k] in system for k in FIELDS) and chunks[0]["text"] in system and "回答应优先依据以下史料，不得与之矛盾" in system and "对话时点之后之事一概不知" in system
    check("system(%s) = persona + evidence + era rule" % fig, ok)

captured = []
async def fake(messages, temperature):
    captured.append(messages)
    return "" if temperature == 0.0 else "（%s 口吻stub）" % messages[0]["content"].split("name：")[1].split("\n")[0]
main.call_deepseek = fake
client = TestClient(main.app)
for fig, (q, cid) in QUESTIONS.items():
    r = client.post("/api/chat", json={"figure": fig, "history": [], "message": q})
    body = r.json()
    sysmsg = captured[-2][0]["content"]
    check("chat(%s) 200 with own persona+evidence in system" % fig, r.status_code == 200 and body["note"] is None and personas[fig]["voice"] in sysmsg and retriever.retrieve(fig, q)[0]["text"] in sysmsg, body)

proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8011"], cwd="D:/shimais-daming/backend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    h = None
    for _ in range(40):
        time.sleep(0.4)
        try:
            h = httpx.get("http://127.0.0.1:8011/api/health", timeout=3, trust_env=False)
            if h.status_code == 200:
                break
        except httpx.HTTPError:
            pass
    check("live health: six figures in order", h is not None and h.json() == {"status": "ok", "figures": ORDER}, h.text if h is not None else "not up")
    import os
    has_key = bool(os.environ.get("DEEPSEEK_API_KEY"))
    with httpx.Client(base_url="http://127.0.0.1:8011", timeout=40, trust_env=False) as c:
        codes = []
        for fig, (q, cid) in QUESTIONS.items():
            rr = c.post("/api/chat", json={"figure": fig, "history": [], "message": q})
            codes.append(rr.status_code)
            if has_key and rr.status_code == 200:
                b = rr.json()
                print("LIVE %s reply: %s | note: %s" % (fig, b["reply"], b["note"]))
        check("live chat x5: 200 with key / 502 friendly without", codes == ([200] * 5 if has_key else [502] * 5), codes)
    print("DEEPSEEK_API_KEY present:", has_key)
finally:
    proc.terminate()
    proc.wait(timeout=10)

passed = sum(results)
print("\n%d/%d passed" % (passed, len(results)))
sys.exit(0 if passed == len(results) else 1)