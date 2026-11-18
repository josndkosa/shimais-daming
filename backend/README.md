# 史脉·大明 · 与历史人物对话 API

FastAPI + httpx + rank-bm25 的轻量后端：以历史人物口吻回答提问，回复优先依据本地史料卡（BM25 检索 top-3），并附一次低温「史官校验」调用产出 `note`。无数据库、无 LangChain。

## 结构

```
backend/
  main.py               # 路由、校验、限流、DeepSeek 调用与史官校验
  retriever.py          # retrieve(figure, query) -> list[chunk]，可整体替换为向量检索
  data/personas.json    # 人设卡（name/era_point/voice/stance/boundaries）
  data/zhuyuanzhang.json# 史料卡 chunks（id/title/text/source）
  requirements.txt
```

## 接口

- `GET /api/health` → `{"status":"ok","figures":["zhuyuanzhang"]}`
- `POST /api/chat`
  - 请求：`{"figure":"zhuyuanzhang","history":[{"role":"user"|"assistant","content":"…"}],"message":"用户新问题"}`
  - 响应：`{"reply":"人物口吻回复","note":"史官注：…"|null}`
  - 校验：figure 不在名册 → 404；history 达 20 条（10 轮）即第 11 轮提问 → 400；message 空或超 500 字 → 400；同一 IP 每小时超 30 次 → 429（内存计数，重启即清零）。
  - 上游：DeepSeek `deepseek-chat`，超时 30 秒；超时/上游错误/未配置密钥 → 502 + 友好信息。校验调用失败时 `note=null`，不影响主回复。

## 本地运行

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows；Linux/macOS 用 .venv/bin/activate
pip install -r requirements.txt
export DEEPSEEK_API_KEY=你的密钥                          # Windows PowerShell: $env:DEEPSEEK_API_KEY="…"
uvicorn main:app --host 127.0.0.1 --port 8000
```

密钥只从环境变量 `DEEPSEEK_API_KEY` 读取，代码与仓库中不含任何密钥。

## Render 部署（免费版）

1. Render Dashboard → New → Web Service，连接本仓库。
2. **Root Directory = `backend`**（与 `frontend/` 并列）。
3. Runtime：Python；设置环境变量 `PYTHON_VERSION=3.11.9`。
4. Build Command：`pip install -r requirements.txt`
5. Start Command：`uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Environment 添加 secret：`DEEPSEEK_API_KEY`。
7. 创建后访问 `https://<服务名>.onrender.com/api/health` 验证。

免费版注意：闲置会休眠，冷启动约数十秒；限流为进程内存计数，休眠/重启后清零；单实例够用，勿开多实例（计数不共享）。

## 上线收紧

- `main.py` 中 CORS 目前 `allow_origins=["*"]`，上线后改为前端实际域名列表（代码内有注释标记）。
- 如需更强限流/多实例，再引入外部存储；当前按规格使用内存计数。

## 替换检索实现

只改 `retriever.py` 的 `retrieve(figure, query)`，保持返回 chunk 字典列表（含 id/title/text/source），`main.py` 无需改动。