const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9319; const DIR = __dirname;
const BASE = "http://127.0.0.1:4173/";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud56`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = []; const imgReqs = [];
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
async function ev(e) { const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
const results = [];
const check = (n, ok, x) => { results.push({ n, ok }); console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  -> " + x)); };
const nav = async (u) => { await send("Page.navigate", { url: BASE + u }); await sleep(900); };
const slides = () => ev(`[...document.querySelectorAll('.carousel .slide')].map(s => { const i = s.querySelector('img'); return { active: s.classList.contains('is-active'), src: i.getAttribute('src'), dataSrc: i.getAttribute('data-src'), nw: i.naturalWidth, ariaHidden: s.getAttribute('aria-hidden') }; })`);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Network.requestWillBeSent" && /\.jpg/.test(d.params.request.url)) imgReqs.push(d.params.request.url.split("/").pop());
    else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 200));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 200)); };
  await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.requestIdleCallback;" });
  await nav("index.html");
  await sleep(400);
  const early = imgReqs.slice();
  let s = await slides();
  check("first screen: only carousel first image requested", early.length === 1 && early[0] === "01-taihedian.jpg", JSON.stringify(early));
  check("build: slide0 has src, slides1-4 data-src only", s[0].src && s[0].src.includes("01-") && s.slice(1).every(x => !x.src && x.dataSrc), JSON.stringify(s.map(x => [x.src, x.dataSrc])));
  const preload = await ev(`!!document.querySelector('link[rel="preload"][as="image"][href="images/carousel/01-taihedian.jpg"]')`);
  check("index head preload first image", preload, preload);

  // idle fills remaining
  await sleep(2200);
  s = await slides();
  check("fallback timeout (no rIC) fills all 5 srcs", s.every(x => x.src && x.nw > 0), JSON.stringify(s.map(x => [x.src, x.nw])));
  check("all 5 images requested after idle", imgReqs.length === 5, JSON.stringify(imgReqs));

  // manual cycle: no empty frame (active img decoded)
  let noEmpty = true; const seen = [];
  for (let k = 0; k < 5; k++) {
    await ev(`document.querySelector('.car-next').click()`); await sleep(120);
    const cur = await slides(); const a = cur.find(x => x.active);
    seen.push(a.src);
    if (!a.src || a.nw <= 0) noEmpty = false;
  }
  check("manual full cycle: active slide always has decoded img (no empty frame)", noEmpty && new Set(seen).size === 5, JSON.stringify(seen));

  // autoplay advances and stays frame-complete
  const before = await ev(`[...document.querySelectorAll('.carousel .slide')].findIndex(x => x.classList.contains('is-active'))`);
  await sleep(6500);
  const after = await ev(`[...document.querySelectorAll('.carousel .slide')].findIndex(x => x.classList.contains('is-active'))`);
  const cur2 = (await slides()).find(x => x.active);
  check("autoplay advances with decoded img", after !== before && cur2.nw > 0, JSON.stringify([before, after, cur2.nw]));

  // dots + a11y unchanged
  const a11y = await ev(`(() => ({ dots: document.querySelectorAll('.car-dot').length, region: document.querySelector('.carousel').getAttribute('aria-roledescription'), slides: [...document.querySelectorAll('.carousel .slide')].map(x => x.getAttribute('aria-roledescription')), current: document.querySelectorAll('.car-dot[aria-current="true"]').length, prev: !!document.querySelector('.car-prev'), next: !!document.querySelector('.car-next') }))()`);
  check("dots/autoplay/a11y intact", a11y.dots === 5 && a11y.region === "carousel" && a11y.slides.every(x => x === "slide") && a11y.current === 1 && a11y.prev && a11y.next, JSON.stringify(a11y));

  // lazy attrs on cards/qinli untouched
  await nav("cards.html");
  const lazyCards = await ev(`[...document.querySelectorAll('.cw-photo img')].every(i => i.loading === 'lazy')`);
  await nav("qinli.html");
  const lazyQinli = await ev(`[...document.querySelectorAll('.ql-cover')].every(i => i.loading === 'lazy')`);
  check("person cards + qinli covers keep loading=lazy", lazyCards && lazyQinli, JSON.stringify([lazyCards, lazyQinli]));

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });