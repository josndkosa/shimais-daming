# shimais-daming

史脉·大明，静态多页历史研读站点。

## 本地运行

在仓库根目录运行 `python -m http.server 5500 --bind 127.0.0.1 --directory frontend`，访问 `http://127.0.0.1:5500`。后端启动方式见 `backend/README.md`。

## AI 服务配置

本机访问默认连接 `http://localhost:8000`。非本机访问默认使用离线人物剧本及固定题库，不会向访客电脑的 localhost 发送请求。

若启用线上 AI，在需要 AI 的 HTML 页面 head 内设置 `meta[name="api-base"]`：

- `content="same-origin"`：请求本站同源 `/api/chat` 和 `/api/quiz/practice`，需先部署对应反向代理。
- `content="offline"`：明确关闭在线 AI，包括本机预览。
- `content` 为实际后端 HTTPS 基地址：跨域部署，地址必须由站长填写并在后端配置 CORS；HTTPS 页面不接受 HTTP 后端。

未配置或配置非法时保持离线能力。发布前应从没有本地后端的设备检查真实地址、证书、代理与可信客户端 IP。学习进度保存在浏览器；在线对话会传输问题及近期历史到后端和模型服务。实际日志、保留期限及删除渠道应按部署事实另行说明。

## 资料与回归测试

史料内容以 `backend/data/*.json` 为准。运行 `python backend/export_materials.py` 更新离线可读的 `frontend/materials.json`，运行 `python backend/export_materials.py --check` 检查同步。不要直接修改导出文件。

- `node --test frontend/content.test.cjs`：内容 ID、专题引用和题目检查。
- 打开本地 `/browser-tests.html`：自动运行聊天并发、过期请求、练习恢复、错误分类、取消和超时测试；使用模拟网络和隔离存储，不调用真实模型，不改学习进度。页面的 `window.testResults` 提供机器可读结果。

测试页面仅用于本地验收，发布静态资源时排除 `browser-tests.html` 与 `*.test.cjs`。真实模型正确率、原典校勘和手机真机操作仍需单独检查。
