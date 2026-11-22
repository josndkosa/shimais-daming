const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9243;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud5`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => results.push({ name, ok, extra });
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
  await send("Page.navigate", { url: "http://127.0.0.1:4173/timeline.html" });
  await sleep(1300);
  await evalJs(`localStorage.clear()`);
  await send("Page.navigate", { url: "http://127.0.0.1:4173/timeline.html" });
  await sleep(1300);

  const all = await evalJs(`SITE_DATA.timeline.events.map(e => [e.id, e.era, e.year, e.reign])`);
  check("23 events total", all.length === 23, String(all.length));
  const gaige = all.filter((e) => e[1] === "gaige").map((e) => e[2]);
  check("gaige year order incl new nodes", JSON.stringify(gaige) === JSON.stringify(["1566", "1567", "1572", "1581", "1582", "1592", "1619"]), gaige.join(","));
  const reignOf = (id) => (all.find((e) => e[0] === id) || [])[3];
  check("e1435 reign 宣德十年", reignOf("e1435") === "宣德十年", reignOf("e1435"));
  check("e1521 reign 正德十六年", reignOf("e1521") === "正德十六年", reignOf("e1521"));
  check("e1627 reign 天启七年", reignOf("e1627") === "天启七年", reignOf("e1627"));
  const domOrder = await evalJs(`[...document.querySelectorAll('.tl-event')].map(n => n.dataset.id || n.querySelector('.tl-year').textContent.trim())`);
  check("DOM order matches data order", JSON.stringify(domOrder) === JSON.stringify(all.map((e) => e[0])) || JSON.stringify(domOrder) === JSON.stringify(all.map((e) => e[2])), domOrder.slice(0, 30).join(","));

  const n1567 = await evalJs(`(() => {
    const ev = SITE_DATA.timeline.events.find(e => e.id === 'e1567');
    return { reign: ev.reign, title: ev.title, summary: ev.summary, detail: ev.detail, tags: ev.tags };
  })()`);
  check("e1567 copy exact", n1567.reign === "隆庆元年" && n1567.title === "隆庆开关" && n1567.summary === "开放福建月港，民间海船合法出海，白银开始大量流入。" && n1567.detail.length === 2 && n1567.detail[0].startsWith("穆宗即位后") && n1567.detail[1].includes("没有白银流入，折银征收无从谈起") && JSON.stringify(n1567.tags) === JSON.stringify(["海禁", "月港", "白银流入"]), JSON.stringify(n1567).slice(0, 120));
  const n1581 = await evalJs(`(() => {
    const ev = SITE_DATA.timeline.events.find(e => e.id === 'e1581');
    return { reign: ev.reign, title: ev.title, summary: ev.summary, detail: ev.detail, tags: ev.tags };
  })()`);
  check("e1581 copy exact", n1581.reign === "万历九年" && n1581.title === "一条鞭法推行全国" && n1581.summary === "赋役合并、按亩折银征收，张居正改革的财政落点。" && n1581.detail.length === 2 && n1581.detail[1].includes("有它的一份结构性原因") && JSON.stringify(n1581.tags) === JSON.stringify(["一条鞭法", "赋役折银", "张居正改革"]), JSON.stringify(n1581).slice(0, 120));

  // expand new node -> read + progress denominator 23
  const before = await evalJs(`document.querySelector('.tl-progress').textContent`);
  await evalJs(`(() => { const row = [...document.querySelectorAll('.tl-row')].find(r => r.closest('.tl-event').querySelector('.tl-year').textContent.trim() === '1567'); row.click(); })()`);
  await sleep(500);
  const st = await evalJs(`(() => {
    const ev = [...document.querySelectorAll('.tl-event')].find(n => n.querySelector('.tl-year').textContent.trim() === '1567');
    return { open: !ev.querySelector('.tl-detail').hidden, badge: !ev.querySelector('.tl-read').hidden,
      paras: ev.querySelectorAll('.tl-detail p').length, tags: [...ev.querySelectorAll('.tl-tag')].map(t => t.textContent),
      progress: document.querySelector('.tl-progress').textContent,
      stored: JSON.parse(localStorage.getItem('shimais-daming:progress:v1')).timeline.read };
  })()`);
  check("1567 expands with 2 paras + 3 tags", st.open && st.paras === 2 && JSON.stringify(st.tags) === JSON.stringify(["海禁", "月港", "白银流入"]), JSON.stringify(st.tags));
  check("1567 marked read, progress 1/23", st.badge && st.stored.includes("e1567") && /1\s*\/\s*23/.test(st.progress), st.progress + " " + JSON.stringify(st.stored));

  // existing progress survives: seed old read then reload
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('shimais-daming:progress:v1')); p.timeline.read.push('e1368'); localStorage.setItem('shimais-daming:progress:v1', JSON.stringify(p)); })()`);
  await send("Page.navigate", { url: "http://127.0.0.1:4173/timeline.html" });
  await sleep(1200);
  const kept = await evalJs(`(() => { const r = JSON.parse(localStorage.getItem('shimais-daming:progress:v1')).timeline.read; return { r, prog: document.querySelector('.tl-progress').textContent }; })()`);
  check("old + new reads persist 2/23", kept.r.includes("e1368") && kept.r.includes("e1567") && /2\s*\/\s*23/.test(kept.prog), kept.prog);

  // reign labels visible in DOM
  const domReign = await evalJs(`(() => {
    const get = (y) => [...document.querySelectorAll('.tl-event')].find(n => n.querySelector('.tl-year').textContent.trim() === y).querySelector('.tl-reign').textContent;
    return [get('1435'), get('1521'), get('1627')];
  })()`);
  check("DOM reign labels updated", JSON.stringify(domReign) === JSON.stringify(["宣德十年", "正德十六年", "天启七年"]), domReign.join(","));

  // mobile overflow
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const ov = await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : null`);
  check("mobile no horizontal overflow", ov === null, String(ov));
  await evalJs(`(() => { const ev = [...document.querySelectorAll('.tl-event')].find(n => n.querySelector('.tl-year').textContent.trim() === '1581'); ev.scrollIntoView({ block: 'center', behavior: 'instant' }); ev.querySelector('.tl-row').click(); })()`);
  await sleep(500);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/tl-new-nodes-mobile.png", Buffer.from(shot.data, "base64"));
  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await evalJs(`(() => { const ev = [...document.querySelectorAll('.tl-event')].find(n => n.querySelector('.tl-year').textContent.trim() === '1567'); ev.scrollIntoView({ block: 'center', behavior: 'instant' }); })()`);
  await sleep(400);
  const shot2 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/tl-new-nodes-desktop.png", Buffer.from(shot2.data, "base64"));

  check("zero console/runtime errors", errors.length === 0, errors.join(" | "));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} PASS`);
  for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + "  " + r.name + (r.ok ? "" : "  " + (r.extra || "")));
  ws.close(); chrome.kill(); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });