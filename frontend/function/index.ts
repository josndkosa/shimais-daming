// 史脉·大明 Sites Functions 入口：三端点移植版（BR-1）。
// 路由：/functions/v1/app/api/health|chat|quiz/practice（网关改写为 /<上游名>/api/*），或 ?action=health|chat|practice。
import { createApi, gatewayClientIp } from "./api.js";

const api = createApi({
  fetch: (url, init) => fetch(url, init),
  getKey: () => Deno.env.get("DEEPSEEK_API_KEY"),
  now: () => Date.now() / 1000,
  clientIp: gatewayClientIp,
});

Deno.serve(async (req, info) => api.handle(req, info));