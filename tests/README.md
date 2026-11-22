# tests/ — 页面级浏览器回归 toolkit

本目录是《史脉·大明》的页面级回归防线：纯 CDP（Chrome DevTools Protocol）无头验收脚本，零 npm 依赖。
由系统 Temp 工作目录原样迁入（保持相对结构），日志 / 截图 / 二进制 / 缓存目录不入仓。

## 跑法

```bash
node tests/run-all.js
```

- runner 顺序执行全部 `verify<N>.js`（按编号）＋ `dbg-bt.js`（frontend/browser-tests.html 的 31 项浏览器回归）。
- 若 127.0.0.1:4173 静态服务未起，runner 自动以本目录 `serve.js` 拉起（ROOT 指向仓库 frontend/），结束時关闭自启进程。
- 汇总每套 过/总 断言数与绿套数；任一套失败以非零码退出。
- 单套也可独立跑：`node tests/verify50.js` 等。

## Chrome 路径

脚本默认 `C:/Program Files/Google/Chrome/Application/chrome.exe`；可用环境变量覆盖：

```bash
CHROME_PATH="/path/to/chrome" node tests/run-all.js
```

## 目录内容

- `verify<N>.js`：各轮功能的页面级验收（轮播/时间线/版图/关系表/小测/亲历/画像/检索/章节/滚动条/图鉴/联动等）。
- `dbg-bt.js`：browser-tests.html runner（读 `window.testResults`，等标题变 PASS/FAIL）。
- `serve.js`：4173 静态服务；`stub-practice.js` / `stub-chat-delay.js`：8001 后端 stub（`stub-mode.txt` 切 ok/fail503/rate429）。
- `chapter2–8.json` / `guests8.json` / `stub-*.txt` / `ctx-*.json`：脚本配套固件与控制文件。
- `test_*.py`：backend 额外 pytest 资产（主 backend 测试在 backend/test_api.py，CI 跑后者）。
- `inject-*.js` / `restructure-*.js` / `*-bn1.py` / `bn2-heads.js` 等：历史数据注入/一次性作者脚本，**非**回归 gate，仅供追溯；部分依赖已不入仓的备份目录，勿直接运行。

## 注意

- 个别早期探针引用迁移前旧路径或已被取代，属历史陈旧套件，入仓前后均失败（基线一致），不代表当前功能回归：
  verify2–8、10、11、13、15、16、18、20–25（旧路径/旧断言），以及 verify52（BH 左缘版探针，BH 修正改右缘后由 verify53 取代）。
  入仓基线：34/54 套绿、断言 602/627；当前维护的绿套以 run-all 输出为准。
- `verify33.js broken` 需先手动把 data.territory 改名制造破坏态再跑，runner 默认只跑 normal 相。
- 仓库另有 `frontend/content.test.cjs`（node --test）与 `frontend/browser-tests.html`，与本目录并存、不合并；CI 见 .github/workflows/ci.yml。