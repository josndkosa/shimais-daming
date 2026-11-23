// 史脉·大明 Sites Functions 入口：三端点移植版（BR-1）。
// 路由：/functions/v1/app/api/health|chat|quiz/practice（网关改写为 /<上游名>/api/*），或 ?action=health|chat|practice。
import { createApi, gatewayClientIp } from "./api.js";

const api = createApi({
  fetch: (url, init) => fetch(url, init),
  getKey: () => Deno.env.get("DEEPSEEK_API_KEY"),
  now: () => Date.now() / 1000,
  clientIp: gatewayClientIp,
});

Deno.serve(async (req, info) => {
  // BS-2 临时诊断：只回收到的路径/连接地址/网关转发头，供路由与限流身份实测；下一版移除。
  const url = new URL(req.url);
  if (url.searchParams.get("action") === "netinfo") {
    return new Response(JSON.stringify({
      pathname: url.pathname,
      remoteAddr: (info && info.remoteAddr && info.remoteAddr.hostname) || null,
      xff: req.headers.get("x-forwarded-for"),
      clientIp: gatewayClientIp(req, info),
    }), { headers: { "content-type": "application/json; charset=utf-8" } });
  }
  return api.handle(req, info);
});