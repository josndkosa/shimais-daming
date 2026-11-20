# 史脉·大明 · 与历史人物对话 API

静态前端 + FastAPI + httpx + rank-bm25 的轻量架构，无数据库、无 LangChain。人物对话检索正相关的 top-3 材料，短追问只补最近一条用户问题，不拼接全部历史；主回复后附一次低温「史官校验」产出 `note`。练习按资料生成，再带实际材料审查答案唯一性和解析依据；机器审题不等于学术校勘，仍需人工抽检。

## 结构

```
backend/
  main.py               # 路由、校验、限流、DeepSeek 调用与史官校验
  retriever.py          # retrieve(figure, query) -> list[chunk]，可整体替换为向量检索
  data/personas.json    # 人设卡（name/era_point/voice/stance/boundaries）
  data/zhuyuanzhang.json # 六个人物 JSON 是唯一资料源（chunks 及可选元数据）
  export_materials.py   # 资料共用校验 + 静态导出/--check
  test_api.py           # 无真实模型的自动回归
  requirements.txt
frontend/materials.json # 生成产物，不手改；无需新增资料 API
```

## 接口

- `GET /api/health` → `{"status":"ok","figures":["zhuyuanzhang"]}`
- `POST /api/chat`
  - 请求：`{"figure":"zhuyuanzhang","history":[{"role":"user"|"assistant","content":"…"}],"message":"用户新问题"}`
  - 响应：`{"reply":"人物口吻回复","note":"史官注：…"|null}`
  - 校验：figure 不在名册 → 404；history 必须少于 20 条；新问题和历史 user 各 1–500 字、历史 assistant 各 1–2000 字（不能全空白）；历史加新问题累计最多 20000 字。长度不合法 → 400，且不调用模型；另保留发送前的上下文预算。
  - 同一 IP 每小时最多 30 次有效格式的提问尝试，失败也计数。
  - 上游：DeepSeek `deepseek-chat`，单次调用网络超时配置为 30 秒（不是整个多调用流程的总时限）；主回复不能为空，仅史官的空字符串代表无注释。包括校验调用在内，上游失败统一报错，不伪装成功核验。
- `POST /api/quiz/practice`（无必填请求体）
  - 响应：`{"questions":[{"dim":"timeline|person|institution","stem":"…","options":["…","…","…","…"],"answer":0,"explain":"…","sourceId":"figure/cN","source":"库中出处"}]}`。
  - 恰好十题，维度 4/3/3；题干、选项去空白查重，答案是 0–3 的整数，`sourceId` 必须存在，`source` 永远从资料库填充，不采信模型自填文本。
  - 审题接收每题对应材料、题干、选项和解析，输出 `correctOptions` 与布尔值 `explanationSupported`；只接受一个正确项且与答案一致、解析有依据的题组。
  - 同一 IP 每小时最多 **6 次尝试**，与聊天独立。成功、生成校验失败、上游故障、资料故障及已进入处理的取消请求均计数，不退款；一次请求内部最多两轮生成，仅校验不通过可重试，网络/上游失败直接返回。客户端取消等待不保证服务端和模型已停止处理。

所有 HTTP 请求在 JSON 解析前按实际接收的 ASGI body 字节累计设 **128 KiB** 上限（含 JSON 转义、UTF-8 编码与空白；分块也计量，不信任 `Content-Length`）。字符上限与字节上限分别生效。

错误响应统一为 `{"code":"…","detail":"可展示的提示"}`，不回显输入正文、内部路径或上游原始错误：

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `invalid_input` | 正文或历史超出字符/条数限制，或内容为空 |
| 404 | `not_found` | 人物/资源不存在 |
| 413 | `request_too_large` | 请求体超过 128 KiB |
| 422 | `validation_error` | 字段、角色、类型或 JSON 格式错误 |
| 429 | `rate_limited` | 额度用尽；另含整数 `retry_after` 秒与相同的 `Retry-After` 响应头 |
| 502 | `upstream_error` | 网络、未配置密钥、上游非成功状态、异常响应封装或内容类型 |
| 504 | `upstream_timeout` | 上游调用超时 |
| 503 | `materials_unavailable` | 资料缺失、不可读或损坏，不启动模型重试 |
| 503 | `generation_failed` | 两轮题目生成/审查均未通过校验 |

其他 HTTP 协议错误使用 `http_error`。上述限流是单进程内存滑动窗口，进程重启会清零；不能用于多 worker/多实例统一成本控制。

## 本地运行

密钥二选一：① 复制 `.env.example` 为 `.env`，在 `DEEPSEEK_API_KEY=` 后填真实密钥（`.env` 已 gitignore，启动自动读取）；② 设环境变量 `DEEPSEEK_API_KEY`（优先级高于 .env，Render 用这种）。

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows；Linux/macOS 用 .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
# 或直接 python main.py（含 __main__ 入口）；PyCharm 可用 .idea 里的 backend 运行配置
```

密钥只从环境变量或 backend/.env 读取，代码与仓库中不含任何密钥。

## Render 部署（免费版）

1. Render Dashboard → New → Web Service，连接本仓库。
2. **Root Directory = `backend`**（与 `frontend/` 并列）。
3. Runtime：Python；设置环境变量 `PYTHON_VERSION=3.11.9`。
4. Build Command：`pip install -r requirements.txt`
5. Start Command：`uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips "$FORWARDED_ALLOW_IPS"`
6. Environment 添加 secret：`DEEPSEEK_API_KEY`；设置 `CORS_ORIGINS` 为实际前端 HTTPS 来源列表，`FORWARDED_ALLOW_IPS` 为确认过的可信代理地址。
7. 发布前按下述清单验证；本文没有验证生产域名、代理链路或真实模型。

免费服务的休眠、冷启动等限制以平台实际政策为准。限流在休眠/重启后清零；只能单 worker/单实例运行，如需扩容必须先设计共享限流。

## 部署地址、代理与数据边界

- `CORS_ORIGINS` 采用逗号分隔的来源（协议、域名、端口，不含路径）；缺省仅放行 localhost/127.0.0.1 的 5500/5501 静态端口。生产必须显式配置真实来源，不使用 `*`；CORS 不是认证机制。
- 应用只使用 `request.client.host`，绝不自行解析 `X-Forwarded-For`。由 uvicorn `--proxy-headers` 和 `FORWARDED_ALLOW_IPS` 判定信任边界，后者必须在 **uvicorn 启动之前**由进程环境或命令行传入；不要依赖 main 导入时才读取的 `.env`。
- 只配置实际可信代理的 IP/网段，**禁止 `FORWARDED_ALLOW_IPS=*`**；无代理直连可显式传 `--forwarded-allow-ips ""`。代理必须清洗或正确追加访客地址，且后端访问范围应与代理链路匹配。不得在未核实平台网络条件时猜测其代理地址。
- 前端线上可以同源转发 `/api`，或在页面 `<meta name="api-base" content="https://实际API域名">` 配置跨域地址；跨域 API 必须开启 HTTPS 并匹配 CORS 来源。不能给线上访客配置 localhost。
- 发布前使用与生产一致的代理配置检查：自填 XFF 不能任意切换额度身份，正常访客不会全被当成代理同一地址；并从未运行本地后端的设备验证真实地址、CORS 和 HTTPS。本仓库自动测试只覆盖本地受控代理模拟，**不代表生产已验证**。
- 学习进度在浏览器保存，但在线 AI 问题与历史会传到 API 及模型服务。实际访问日志、保留期限和删除方式应按部署事实核实，不承诺“不留存”；不要在日志中记录完整对话正文。

## 资料同步与离线测试

六个人物 `backend/data/*.json`（不含人设文件）是唯一资料源。修改一次源资料后在仓库根目录执行：

```bash
python backend/export_materials.py
python backend/export_materials.py --check
PYTHONPATH=backend python -m unittest discover -s backend -p 'test_*.py'
```

Windows Git Bash 可用现有解释器 `backend/.venv/Scripts/python.exe` 替代 `python`。测试使用 stdlib unittest 和 httpx ASGITransport/MockTransport，隔离 `.env` 与真实密钥，完全不访问真实模型；覆盖 T10–T16/T22–T23/T28、本地可信代理、额度成功/失败/取消、检索与静态资料一致性。请先导出再运行测试，`--check` 发现不同步时退出码为 1 且不写文件。

产物格式为 `{"sources":[{"id":"figure/cN","figure":"…","title":"…","text":"…","source":"…","kind":"…","locator":"…","edition":"…","verification":"…","url":"可选"}]}`。原有元数据保留；未登记项默认标记为现代转述、locator 使用 source、版本为“尚未登记所据版本”、核验状态为“本站转述，原文及版本待核对”，不凭猜测补链接。不手改 `frontend/materials.json`；资料变更后重启后端以清空检索缓存。

## 替换检索实现

只改 `retriever.py` 的 `retrieve(figure, query)`，保持返回 chunk 字典列表（含 id/title/text/source），`main.py` 无需改动。当前 BM25 仅排除零/负相关得分，口语同义词和短追问是启发式改进，不保证语义检索质量，也不会替代人物时代边界或人工史料核验。