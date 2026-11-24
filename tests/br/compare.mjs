// BR-2 对拍：backend/test_api.py 非真实 LLM 用例对函数版（api.js）复跑＋BM25 排序跨语言比对。
// 运行：node tests/br/compare.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createApi } from "../../frontend/function/api.js";
import { retrieve, clearCache, corpus, queryTokens } from "../../frontend/function/bm25.js";
import { canonicalMaterials } from "../../frontend/function/materials.js";
import { GENERAL_RULES, CHECK_RULES, PRACTICE_RULES, REVIEW_RULES, FIGURES } from "../../frontend/function/consts.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const BODY_LIMIT = 128 * 1024;

let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  clearCache();
  try {
    await fn();
    passed += 1;
    console.log("PASS " + name);
  } catch (err) {
    failed += 1;
    failures.push(name);
    console.log("FAIL " + name + " :: " + (err && err.message));
  }
}

function contentResponse(content) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}
function questions() {
  const dims = ["timeline", "timeline", "timeline", "timeline", "person", "person", "person", "institution", "institution", "institution"];
  return { questions: dims.map((dim, i) => ({
    dim, stem: `第${i + 1}题：海瑞买棺上疏的年份？`,
    options: ["1566", "1565", "1567", "1568"], answer: 0,
    explain: "1566年买棺上疏，反映谏诤的代价。", sourceId: "hairui/c4",
    source: "《不存在的史料·卷999》",
  })) };
}
function review(correct = null, supported = true) {
  return Array.from({ length: 10 }, () => ({ correctOptions: correct === null ? [0] : correct, explanationSupported: supported }));
}

function makeApi(opts = {}) {
  const state = { calls: [], responses: [], queries: [], clock: { t: 100 } };
  const upstream = async (url, init) => {
    const payload = JSON.parse(init.body);
    state.calls.push(payload);
    if (state.responses.length) {
      const r = state.responses.shift();
      if (r instanceof Error) throw r;
      if (r && r.__hang) {
        return new Promise((res, rej) => {
          init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
        });
      }
      return r;
    }
    const rules = payload.messages[0].content;
    if (rules === PRACTICE_RULES) return contentResponse(JSON.stringify(questions()));
    if (rules === CHECK_RULES) return contentResponse("");
    if (payload.temperature === 0) return contentResponse(JSON.stringify(review()));
    return contentResponse("此事可据材料讨论。");
  };
  const api = createApi({
    fetch: upstream,
    getKey: () => "offline-test-only",
    now: () => state.clock.t,
    clientIp: (req, info) => (info && info.ip) || "127.0.0.1",
    upstreamTimeoutMs: opts.upstreamTimeoutMs,
    provider: opts.provider,
    retrieve: (f, q, p) => {
      state.queries.push(q);
      return retrieve(f, q, p);
    },
  });
  const send = (path, { method = "POST", payload, raw, headers = {}, ip = "127.0.0.1", stream } = {}) => {
    const h = { "content-type": "application/json", ...headers };
    let body;
    if (stream) body = stream;
    else if (raw !== undefined) body = raw;
    else if (payload !== undefined) body = JSON.stringify(payload);
    const req = new Request("http://test" + path, { method, body, headers: h, ...(stream ? { duplex: "half" } : {}) });
    return api.handle(req, { ip });
  };
  const chat = (updates = {}, extra = {}) =>
    send("/api/chat", { payload: { figure: "hairui", message: "海瑞买棺上疏", history: [], ...updates }, ...extra });
  return { api, state, send, chat };
}

async function assertError(resp, status, code) {
  const text = await resp.text();
  resp.__text = text;
  assert.equal(resp.status, status, text);
  const body = JSON.parse(text);
  assert.equal(body.code, code);
  assert.equal(typeof body.detail, "string");
  assert.ok(body.detail);
  return body;
}

/* ---------- health / CORS / 路由 ---------- */

await test("health 六人顺序与 CORS 默认本地", async () => {
  const { send } = makeApi();
  const resp = await send("/api/health", { method: "GET" });
  assert.equal(resp.status, 200);
  assert.deepEqual(await resp.json(), { status: "ok", figures: FIGURES });
  for (const origin of ["http://localhost:5500", "http://127.0.0.1:5500", "http://localhost:5501", "http://127.0.0.1:5501"]) {
    const r = await send("/api/health", { method: "GET", headers: { origin } });
    assert.equal(r.headers.get("access-control-allow-origin"), origin);
  }
  const r = await send("/api/health", { method: "GET", headers: { origin: "https://untrusted.example" } });
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});

await test("未知人物与未知路由结构化 404", async () => {
  const { state, send, chat } = makeApi();
  await assertError(await chat({ figure: "no-such-person" }), 404, "not_found");
  await assertError(await send("/missing", { method: "GET" }), 404, "not_found");
  await assertError(await send("/?action=netinfo", { method: "GET" }), 404, "not_found");
  assert.equal(state.calls.length, 0);
});

await test("BT-1 函数入口不再暴露 netinfo 诊断路由", () => {
  const entry = readFileSync(resolve(root, "frontend/function/index.ts"), "utf8");
  assert.doesNotMatch(entry, /action.{0,20}netinfo|netinfo/);
});

/* ---------- chat 入参校验 ---------- */

await test("T10 历史分角色字数边界", async () => {
  for (const [role, limit] of [["user", 500], ["assistant", 2000]]) {
    for (const char of ["史", "a"]) {
      const { state, chat } = makeApi();
      assert.equal((await chat({ history: [{ role, content: char.repeat(limit) }] })).status, 200);
      const calls = state.calls.length;
      await assertError(await chat({ history: [{ role, content: char.repeat(limit + 1) }] }), 400, "invalid_input");
      assert.equal(state.calls.length, calls);
    }
  }
});

await test("T11 历史条目上限 19/20", async () => {
  const { state, chat } = makeApi();
  const history = Array.from({ length: 19 }, () => ({ role: "user", content: "问" }));
  assert.equal((await chat({ history })).status, 200);
  const calls = state.calls.length;
  await assertError(await chat({ history: [...history, history[0]] }), 400, "invalid_input");
  assert.equal(state.calls.length, calls);
});

await test("T12 新问题字数边界不触发模型", async () => {
  const { state, chat } = makeApi();
  for (const text of ["", " \n\t", "中".repeat(501), "a".repeat(501)]) {
    await assertError(await chat({ message: text }), 400, "invalid_input");
  }
  assert.equal(state.calls.length, 0);
  assert.equal((await chat({ message: "中".repeat(500) })).status, 200);
});

await test("T13 累计字数含新问题", async () => {
  for (const char of ["中", "a"]) {
    const { state, chat } = makeApi();
    const history = Array.from({ length: 10 }, () => ({ role: "assistant", content: char.repeat(1950) }));
    assert.equal((await chat({ message: char.repeat(500), history })).status, 200);
    const calls = state.calls.length;
    history[9].content += char;
    await assertError(await chat({ message: char.repeat(500), history }), 400, "invalid_input");
    assert.equal(state.calls.length, calls);
  }
});

await test("T13 真实 body 字节上限与 JSON 转义", async () => {
  for (const [char, escaped] of [["a", false], ["中", false], ["中", true]]) {
    let raw = JSON.stringify({ figure: "hairui", message: char.repeat(500) });
    if (escaped) raw = raw.replaceAll("中", "\\u4e2d");
    const exact = raw + " ".repeat(BODY_LIMIT - new TextEncoder().encode(raw).length);
    for (const length of [BODY_LIMIT - 1, BODY_LIMIT, BODY_LIMIT + 1]) {
      const { state, send } = makeApi();
      const data = length <= BODY_LIMIT ? exact.slice(0, length) : exact + " ";
      const calls = state.calls.length;
      const result = await send("/api/chat", { raw: data });
      if (length <= BODY_LIMIT) assert.equal(result.status, 200, await result.clone().text());
      else {
        await assertError(result, 413, "request_too_large");
        assert.equal(state.calls.length, calls);
      }
    }
  }
});

await test("T13 分块 body 无视伪造 Content-Length", async () => {
  for (const declared of [null, "1"]) {
    const { state, send } = makeApi();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        controller.enqueue(new TextEncoder().encode("x".repeat(BODY_LIMIT - 1)));
        controller.enqueue(new TextEncoder().encode("x"));
        controller.close();
      },
    });
    const headers = { origin: "http://localhost:5500" };
    if (declared) headers["content-length"] = declared;
    const result = await send("/api/chat", { stream, headers });
    await assertError(result, 413, "request_too_large");
    assert.equal(result.headers.get("access-control-allow-origin"), "http://localhost:5500");
    assert.equal(state.calls.length, 0);
  }
});

await test("T13 超大历史先 413 再校验", async () => {
  const { state, chat } = makeApi();
  const history = Array.from({ length: 19 }, () => ({ role: "assistant", content: "x".repeat(100000) }));
  await assertError(await chat({ history }), 413, "request_too_large");
  assert.equal(state.calls.length, 0);
});

await test("422 结构化且不回显正文", async () => {
  const secret = "PRIVATE-BODY-DO-NOT-ECHO";
  const { state, send, chat } = makeApi();
  for (const updates of [{ message: { secret } }, { history: [{ role: secret, content: secret }] }, { history: null }, { figure: [] }]) {
    const result = await chat(updates);
    const echoText = await result.clone().text();
    await assertError(result, 422, "validation_error");
    assert.ok(!echoText.includes(secret));
  }
  const result = await send("/api/chat", { raw: '{"message":"' + secret });
  const echoText2 = await result.clone().text();
  await assertError(result, 422, "validation_error");
  assert.ok(!echoText2.includes(secret));
  assert.equal(state.calls.length, 0);
});

/* ---------- 上游错误口径 ---------- */

await test("T14 坏上游封装不重试", async () => {
  const bad = [null, 123, [], {}, "", "  "].map((v) => contentResponse(v));
  for (const v of [{}, [], { choices: [] }, { choices: [null] }, { choices: [{ message: {} }] }]) {
    bad.push(new Response(JSON.stringify(v), { status: 200 }));
  }
  bad.push(new Response("not json", { status: 200 }), new Response("private upstream detail", { status: 503 }));
  for (const route of ["/api/chat", "/api/quiz/practice"]) {
    for (const response of bad) {
      const { state, send, chat } = makeApi();
      state.responses.push(response);
      const count = state.calls.length;
      const result = route === "/api/chat" ? await chat() : await send(route);
      await assertError(result, 502, "upstream_error");
      assert.equal(state.calls.length, count + 1);
      assert.ok(!result.__text.includes("private upstream detail"));
    }
  }
});

await test("超时/网络错误口径（含审题阶段）", async () => {
  for (const route of ["/api/chat", "/api/quiz/practice"]) {
    for (const [kind, status, code] of [["timeout", 504, "upstream_timeout"], ["connect", 502, "upstream_error"]]) {
      for (const duringReview of [false, true]) {
        const { state, send, chat } = makeApi({ upstreamTimeoutMs: 20 });
        if (duringReview) {
          state.responses.push(contentResponse(route === "/api/chat" ? "回复" : JSON.stringify(questions())));
        }
        state.responses.push(kind === "timeout" ? { __hang: true } : new TypeError("fetch failed"));
        const count = state.calls.length;
        const result = route === "/api/chat" ? await chat() : await send(route);
        await assertError(result, status, code);
        assert.equal(state.calls.length, count + 1 + (duringReview ? 1 : 0));
        assert.ok(!result.__text.includes("private"));
      }
    }
  }
});

/* ---------- memory / 提示词 ---------- */

await test("memory 档位与话题注入系统提示", async () => {
  const { state, chat } = makeApi();
  assert.equal((await chat({ memory: { tier: "相熟", lastTopics: ["问过废相", "问过锦衣卫"] } })).status, 200);
  const system = state.calls[0].messages[0].content;
  assert.ok(system.includes("此人此前曾与你交谈，谈及：问过废相、问过锦衣卫。"));
  assert.ok(system.includes("此人现与你的交情是「相熟」"));
  assert.ok(system.includes("史官校验规则不变。"));
});

await test("memory 话题截断 50 字、上限 3 条", async () => {
  const { state, chat } = makeApi();
  const long = "问".repeat(120);
  assert.equal((await chat({ memory: { tier: "深谈", lastTopics: [long, "第二问", "第三问", "第四问"] } })).status, 200);
  const system = state.calls[0].messages[0].content;
  assert.ok(system.includes("问".repeat(50)));
  assert.ok(!system.includes("问".repeat(51)));
  assert.ok(!system.includes("第四问"));
});

await test("非法 tier 忽略；无 memory 提示词不变", async () => {
  const a = makeApi();
  assert.equal((await a.chat({ memory: { tier: "挚友", lastTopics: ["问过废相"] } })).status, 200);
  assert.ok(!a.state.calls[0].messages[0].content.includes("此人此前曾与你交谈"));
  const b = makeApi();
  assert.equal((await b.chat()).status, 200);
  const system = b.state.calls[0].messages[0].content;
  assert.ok(!system.includes("此人此前曾与你交谈"));
  assert.ok(system.endsWith(GENERAL_RULES));
});

await test("空校验回复合法 note=null 且两次调用", async () => {
  const { state, chat } = makeApi();
  const result = await chat();
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { reply: "此事可据材料讨论。", note: null });
  assert.equal(state.calls.length, 2);
});

await test("追问检索只带最近用户问题", async () => {
  const { state, chat } = makeApi();
  const history = [
    { role: "user", content: "清丈均赋" }, { role: "assistant", content: "旧回答" },
    { role: "user", content: "海瑞买棺上疏入狱" }, { role: "assistant", content: "最新回答" },
  ];
  assert.equal((await chat({ message: "后来呢？", history })).status, 200);
  let query = state.queries.at(-1);
  assert.ok(query.includes("海瑞买棺上疏入狱"));
  assert.ok(query.includes("后来呢"));
  assert.ok(!query.includes("清丈均赋"));
  assert.ok(!query.includes("最新回答"));
  assert.equal((await chat({ message: "清丈土地", history })).status, 200);
  assert.equal(state.queries.at(-1), "清丈土地");
});

/* ---------- 史料不可用 ---------- */

await test("史料缺失/损坏不调模型 503", async () => {
  for (const mode of ["throw", "{}", '{"chunks":[]}', '{"chunks":[{"id":"c1"}]}', '{"chunks":[null]}']) {
    for (const route of ["/api/chat", "/api/quiz/practice"]) {
      clearCache();
      const provider = (name) => {
        if (name === "personas.json") {
          return readFileSync(resolve(root, "backend/data/personas.json"), "utf-8");
        }
        if (mode === "throw") throw new Error("private/path");
        return mode;
      };
      const { state, send, chat } = makeApi({ provider });
      const result = route === "/api/chat" ? await chat() : await send(route);
      await assertError(result, 503, "materials_unavailable");
      assert.ok(!result.__text.includes("private/path"));
      assert.equal(state.calls.length, 0);
    }
  }
});

/* ---------- practice ---------- */

await test("T15 非法题目结构两次生成后 503", async () => {
  const mutations = [{ dim: [] }, { dim: "other" }, { stem: [] }, { stem: " " },
    { options: [[], "B", "C", "D"] }, { options: ["A", " A ", "C", "D"] },
    { options: ["A", "B", "C"] }, { options: ["A", null, "C", "D"] },
    { answer: true }, { answer: 4 }, { answer: "0" }, { explain: 5 },
    { explain: " " }, { sourceId: [] }, { sourceId: "unknown/c1" }];
  const payloads = [];
  for (const mutation of mutations) {
    const payload = questions();
    Object.assign(payload.questions[0], mutation);
    payloads.push(payload);
  }
  const duplicate = questions();
  duplicate.questions[1].stem = " " + duplicate.questions[0].stem + " ";
  payloads.push(duplicate, [], { questions: questions().questions.slice(0, 9) }, { questions: Array(10).fill(null) });
  for (const payload of payloads) {
    const { state, send } = makeApi();
    state.responses.push(contentResponse(JSON.stringify(payload)), contentResponse(JSON.stringify(payload)));
    const count = state.calls.length;
    await assertError(await send("/api/quiz/practice"), 503, "generation_failed");
    assert.equal(state.calls.length, count + 2);
  }
});

await test("T16 坏 JSON 重试一次后恢复", async () => {
  const { state, send } = makeApi();
  state.responses.push(contentResponse("not JSON"));
  const result = await send("/api/quiz/practice");
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal(state.calls.length, 3);
  assert.equal((await result.json()).questions.length, 10);
});

await test("T23 source 以 canonical 为准且审题拿证据", async () => {
  const { state, send } = makeApi();
  const result = await send("/api/quiz/practice");
  assert.equal(result.status, 200);
  const chunk = corpus("hairui")[0][3];
  const body = await result.json();
  for (const q of body.questions) {
    assert.equal(q.sourceId, "hairui/c4");
    assert.equal(q.source, chunk.source);
  }
  const reviewPrompt = state.calls[1].messages[1].content;
  const items = JSON.parse(reviewPrompt);
  assert.equal(items.length, 10);
  for (const item of items) {
    assert.equal(item.material.id, "hairui/c4");
    assert.equal(item.material.text, chunk.text);
    assert.equal(item.material.source, chunk.source);
    assert.equal(item.explain, questions().questions[0].explain);
  }
  assert.ok(!reviewPrompt.includes("不存在的史料"));
});

await test("T23 歧义/不支持/坏审题一律拒绝", async () => {
  const verdicts = [review([0, 1]), review([]), review([1]), review(null, false),
    review([true]), "RAW00", review(null, 1), review(null, "true"),
    review().slice(0, 9), Array(10).fill(0), {}, Array(10).fill(null)];
  for (const verdict of verdicts) {
    const { state, send } = makeApi();
    for (let i = 0; i < 2; i++) {
      state.responses.push(contentResponse(JSON.stringify(questions())), contentResponse(verdict === "RAW00" ? JSON.stringify(review()).replaceAll('"correctOptions":[0]', '"correctOptions":[0.0]') : JSON.stringify(verdict)));
    }
    await assertError(await send("/api/quiz/practice"), 503, "generation_failed");
  }
});

await test("T22 六次尝试计成功与失败、到期恢复、聊天独立", async () => {
  for (const success of [true, false]) {
    const { state, send, chat } = makeApi();
    state.clock.t = 100;
    for (let i = 0; i < 6; i++) {
      if (!success) state.responses.push(contentResponse("bad JSON"), contentResponse("bad JSON"));
      const result = await send("/api/quiz/practice");
      assert.equal(result.status, success ? 200 : 503, await result.clone().text());
    }
    const count = state.calls.length;
    const body = await assertError(await send("/api/quiz/practice"), 429, "rate_limited");
    assert.equal(body.retry_after, 3600);
    assert.equal(state.calls.length, count);
    assert.equal((await chat()).status, 200);
    state.clock.t = 3700;
    assert.equal((await send("/api/quiz/practice")).status, 200);
  }
});

await test("失败尝试不退款（取消语义以网络失败等价）", async () => {
  const { state, send } = makeApi();
  for (let i = 0; i < 6; i++) {
    state.responses.push(new TypeError("fetch failed"));
    await assertError(await send("/api/quiz/practice"), 502, "upstream_error");
  }
  const count = state.calls.length;
  await assertError(await send("/api/quiz/practice"), 429, "rate_limited");
  assert.equal(state.calls.length, count);
});

await test("T28 转发头不改变限流身份（连接地址为准）", async () => {
  const { api, state, send } = makeApi();
  for (let i = 0; i < 6; i++) {
    state.responses.push(new Response("", { status: 503 }));
    await assertError(await send("/api/quiz/practice", { headers: { "x-forwarded-for": `198.51.100.${i}` } }), 502, "upstream_error");
  }
  await assertError(await send("/api/quiz/practice", { headers: { "x-forwarded-for": "203.0.113.1" } }), 429, "rate_limited");
  assert.deepEqual([...api.practiceHits.keys()], ["127.0.0.1"]);
});

await test("chat 限流 30 次与 retry_after 头", async () => {
  const { send, chat } = makeApi();
  for (let i = 0; i < 30; i++) assert.equal((await chat()).status, 200);
  const result = await chat();
  const body = await assertError(result, 429, "rate_limited");
  assert.ok(body.retry_after > 0);
  assert.equal(parseInt(result.headers.get("retry-after"), 10), body.retry_after);
});

/* ---------- 检索与导出 ---------- */

await test("检索：直接事实/口语同义/零相关", async () => {
  assert.equal(retrieve("hairui", "买棺上疏")[0].id, "c4");
  assert.equal(retrieve("zhangjuzheng", "一条鞭法")[0].id, "c4");
  assert.ok(retrieve("hairui", "骂皇帝").map((c) => c.id).includes("c4"));
  for (const query of ["", "Python Kubernetes API", "咖啡披萨薯条"]) {
    assert.deepEqual(retrieve("hairui", query), []);
  }
});

await test("canonical 导出与 frontend/materials.json 一致", async () => {
  const actual = JSON.parse(readFileSync(resolve(root, "frontend/materials.json"), "utf-8"));
  assert.deepEqual(canonicalMaterials(), actual);
});

await test("BM25 跨语言对拍（172 查询 × 6 人物，顺序一致、分数 1e-9）", async () => {
  const baseline = JSON.parse(readFileSync(resolve(here, "bm25-baseline.json"), "utf-8"));
  let maxDelta = 0, checked = 0;
  for (const figure of FIGURES) {
    clearCache();
    const [, bm25] = corpus(figure);
    for (const q of baseline.queries) {
      const expected = baseline.figures[figure][q];
      const scores = bm25.getScores(queryTokens(q));
      const top = retrieve(figure, q).map((c) => c.id);
      assert.deepEqual(top, expected.top, `order mismatch ${figure} / ${q}`);
      for (let i = 0; i < scores.length; i++) {
        const delta = Math.abs(scores[i] - expected.scores[i]);
        maxDelta = Math.max(maxDelta, delta);
        assert.ok(delta <= 1e-9 * Math.max(1, Math.abs(expected.scores[i])), `score mismatch ${figure} / ${q} / ${i}`);
      }
      checked += 1;
    }
  }
  console.log(`  bm25 cross-check: ${checked} cases, max score delta ${maxDelta}`);
});

/* ---------- 网关路由与限流身份（BS 实测口径） ---------- */

await test("网关上游名不固定：任意首段前缀均剥离到 /api/*", async () => {
  const { api } = makeApi();
  for (const prefix of ["/app", "/upstream-xyz", "/functions/v1/app"]) {
    const resp = await api.handle(new Request("http://test" + prefix + "/api/health", { method: "GET" }), { ip: "127.0.0.1" });
    assert.equal(resp.status, 200, prefix);
    assert.deepEqual(await resp.json(), { status: "ok", figures: FIGURES });
  }
  const bare = await api.handle(new Request("http://test/api/health", { method: "GET" }), { ip: "127.0.0.1" });
  assert.equal(bare.status, 200);
  const root = await api.handle(new Request("http://test/app", { method: "GET" }), { ip: "127.0.0.1" });
  assert.equal(root.status, 404);
});

await test("gatewayClientIp：伪造 XFF 不夺身份，取最右非内网跳", async () => {
  const { gatewayClientIp } = await import("../../frontend/function/api.js");
  const mk = (xff, remote) => gatewayClientIp(
    new Request("http://test/", { headers: xff ? { "x-forwarded-for": xff } : {} }),
    { remoteAddr: { hostname: remote } }
  );
  assert.equal(mk("1.2.3.4, 211.173.78.184,10.200.8.245,10.200.8.240, 100.127.105.48", "0.0.0.0"), "211.173.78.184");
  assert.equal(mk("211.173.78.184,10.200.9.44,10.200.8.239, 100.127.106.67", "0.0.0.0"), "211.173.78.184");
  assert.equal(mk("10.0.0.1, 192.168.1.1, 100.64.0.9", "0.0.0.0"), "unknown");
  assert.equal(mk(null, "203.0.113.7"), "203.0.113.7");
  assert.equal(mk(null, "0.0.0.0"), "unknown");
});

console.log(`\n== BR compare ${passed}/${passed + failed} ==`);
if (failed) {
  console.log("failures: " + failures.join(", "));
  process.exit(1);
}