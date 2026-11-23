// backend/main.py 的逐字契约移植（Sites Functions 版）。
// 依赖注入 deps：fetch / getKey / now（秒）/ clientIp(req, info) / provider（史料原文），便于本地对拍。
// 红线：错误日志只记类型与状态，不记用户正文；key 只从 Secret 读。
import { GENERAL_RULES, CHECK_RULES, PRACTICE_RULES, REVIEW_RULES, MEMORY_TIERS, FOLLOWUPS, FIGURES } from "./consts.js";
import { loadFigure, canonicalMaterials, loadPersonas, MaterialsUnavailableError, defaultProvider } from "./materials.js";
import { retrieve, clearCache } from "./bm25.js";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const UPSTREAM_TIMEOUT_MS = 30000;

const HISTORY_MAX_ENTRIES = 20;
const MESSAGE_MAX_CHARS = 500;
const ASSISTANT_HISTORY_MAX_CHARS = 2000;
const CONTEXT_MAX_CHARS = 20000;
const REQUEST_MAX_BYTES = 128 * 1024;
const RATE_LIMIT = 30;
const PRACTICE_RATE_LIMIT = 6;
const RATE_WINDOW_SECONDS = 3600;

const LOCAL_ORIGINS = ["localhost", "127.0.0.1"].flatMap((host) => [5500, 5501].map((port) => `http://${host}:${port}`));

class UpstreamError extends Error {}
class UpstreamTimeoutError extends Error {}

const cp = (s) => Array.from(s);
const cpLen = (s) => cp(s).length;
const cpSlice = (s, n) => cp(s).slice(0, n).join("");

// Python json.dumps 默认分隔符（", ", ": "），ensure_ascii=False。
function pyJsonDump(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(pyJsonDump).join(", ") + "]";
  return "{" + Object.entries(value).map(([k, v]) => JSON.stringify(k) + ": " + pyJsonDump(v)).join(", ") + "}";
}

function errorResponse(status, code, detail, retryAfter) {
  const content = { code, detail };
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (retryAfter !== undefined && retryAfter !== null) {
    content.retry_after = retryAfter;
    headers["retry-after"] = String(retryAfter);
  }
  return new Response(JSON.stringify(content), { status, headers });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function parseJson(raw) {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.includes("\n") ? text.slice(text.indexOf("\n") + 1) : "";
    const rstripped = text.replace(/\s+$/, "");
    if (rstripped.endsWith("```")) text = rstripped.slice(0, -3);
  }
  return JSON.parse(text.trim());
}

// Python type(x) is int 拒绝 float/bool；JSON.parse 无法区分 0 与 0.0，
// 故对 answer / correctOptions 的数字字面量做原文整型校验。
function answerLiteralsAreInts(raw) {
  for (const m of raw.matchAll(/"answer"\s*:\s*([^,}\]\s]+)/g)) {
    if (!/^-?\d+$/.test(m[1])) return false;
  }
  return true;
}

function correctOptionsLiteralsAreInts(raw) {
  for (const m of raw.matchAll(/"correctOptions"\s*:\s*\[([^\]]*)\]/g)) {
    for (const part of m[1].split(",")) {
      const t = part.trim();
      if (t && !/^-?\d+$/.test(t)) return false;
    }
  }
  return true;
}

export function createApi(deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const getKey = deps.getKey || (() => undefined);
  const now = deps.now || (() => Date.now() / 1000);
  const clientIp = deps.clientIp || (() => "unknown");
  const provider = deps.provider || defaultProvider;
  const retrieveImpl = deps.retrieve || retrieve;
  const upstreamTimeoutMs = deps.upstreamTimeoutMs ?? UPSTREAM_TIMEOUT_MS;

  const personas = loadPersonas(provider);
  const hits = new Map();
  const practiceHits = new Map();
  let requestCount = 0;

  function takeAttempt(buckets, ip, limit) {
    const t = now();
    let window = buckets.get(ip);
    if (!window) {
      window = [];
      buckets.set(ip, window);
    }
    while (window.length && t - window[0] >= RATE_WINDOW_SECONDS) window.shift();
    if (window.length >= limit) return Math.max(1, Math.ceil(RATE_WINDOW_SECONDS - (t - window[0])));
    window.push(t);
    return 0;
  }

  function sweep(buckets) {
    const t = now();
    for (const [ip, window] of buckets) {
      while (window.length && t - window[0] >= RATE_WINDOW_SECONDS) window.shift();
      if (!window.length) buckets.delete(ip);
    }
  }

  async function callDeepseek(messages, temperature, allowEmpty = false) {
    const key = getKey();
    if (!key) throw new UpstreamError("对话服务未配置密钥，请联系站长后再试。");
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, upstreamTimeoutMs);
    let resp;
    try {
      resp = await fetchImpl(DEEPSEEK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + key },
        body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, temperature }),
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) throw new UpstreamTimeoutError("upstream timeout");
      throw new UpstreamError("无法连接模型服务，请稍后再试。");
    } finally {
      clearTimeout(timer);
    }
    if (resp.status !== 200) throw new UpstreamError("对话服务暂时不可用（上游错误），请稍后再试。");
    let payload;
    try {
      payload = await resp.json();
    } catch {
      throw new UpstreamError("模型服务返回格式异常，请稍后再试。");
    }
    const choices = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.choices : null;
    if (!Array.isArray(choices) || !choices.length || !choices[0] || typeof choices[0] !== "object" || Array.isArray(choices[0])) {
      throw new UpstreamError("模型服务返回格式异常，请稍后再试。");
    }
    const message = choices[0].message;
    const content = message && typeof message === "object" && !Array.isArray(message) ? message.content : null;
    if (typeof content !== "string") throw new UpstreamError("模型服务返回格式异常，请稍后再试。");
    const trimmed = content.trim();
    if (!trimmed && !allowEmpty) throw new UpstreamError("模型服务返回空回复，请稍后再试。");
    return trimmed;
  }

  function retrievalQuery(req) {
    const compact = req.message.replace(/[\s？?！!。，,.]/g, "");
    if (cpLen(compact) <= 16 && FOLLOWUPS.some((f) => compact.startsWith(f))) {
      const previous = [...req.history].reverse().find((m) => m.role === "user");
      if (previous) return previous.content + "\n" + req.message;
    }
    return req.message;
  }

  function memoryNote(memory) {
    if (!memory || typeof memory !== "object" || Array.isArray(memory)) return "";
    const tier = memory.tier;
    if (!MEMORY_TIERS.includes(tier)) return "";
    const topics = memory.lastTopics;
    const picked = [];
    if (Array.isArray(topics)) {
      for (const item of topics.slice(0, 3)) {
        if (typeof item === "string" && item.trim()) picked.push(cpSlice(item, 50));
      }
    }
    if (!picked.length) return "";
    return (
      "此人此前曾与你交谈，谈及：" + picked.join("、") + "。若自然，可在言语间提及一二，不必刻意。" +
      "此人现与你的交情是「" + tier + "」：交情深者，言语可更坦率推心，" +
      "但仍不得逾越你的时代认知与史实边界，史官校验规则不变。"
    );
  }

  function buildSystem(figure, query) {
    const persona = personas[figure];
    const chunks = retrieveImpl(figure, query, provider);
    const parts = [
      "# 人设卡",
      "name：" + persona.name,
      "era_point：" + persona.era_point,
      "voice：" + persona.voice,
      "stance：" + persona.stance,
      "boundaries：" + persona.boundaries,
      "",
      "# 史料依据",
      "回答应优先依据以下史料，不得与之矛盾。",
    ];
    for (const c of chunks) parts.push("- [" + c.id + "] " + c.title + "：" + c.text + "（" + c.source + "）");
    parts.push("");
    parts.push(GENERAL_RULES);
    return [parts.join("\n"), chunks];
  }

  function validateChatPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    if (typeof payload.figure !== "string" || typeof payload.message !== "string") return null;
    let history = [];
    if (payload.history !== undefined) {
      if (!Array.isArray(payload.history)) return null;
      for (const m of payload.history) {
        if (!m || typeof m !== "object" || Array.isArray(m)) return null;
        if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
        history.push({ role: m.role, content: m.content });
      }
    }
    let memory = null;
    if (payload.memory !== undefined && payload.memory !== null) {
      if (typeof payload.memory !== "object" || Array.isArray(payload.memory)) return null;
      memory = payload.memory;
    }
    return { figure: payload.figure, message: payload.message, history, memory };
  }

  async function readBodyLimited(req) {
    if (!req.body) return { ok: true, bytes: new Uint8Array(0) };
    const reader = req.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > REQUEST_MAX_BYTES) {
        try { await reader.cancel(); } catch { /* 忽略 */ }
        return { ok: false };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }
    return { ok: true, bytes };
  }

  async function handleChat(req, ip) {
    const body = await readBodyLimited(req);
    if (!body.ok) return errorResponse(413, "request_too_large", "请求体不能超过 128 KiB，请缩短内容后重试。");
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(body.bytes));
    } catch {
      return errorResponse(422, "validation_error", "请求格式不正确，请检查必填字段、消息角色与内容类型。");
    }
    const parsed = validateChatPayload(payload);
    if (!parsed) return errorResponse(422, "validation_error", "请求格式不正确，请检查必填字段、消息角色与内容类型。");

    if (!Object.hasOwn(personas, parsed.figure)) return errorResponse(404, "not_found", "名册中无此人。");
    if (parsed.history.length >= HISTORY_MAX_ENTRIES) {
      return errorResponse(400, "invalid_input", "对话最多 10 轮（history 少于 20 条），请开启新对话。");
    }
    if (!parsed.message.trim() || cpLen(parsed.message) > MESSAGE_MAX_CHARS) {
      return errorResponse(400, "invalid_input", "问题须为 1–500 字。");
    }
    for (const m of parsed.history) {
      const limit = m.role === "user" ? MESSAGE_MAX_CHARS : ASSISTANT_HISTORY_MAX_CHARS;
      if (!m.content.trim() || cpLen(m.content) > limit) {
        return errorResponse(400, "invalid_input", "历史消息不能为空，user 最多 500 字、assistant 最多 2000 字。");
      }
    }
    if (cpLen(parsed.message) + parsed.history.reduce((s, m) => s + cpLen(m.content), 0) > CONTEXT_MAX_CHARS) {
      return errorResponse(400, "invalid_input", "历史消息与新问题累计不能超过 20000 字，请开启新对话。");
    }
    const retryAfter = takeAttempt(hits, ip, RATE_LIMIT);
    if (retryAfter) {
      return errorResponse(429, "rate_limited", "提问过频：同一地址每小时最多 30 次，请稍后再试。", retryAfter);
    }

    const [system0, chunks] = buildSystem(parsed.figure, retrievalQuery(parsed));
    const note0 = memoryNote(parsed.memory);
    const system = note0 ? system0 + "\n" + note0 : system0;
    let budget = CONTEXT_MAX_CHARS - cpLen(parsed.message);
    const history = [];
    for (const m of [...parsed.history].reverse()) {
      const content = cpSlice(m.content, Math.min(budget, m.role === "user" ? MESSAGE_MAX_CHARS : ASSISTANT_HISTORY_MAX_CHARS));
      if (content) {
        history.push({ role: m.role, content });
        budget -= cpLen(content);
      }
    }
    const messages = [{ role: "system", content: system }, ...history.reverse(), { role: "user", content: parsed.message }];
    const reply = await callDeepseek(messages, 0.7);

    const evidence = chunks.map((c) => "- " + c.title + "：" + c.text).join("\n");
    const checkMessages = [
      { role: "system", content: CHECK_RULES },
      { role: "user", content: "用户问题：" + parsed.message + "\n史料依据：\n" + evidence + "\n待校验回复：\n" + reply },
    ];
    const verdict = await callDeepseek(checkMessages, 0.0, true);
    const note = verdict && !["无", "无误", "无。"].includes(verdict) ? cpSlice(verdict, 50) : null;
    return jsonResponse({ reply, note });
  }

  function validatePractice(payload, sources, raw) {
    if (!answerLiteralsAreInts(raw)) return null;
    const qs = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.questions : null;
    if (!Array.isArray(qs) || qs.length !== 10) return null;
    const counts = { timeline: 0, person: 0, institution: 0 };
    const stems = new Set();
    const validated = [];
    for (const q of qs) {
      if (!q || typeof q !== "object" || Array.isArray(q)) return null;
      const dim = q.dim;
      if (typeof dim !== "string" || !Object.hasOwn(counts, dim)) return null;
      counts[dim] += 1;
      const stem = q.stem, opts = q.options, ans = q.answer, explain = q.explain, sourceId = q.sourceId;
      if (typeof stem !== "string" || !stem.trim()) return null;
      const stemKey = stem.split(/\s+/).filter(Boolean).join("");
      if (stems.has(stemKey)) return null;
      stems.add(stemKey);
      if (!Array.isArray(opts) || opts.length !== 4) return null;
      if (!opts.every((o) => typeof o === "string" && o.trim())) return null;
      if (new Set(opts.map((o) => o.split(/\s+/).filter(Boolean).join(""))).size !== 4) return null;
      if (typeof ans !== "number" || !Number.isInteger(ans) || ans < 0 || ans > 3) return null;
      if (typeof explain !== "string" || !explain.trim()) return null;
      if (typeof sourceId !== "string" || !Object.hasOwn(sources, sourceId)) return null;
      validated.push({
        dim, stem: stem.trim(), options: opts.map((o) => o.trim()),
        answer: ans, explain: explain.trim(), sourceId,
        source: sources[sourceId].source,
      });
    }
    if (counts.timeline !== 4 || counts.person !== 3 || counts.institution !== 3) return null;
    return validated;
  }

  async function reviewPractice(qs, sources) {
    const items = qs.map((q) => ({ stem: q.stem, options: q.options, explain: q.explain, material: sources[q.sourceId] }));
    const messages = [
      { role: "system", content: REVIEW_RULES },
      { role: "user", content: pyJsonDump(items) },
    ];
    const raw = await callDeepseek(messages, 0.0);
    if (!correctOptionsLiteralsAreInts(raw)) return false;
    const verdicts = parseJson(raw);
    if (!Array.isArray(verdicts) || verdicts.length !== qs.length) return false;
    for (let i = 0; i < qs.length; i++) {
      const verdict = verdicts[i];
      if (!verdict || typeof verdict !== "object" || Array.isArray(verdict) || verdict.explanationSupported !== true) return false;
      const options = verdict.correctOptions;
      if (!Array.isArray(options) || options.length !== 1) return false;
      if (typeof options[0] !== "number" || !Number.isInteger(options[0]) || options[0] !== qs[i].answer) return false;
    }
    return true;
  }

  async function handlePractice(ip) {
    const retryAfter = takeAttempt(practiceHits, ip, PRACTICE_RATE_LIMIT);
    if (retryAfter) {
      return errorResponse(429, "rate_limited", "同一地址每小时最多 6 次出题尝试（含失败和取消），请稍后再试或使用固定题。", retryAfter);
    }
    const sources = Object.fromEntries(canonicalMaterials(provider).sources.map((s) => [s.id, s]));
    const genMessages = [
      { role: "system", content: PRACTICE_RULES },
      { role: "user", content: "# 事实来源池\n" + pyJsonDump(Object.values(sources)) + "\n\n请出题。" },
    ];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callDeepseek(genMessages, 0.7);
        const qs = validatePractice(parseJson(raw), sources, raw);
        if (qs === null || !(await reviewPractice(qs, sources))) continue;
        return jsonResponse({ questions: qs });
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
    return errorResponse(503, "generation_failed", "本次题目经两次生成仍未通过校验，请重试或使用固定题。");
  }

  function corsHeaders(req) {
    const origin = req.headers.get("origin");
    return origin && LOCAL_ORIGINS.includes(origin) ? { "access-control-allow-origin": origin } : {};
  }

  function withCors(req, resp) {
    const extra = corsHeaders(req);
    if (!Object.keys(extra).length) return resp;
    const headers = new Headers(resp.headers);
    for (const [k, v] of Object.entries(extra)) headers.set(k, v);
    return new Response(resp.body, { status: resp.status, headers });
  }

  async function route(req, ip) {
    const url = new URL(req.url);
    // 网关把 /functions/v1/app/<后缀> 改写为 /app/<后缀>（BR-0 实测）；本地对拍直接给 /api/*。
    let path = url.pathname.replace(/^\/functions\/v1\/[^/]+/, "").replace(/^\/app/, "") || "/";
    const action = url.searchParams.get("action");
    if (action === "health") path = "/api/health";
    else if (action === "chat") path = "/api/chat";
    else if (action === "practice") path = "/api/quiz/practice";

    if (req.method === "OPTIONS") {
      const headers = { ...corsHeaders(req) };
      if (headers["access-control-allow-origin"]) {
        headers["access-control-allow-methods"] = "GET, POST";
        headers["access-control-allow-headers"] = "Content-Type";
        headers["access-control-expose-headers"] = "Retry-After";
      }
      return new Response("OK", { status: 200, headers });
    }

    if (path === "/api/health") {
      if (req.method !== "GET") return errorResponse(405, "http_error", "请求无法处理。");
      return jsonResponse({ status: "ok", figures: Object.keys(personas) });
    }
    if (path === "/api/chat") {
      if (req.method !== "POST") return errorResponse(405, "http_error", "请求无法处理。");
      return handleChat(req, ip);
    }
    if (path === "/api/quiz/practice") {
      if (req.method !== "POST") return errorResponse(405, "http_error", "请求无法处理。");
      return handlePractice(ip);
    }
    return errorResponse(404, "not_found", "请求的资源不存在。");
  }

  async function handle(req, info) {
    requestCount += 1;
    if (requestCount % 256 === 0) {
      sweep(hits);
      sweep(practiceHits);
    }
    const ip = clientIp(req, info);
    let resp;
    try {
      resp = await route(req, ip);
    } catch (err) {
      if (err instanceof MaterialsUnavailableError) {
        resp = errorResponse(503, "materials_unavailable", "史料库暂不可用，请稍后再试。");
      } else if (err instanceof UpstreamTimeoutError) {
        resp = errorResponse(504, "upstream_timeout", "上游响应超时（30 秒），请稍后再试。");
      } else if (err instanceof UpstreamError) {
        resp = errorResponse(502, "upstream_error", err.message);
      } else {
        console.log("internal error type=" + (err && err.name) + " status=500");
        resp = errorResponse(500, "http_error", "请求无法处理。");
      }
    }
    return withCors(req, resp);
  }

  return { handle, hits, practiceHits, clearRetrievalCache: clearCache, constants: { GENERAL_RULES, CHECK_RULES, PRACTICE_RULES, REVIEW_RULES } };
}