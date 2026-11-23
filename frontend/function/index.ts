// 史脉·大明 Sites Functions 入口：三端点移植版（BR-1）。
// 路由：/functions/v1/app/api/health|chat|quiz/practice（网关改写为 /app/api/*），或 ?action=health|chat|practice。
import { createApi } from "./api.js";

const api = createApi({
  fetch: (url, init) => fetch(url, init),
  getKey: () => Deno.env.get("DEEPSEEK_API_KEY"),
  now: () => Date.now() / 1000,
  // 网关连接地址优先；缺失时取网关注入的转发链最右一跳（浏览器伪造头在网关被剥离，口径待切换时实测）。
  clientIp: (req, info) => {
    const remote = info && info.remoteAddr && info.remoteAddr.hostname;
    if (remote) return remote;
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
    return "unknown";
  },
});

Deno.serve((req, info) => api.handle(req, info));