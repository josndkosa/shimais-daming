# BV 个人研读线索实施记录

- 日期：2026-11-25
- 状态：已实施并完成本地验收；2026-11-25 发布后自检发现回声文案重复，已立即回滚，待修复后重新验收发布
- 设计：`docs/superpowers/specs/2026-11-24-personal-research-thread-design.md`
- 计划：`docs/superpowers/plans/2026-11-24-personal-research-thread.md`
- 交付分支：`main`
- 发布动作：2026-11-25 曾发布 BV 版本；发布后自检发现回声文案重复，已立即回滚到 BT 版，当前线上不含 BV 改动

## 1. 分项提交

| 任务 | 提交号 | 提交信息 |
| --- | --- | --- |
| BV-1 | `ff2769c9073dd49b817b6891ccb882d64c68984a` | 个人研读线索（BV-1）：定义三条线索与证据映射 |
| BV-2 | `a86804b7103caaf796fae53aa3fae04559882e4e` | 个人研读线索（BV-2）：统一存储校验与证据记录 |
| BV-3 | `d58404f4c6f9b6cad4f7094b2a54b85b2a5bc111` | 个人研读线索（BV-3）：接入现有研读行为入口 |
| BV-4 | `1c166df707233ffbef19f18eeb5031bfe4bc0493` | 个人研读线索（BV-4）：画像证据链与响应式样式 |
| BV-5 | `e0072aa1c198c55e3bc64be67f3368cf1cf93bdc` | 个人研读线索（BV-5）：检索标记与全量验收 |

BV-1 至 BV-5 按 Task 1 → Task 5 顺序提交。每项均先写失败测试、确认有效红灯，再实现并确认绿灯。

## 2. 定版内容

三条研究问题逐字采用站长 2026-11-25 定版：

- `yitiaobian`：`一条鞭法把赋役并成白银，为什么农户的实际负担反而可能更重？`
- `tumubao`：`大军在土木堡覆没之后，北京凭什么守住了？`
- `chongzhen`：`崇祯勤政十七年，为什么还是没能挽回大明的颓势？`

未改既有史料、章节、亲历剧本、题目、人物设定或定版界面文案。新增数据只进入现有 `shimais-daming:progress:v1` 的 `research` 字段。

## 3. 红绿证据

| 任务 | 红灯 | 绿灯 |
| --- | --- | --- |
| BV-1 | 定向内容测试提示 `data.researchThreads` 不存在 | 定向 2/2；当轮全量 50/50 |
| BV-2 | 定向测试提示 `startResearchThread`、`recordThreadEvidence` 尚不存在 | 定向 2/2；当轮全量 52/52 |
| BV-3 | 原 34 项通过，新增 9 项失败；补离线回退测试后再次得到 43/44，证明离线剧本被误取证 | 浏览器 44/44；内容 52/52 |
| BV-4 | 新增画像、首页、损坏存档与写入失败测试失败 | 浏览器 49/49；修复 VM 沙箱依赖后内容 52/52 |
| BV-5 | 浏览器 49/50，唯一失败为“可补槽材料缺少标记” | 浏览器 50/50；内容 52/52；布局与动效 11/11 |

Node VM 测试中的嵌套数组/对象使用 JSON 序列化或 `Array.from()` 转回主 realm 后比较，避免跨 realm 原型差异造成假失败。

## 4. 最终验收

2026-11-25 在 BV-5 提交前重新执行，未沿用旧结果：

| 验收 | 命令 | 结果 |
| --- | --- | --- |
| 浏览器功能回归 | `node tests/dbg-bt.js` | 50/50，零失败 |
| 研读线索布局与动效 | `node tests/verify-research.js` | 11/11，零 console/runtime error |
| 轮播回归 | `node tests/verify9.js` | 13/13，零 console/runtime error |
| 内容与存档回归 | `node --test frontend/content.test.cjs` | 52/52 |
| Python / Functions API 对拍 | `node tests/br/compare.mjs` | 36/36；canonical 一致；BM25 1032 例最大分差 0 |
| Python 后端正式门禁 | 在 `backend/` 执行 `PYTHONIOENCODING=utf-8 python -m pytest -q` | 38 passed，112 subtests passed |
| 语法与差异检查 | `node --check frontend/app.js`、`node --check tests/verify-research.js`、`git diff --check` | 通过 |

布局验收覆盖桌面三卡/三槽、390px 单列纵向证据链、390px 单列线索卡、无文档级横向溢出、未开始只读、reduced-motion 和零运行时错误。

## 5. 与设计稿、计划的偏差

1. **研究问题定版**：设计原要求文案确认前不生成问句；站长于 2026-11-25 定版后，三条问题才逐字录入。设计状态已同步为已实施。
2. **回声文案**：设计示例为“已为「一条鞭法」线索取证 · 读机制 → 查看线索”，计划与 `researchUI` 为“已为「一条鞭法」线索取证 · 查看线索”。实现采用后者，设计示例已同步；未新增“读机制”这一未确认动作。
3. **Task 3 浏览器测试示例修正**：实际页面参数为 `decision` 而非 `decisions`；浏览器沙箱没有 `assert.equal`，改为 `assert(actual === expected, message)`；画像相对地址用 `getAttribute("href")` 判断；时间线需关闭后重新展开才触发第二次取证。
4. **亲历测试修正**：通关循环同时处理选择与“下一场”；重复末场 fixture 显式保留 `qinli.current` 且 `sceneIndex === story.scenes.length`，确保验证的是末场恢复而非重复通关。
5. **错题 fixture 与挂点**：fixture 精确为只错第十题；正式小测错题回看位于 `buildResult()`，除计划中的解析回看外，也在正式错题区接入同一 `review:<sourceId>` 记录，覆盖设计验收要求。
6. **聊天取证条件**：计划示例只判断 `reply != null`，会被离线剧本回退误触发。实现增加 `counted`，仅在线成功响应且仍为当前会话时取证；过期响应、离线剧本和在线失败回退均不取证，并新增专项回归。
7. **画像开始/切换重绘**：计划示例调用 `renderProfile()`，会重复追加页头与内容；实现改为在原 `.pf-wrap` 内 `wrap.replaceChildren(buildContent())`，保持单一容器。
8. **检索无关 fixture**：原“无关材料”可能不进入搜索结果，使无标记断言成为空断言；改为“一条鞭法时期的铜钱”，并同时断言该卡片确实存在且无标记。
9. **布局脚本 Chrome 目录**：计划使用仓库内 `tests/ud-research`；实现改用系统临时目录 `shimais-research-<pid>`，避免浏览器临时文件进入工作树。
10. **布局脚本导航等待**：`nav()` 同时等待目标路径、`readyState` 和非空 `#app`，避免旧页面就绪造成误判。
11. **Python 验收目录**：计划只写 `python -m pytest -q`，未标工作目录。实际 CI 在 `backend/` 执行；计划已补明目录与编码环境变量。
12. **VM 沙箱依赖**：画像/首页局部测试补 `activeResearch`、`researchFootprintCount` 空桩；检索局部测试补 `researchMarkerKey` 空桩，保持原有纯渲染测试独立。
13. **根目录 pytest 误跑**：根目录执行会误收集 `tests/` 下四个导入时即运行的旧脚本，出现 BT-2 后测试桩未接收 `max_tokens` 等历史漂移；这些脚本不是 CI 门禁。诊断中曾临时补齐旧桩签名，发现更深旧契约偏差后全部撤回，未修改后端或测试文件。误跑触发了旧脚本内置的本地 live 探针，可能使用本地后端既有上游配置；未读取或回显密钥值，未调用或修改线上 Functions，也未触碰 Secret 元数据。正式验收改用 CI 等价目录后全绿。

## 6. 范围与发布状态

- 未新增页面、顶级导航、后端接口、模型调用或 localStorage key。
- 未修改 `backend/`、史料、题目、剧本或人物设定。
- 未纳入并行工作修改的 `frontend/.史脉·大明.qoder.site`；发布工具随后写入的当前回滚绑定不视为 BV 源码改动。
- 未纳入 `qoder截图/`。
- 访问范围保持 public；未读取、回显或修改 Secret 值，未修改 Secret 设置；函数按原依赖重新发布。

## 7. 2026-11-25 发布、自检与回滚

### 7.1 发布版本

| 项 | 值 |
| --- | --- |
| 发布源码 | `3290909bae53e029fff0681a8f4fc1e2bc4534ec` |
| BV actionId | `ac412909-4bd5-445f-911f-cf5195cf79d7` |
| BV deploymentId | `01a212c4-56e8-7edf-9ddc-6afe820eb330` |
| **BV releaseId** | **`01a212c4-945b-740b-85f2-35d677b40533`** |
| publishOperationId | `01a212c4-945b-746d-9398-d0e987ff4c22` |
| 回滚源码基线 | `aa93ae8d5c94b09d83d030e59eaef929d9153415`（与上一版 BT 发布源码 `63777f8` 的生产文件一致） |
| 回滚 actionId | `d0878218-fef6-4a3a-8262-45c771eeaac4` |
| 回滚 deploymentId | `01a212ca-45c0-70b9-9eab-0b313e5ccc9d` |
| **当前线上 releaseId** | **`01a212cb-8628-7272-9d41-9bdc38c10eea`** |
| 回滚 publishOperationId | `01a212cb-8628-72b0-9911-f974d85156a8` |

发布前重新核验 `aa93ae8..3290909` 仅含 BV 定义、实现、测试与记录；`frontend/dist` 的 35 个生产文件与源码逐字节一致，Functions 与 `backend/` 相对 `aa93ae8` 无改动。新鲜门禁为内容 52/52、浏览器 50/50、布局 11/11、API 对拍 36/36、Python 38 passed + 112 subtests passed。

### 7.2 发布后自检

`tests/verify-bv-live.js` 对 BV release 执行结果：

- health 200，`status=ok`，六人物顺序正确：通过。
- 线上 `app.js`、`data.js`、`styles.css` 与发布产物 SHA-256 一致：通过。
- 画像页出现「研读线索」，三张卡标题与三条研究问题逐字正确：通过。
- 未开始状态无进度写入，桌面无文档级横向溢出：通过。
- 点击“开始追索”创建空的 `yitiaobian` 线索：通过。
- 展开 `event:e1581` 后证据只记录一次：通过。
- 决策页、对话页正常打开，无白屏、无 console/runtime error：通过。
- **底部回声精确文本：失败。** 页面实际显示“已为「一条鞭法」线索取证 · 查看线索查看线索”。

根因是 `showResearchEcho()` 已把完整模板放入 `.research-echo-text`，随后又追加文案同为“查看线索”的链接，导致可见文字重复。该问题未被原有只检查“提示出现”的浏览器用例发现。

### 7.3 回滚与当前状态

按“任何一项不过立即回滚”的要求，已用 `aa93ae8` 的生产文件与未改动的 Functions 新建回滚版本并发布。回滚后核验：

- 当前 action `published=true`、operation `succeeded/committed=true`。
- health 200，六人物正确。
- 线上三个核心资产与 `aa93ae8` 对应文件 SHA-256 全部一致。
- 访问范围保持 `public`；未读取、回显或修改 Secret 值，未改变函数依赖。

BV release 已被替换，当前线上不含 BV 功能。后续须修正回声为单一可见文案，补精确文本回归，重新执行本地全套与线上自检后再发布；不得沿用本次 14/15 的失败结果。
