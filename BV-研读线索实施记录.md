# BV 个人研读线索实施记录

- 日期：2026-11-25
- 状态：已实施、已提交，待独立核验与站长另行批准后发布
- 设计：`docs/superpowers/specs/2026-11-24-personal-research-thread-design.md`
- 计划：`docs/superpowers/plans/2026-11-24-personal-research-thread.md`
- 交付分支：`main`
- 发布动作：无；未改变访问范围，未触碰线上函数或 Secret

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
- 未纳入并行工作修改的 `frontend/.史脉·大明.qoder.site`。
- 未纳入 `qoder截图/`。
- 未发布，未改变访问范围，未触碰线上函数与 Secret。
- 本记录与 BV-1 至 BV-5 在同一推送批次交付；发布仍须独立核验通过并获得站长另行点头。
