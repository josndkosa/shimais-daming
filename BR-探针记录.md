# BR 探针记录（Sites Server Functions 实测收尾）

日期：2026-11-23　结论：**四项全过，门禁通过，可进 BR-1 移植**。
探针草稿 actionId 443bf896-ad98-4a33-8bc5-02e38d3b8c10 经站长授权发布（前端 dist 逐字节不变，线上页面与剧本兜底现状保持）；站点访问已由站长改为 public。

## 四项结论（逐项）

1. **档位可部署 Server Functions 且域名可访问** —— 过（沿用分配实证＋本次部署响应）。
   - Functions 后端分配成功（backend status=ready，capabilities 含 functions）；探针函数经站点域名实际响应 HTTP 200。
2. **Secret 可配置且函数内可读** —— 过。
   - 站长在站点设置安全输入 DEEPSEEK_API_KEY（sync_state=synced，值不经聊天/仓库/日志）；函数内 `Deno.env.get` 读取，`/functions/v1/app?action=exists` 回显 `{"exists":true}`，仅布尔不回显值。
3. **函数出网调 DeepSeek** —— 过。
   - 用该 key 向 https://api.deepseek.com/chat/completions 发最小 chat（model=deepseek-chat，max_tokens=1，content="ping"）：**call1 HTTP 200，call2 HTTP 200**。
4. **时限内完成串行调用** —— 过。
   - call1 往返 **522ms**，call2 往返 **266ms**，函数内串行总耗时 **788ms**；客户端整请求 wall **1.905s**（含本站网络与平台开销）。
   - 平台单次执行时限数字：工具与插件文档均未暴露该数值，无法引用官方口径；实测 788ms 串行两次未发生超时截断（函数内单次调用自设 20s 超时保护未触发）。chat 正式链路串行 2 次、practice 最多 4 次的预算按本次单次数百毫秒量级估计充裕，正式数字以 BR-1 后端到端实测为准。

## 路由与防滥用备注

- 平台函数入口为 `/functions/v1/app`，**查询参数路由可用**（`?action=exists|probe`）；子路径 `/functions/v1/app/exists` 实测返回 not_found（平台未转发子路径），BR-1 端点映射按查询参数或平台实际转发行为适配。
- 探针路由带 60s 全局冷却（429 probe_cooldown），防公开站点上被刷 DeepSeek 配额；BR-1 移植版将移除探针路由。
- 日志与本报告只记状态码与耗时；key、回复正文零记录（函数内 resp.arrayBuffer() 丢弃正文）。

## 实测原始返回

```
GET /functions/v1/app?action=exists → {"exists":true}
GET /functions/v1/app?action=probe  → {"exists":true,"call1":{"status":200,"ms":522},"call2":{"status":200,"ms":266},"totalMs":788}（http 200，wall 1.904950s）
GET / → 200（首页内容不变）
```