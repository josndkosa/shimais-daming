"""史脉·大明「与历史人物对话」API：FastAPI + httpx + rank-bm25，无数据库。"""

import json
import os
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import retriever

DATA_DIR = Path(__file__).resolve().parent / "data"
# 本地密钥放 backend/.env（已 gitignore）；已有环境变量（如 Render）优先，不被覆盖
load_dotenv(Path(__file__).resolve().parent / ".env")
PERSONAS = json.loads((DATA_DIR / "personas.json").read_text(encoding="utf-8"))

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"
UPSTREAM_TIMEOUT = 30.0

HISTORY_MAX_ENTRIES = 20  # 10 轮（20 条）；history 已达 20 条即第 11 轮提问，直接 400
MESSAGE_MAX_CHARS = 500
ASSISTANT_HISTORY_MAX_CHARS = 2000  # 历史 assistant 回复可长于新消息，截断而非拒绝
RATE_LIMIT = 30
RATE_WINDOW_SECONDS = 3600

_hits = defaultdict(deque)

app = FastAPI(title="史脉·大明 · 与历史人物对话")

# CORS：先放行全部来源；上线后收紧到本站域名，如 allow_origins=["https://你的站点域名"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    figure: str
    history: list[HistoryMessage] = []
    message: str


class UpstreamError(Exception):
    pass


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    window = _hits[ip]
    while window and now - window[0] > RATE_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= RATE_LIMIT:
        return True
    window.append(now)
    return False


GENERAL_RULES = (
    "# 通用规则\n"
    "1. 始终以角色身份与口吻说话，不得跳出角色做现代式自我介绍。\n"
    "2. 回答优先依据「史料依据」，不得与之矛盾；史料没有的细节可按角色立场合理推断，"
    "但不得编造具体年份、事件与引文。\n"
    "3. 单次回复控制在 300 字以内。\n"
    "4. 用户问与历史无关的现代问题时，按 boundaries 处理：先反问对方何意，再按其理解回应。\n"
    "5. 对话时点之后之事一概不知，被问到要明确表示不知，并拒绝预言。"
)

CHECK_RULES = (
    "你是史官校验员。只判断「待校验回复」是否有明显史实错误"
    "（与史料依据矛盾，或编造具体年份、事件、引文）。"
    "无误：只返回空字符串，不要任何其它文字。"
    "有误：返回一句不超过 50 字的纠正语，格式为「史官注：……」。"
)


def build_system(figure: str, query: str):
    persona = PERSONAS[figure]
    chunks = retriever.retrieve(figure, query)
    parts = [
        "# 人设卡",
        "name：" + persona["name"],
        "era_point：" + persona["era_point"],
        "voice：" + persona["voice"],
        "stance：" + persona["stance"],
        "boundaries：" + persona["boundaries"],
        "",
        "# 史料依据",
        "回答应优先依据以下史料，不得与之矛盾。",
    ]
    for c in chunks:
        parts.append("- [" + c["id"] + "] " + c["title"] + "：" + c["text"] + "（" + c["source"] + "）")
    parts.append("")
    parts.append(GENERAL_RULES)
    return "\n".join(parts), chunks


async def call_deepseek(messages, temperature: float) -> str:
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        raise UpstreamError("对话服务未配置密钥，请联系站长后再试。")
    # trust_env=False：直连固定上游，忽略主机代理环境变量（含畸形 NO_PROXY 条目）
    async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT, trust_env=False) as client:
        resp = await client.post(
            DEEPSEEK_URL,
            headers={"Authorization": "Bearer " + key},
            json={"model": DEEPSEEK_MODEL, "messages": messages, "temperature": temperature},
        )
    if resp.status_code != 200:
        raise UpstreamError("对话服务暂时不可用（上游错误），请稍后再试。")
    try:
        return resp.json()["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, ValueError):
        raise UpstreamError("对话服务返回格式异常，请稍后再试。")


@app.get("/api/health")
def health():
    return {"status": "ok", "figures": list(PERSONAS.keys())}


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    ip = _client_ip(request)
    if _rate_limited(ip):
        return JSONResponse(
            status_code=429,
            content={"detail": "提问过频：同一地址每小时最多 30 次，请稍后再试。"},
        )
    if req.figure not in PERSONAS:
        return JSONResponse(status_code=404, content={"detail": "名册中无此人。"})
    if len(req.history) >= HISTORY_MAX_ENTRIES:
        return JSONResponse(
            status_code=400,
            content={"detail": "对话最多 10 轮（history 20 条），请开启新对话。"},
        )
    if not req.message.strip() or len(req.message) > MESSAGE_MAX_CHARS:
        return JSONResponse(
            status_code=400,
            content={"detail": "问题须为 1–500 字。"},
        )

    try:
        system, chunks = build_system(req.figure, req.message)
    except (FileNotFoundError, KeyError, ValueError):
        return JSONResponse(status_code=502, content={"detail": "史料库暂不可用，请稍后再试。"})

    messages = [{"role": "system", "content": system}]
    messages += [
        {
            "role": m.role,
            "content": m.content[: MESSAGE_MAX_CHARS if m.role == "user" else ASSISTANT_HISTORY_MAX_CHARS],
        }
        for m in req.history
    ]
    messages.append({"role": "user", "content": req.message})

    try:
        reply = await call_deepseek(messages, 0.7)
    except UpstreamError as exc:
        return JSONResponse(status_code=502, content={"detail": str(exc)})
    except httpx.TimeoutException:
        return JSONResponse(status_code=502, content={"detail": "上游响应超时（30 秒），请稍后再试。"})
    except httpx.HTTPError:
        return JSONResponse(status_code=502, content={"detail": "无法连接对话服务，请稍后再试。"})

    note = None
    try:
        evidence = "\n".join("- " + c["title"] + "：" + c["text"] for c in chunks)
        check_messages = [
            {"role": "system", "content": CHECK_RULES},
            {
                "role": "user",
                "content": "用户问题：" + req.message + "\n史料依据：\n" + evidence + "\n待校验回复：\n" + reply,
            },
        ]
        verdict = (await call_deepseek(check_messages, 0.0)).strip()
        if verdict and verdict not in ("无", "无误", "无。"):
            note = verdict[:50]
    except Exception:
        note = None

    return {"reply": reply, "note": note}


PRACTICE_RATE_LIMIT = 6  # 练习出题独立限流：同一 IP 每小时 6 次，与 /api/chat 的桶互不相干
_practice_hits = defaultdict(deque)

PRACTICE_FIGURES = ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"]

PRACTICE_RULES = (
    "你是明史练习题出题员。只能依据下方「事实来源池」中的事实出题，不得引入池外知识。\n"
    "输出且仅输出一个 JSON 对象，格式：\n"
    '{"questions":[{"dim":"timeline|person|institution","stem":"题干","options":["A","B","C","D"],'
    '"answer":0,"explain":"解析","source":"出处"}]}\n'
    "约束：恰好 10 题；dim 分布为 timeline 4 题、person 3 题、institution 3 题；\n"
    "每题 4 个选项且互不重复；answer 为 0–3 的选项下标；\n"
    "每题的 source 填所依据史料卡自带的出处文字列（原样抄录，不得改写）；\n"
    "explain 不超过 40 字，点明与本站主线问题（制度如何运转、人如何在其中抉择）的关联更好；\n"
    "年份类题目的干扰项用相邻年份；题干不得出现「根据史料卡」「池」之类字眼；\n"
    "不要输出 JSON 以外的任何文字。"
)

BLIND_RULES = (
    "你是明史答题员。只依据题目本身作答。"
    "输出且仅输出一个 JSON 数组：10 个 0–3 的整数，依次为每题正确选项的下标。"
    "不要任何其它文字。"
)


def _practice_rate_limited(ip: str) -> bool:
    now = time.monotonic()
    window = _practice_hits[ip]
    while window and now - window[0] > RATE_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= PRACTICE_RATE_LIMIT:
        return True
    window.append(now)
    return False


def _practice_pool() -> str:
    lines = []
    for fig in PRACTICE_FIGURES:
        chunks = json.loads((DATA_DIR / (fig + ".json")).read_text(encoding="utf-8"))["chunks"]
        for c in chunks:
            lines.append(
                "- [" + fig + "/" + c["id"] + "] " + c["title"] + "：" + c["text"] + "（出处：" + c["source"] + "）"
            )
    return "\n".join(lines)


def _parse_json(raw: str):
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return json.loads(text.strip())


def _validate_practice(payload):
    qs = payload.get("questions") if isinstance(payload, dict) else None
    if not isinstance(qs, list) or len(qs) != 10:
        return None
    counts = {"timeline": 0, "person": 0, "institution": 0}
    for q in qs:
        if not isinstance(q, dict):
            return None
        dim = q.get("dim")
        if dim not in counts:
            return None
        counts[dim] += 1
        stem, opts, ans = q.get("stem"), q.get("options"), q.get("answer")
        explain, source = q.get("explain"), q.get("source")
        if not isinstance(stem, str) or not stem.strip():
            return None
        if not isinstance(opts, list) or len(opts) != 4 or len(set(opts)) != 4:
            return None
        if not all(isinstance(o, str) and o.strip() for o in opts):
            return None
        if not isinstance(ans, int) or isinstance(ans, bool) or not 0 <= ans <= 3:
            return None
        if not isinstance(explain, str) or not explain.strip():
            return None
        if not isinstance(source, str) or not source.strip():
            return None
    if counts != {"timeline": 4, "person": 3, "institution": 3}:
        return None
    return qs


async def _blind_answers(qs):
    blocks = []
    for i, q in enumerate(qs):
        opts = "\n".join("ABCD"[j] + ". " + o for j, o in enumerate(q["options"]))
        blocks.append(str(i + 1) + ". " + q["stem"] + "\n" + opts)
    messages = [
        {"role": "system", "content": BLIND_RULES},
        {"role": "user", "content": "\n\n".join(blocks)},
    ]
    arr = _parse_json(await call_deepseek(messages, 0.0))
    if not isinstance(arr, list) or len(arr) != 10:
        return None
    if not all(isinstance(a, int) and not isinstance(a, bool) and 0 <= a <= 3 for a in arr):
        return None
    return arr


@app.post("/api/quiz/practice")
async def quiz_practice(request: Request):
    ip = _client_ip(request)
    if _practice_rate_limited(ip):
        return JSONResponse(
            status_code=429,
            content={"detail": "出题过频：同一地址每小时最多 6 次，请稍后再试。"},
        )
    gen_messages = [
        {"role": "system", "content": PRACTICE_RULES},
        {"role": "user", "content": "# 事实来源池\n" + _practice_pool() + "\n\n请出题。"},
    ]
    for _attempt in range(2):
        try:
            qs = _validate_practice(_parse_json(await call_deepseek(gen_messages, 0.7)))
            if qs is None:
                continue
            blind = await _blind_answers(qs)
            if blind is None or any(blind[i] != qs[i]["answer"] for i in range(10)):
                continue
            return {"questions": qs}
        except (UpstreamError, httpx.HTTPError, ValueError, TypeError, KeyError):
            continue
    return JSONResponse(status_code=503, content={"detail": "generation_failed"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)