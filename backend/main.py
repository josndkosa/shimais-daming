"""史脉·大明「与历史人物对话」API：FastAPI + httpx + rank-bm25，无数据库。"""

import json
import os
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import retriever

DATA_DIR = Path(__file__).resolve().parent / "data"
PERSONAS = json.loads((DATA_DIR / "personas.json").read_text(encoding="utf-8"))

DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"
UPSTREAM_TIMEOUT = 30.0

HISTORY_MAX_ENTRIES = 20  # 10 轮（20 条）；history 已达 20 条即第 11 轮提问，直接 400
MESSAGE_MAX_CHARS = 500
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
    messages += [{"role": m.role, "content": m.content} for m in req.history]
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