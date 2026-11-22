const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9320; const DIR = __dirname;
const BASE = "http://127.0.0.1:4173/";
const ROOT = "D:/shimais-daming/frontend/";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud57`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
const results = [];
const check = (n, ok, x) => { results.push({ n, ok }); console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + x)); };
const nav = async (u) => { await send("Page.navigate", { url: BASE + u }); await sleep(900); };

(async () => {
  // static file-level checks
  const files = ["index.html", "timeline.html", "decisions.html", "cards.html", "chat.html", "quiz.html", "profile.html", "relations.html", "search.html", "chapter.html", "qinli.html", "qinli-play.html"];
  const descs = {}; let favAll = true;
  for (const f of files) {
    const html = fs.readFileSync(ROOT + f, "utf8");
    const m = html.match(/<meta name="description" content="([^"]*)" \/>/);
    descs[f] = m ? m[1] : null;
    if (!html.includes('<link rel="icon" type="image/svg+xml" href="favicon.svg" />')) favAll = false;
  }
  const vals = Object.values(descs);
  check("all 12 pages static description non-empty", vals.every(v => v && v.trim()), JSON.stringify(descs));
  check("descriptions pairwise distinct", new Set(vals).size === 12, JSON.stringify(vals));
  check("favicon link on all 12 pages", favAll, favAll);
  const idx = fs.readFileSync(ROOT + "index.html", "utf8");
  check("index og:title/description/type/image", idx.includes('og:title" content="史脉·大明"') && idx.includes('og:type" content="website"') && idx.includes('og:image" content="/images/carousel/01-taihedian.jpg"') && idx.includes('og:description" content="' + descs["index.html"] + '"'), "og missing");
  const site = JSON.parse(fs.readFileSync(ROOT + ".史脉·大明.qoder.site", "utf8"));
  const paths = site.design.pages.map(p => p.path);
  check("descriptor valid JSON with 12 pages incl new 3", site.design.pages.length === 12 && ["/search.html", "/chapter.html", "/qinli-play.html"].every(p => paths.includes(p)), JSON.stringify(paths));
  const favSvg = fs.readFileSync(ROOT + "favicon.svg", "utf8");
  check("favicon.svg dark bg + gold 史", favSvg.includes("#0c0a09") && favSvg.includes("#b08d4f") && favSvg.includes(">史<"), favSvg.slice(0, 80));

  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200)); };
  await send("Runtime.enable"); await send("Page.enable");

  // runtime must not overwrite static description
  let runtimeOk = true; const seen = [];
  for (const f of files) {
    await nav(f === "qinli-play.html" ? f + "?story=q1449" : f);
    const c = await ev(`document.querySelector('meta[name="description"]').getAttribute('content')`);
    seen.push([f, c === descs[f]]);
    if (c !== descs[f]) runtimeOk = false;
  }
  check("runtime keeps static description on every page", runtimeOk, JSON.stringify(seen.filter(x => !x[1])));

  await nav("index.html");
  const ogLive = await ev(`(() => ({ t: document.querySelector('meta[property="og:title"]').content, i: document.querySelector('meta[property="og:image"]').content }))()`);
  const imgStatus = await ev(`fetch(${JSON.stringify(ogLive.i)}).then(r => r.status)`);
  const favStatus = await ev(`fetch('favicon.svg').then(r => r.status)`);
  check("og:image resolves (200) and favicon.svg served (200)", imgStatus === 200 && favStatus === 200, JSON.stringify([ogLive, imgStatus, favStatus]));

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });