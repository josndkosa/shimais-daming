# BR 对拍记录（BR-2：函数版 vs Python 版）

日期：2026-11-23　结论：**对拍全绿，停在「待站长确认切换」**。
函数草稿 actionId 48c4435a-21e9-4683-8fed-d1a29eb3eb7c 就绪（canPublish=true）**未发布**；线上仍为探针版（443bf896），前端 api-base、文案、剧本兜底零改动；backend/ Python 版零改动保留作回滚。

## 三方证据（分开记录）

| 套件 | 运行方式 | 结果 |
| --- | --- | --- |
| Python 基线 backend/test_api.py | backend/.venv `python -m unittest test_api -v`（venv 无 pytest，unittest 直跑） | **34/34 OK**（0.819s，含全部 subTest） |
| 函数版对拍 tests/br/compare.mjs | `node tests/br/compare.mjs`（同一 api.js 源码，mock 上游，零真实 LLM） | **29/29 PASS** |
| BM25 跨语言排序 | bm25_dump.py 导出基准 → compare.mjs 比对 | **172 查询 × 6 人物 = 1032 例，top3 顺序逐例一致，全量分数最大偏差 0** |
| 前端内容测试 frontend/content.test.cjs | `node --test content.test.cjs` | **46/46 pass** |

对拍为本地同源执行（与 Python 基线的 ASGI 本地执行对称）；云端部署后的真实端点验证留待切换发布后按 BM 第 3 步执行，本记录不声称已验证线上函数行为。

## 逐项对照（Python 用例 → 函数版用例）

| Python 用例 | 函数版对拍项 | 结果 |
| --- | --- | --- |
| test_T10_history_per_role_boundaries | T10 历史分角色字数边界（user 500/assistant 2000，史/a） | 一致 |
| test_T11_history_entry_limit | T11 历史条目上限 19/20 | 一致 |
| test_T12_new_question_limits_without_model_calls | T12 新问题字数边界不触发模型 | 一致 |
| test_T13_total_characters_include_new_question | T13 累计字数含新问题（1950×10+500 / +1） | 一致 |
| test_T13_actual_body_byte_limit_and_json_escaping | T13 真实 body 字节上限与 JSON 转义（128KiB±1，a/中/转义） | 一致 |
| test_T13_chunked_body_ignores_spoofed_content_length | T13 分块 body 无视伪造 Content-Length（含 413 的 CORS 头） | 一致 |
| test_T13_large_history_is_rejected_before_model | T13 超大历史先 413 再校验 | 一致 |
| test_422_is_structured_without_echoing_body | 422 结构化且不回显正文（含坏 JSON） | 一致 |
| test_unknown_figure_and_route_are_structured | 未知人物与未知路由结构化 404 | 一致 |
| test_T14_malformed_upstream_envelopes_do_not_retry | T14 坏上游封装不重试（chat/practice 各 13 种，恰 1 次调用） | 一致 |
| test_network_timeout_and_review_errors_are_not_generation_failure | 超时/网络错误口径（504/502，含审题阶段，两路由） | 一致 |
| test_memory_tier_and_topics_reach_the_system_prompt | memory 档位与话题注入系统提示 | 一致 |
| test_memory_topics_are_truncated_and_capped | memory 话题截断 50 字、上限 3 条 | 一致 |
| test_invalid_memory_tier_is_ignored / test_chat_without_memory_keeps_the_prompt_unchanged | 非法 tier 忽略；无 memory 提示词不变（endswith GENERAL_RULES） | 一致 |
| test_empty_chat_checker_is_valid | 空校验回复合法 note=null 且两次调用 | 一致 |
| test_followup_retrieval_uses_only_latest_user_context | 追问检索只带最近用户问题 | 一致 |
| test_material_files_missing_or_invalid_do_not_call_model | 史料缺失/损坏不调模型 503（provider 注入等价 Path.read_text 补丁） | 一致 |
| test_invalid_material_structure_does_not_call_model | 同上（{} / 空 chunks / 缺字段 / null 条目） | 一致 |
| test_T15_invalid_question_structures_never_escape | T15 非法题目结构两次生成后 503（19 种变异，恰 2 次调用） | 一致 |
| test_T16_bad_generated_json_retries_once_then_recovers | T16 坏 JSON 重试一次后恢复（3 次调用） | 一致 |
| test_T23_source_is_canonical_and_reviewer_gets_evidence | T23 source 以 canonical 为准且审题拿证据 | 一致 |
| test_T23_ambiguous_or_unsupported_or_malformed_reviews_rejected | T23 歧义/不支持/坏审题一律拒绝（12 种，含 [0.0]/[true]/supported=1/"true"） | 一致 |
| test_T22_six_attempts_count_success_and_failure_and_expire | T22 六次尝试计成功与失败、到期恢复、聊天独立（retry_after=3600+头） | 一致 |
| test_chat_rate_has_retry_after | chat 限流 30 次与 retry_after 头 | 一致 |
| test_cors_defaults_local_only | health 六人顺序与 CORS 默认本地（四本地 origin 回显、外域无头） | 一致 |
| RetrievalTests 三项 | 检索：直接事实/口语同义/零相关＋1032 例跨语言全量比对 | 一致 |
| ExportTests.test_canonical_export_matches_all_six_files_and_preserves_metadata | canonical 导出与 frontend/materials.json 一致（deepEqual） | 一致 |

## 口径差异与等价处理（如实列明）

1. **取消不退款**：Python 用 asyncio.CancelledError 直穿；JS 无对应物，以 fetch 网络失败（502）等价验证「6 次失败后第 7 次 429、不计模型调用」，不退款语义一致。
2. **uvicorn 可信代理跳数**（test_T28_uvicorn_trusts_only_configured_proxy_hops）：属 uvicorn 中间件行为，不可移植；函数版以连接地址（Deno.serve info.remoteAddr）为限流身份，网关 XFF 注入行为待切换时实测。T28 的「伪造 XFF 不改身份」已按此口径对拍通过。
3. **type(x) is int 拒 float**：JSON.parse 无法区分 0 与 0.0，函数版对 answer/correctOptions 数字字面量做原文整型校验（answerLiteralsAreInts/correctOptionsLiteralsAreInts），[0.0] 拒绝行为与 Python 一致。
4. **字数口径**：按 Unicode 码点计数（Array.from），与 Python len 一致；提示词 JSON 用 pyJsonDump 复刻 json.dumps 默认分隔符（", ", ": "）。
5. **ExportTests.test_check_detects_stale_export_without_writing**：Python 导出工具 CLI 行为，与函数契约无关，未移植（导出工具本体未动）。
6. 平台差异备注：函数单次执行时限数字平台未暴露（见 BR-探针记录）；chat 串行 2 次实测 788ms，practice 最多 4 次调用预算按同量级估计充裕，切换后以端到端实测为准。

## 函数文件清单（frontend/function/，104KB）

- index.ts —— Deno.serve 入口；路由 /app/api/*（网关实测改写）与 ?action= 双适配；clientIp 取连接地址
- api.js —— 三端点契约、限流（内存 Map＋每 256 请求定期清扫）、错误口径、CORS、128KiB 流式体限
- bm25.js —— BM25Okapi 等价＋分词＋查询侧同义扩展＋top3 稳定排序
- materials.js —— load_figure 校验/canonical 导出/MaterialsUnavailableError
- consts.js、data_bundle.js —— 脚本生成（tests/br/extract-consts.py、gen-bundle.mjs），逐字自 backend
- data/ 七 JSON —— 与 backend/data 逐字节一致（diff 核验）

## 红线核验

- key 不进仓库/日志/聊天：函数只 Deno.env.get 读取；日志仅类型与状态；对拍用 offline-test-only 假 key。
- 人物数据、题目、史料文字逐字不动：data/ 七文件 diff 逐字节一致；提示词常量脚本提取；frontend/ 页面/data.js/app.js/styles.css 零改动（git 核验）。
- backend/ 与前端文案逻辑零改动；未发布新版本（线上＝探针版）。

## 下一步（待站长确认切换）

切换＝发布移植版草稿（或按当时源码新备草稿）＋前端 api-base 指向同域函数入口＋真实端点验收（health/chat/practice 各一条真实请求）。本草稿未发布，随时可弃。