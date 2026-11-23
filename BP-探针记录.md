# BP 探针记录（Sites Server Functions 重试）

日期：2026-11-22　结论：**第一步只读核查不通过 → 停止，不进入第二步/第三步**；backend/ 与前端任何页面、api-base 零改动；不可进 BM-1。

## 第一步：只读核查（不过即停）

- **list_sites 确认云站点**：无法执行——本轮 Sites MCP 连接器已断开（`mcp_list(server="sites")` 返回空；目录更新明确移除 `mcp__plugin_sites_qoder_sites__*`）。
  - 同会话早前 BM-0 的只读证据：`get_context` sites=[]、`list_sites` owned projects=[] → **云站点未建**。
- **get_site(secrets) 确认 DEEPSEEK_API_KEY 存在**：无法执行（连接器断开）；BM-0 时无任何 Secret，且 MCP 无创建 Secret 能力（值须站长控制台填写）。**未确认 Secret 已填**。
- 判定：两项均无法确认存在（站点未建／Secret 未填）→ 第一步不通过，停。

## 第二步／第三步

未执行（门禁拦截）。未建探针函数、未 prepare_site/publish_site、未改 api-base。探针函数源码待连接器恢复且第一步通过后再按平台约定编写入仓。

## 四项结论（逐项）

1. **档位可部署 Server Functions 且域名可访问**：不过／未验证。证据：Sites 连接器断开无法部署与域名实测；BM-0 证据 projects=[]（站点未建）。
2. **Secret 可配置且函数内可读**：不过。exists 结果无法取得（连接器断开）；BM-0 时无 Secret；未确认 DEEPSEEK_API_KEY 存在。
3. **函数出网调 DeepSeek**：不过／未验证。未部署函数，无 HTTP 状态码证据。
4. **时限内完成串行调用**：不过。无已确认 key、未部署，单次耗时与串行两次总耗时均无数字；平台单次执行时限数字亦无法读取（连接器断开）。

## 重试前置

1. 恢复本会话 Sites MCP 连接器（或提供可用 Sites 通道）。
2. 站长确认云站点已建、并在控制台填好**已轮换的** DEEPSEEK_API_KEY（旧 key 先作废）；key 不经聊天/不进仓库/不写日志。
3. 重跑第一步只读核查（list_sites＋get_site(secrets) 仅看名称/存在性），两项都在才进第二步探针函数与发布实测。