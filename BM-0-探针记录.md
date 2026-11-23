# BM-0 能力探针记录（Sites Server Functions）

日期：2026-11-22　结论：**探针未通过，停在第 0 步，不进入第 1 步移植**；backend/ 与前端逻辑/文案均未改动（回退函数计算路线，现有后端不动）。

## 逐项结果

1. **档位可创建并部署 Server Functions、部署后经站点域名访问** —— 未验证（不具备验证条件）。
   - 证据：`get_context` 显示 `sites: []`（无云验证站点），仅本地未发布描述符 `frontend/.史脉·大明.qoder.site`；`list_sites` owned `projects: []`。函数后端未分配（无 backendRef）。
   - 要验证需 `prepare_site`（建草稿/云资源）＋`publish_site`（发布）。发布属站长显式授权事项，且会提前公开整站（与 11/29 发帖计划冲突）；鉴于第 2/4 项必不过，本次不做部署。
2. **环境变量/Secret 可配置且函数内可读** —— 不过。
   - 证据：无云站点故无任何 Secret；MCP 工具集仅 `get_site(include:[secrets])` 与 `delete_secret`，**无创建 Secret 的工具**；Secret 值须站长在 Site Settings 控制台填写（"Values are entered in Site Settings and never included in chat or command arguments"）。当前未建测试 Secret，函数侧无从读取。
3. **函数内可出网调用 https://api.deepseek.com** —— 未验证。
   - 需已部署函数才能实测 egress；未部署（见第 1 项），故无 HTTP 响应证据。
4. **单次执行时限内完成真实 DeepSeek 调用（chat 串行 2 次／practice 最多 4 次）** —— 不过。
   - 证据：Sites Secret 未填 DEEPSEEK_API_KEY；本机环境变量亦未设（`DEEPSEEK_API_KEY set: False`）。无已轮换的新 key，无法做带 key 的最小 chat 往返实测，耗时无数字。

## 门禁判定

第 2、4 项不过（前置条件缺失：站长控制台 Secret／已轮换 key），按规格「探针任一项不过：停下，不进入第 1 步」执行停止。第 1、3 项因未部署记为未验证。

## 重试前置（需站长本人操作）

1. 在 Sites 控制台为本项目创建测试 Secret 与 **已轮换的** DEEPSEEK_API_KEY（旧 key 先在 DeepSeek 后台作废）；key 不经聊天、不进仓库、不写日志。
2. 明确授权发布探针（prepare_site＋publish_site；会公开整站）或确认探针发布窗口。
3. 满足后重跑第 0 步四项（含 /api/health 域名访问、Secret 存在性回显、deepseek 出网、带 key chat 往返耗时），全过才进入 BM-1 移植。