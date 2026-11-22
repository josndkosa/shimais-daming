const { spawn, execSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9263;
const ROOT = "D:/shimais-daming";
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud25`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1200); };
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const seed = (obj) => evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(obj))})`);
const qlState = () => evalJs(`(() => { const p = document.querySelector('.ql-play'); return { hidden: p.hidden, label: p.querySelector('.ql-scene-label') ? p.querySelector('.ql-scene-label').textContent : null, head: document.querySelector('.ql-head-title') ? document.querySelector('.ql-head-title').textContent : (document.querySelector('.ql-play h2') ? document.querySelector('.ql-play h2').textContent : null), meters: [...document.querySelectorAll('.ql-stat-label')].map(x => x.textContent), stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent) }; })()`);
const ctxLine = () => evalJs(`document.querySelector('.tl-context-line') ? document.querySelector('.tl-context-line').textContent : null`);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200));
  };
  await send("Runtime.enable"); await send("Page.enable");

  // ---- qinli ?story= ----
  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/qinli.html?story=q1449");
  let s = await qlState();
  check("?story=q1449 fresh opens opening state", !s.hidden && /第一场/.test(s.label || "") && JSON.stringify(s.meters) === JSON.stringify(["朝议声望", "京师军心"]) && JSON.stringify(s.stats) === JSON.stringify(["50", "50"]), JSON.stringify(s));
  await seed({ qinli: { done: [], current: { storyId: "q1449", sceneIndex: 3, prestige: 65, morale: 40 } } });
  await nav("http://127.0.0.1:4173/qinli.html?story=q1449");
  s = await qlState();
  check("?story=q1449 with save resumes scene4 65/40", !s.hidden && /第四场/.test(s.label || "") && JSON.stringify(s.stats) === JSON.stringify(["65", "40"]), JSON.stringify(s));
  await nav("http://127.0.0.1:4173/qinli.html?story=q1644");
  s = await qlState();
  const head1644 = await evalJs(`document.querySelector('.ql-play').textContent.slice(0, 60)`);
  check("?story=q1644 opens chongzhen line fresh (save was q1449)", !s.hidden && /第一场/.test(s.label || "") && JSON.stringify(s.meters) === JSON.stringify(["尽责", "生机"]) && /煤山/.test(head1644), JSON.stringify([s, head1644]));
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/qinli.html?story=xxx");
  const bad = await qlState();
  await nav("http://127.0.0.1:4173/qinli.html");
  const none = await qlState();
  check("bogus param == no param: cards only, nothing opened", bad.hidden && none.hidden, JSON.stringify([bad.hidden, none.hidden]));
  await seed({ qinli: { done: [], current: { storyId: "q1402", sceneIndex: 2, prestige: 55, morale: 55 } } });
  await nav("http://127.0.0.1:4173/qinli.html?story=zzz");
  const badResume = await qlState();
  check("bogus param keeps existing auto-resume behavior", !badResume.hidden && /第三场/.test(badResume.label || "") && JSON.stringify(badResume.meters) === JSON.stringify(["士节", "生机"]), JSON.stringify(badResume));
  await nav("http://127.0.0.1:4173/qinli.html?story=q1380");
  const override = await qlState();
  check("valid param overrides other-story save", !override.hidden && /第一场/.test(override.label || "") && JSON.stringify(override.meters) === JSON.stringify(["圣眷", "清名"]), JSON.stringify(override));

  // ---- timeline context strip ----
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/timeline.html");
  const first = await ctxLine();
  check("load initial = first event 1368 太祖/内阁未设", first === "洪武元年 · 在位：太祖 · 首辅：内阁未设", first);
  const note = await evalJs(`document.querySelector('.tl-context-note').textContent`);
  check("note verbatim", note === "首辅以本站帝王首辅表收录为准。", note);
  const clickCtx = async (id) => { await evalJs(`document.querySelector('.tl-event[data-id="${id}"] .tl-row').click()`); await sleep(150); return ctxLine(); };
  const c1581 = await clickCtx("e1581");
  check("click e1581 -> 神宗/张居正", /在位：神宗 · 首辅：张居正$/.test(c1581 || "") && /万历/.test(c1581), c1581);
  const c1644 = await clickCtx("e1644");
  check("click e1644 -> 思宗/—", /在位：思宗 · 首辅：—$/.test(c1644 || "") && /崇祯十七年/.test(c1644), c1644);
  const c1402 = await clickCtx("e1402");
  check("click e1402 -> 成祖/解缙 (boundary tie earliest)", /在位：惠宗|在位：成祖/.test(c1402 || "") && /首辅：解缙$/.test(c1402 || ""), c1402);
  // scroll follow
  await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1644"]'); const navH = document.querySelector('.site-nav').offsetHeight; const ctxH = document.querySelector('.tl-context').offsetHeight; window.scrollTo({ top: Math.max(0, a.getBoundingClientRect().top + scrollY - navH - ctxH - 8), behavior: 'instant' }); })()`);
  await sleep(700);
  const bottom = await ctxLine();
  check("scroll to last event -> its context", /崇祯十七年 · 在位：思宗 · 首辅：—/.test(bottom || ""), bottom);
  await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1449"]'); const navH = document.querySelector('.site-nav').offsetHeight; const ctxH = document.querySelector('.tl-context').offsetHeight; window.scrollTo({ top: Math.max(0, a.getBoundingClientRect().top + scrollY - navH - ctxH - 8), behavior: 'instant' }); })()`);
  await sleep(700);
  const mid = await ctxLine();
  check("scroll to e1449 -> 正统十四年 context", /正统十四年 · 在位：英宗 · 首辅：陈循/.test(mid || ""), mid);
  // sticky geometry
  const geo = await evalJs(`(() => { const c = document.querySelector('.tl-context').getBoundingClientRect(); const n = document.querySelector('.site-nav').getBoundingClientRect(); return { ctxTop: Math.round(c.top), navBottom: Math.round(n.bottom), ctxH: Math.round(c.height), z: getComputedStyle(document.querySelector('.tl-context')).zIndex }; })()`);
  check("strip sticky flush under nav", Math.abs(geo.ctxTop - geo.navBottom) <= 1 && geo.ctxH > 20, JSON.stringify(geo));
  await evalJs(`localStorage.clear()`); await nav("http://127.0.0.1:4173/timeline.html"); await evalJs(`window.scrollTo(0, 1200)`); await sleep(700); const lsScroll = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  check("scroll/ctx writes no progress", lsScroll === null, lsScroll);
  await shot("timeline-ctx-scroll");
  // deep link coexistence
  await nav("http://127.0.0.1:4173/timeline.html?event=e1449");
  await sleep(500);
  const deep = await evalJs(`(() => { const a = document.querySelector('.tl-event[data-id="e1449"]'); return { line: document.querySelector('.tl-context-line').textContent, hit: a.classList.contains('is-deep-hit'), open: a.classList.contains('is-open') }; })()`);
  check("?event=e1449: ctx initial = that event + highlight intact", deep.line === "正统十四年 · 在位：英宗 · 首辅：陈循" && deep.hit && deep.open, JSON.stringify(deep));
  await sleep(600);
  const deepAfter = await ctxLine();
  check("ctx lock holds deep value after programmatic scroll", deepAfter === deep.line, deepAfter);
  await shot("timeline-ctx-deep");
  // strip only on timeline
  let onlyOk = true;
  for (const p of ["index.html", "cards.html", "search.html", "qinli.html", "relations.html"]) {
    await nav("http://127.0.0.1:4173/" + p);
    if (await evalJs(`!!document.querySelector('.tl-context')`)) onlyOk = false;
  }
  check("context strip only on timeline", onlyOk, "leak");

  // ---- red lines ----
  const dataDiff = execSync("git diff --stat -- frontend/data.js", { cwd: ROOT }).toString().trim();
  check("data.js zero diff this round", dataDiff === "", dataDiff);
  const appSrc = fs.readFileSync(ROOT + "/frontend/app.js", "utf8");
  check("CHAT_API_BASE untouched", /const CHAT_API_BASE = "http:\/\/localhost:8000";/.test(appSrc), "changed");
  const D = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SITE_DATA", {});
  const HEAD = vm.runInNewContext(execSync("git show HEAD:frontend/data.js", { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString() + "\n;SITE_DATA", {});
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check("qinli/relations/search index data identical to HEAD", same(D.qinli, HEAD.qinli) && same(D.relations, HEAD.relations) && same(D.modules, HEAD.modules), "diff");
  const navCount = await evalJs(`document.querySelectorAll('.nav-link').length`);
  check("nav still 10", navCount === 10, navCount);

  // ---- mobile ----
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/timeline.html?event=e1581");
  await sleep(500);
  const mob = await evalJs(`(() => { const c = document.querySelector('.tl-context').getBoundingClientRect(); const n = document.querySelector('.site-nav').getBoundingClientRect(); return { docW: document.documentElement.scrollWidth, ctxTop: Math.round(c.top), navBottom: Math.round(n.bottom), line: document.querySelector('.tl-context-line').textContent }; })()`);
  check("mobile: no overflow, strip under nav, deep ctx correct", mob.docW <= 375 && Math.abs(mob.ctxTop - mob.navBottom) <= 1 && /神宗 · 首辅：张居正/.test(mob.line), JSON.stringify(mob));
  await shot("timeline-ctx-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });