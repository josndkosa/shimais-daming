const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9280;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const MEM_KEY = "shimais-daming:chatmem:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud42`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1400); };
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const sendMsg = (t) => evalJs(`(() => { const ta = document.querySelector('textarea.ct-text'); ta.value = ${JSON.stringify(t)}; document.querySelector('.ct-send').click(); return true; })()`);
const mem = () => evalJs(`JSON.parse(localStorage.getItem(${JSON.stringify(MEM_KEY)}) || '{}')`);
const ui = () => evalJs(`(() => ({
  msgs: document.querySelectorAll('.ct-flow .ct-msg').length,
  note: document.querySelector('.ct-memory-note').hidden ? null : document.querySelector('.ct-memory-note').textContent,
  tiers: [...document.querySelectorAll('.ct-tier')].map(t => t.textContent),
  deep: [...document.querySelectorAll('.ct-chip-deep')].map(c => c.textContent),
  forgetHidden: document.querySelector('.ct-forget-btn').hidden,
  qinliHref: document.querySelector('.ct-qinli-link').getAttribute('href'),
  qinliBadge: document.querySelector('.ct-qinli-badge').hidden ? null : document.querySelector('.ct-qinli-badge').textContent,
  endHidden: document.querySelector('.ct-end').hidden,
  inputHidden: document.querySelector('.ct-input').hidden
}))()`);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errors.push("EXC " + JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200));
  };
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(600);
  fs.writeFileSync(DIR + "/chat-requests.jsonl", "");

  // 1) two rounds with Zhu Yuanzhang
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  await evalJs(`localStorage.clear(); localStorage.removeItem(${JSON.stringify(MEM_KEY)})`);
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  await sendMsg("问过废相");
  await sleep(1100);
  await sendMsg("问过锦衣卫");
  await sleep(1100);
  let m = await mem();
  const zhu = m.zhuyuanzhang;
  check("two rounds stored: totalRounds 2, 2 topics, 4 messages", zhu && zhu.totalRounds === 2 && zhu.lastTopics.length === 2 && zhu.history.length === 4, JSON.stringify(zhu));
  check("topics truncated to 40 chars", zhu.lastTopics.every((t) => t.length <= 40), JSON.stringify(zhu.lastTopics));

  // 2) reload restores history + hint, new-round cap starts at 0
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  let u = await ui();
  check("reload restores 4 messages + memory hint", u.msgs === 4 && u.note && u.note.includes("问过废相") && u.note.includes("问过锦衣卫"), JSON.stringify([u.msgs, u.note]));
  check("restored history excluded from ten-round cap", u.endHidden === true && u.inputHidden === false, JSON.stringify([u.endHidden, u.inputHidden]));
  check("tier 初见 at 2 rounds", u.tiers[0] === "与他的交情：初见", JSON.stringify(u.tiers));
  check("qinli link points to q1380, badge hidden without progress", u.qinliHref === "qinli-play.html?story=q1380" && u.qinliBadge === null, JSON.stringify([u.qinliHref, u.qinliBadge]));
  await shot("chat-memory-restored");

  // 3) memory payload only after archive exists
  const reqs = fs.readFileSync(DIR + "/chat-requests.jsonl", "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  check("first request has no memory, later ones carry tier+topics", reqs[0] && !("memory" in reqs[0]) && reqs[1] && reqs[1].memory && reqs[1].memory.tier === "初见" && Array.isArray(reqs[1].memory.lastTopics), JSON.stringify(reqs.map((r) => r.memory)));

  // 4) tier 相熟 at 5 rounds -> deep questions
  await evalJs(`(() => { const raw = JSON.parse(localStorage.getItem(${JSON.stringify(MEM_KEY)}) || '{}'); raw.zhuyuanzhang = { history: raw.zhuyuanzhang.history, totalRounds: 5, lastTopics: raw.zhuyuanzhang.lastTopics, lastVisit: Date.now() }; localStorage.setItem(${JSON.stringify(MEM_KEY)}, JSON.stringify(raw)); })()`);
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  u = await ui();
  check("tier 相熟 at 5 rounds + two deep questions", u.tiers[0] === "与他的交情：相熟" && u.deep.length === 2 && u.deep.every((d) => d.includes("深聊")), JSON.stringify([u.tiers[0], u.deep]));
  await shot("chat-tier-familiar");

  // 5) profile 故人 section
  await nav("http://127.0.0.1:8001/profile.html");
  const pf = await evalJs(`(() => { const rows = [...document.querySelectorAll('.pf-old-row')].map(r => r.textContent); const sec = [...document.querySelectorAll('.pf-section')].some(s => s.querySelector('.pf-old-list')); return { rows, sec }; })()`);
  check("profile 故人 section lists the familiar figure", pf.sec && pf.rows.length === 1 && pf.rows[0] === "与朱元璋：相熟 · 共 5 轮", JSON.stringify(pf));
  await evalJs(`localStorage.removeItem(${JSON.stringify(MEM_KEY)})`);
  await nav("http://127.0.0.1:8001/profile.html");
  const pfNone = await evalJs(`!!document.querySelector('.pf-old-list')`);
  check("profile hides 故人 when no records", pfNone === false, pfNone);

  // 6) forget this person
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  await evalJs(`(() => { const raw = JSON.parse(localStorage.getItem(${JSON.stringify(MEM_KEY)}) || '{}'); raw.zhuyuanzhang = { history: [{ role: 'user', content: '旧问' }], totalRounds: 6, lastTopics: ['旧问'], lastVisit: Date.now() }; localStorage.setItem(${JSON.stringify(MEM_KEY)}, JSON.stringify(raw)); })()`);
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  await evalJs(`window.confirm = () => true; document.querySelector('.ct-forget-btn').click();`);
  await sleep(300);
  u = await ui();
  const mAfter = await mem();
  check("forget clears memory, history and tier", !mAfter.zhuyuanzhang && u.msgs === 0 && u.note === null && u.tiers[0] === "与他的交情：初见" && u.deep.length === 0, JSON.stringify([u.msgs, u.note, u.tiers[0], u.deep.length]));

  // 7) ten-round cap counts only new rounds
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  await evalJs(`(() => { const raw = JSON.parse(localStorage.getItem(${JSON.stringify(MEM_KEY)}) || '{}'); raw.zhuyuanzhang = { history: [{ role: 'user', content: '旧问一' }, { role: 'assistant', content: '旧答一' }], totalRounds: 9, lastTopics: ['旧问一'], lastVisit: Date.now() }; localStorage.setItem(${JSON.stringify(MEM_KEY)}, JSON.stringify(raw)); })()`);
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  for (let i = 0; i < 10; i++) { await sendMsg("新问" + i); await sleep(750); }
  u = await ui();
  check("ten new rounds end the session (restored rounds excluded)", u.endHidden === false, JSON.stringify([u.endHidden, u.msgs]));

  // 8) qinli badge when the story was played
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}'); p.qinli = { done: ['q1380'], current: null }; localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify(p)); })()`);
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  u = await ui();
  check("qinli badge appears once the story was played", u.qinliBadge === "你已亲历过他的时刻", JSON.stringify(u.qinliBadge));

  // 9) mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:8001/chat.html?figure=zhuyuanzhang");
  const mob = await evalJs(`document.documentElement.scrollWidth`);
  check("mobile: no overflow", mob <= 390, mob);
  await shot("chat-memory-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill(); stub.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(2); });