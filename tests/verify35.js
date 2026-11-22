const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9291;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud47`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0, mainId; const pending = new Map(); const excs = []; const errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1800); };
const pages = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((x) => x.type === "page");
async function trustedClick(selector) {
  await evalJs(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center", behavior: "instant" }); true`);
  await sleep(350);
  const p = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
}
async function expectNewTab(name, urlPrefix) {
  let tab = null;
  for (let i = 0; i < 12; i++) { await sleep(300); tab = (await pages()).find((x) => x.id !== mainId && x.url.startsWith(urlPrefix)); if (tab) break; }
  const here = await evalJs("location.pathname + location.search");
  check(name, !!tab, JSON.stringify({ here, tabs: (await pages()).map((x) => x.url) }));
  if (tab) await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
  await sleep(300);
  return tab;
}
const attrScan = () => evalJs(`(() => {
  const as = [...document.querySelectorAll('a')].filter(a => /^qinli(-play)?.html/.test(a.getAttribute('href') || ''));
  return as.map(a => ({ cls: a.className, href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }));
})()`);
const contentOk = (list) => list.filter(x => !x.cls.includes("nav-link")).every(x => x.target === "_blank" && x.rel === "noopener");
const navOk = (list) => list.filter(x => x.cls.includes("nav-link")).every(x => x.target === null && x.rel === null);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  mainId = t.id;
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") excs.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push(d.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 200));
  };
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(600);

  // 1) index fresh: only nav carries qinli (catalog has six modules, qinli is nav-only)
  await nav(BASE + "/index.html");
  await evalJs("localStorage.clear(); true");
  await nav(BASE + "/index.html");
  let scan = await attrScan();
  check("index fresh: nav qinli plain, no stray content anchors", navOk(scan) && contentOk(scan) && scan.every(x => x.cls.includes("nav-link")), JSON.stringify(scan));

  // 2) index resume (lastRead qinli)
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ lastRead: { kind: "qinli", id: "q1380" } })); true`);
  await nav(BASE + "/index.html");
  const resumeHref = await evalJs(`(() => { const a = [...document.querySelectorAll('.topic-next')].find(x => /^qinli(-play)?.html/.test(x.getAttribute('href'))); return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null; })()`);
  check("index resume link qinli deep link + target", resumeHref && resumeHref.href === "qinli-play.html?story=q1380" && resumeHref.target === "_blank" && resumeHref.rel === "noopener", JSON.stringify(resumeHref));
  await trustedClick('.topic-next[href="qinli-play.html?story=q1380"]');
  await expectNewTab("index resume opens q1380 in new tab", BASE + "/qinli-play.html?story=q1380");
  check("index origin page preserved", (await evalJs("location.pathname")) === "/index.html", await evalJs("location.pathname"));

  // 3) chapter next link
  await nav(BASE + "/chapter.html");
  scan = await attrScan();
  check("chapter: 亲历《诏狱》 target+rel, other next links plain", contentOk(scan) && navOk(scan) && scan.filter(x => x.cls.includes("ch-next-link")).length === 1, JSON.stringify(scan));
  await trustedClick(".ch-next-link");
  await expectNewTab("chapter next opens q1380 in new tab", BASE + "/qinli-play.html?story=q1380");

  // 4) chat cross-link
  await nav(BASE + "/chat.html?figure=zhuyuanzhang");
  const ct = await evalJs(`(() => { const a = document.querySelector('.ct-qinli-link'); return { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }; })()`);
  check("chat qinli link deep link + target", ct.href === "qinli-play.html?story=q1380" && ct.target === "_blank" && ct.rel === "noopener", JSON.stringify(ct));
  await trustedClick(".ct-qinli-link");
  await expectNewTab("chat cross-link opens q1380 in new tab", BASE + "/qinli-play.html?story=q1380");

  // 5) profile continue + resume
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ qinli: { current: { storyId: "q1581" } }, lastRead: { kind: "qinli", id: "q1581" } })); true`);
  await nav(BASE + "/profile.html");
  const pf = await evalJs(`(() => {
    const ql = document.querySelector('.pf-link[href^="qinli-play.html"]');
    const resume = [...document.querySelectorAll('.cta-gold')].find(a => /^qinli(-play)?.html/.test(a.getAttribute('href') || ''));
    return { ql: { href: ql.getAttribute('href'), target: ql.getAttribute('target'), rel: ql.getAttribute('rel') }, resume: resume ? { href: resume.getAttribute('href'), target: resume.getAttribute('target') } : null };
  })()`);
  check("profile 继续亲历 q1581 + target; resume link too", pf.ql.href === "qinli-play.html?story=q1581" && pf.ql.target === "_blank" && pf.ql.rel === "noopener" && pf.resume && pf.resume.href === "qinli-play.html?story=q1581" && pf.resume.target === "_blank", JSON.stringify(pf));
  await trustedClick('.pf-link[href^="qinli-play.html"]');
  await expectNewTab("profile continue opens q1581 in new tab", BASE + "/qinli-play.html?story=q1581");

  // 6) topic path on cards deep link
  await nav(BASE + "/cards.html?card=i3");
  const tp = await attrScan();
  check("topic path: qinli step + next target+rel, others plain", contentOk(tp) && navOk(tp) && tp.filter(x => x.cls.includes("topic-link")).length === 1 && tp.filter(x => x.cls.includes("topic-next")).length === 1, JSON.stringify(tp));
  await trustedClick(".topic-path .topic-next");
  await expectNewTab("topic next step opens q1581 in new tab", BASE + "/qinli-play.html?story=q1581");

  // 7) decisions entry strip
  await nav(BASE + "/decisions.html");
  const de = await evalJs(`(() => { const a = document.querySelector('.ql-entry-link'); return { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }; })()`);
  check("decisions entry link target+rel", de.href === "qinli.html" && de.target === "_blank" && de.rel === "noopener", JSON.stringify(de));
  await trustedClick(".ql-entry-link");
  await expectNewTab("decisions entry opens qinli in new tab", BASE + "/qinli.html");

  // 8) nav stays same-tab
  await nav(BASE + "/index.html");
  const before = (await pages()).length;
  await trustedClick('.nav-link[href="qinli.html"]');
  await sleep(1600);
  const after = (await pages()).length;
  check("nav 亲历 stays same-tab", (await evalJs("location.pathname")) === "/qinli.html" && after === before, JSON.stringify({ path: await evalJs("location.pathname"), before, after }));

  // 9) qinli in-page: no new tabs on play/choice
  await nav(BASE + "/qinli.html");
  const inPage = await evalJs(`[...document.querySelectorAll('a[target="_blank"]')].filter(a => !a.closest('.topic-path')).length`);
  check("qinli in-page anchors stay same-tab (topic module excepted)", inPage === 0, inPage);
  const pbefore = (await pages()).length;
  await trustedClick(".ql-play-btn");
  await sleep(900);
  const scene = await evalJs(`!!document.querySelector('.ql-choice')`);
  await trustedClick(".ql-choice");
  await sleep(700);
  const pafter = (await pages()).length;
  check("qinli play + choice stay in same tab", scene && pafter === pbefore && (await evalJs("location.pathname")) === "/qinli-play.html", JSON.stringify({ scene, pbefore, pafter }));

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify35 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });