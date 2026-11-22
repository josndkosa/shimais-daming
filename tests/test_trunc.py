import json
import sys

sys.path.insert(0, "D:/shimais-daming/backend")
from fastapi.testclient import TestClient
import main

results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  -> " + str(extra)))

CAP = []
async def fake(messages, temperature):
    CAP.append(messages)
    return "朕知道了。"
main.call_deepseek = fake
client = TestClient(main.app)

long_user = "u" * 5000
long_assistant = "a" * 3000
r = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [{"role": "user", "content": long_user}, {"role": "assistant", "content": long_assistant}], "message": "你好"})
check("overlong history accepted (200)", r.status_code == 200, r.status_code)
msgs = CAP[0]
check("user history truncated to 500", len(msgs[1]["content"]) == 500, len(msgs[1]["content"]))
check("assistant history truncated to 2000", len(msgs[2]["content"]) == 2000, len(msgs[2]["content"]))
check("new message untouched", msgs[3]["content"] == "你好", msgs[3])

CAP.clear()
r = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [{"role": "user", "content": "短问"}, {"role": "assistant", "content": "短答"}], "message": "再问"})
check("short history unchanged", r.status_code == 200 and CAP[0][1]["content"] == "短问" and CAP[0][2]["content"] == "短答", r.status_code)

r = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [], "message": "x" * 501})
check("new message 501 still 400", r.status_code == 400, r.status_code)
r = client.post("/api/chat", json={"figure": "zhuyuanzhang", "history": [{"role": "user", "content": "h"}] * 20, "message": "你好"})
check("20 history entries still 400", r.status_code == 400, r.status_code)
r = client.post("/api/chat", json={"figure": "nobody", "history": [], "message": "你好"})
check("unknown figure still 404", r.status_code == 404, r.status_code)
r = client.get("/api/health")
check("health unchanged", r.status_code == 200 and len(r.json()["figures"]) == 6, r.status_code)

print("\n%d/%d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)