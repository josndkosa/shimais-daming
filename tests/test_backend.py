import json
import subprocess
import sys
import time

sys.path.insert(0, "D:/shimais-daming/backend")
import httpx
from fastapi.testclient import TestClient
import main
import retriever

results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -> " + str(extra)))

CANNED = "朕废丞相，是为子孙除祸根！胡惟庸谋反，朕诛他，顺势撤了中书省，六部直隶于朕。自此大明再无丞相，皇权归一，岂容置疑？"

# ---------- Phase A: in-process ----------
chunks = retriever.retrieve("zhuyuanzhang", "为何废丞相")
check("retriever top-3 for 为何废丞相 leads with c3", len(chunks) == 3 and chunks[0]["id"] == "c3", [c["id"] for c in chunks])
system, syschunks = main.build_system("zhuyuanzhang", "为何废丞相")
p = main.PERSONAS["zhuyuanzhang"]
check("system = persona + top3 evidence + rules", all(k in system for k in [p["name"], p["era_point"], p["voice"], p["stance"], p["boundaries"], "史料依据", "回答应优先依据以下史料，不得与之矛盾", "不得编造具体年份、事件与引文", "300 字以内"]) and system.count("- [c") == 3 and chunks[0]["text"] in system, system[:120])

captured = []
check_mode = {"verdict": ""}
async def fake_deepseek(messages, temperature):
    captured.append({"messages": messages, "temperature": temperature})
    if temperature == 0.0:
        if check_mode["verdict"] == "raise":
            raise main.UpstreamError("check down")
        return check_mode["verdict"]
    return CANNED
main.call_deepseek = fake_deepseek

client = TestClient(main.app)
r = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [{"role": "user", "content": "朕问你答"}, {"role": "assistant", "content": "哼，问来。"}], "message": "为何废丞相"})
body = r.json()
msgs = captured[0]["messages"]
check("chat 200 reply+note null; system first, history order, message last", r.status_code == 200 and body == {"reply": CANNED, "note": None} and msgs[0]["role"] == "system" and msgs[1] == {"role": "user", "content": "朕问你答"} and msgs[2] == {"role": "assistant", "content": "哼，问来。"} and msgs[-1] == {"role": "user", "content": "为何废丞相"}, body)
check("check call is low-temp second call with question+evidence+reply", len(captured) == 2 and captured[1]["temperature"] == 0.0 and "为何废丞相" in captured[1]["messages"][1]["content"] and CANNED in captured[1]["messages"][1]["content"] and "废丞相" in captured[1]["messages"][1]["content"], captured[1]["temperature"])
check_mode["verdict"] = "史官注：蓝玉案在 1393 年，非 1392 年。"
r = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "蓝玉案哪年？"})
check("note carries 史官注 verdict", r.json()["note"] == "史官注：蓝玉案在 1393 年，非 1392 年。", r.json())
check_mode["verdict"] = "raise"
r = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "再说贪腐"})
check("check failure -> note null, reply intact", r.status_code == 200 and r.json() == {"reply": CANNED, "note": None}, r.json())
check_mode["verdict"] = ""

# validation (no upstream needed)
r404 = client.post("/api/chat", json={"figure": "zhu-di", "history": [], "message": "你是谁"})
h20 = [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}] * 10
r400a = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": h20, "message": "第十一轮"})
r400b = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": h20 + [{"role": "user", "content": "q"}, {"role": "assistant", "content": "a"}], "message": "x"})
r400c = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "字" * 501})
r400d = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "   "})
check("404 unknown figure / 400 history>=20 / 400 msg>500 / 400 empty", r404.status_code == 404 and r400a.status_code == 400 and r400b.status_code == 400 and r400c.status_code == 400 and r400d.status_code == 400, [r404.status_code, r400a.status_code, r400b.status_code, r400c.status_code, r400d.status_code])

# 11 rounds: rounds 1-10 ok, round 11 blocked
codes = []
hist = []
for rnd in range(1, 12):
    rr = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": hist, "message": "第%d问" % rnd})
    codes.append(rr.status_code)
    if rr.status_code == 200:
        hist = hist + [{"role": "user", "content": "第%d问" % rnd}, {"role": "assistant", "content": rr.json()["reply"]}]
check("10 rounds pass, 11th round blocked 400", codes[:10] == [200] * 10 and codes[10] == 400, codes)

# rate limit: total 30 then 429 (count so far in this process)
used = len(captured) // 2 + 5 + 1  # stub+round 成功请求(13) + 校验请求(5) + 第11轮被拦(1)
extra = 0
last = None
while True:
    rr = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "限流探针"})
    last = rr.status_code
    if last == 429:
        break
    extra += 1
    if extra > 40:
        break
check("30 requests/hour then 429", last == 429 and used + extra == 30, [used, extra, last])

# ---------- Phase B: live uvicorn, no key ----------
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8010"],
    cwd="D:/shimais-daming/backend", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
try:
    up = False
    for _ in range(40):
        time.sleep(0.4)
        try:
            h = httpx.get("http://127.0.0.1:8010/api/health", timeout=3, trust_env=False)
            if h.status_code == 200:
                up = True
                break
        except httpx.HTTPError:
            pass
    check("uvicorn up; health exact payload", up and h.json() == {"status": "ok", "figures": ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"]}, h.text if up else "not up")
    with httpx.Client(base_url="http://127.0.0.1:8010", timeout=40, trust_env=False) as c:
        r = c.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "为何废丞相"})
        check("no key -> 502 friendly", r.status_code == 502 and "密钥" in r.json()["detail"], [r.status_code, r.text])
        cors = c.options("/api/chat", headers={"Origin": "https://example.com", "Access-Control-Request-Method": "POST"})
        check("CORS allow-all preflight", cors.headers.get("access-control-allow-origin") == "*", dict(cors.headers))
        n = 1
        r404 = c.post("/api/chat", json={"figure": "nobody", "history": [], "message": "x"}); n += 1
        r400 = c.post("/api/chat", json={"figure": "zhuyuanzhang", "history": h20, "message": "x"}); n += 1
        check("live 404 + 400(history 20)", r404.status_code == 404 and r400.status_code == 400, [r404.status_code, r400.status_code])
        statuses = []
        for i in range(30 - n + 1):
            rr = c.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "探针"})
            statuses.append(rr.status_code)
        check("live rate: 30 counted then 429", statuses[:-1] == [502] * (30 - n) and statuses[-1] == 429, statuses[-3:])
finally:
    proc.terminate()
    proc.wait(timeout=10)

passed = sum(results)
print("\n%d/%d passed" % (passed, len(results)))
sys.exit(0 if passed == len(results) else 1)