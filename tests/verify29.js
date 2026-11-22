const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9276;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud38`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const photoState = () => evalJs(`(() => [...document.querySelectorAll('.cw-person')].map(card => {
  const img = card.querySelector('.cw-photo img');
  const r = img.getBoundingClientRect();
  const body = card.querySelector('.cw-body').getBoundingClientRect();
  const note = card.querySelector('.cw-note');
  const cs = getComputedStyle(img);
  return { id: card.dataset.card, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, ratio: Math.round((r.width / r.height) * 1000) / 1000, fit: cs.objectFit, bg: cs.backgroundColor, border: cs.borderTopWidth + ' ' + cs.borderTopStyle, bodyTop: Math.round(body.top * 10) / 10, noteBelow: note ? note.getBoundingClientRect().top >= r.bottom - 0.5 : null, natural: [img.naturalWidth, img.naturalHeight] };
}))()`);

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
  await nav("http://127.0.0.1:4173/cards.html");
  await sleep(2600);
  const st = await photoState();
  const heights = st.map((x) => x.h);
  check("six frames identical height, 4:3 ratio", new Set(heights).size === 1 && st.every((x) => Math.abs(x.ratio - 4 / 3) < 0.01), JSON.stringify(st.map((x) => [x.id, x.h, x.ratio])));
  check("contain + dark surface + hairline border", st.every((x) => x.fit === "contain" && x.bg === "rgb(19, 18, 17)" && x.border === "1px solid"), JSON.stringify(st.map((x) => [x.fit, x.bg, x.border])));
  const rows = [[0, 1], [2, 3], [4, 5]];
  check("two-column body starts aligned in every row", rows.every(([a, b]) => Math.abs(st[a].bodyTop - st[b].bodyTop) < 0.6), JSON.stringify(rows.map(([a, b]) => [st[a].id, st[b].id, st[a].bodyTop, st[b].bodyTop])));
  check("figcaption stays below frame", st.filter((x) => x.noteBelow !== null).every((x) => x.noteBelow === true), JSON.stringify(st.map((x) => [x.id, x.noteBelow])));
  check("contain keeps full image (no crop math): rendered box ratio wider-or-equal than natural for tall imgs", st.every((x) => x.fit === "contain"), "fit");
  await evalJs(`document.querySelectorAll('.cw-person')[3].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(500);
  await shot("cards-frame-hairui");
  await evalJs(`document.querySelectorAll('.cw-person')[2].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(500);
  await shot("cards-frame-yuqian");
  await evalJs(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(400);
  await shot("cards-frame-top");

  // mobile 390
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/cards.html");
  await sleep(2600);
  const mob = await photoState();
  check("390px: ratio holds, no overflow, note below", mob.every((x) => Math.abs(x.ratio - 4 / 3) < 0.01 && (x.noteBelow === null || x.noteBelow)) && (await evalJs(`document.documentElement.scrollWidth`)) <= 390, JSON.stringify(mob.map((x) => [x.id, x.ratio])));
  await evalJs(`document.querySelectorAll('.cw-person')[5].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(500);
  await shot("cards-frame-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });