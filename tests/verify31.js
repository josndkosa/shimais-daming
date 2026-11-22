const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9279;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const IDS = ["q1380", "q1402", "q1449", "q1548", "q1581", "q1644"];
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud41`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const coverState = () => evalJs(`(() => [...document.querySelectorAll('.ql-card')].map(card => {
  const img = card.querySelector('.ql-cover');
  const r = img ? img.getBoundingClientRect() : null;
  return { id: card.dataset.card || (card.querySelector('.ql-year') ? card.querySelector('.ql-year').textContent : ''), has: !!img, src: img ? img.getAttribute('src') : null, alt: img ? img.alt : null, loading: img ? img.getAttribute('loading') : null, decoding: img ? img.getAttribute('decoding') : null, natural: img ? [img.naturalWidth, img.naturalHeight] : null, ratio: r ? Math.round((r.width / r.height) * 1000) / 1000 : null, fit: img ? getComputedStyle(img).objectFit : null, cardW: Math.round(card.getBoundingClientRect().width), imgW: r ? Math.round(r.width) : 0 };
}))()`);
const brokenIcons = () => evalJs(`(() => [...document.querySelectorAll('.ql-card')].filter(c => c.querySelector('img')).length)()`);

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

  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); })()`);
  await sleep(1500);
  let st = await coverState();
  check("six covers present, src matches id order", st.length === 6 && st.every((x, i) => x.has && x.src === "images/qinli/" + IDS[i] + ".jpg"), JSON.stringify(st.map((x) => [x.src, x.has])));
  check("covers actually loaded (natural size > 0)", st.every((x) => x.natural && x.natural[0] > 0), JSON.stringify(st.map((x) => x.natural)));
  check("alt / lazy / async / 16:9 cover / object-fit cover", st.every((x) => x.alt.endsWith("封面") && x.loading === "lazy" && x.decoding === "async" && Math.abs(x.ratio - 16 / 9) < 0.02 && x.fit === "cover"), JSON.stringify(st.map((x) => [x.alt, x.loading, x.ratio, x.fit])));
  check("cover spans card inner width, no overflow", st.every((x) => Math.abs(x.imgW - (x.cardW - 2)) <= 1 && x.imgW <= x.cardW), JSON.stringify(st.map((x) => [x.imgW, x.cardW])));
  await shot("qinli-covers-desktop");

  // is-done badge still visible with cover
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ qinli: { done: ["q1380"], current: null } }))`);
  await nav("http://127.0.0.1:4173/qinli.html");
  await sleep(900);
  const done = await evalJs(`(() => { const card = document.querySelector('.ql-card.is-done'); const badge = card && card.querySelector('.ql-done'); return { hasCard: !!card, badgeVisible: badge ? !badge.hidden : false, cover: card ? !!card.querySelector('.ql-cover') : false }; })()`);
  check("done badge visible alongside cover", done.hasCard && done.badgeVisible && done.cover, JSON.stringify(done));

  // broken path fallback: fail q1581.jpg
  await send("Fetch.enable", { patterns: [{ urlPattern: "*q1581.jpg*", requestStage: "Request" }] });
  ws.addEventListener("message", async (m) => {
    const d = JSON.parse(m.data);
    if (d.method !== "Fetch.requestPaused") return;
    const p = d.params;
    if (/q1581\.jpg/.test(p.request.url)) {
      await send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 404, responseHeaders: [{ name: "Content-Type", value: "text/plain" }], body: "" });
    } else {
      await send("Fetch.continueRequest", { requestId: p.requestId });
    }
  });
  await nav("http://127.0.0.1:4173/qinli.html");
  await sleep(1400);
  st = await coverState();
  const broken = st.find((x) => x.src === "images/qinli/q1581.jpg");
  check("failed image: cover block removed, no broken image left", !broken || !broken.has, JSON.stringify(broken));
  check("other five covers unaffected", st.filter((x) => x.has).length === 5 && st.filter((x) => x.has).every((x) => x.natural && x.natural[0] > 0), JSON.stringify(st.map((x) => [x.src, x.has])));
  check("no leftover img element on the failed card", (await brokenIcons()) === 5, await brokenIcons());
  await send("Fetch.disable");

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/qinli.html");
  await sleep(1200);
  st = await coverState();
  const mob = await evalJs(`document.documentElement.scrollWidth`);
  check("390px: 16:9 kept, no overflow, six covers", mob <= 390 && st.filter((x) => x.has).length === 6 && st.every((x) => Math.abs(x.ratio - 16 / 9) < 0.02), JSON.stringify([mob, st.map((x) => x.ratio)]));
  await shot("qinli-covers-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });