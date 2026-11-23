/* BR-0 探针：exists 布尔回显＋DeepSeek 最小 chat 串行两次。
   红线：不记录/不回显 key 与回复正文，只记状态码与耗时。 */
const PROBE_COOLDOWN_MS = 60000;
const CALL_TIMEOUT_MS = 20000;
let lastProbeAt = 0;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function deepseekPing(key) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + key,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    });
    await resp.arrayBuffer();
    return { status: resp.status, ms: Date.now() - started };
  } catch (err) {
    const kind = err && err.name === "AbortError" ? "timeout" : "network_error";
    return { status: 0, ms: Date.now() - started, error: kind };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^\/functions\/v1\/app/, "") || "/";
  const action = url.searchParams.get("action");
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  const exists = typeof key === "string" && key.length > 0;

  if (sub === "/" || sub === "/exists" || action === "exists") {
    return json({ exists });
  }

  if (sub === "/probe" || action === "probe") {
    if (!exists) return json({ exists, error: "service_not_configured" }, 503);
    const now = Date.now();
    if (now - lastProbeAt < PROBE_COOLDOWN_MS) {
      return json({ error: "probe_cooldown", retryAfterMs: PROBE_COOLDOWN_MS - (now - lastProbeAt) }, 429);
    }
    lastProbeAt = now;
    const totalStarted = Date.now();
    const call1 = await deepseekPing(key);
    const call2 = await deepseekPing(key);
    const result = { exists, call1, call2, totalMs: Date.now() - totalStarted };
    console.log("BR-0 probe " + JSON.stringify(result));
    return json(result);
  }

  return json({ error: "not_found" }, 404);
});