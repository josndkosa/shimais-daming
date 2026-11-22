const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9254;
const KEY = "shimais-daming:progress:v1";
const API = "shimais-daming-api.onrender.com";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud16`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1300); };
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };

let mode = "fail";           // fail | hold | fulfill
let fulfillBody = null;
const held = [];
const apiCalls = [];

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = async (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); return; }
    if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200));
    if (d.method === "Fetch.requestPaused") {
      const { requestId, request } = d.params;
      apiCalls.push({ url: request.url, method: request.method, postData: request.postData || null });
      if (mode === "fail") await send("Fetch.failRequest", { requestId, errorReason: "Failed" });
      else if (mode === "hold") held.push(requestId);
      else if (request.method === "OPTIONS") await send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }, { name: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" }, { name: "Access-Control-Allow-Headers", value: "Content-Type" }], body: "" });
      else await send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: Buffer.from(JSON.stringify(fulfillBody)).toString("base64") });
    }
  };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__calls = []; const of = window.fetch; window.fetch = function (u, o) { try { window.__calls.push({ url: String(u), method: (o && o.method) || "GET", body: o && o.body ? String(o.body) : null }); } catch (e) {} return of.apply(this, arguments); };` });
  await send("Fetch.enable", { patterns: [{ urlPattern: "*" + API + "*" }] });

  const OLD_SAVE = { timeline: { read: ["e1368", "e1380"] }, decisions: { done: ["d1380"], picks: { d1380: "B" } }, quiz: { picks: [1,1,2,1,0,1,2,0,2,1], score: 10, dims: { timeline: { hit: 4, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 3, total: 3 } } } };
  await nav("http://127.0.0.1:4173/index.html");
  await evalJs(`localStorage.setItem('${KEY}', JSON.stringify(${JSON.stringify(OLD_SAVE)}))`);
  const nums = await evalJs(`[...document.querySelectorAll('.entry-index')].map(x => x.textContent)`);
  check("homepage catalog numbered 01-06", JSON.stringify(nums) === JSON.stringify(["01","02","03","04","05","06"]), JSON.stringify(nums));

  await nav("http://127.0.0.1:4173/chat.html");
  const init = await evalJs(`(() => ({
    figures: [...document.querySelectorAll('.ct-figure')].map(b => [b.querySelector('.ct-figure-name').textContent, b.querySelector('.ct-figure-era').textContent, b.querySelector('img').getAttribute('src')]),
    chips: [...document.querySelectorAll('.ct-chip')].map(c => c.textContent),
    disclaimer: document.querySelector('.ct-disclaimer').textContent,
    discFixed: getComputedStyle(document.querySelector('.ct-disclaimer')).position,
    inputVisible: !document.querySelector('.ct-input').hidden,
    healthCalled: true,
  }))()`);
  check("picker 6 figures with era + portraits, chongzhen palace img", init.figures.length === 6 && init.figures[0][0] === "朱元璋" && init.figures[0][1].includes("洪武三十年") && init.figures[5][2].includes("05-palace-snow-night"), JSON.stringify(init.figures));
  check("3 preset chips + fixed disclaimer + input visible", init.chips.length === 3 && init.disclaimer === "对话由 AI 依据人物史料卡生成，重要史实请以史料原文为准。" && init.discFixed === "fixed" && init.inputVisible, JSON.stringify(init.chips));
  check("health prewarm fired", apiCalls.some(c => c.url.endsWith("/api/health")), JSON.stringify(apiCalls.map(c => c.url)));

  // 剧本模式：六人 × 3 预置问
  mode = "fail";
  const figIds = ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"];
  let scriptOk = true; const scriptDetail = [];
  for (let fi = 0; fi < 6; fi++) {
    await evalJs(`document.querySelectorAll('.ct-figure')[${fi}].click()`);
    await sleep(200);
    for (let qi = 0; qi < 3; qi++) {
      const expect = await evalJs(`SITE_DATA.chatFigures[${fi}].qas[${qi}].a`);
      await evalJs(`document.querySelectorAll('.ct-chip')[${qi}].click()`);
      await sleep(350);
      const got = await evalJs(`(() => { const msgs = [...document.querySelectorAll('.ct-flow .ct-msg.ct-figure')]; const last = msgs[msgs.length - 1]; return { text: last.querySelector('.ct-text').textContent, note: !!last.querySelector('.ct-note'), offline: !document.querySelector('.ct-offline').hidden }; })()`);
      if (got.text !== expect || got.note || !got.offline) { scriptOk = false; scriptDetail.push([fi, qi, got]); }
    }
  }
  check("offline script answers all 18 preset questions, banner on, no note", scriptOk, JSON.stringify(scriptDetail.slice(0, 2)));
  const save1 = await evalJs(`JSON.parse(localStorage.getItem('${KEY}'))`);
  check("chat.started saved, old progress intact", save1.chat && save1.chat.started === true && JSON.stringify(save1.timeline) === JSON.stringify(OLD_SAVE.timeline) && JSON.stringify(save1.decisions) === JSON.stringify(OLD_SAVE.decisions) && JSON.stringify(save1.quiz) === JSON.stringify(OLD_SAVE.quiz), JSON.stringify(save1.chat));

  // 关键词命中与通用兜底
  await evalJs(`document.querySelectorAll('.ct-figure')[0].click()`); await sleep(200);
  await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = '丞相是怎么回事'; document.querySelector('.ct-send').click(); })()`);
  await sleep(350);
  const kw = await evalJs(`(() => { const m = [...document.querySelectorAll('.ct-flow .ct-msg.ct-figure')]; return m[m.length-1].querySelector('.ct-text').textContent; })()`);
  const kwExpect = await evalJs(`SITE_DATA.chatFigures[0].qas[0].a`);
  await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = '今日天气如何'; document.querySelector('.ct-send').click(); })()`);
  await sleep(350);
  const fb = await evalJs(`(() => { const m = [...document.querySelectorAll('.ct-flow .ct-msg.ct-figure')]; return m[m.length-1].querySelector('.ct-text').textContent; })()`);
  const fbExpect = await evalJs(`SITE_DATA.chatFigures[0].fallback`);
  check("keyword match + generic fallback in script mode", kw === kwExpect && fb === fbExpect, JSON.stringify([kw.slice(0, 20), fb.slice(0, 20)]));

  // Enter 发送 / Shift+Enter 不发送
  const before = await evalJs(`document.querySelectorAll('.ct-flow .ct-msg.ct-user').length`);
  await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = 'Enter 探针'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); })()`);
  await sleep(350);
  const afterEnter = await evalJs(`document.querySelectorAll('.ct-flow .ct-msg.ct-user').length`);
  await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = 'shift 探针'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })); })()`);
  await sleep(300);
  const afterShift = await evalJs(`document.querySelectorAll('.ct-flow .ct-msg.ct-user').length`);
  check("Enter sends, Shift+Enter does not", afterEnter === before + 1 && afterShift === afterEnter, [before, afterEnter, afterShift].join(","));

  // 十轮上限 + history ≤20 + figure id + 结束区按钮
  await evalJs(`document.querySelectorAll('.ct-figure')[1].click()`); await sleep(200);
  for (let i = 0; i < 10; i++) {
    await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = '第${i}问'; document.querySelector('.ct-send').click(); })()`);
    await sleep(250);
  }
  const end = await evalJs(`(() => ({ inputHidden: document.querySelector('.ct-input').hidden, endVisible: !document.querySelector('.ct-end').hidden, endText: document.querySelector('.ct-end-text').textContent }))()`);
  const lastBody = await evalJs(`(() => { const c = window.__calls.filter(x => x.url.endsWith('/api/chat')).pop(); return c ? JSON.parse(c.body) : null; })()`);
  check("10 rounds -> end panel; history 18 entries; figure id correct", end.inputHidden && end.endVisible && end.endText === "与他的十回合已聊完" && lastBody.history.length === 18 && lastBody.figure === "zhudi", JSON.stringify([end, lastBody.history.length, lastBody.figure]));
  const chipsBlocked = await evalJs(`(() => { const n = document.querySelectorAll('.ct-flow .ct-msg.ct-user').length; document.querySelectorAll('.ct-chip')[0].click(); return n; })()`);
  await sleep(300);
  const chipsAfter = await evalJs(`document.querySelectorAll('.ct-flow .ct-msg.ct-user').length`);
  check("11th round blocked even via chip", chipsAfter === chipsBlocked, [chipsBlocked, chipsAfter].join(","));
  await evalJs(`document.querySelector('.ct-end-btn.cta-gold').click()`); await sleep(300);
  const restarted = await evalJs(`(() => ({ msgs: document.querySelectorAll('.ct-flow .ct-msg').length, input: !document.querySelector('.ct-input').hidden }))()`);
  check("重开一轮 clears flow and restores input", restarted.msgs === 0 && restarted.input, JSON.stringify(restarted));
  await evalJs(`document.querySelectorAll('.ct-chip')[0].click()`); await sleep(300);
  await evalJs(`document.querySelectorAll('.ct-figure')[1].click()`); await sleep(200);
  for (let i = 0; i < 10; i++) { await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = '再${i}问'; document.querySelector('.ct-send').click(); })()`); await sleep(200); }
  await evalJs(`document.querySelector('.ct-end-btn:not(.cta-gold)').click()`); await sleep(600);
  const switched = await evalJs(`(() => { const r = document.querySelector('.ct-picker').getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; })()`);
  check("换一位人物 scrolls picker into view", switched, String(switched));

  // 思索中 + 10s 冷启动提示（hold 后 fail）
  mode = "hold";
  await evalJs(`document.querySelectorAll('.ct-figure')[2].click()`); await sleep(200);
  await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = '冷启动探针'; document.querySelector('.ct-send').click(); })()`);
  await sleep(600);
  const thinking = await evalJs(`(() => { const p = document.querySelector('.ct-pending'); return p ? p.querySelector('.ct-text').textContent : null; })()`);
  await sleep(10200);
  const cold = await evalJs(`(() => { const p = document.querySelector('.ct-pending'); return p && !p.querySelector('.ct-cold').hidden ? p.querySelector('.ct-cold').textContent : null; })()`);
  check("thinking bubble + 10s cold-start hint", thinking === "对方正在思索……" && cold === "服务冷启动中，首答可能需要等一会儿", JSON.stringify([thinking, cold]));
  mode = "fail";
  for (const rid of held.splice(0)) await send("Fetch.failRequest", { requestId: rid, errorReason: "Failed" });
  await sleep(500);
  const afterFail = await evalJs(`(() => ({ pending: !!document.querySelector('.ct-pending'), last: [...document.querySelectorAll('.ct-flow .ct-msg.ct-figure')].pop().querySelector('.ct-text').textContent }))()`);
  const yqExpect = await evalJs(`SITE_DATA.chatFigures[2].fallback`);
  check("held request failure falls back to script, pending removed", !afterFail.pending && afterFail.last === yqExpect, JSON.stringify(afterFail).slice(0, 120));

  // mock 200：reply + note 展示 / note null 不展示
  mode = "fulfill";
  fulfillBody = { reply: "朕答你：此事依史料而行。", note: "史官注：此处为校验示例。" };
  await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = 'mock 探针一'; document.querySelector('.ct-send').click(); })()`);
  await sleep(500);
  const mock1 = await evalJs(`(() => { const m = [...document.querySelectorAll('.ct-flow .ct-msg.ct-figure')].pop(); return { text: m.querySelector('.ct-text').textContent, note: m.querySelector('.ct-note') ? m.querySelector('.ct-note').textContent : null, offline: !document.querySelector('.ct-offline').hidden }; })()`);
  fulfillBody = { reply: "朕再答你。", note: null };
  await evalJs(`(() => { const t = document.querySelector('textarea.ct-text'); t.value = 'mock 探针二'; document.querySelector('.ct-send').click(); })()`);
  await sleep(500);
  const mock2 = await evalJs(`(() => { const m = [...document.querySelectorAll('.ct-flow .ct-msg.ct-figure')].pop(); return { text: m.querySelector('.ct-text').textContent, note: !!m.querySelector('.ct-note') }; })()`);
  check("mock 200 renders reply + note line; null note hidden", mock1.text === "朕答你：此事依史料而行。" && mock1.note === "史官注：此处为校验示例。" && mock2.text === "朕再答你。" && !mock2.note, JSON.stringify([mock1, mock2]));
  await shot("chat-desktop");

  // 移动端
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/chat.html");
  await sleep(400);
  const mob = await evalJs(`(() => { const inp = document.querySelector('.ct-input').getBoundingClientRect(); const disc = document.querySelector('.ct-disclaimer').getBoundingClientRect(); const pick = document.querySelector('.ct-picker'); return { ov: document.documentElement.scrollWidth - window.innerWidth, inpBottom: inp.bottom, discTop: disc.top, winH: window.innerHeight, pickScroll: pick.scrollWidth > pick.clientWidth, sticky: getComputedStyle(document.querySelector('.ct-input')).position }; })()`);
  check("mobile: no h-overflow, input sticky above fixed disclaimer, picker scrolls", mob.ov <= 0 && mob.sticky === "sticky" && Math.abs(mob.inpBottom - mob.discTop) <= 2 && Math.abs(mob.discTop + 30 - mob.winH) <= 2 && mob.pickScroll, JSON.stringify(mob));
  await shot("chat-mobile");

  check("zero runtime/console errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });