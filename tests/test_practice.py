import json
import sys

sys.path.insert(0, "D:/shimais-daming/backend")
from fastapi.testclient import TestClient
import main

results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -> " + str(extra)))

DIMS = ["timeline"] * 4 + ["person"] * 3 + ["institution"] * 3

def make_qs():
    qs = []
    for i, d in enumerate(DIMS):
        qs.append({
            "dim": d,
            "stem": "练习题题干 %d？" % (i + 1),
            "options": ["1368", "1380", "1402", "1421"],
            "answer": i % 4,
            "explain": "解析：与制度主线相关。",
            "source": "《明史·太祖本纪》",
        })
    return qs

CFG = {"gen": [], "blind": "match", "raise": False}
CALLS = {"gen": 0, "blind": 0, "gen_messages": [], "blind_messages": []}
HOLDER = {"qs": make_qs()}

async def fake_deepseek(messages, temperature):
    if CFG["raise"]:
        raise main.UpstreamError("mock upstream down")
    if temperature == 0.0:
        CALLS["blind"] += 1
        CALLS["blind_messages"].append(messages)
        if CFG["blind"] == "match":
            return json.dumps([q["answer"] for q in HOLDER["qs"]])
        if CFG["blind"] == "mismatch":
            return json.dumps([(q["answer"] + 1) % 4 for q in HOLDER["qs"]])
        return "not json at all"
    CALLS["gen"] += 1
    CALLS["gen_messages"].append(messages)
    payload = CFG["gen"].pop(0) if CFG["gen"] else json.dumps({"questions": HOLDER["qs"]}, ensure_ascii=False)
    return payload

main.call_deepseek = fake_deepseek
client = TestClient(main.app)

def post(ip):
    return client.post("/api/quiz/practice", headers={"x-forwarded-for": ip})

# 1 success + pool + blind isolation
CFG.update(gen=[], blind="match"); CFG["raise"]=False
CALLS.update(gen=0, blind=0, gen_messages=[], blind_messages=[])
r = post("10.0.0.1")
body = r.json()
ok = r.status_code == 200 and len(body["questions"]) == 10
counts = {d: sum(1 for q in body["questions"] if q["dim"] == d) for d in ("timeline", "person", "institution")}
ok = ok and counts == {"timeline": 4, "person": 3, "institution": 3}
ok = ok and all(len(q["options"]) == 4 and len(set(q["options"])) == 4 and isinstance(q["answer"], int) and 0 <= q["answer"] <= 3 and q["explain"] and q["source"] for q in body["questions"])
check("success: 200 with 10 questions 4/3/3 and full fields", ok, (r.status_code, counts))
pool_msg = CALLS["gen_messages"][0][1]["content"]
chunks_all = []
for fig in main.PRACTICE_FIGURES:
    chunks_all += json.loads((main.DATA_DIR / (fig + ".json")).read_text(encoding="utf-8"))["chunks"]
check("prompt pool = all 48 chunks with titles and sources", pool_msg.count("- [") == 48 and all(c["title"] in pool_msg and c["source"] in pool_msg for c in chunks_all), pool_msg.count("- ["))
blind_user = CALLS["blind_messages"][0][1]["content"]
check("blind call gets stems+options only, no answer/explain/source", CALLS["blind"] == 1 and "《明史·太祖本纪》" not in blind_user and "解析" not in blind_user and all(q["stem"] in blind_user for q in HOLDER["qs"]), blind_user[:80])
check("blind temperature low", True)

# 2 structural fail then retry success
bad = json.dumps({"questions": make_qs()[:9]}, ensure_ascii=False)
good = json.dumps({"questions": make_qs()}, ensure_ascii=False)
CFG.update(gen=[bad, good], blind="match")
CALLS.update(gen=0, blind=0)
r = post("10.0.0.2")
check("structural fail retries once then 200", r.status_code == 200 and CALLS["gen"] == 2, (r.status_code, CALLS["gen"]))

# 3 structural fail twice -> 503
CFG.update(gen=[bad, bad], blind="match")
r = post("10.0.0.3")
check("structural fail twice -> 503 generation_failed", r.status_code == 503 and r.json() == {"detail": "generation_failed"}, (r.status_code, r.json()))

# 4 blind mismatch twice -> 503
CFG.update(gen=[], blind="mismatch")
CALLS.update(gen=0, blind=0)
r = post("10.0.0.4")
check("blind mismatch retries once then 503", r.status_code == 503 and CALLS["gen"] == 2 and CALLS["blind"] == 2, (r.status_code, CALLS))

# 5 blind garbage -> 503
CFG.update(gen=[], blind="garbage")
r = post("10.0.0.5")
check("blind unparseable -> 503", r.status_code == 503, r.status_code)

# 6 upstream exception -> 503
CFG.update(gen=[], blind="match"); CFG["raise"]=True
r = post("10.0.0.6")
check("upstream exception -> 503 generation_failed", r.status_code == 503 and r.json() == {"detail": "generation_failed"}, (r.status_code, r.json()))
CFG["raise"] = False

# 7 fenced JSON accepted
CFG.update(gen=["```json\n" + good + "\n```"], blind="match")
r = post("10.0.0.7")
check("fenced JSON parsed", r.status_code == 200, r.status_code)

# 8 rate limit 6/h independent bucket
CFG.update(gen=[], blind="match")
codes = [post("10.0.0.8").status_code for _ in range(7)]
check("7th generation same IP -> 429, first six 200", codes == [200] * 6 + [429], codes)
r429 = post("10.0.0.8")
check("429 body friendly detail", r429.status_code == 429 and "6" in r429.json()["detail"], r429.json())
# chat bucket untouched by practice calls: chat still works on same IP
async def fake_chat(messages, temperature):
    return "朕知道了。"
main.call_deepseek = fake_chat
rc = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "你好"}, headers={"x-forwarded-for": "10.0.0.8"})
check("chat unaffected by practice bucket (200 on same IP)", rc.status_code == 200, rc.status_code)
main.call_deepseek = fake_deepseek
# practice bucket not consumed by chat: fresh IP chat x30 then practice still 200
for i in range(30):
    client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "你好"}, headers={"x-forwarded-for": "10.0.0.9"})
rp = post("10.0.0.9")
check("chat 30 calls do not consume practice bucket", rp.status_code == 200, rp.status_code)

# 9 health unchanged
rh = client.get("/api/health")
check("health unchanged six figures", rh.status_code == 200 and len(rh.json()["figures"]) == 6, rh.json())

# 10 validator unit cases
V = main._validate_practice
base = {"questions": make_qs()}
check("validator accepts good set", V(json.loads(json.dumps(base))) is not None)
def mut(fn):
    d = json.loads(json.dumps(base))
    fn(d["questions"])
    return V(d) is None
check("validator rejects 9 questions", mut(lambda qs: qs.pop()))
check("validator rejects dim 5/3/2", mut(lambda qs: qs[0].update(dim="timeline") or qs[4].update(dim="timeline")))
check("validator rejects duplicate options", mut(lambda qs: qs[0].update(options=["1368", "1368", "1402", "1421"])))
check("validator rejects 3 options", mut(lambda qs: qs[0].update(options=["1368", "1380", "1402"])))
check("validator rejects answer 4", mut(lambda qs: qs[0].update(answer=4)))
check("validator rejects bool answer", mut(lambda qs: qs[0].update(answer=True)))
check("validator rejects empty stem", mut(lambda qs: qs[0].update(stem="  ")))
check("validator rejects empty explain", mut(lambda qs: qs[0].update(explain="")))
check("validator rejects empty source", mut(lambda qs: qs[0].update(source="")))
check("validator rejects non-dict entry", mut(lambda qs: qs.__setitem__(0, "x")))

print("\n%d/%d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)