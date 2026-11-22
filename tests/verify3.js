const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9241;
const DIR = __dirname;
const chrome = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-gpu", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${DIR}/ud3`, "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++idc; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
const results = [];
function check(name, ok, extra) { results.push({ name, ok, extra }); }
(async () => {
  let target;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      target = list.find((t) => t.type === "page");
      if (target) break;
    } catch {}
  }
  if (!target) throw new Error("no chrome target");
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300));
    else if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push(d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300));
  };
  await send("Runtime.enable"); await send("Page.enable");
  const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1200); };

  await nav("http://127.0.0.1:4173/index.html");

  // 1. slide copy final, no 占位
  const slides = await evalJs(`SITE_DATA.slides.map(s => [s.img, s.headline, s.sub])`);
  const expected = [
    ["01-taihedian.jpg", "大明 · 1368—1644", "一个王朝的 276 年，从这里开始"],
    ["02-taizu.jpg", "洪武定制", "他亲手定下的规矩，管了明朝 276 年"],
    ["03-greatwall.jpg", "天子守国门", "迁都北京之后，边防就是帝国的日常"],
    ["04-treasure-ship.jpg", "宝船出海", "郑和七下西洋：朝贡体系的巅峰，也是绝唱"],
    ["05-palace-snow-night.jpg", "甲申之变", "1644，煤山自缢——抓得最紧的手，最后无处安放"],
  ];
  check("slides data matches final copy", JSON.stringify(slides.map(s => [s[0].split("/").pop(), s[1], s[2]])) === JSON.stringify(expected));
  check("no 占位 in slides", !JSON.stringify(slides).includes("占位"));
  const domCopy = await evalJs(`[...document.querySelectorAll('.slide')].map(s => [s.querySelector('.slide-headline').textContent, s.querySelector('.slide-sub').textContent])`);
  check("DOM renders final copy", JSON.stringify(domCopy) === JSON.stringify(expected.map(e => [e[1], e[2]])));

  // 2. taizu still framed, not stretched
  const taizu = await evalJs(`(() => {
    const s = [...document.querySelectorAll('.slide')].find(x => x.querySelector('img').src.includes('02-taizu'));
    const img = s.querySelector('img');
    return { frame: s.classList.contains('slide-frame'), wrap: !!s.querySelector('.frame-wrap'),
      ratio: +(img.getBoundingClientRect().width / img.getBoundingClientRect().height).toFixed(2),
      natural: +(img.naturalWidth / img.naturalHeight).toFixed(2) };
  })()`);
  check("taizu hanging-scroll frame kept", taizu.frame && taizu.wrap && Math.abs(taizu.ratio - taizu.natural) < 0.02, JSON.stringify(taizu));

  // 3. CTA button
  const cta = await evalJs(`(() => {
    const a = document.querySelector('.cta-button');
    if (!a) return null;
    const cs = getComputedStyle(a); const r = a.getBoundingClientRect();
    const q = document.querySelector('.question-block').getBoundingClientRect();
    return { text: a.textContent, href: a.getAttribute('href'), below: r.top > q.bottom,
      border: cs.borderTopColor, w: Math.round(r.width), h: Math.round(r.height), display: cs.display };
  })()`);
  check("CTA rendered below question", !!cta && cta.below && cta.text === "开始研读" && cta.href === "timeline.html", JSON.stringify(cta));
  check("CTA vermilion outline, large", !!cta && cta.h >= 48 && cta.w >= 160 && /158|155|rgb/.test(cta.border), JSON.stringify(cta && cta.border));

  // 4. click CTA navigates to timeline
  const box = await evalJs(`(() => { const r = document.querySelector('.cta-button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await evalJs(`document.querySelector('.cta-button').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  const box2 = await evalJs(`(() => { const r = document.querySelector('.cta-button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: box2.x, y: box2.y, button: "left", clickCount: 1 });
  await sleep(1200);
  const url = await evalJs(`location.pathname`);
  check("CTA click lands on timeline.html", url.endsWith("/timeline.html"), url);
  const tlOk = await evalJs(`document.querySelectorAll('.tl-event').length`);
  check("timeline renders 21 events", tlOk === 21, String(tlOk));

  // 5. overflow desktop + mobile on index
  await nav("http://127.0.0.1:4173/index.html");
  const ovD = await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : null`);
  check("desktop no horizontal overflow", ovD === null, String(ovD));
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const ovM = await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : null`);
  check("mobile no horizontal overflow", ovM === null, String(ovM));
  const ctaM = await evalJs(`(() => { const a = document.querySelector('.cta-button'); const r = a.getBoundingClientRect(); return { display: getComputedStyle(a).display, right: Math.round(r.right), vw: window.innerWidth }; })()`);
  check("mobile CTA full-width block, inside viewport", ctaM.display === "block" && ctaM.right <= ctaM.vw, JSON.stringify(ctaM));

  // screenshots
  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await nav("http://127.0.0.1:4173/index.html");
  await evalJs(`document.querySelector('.question-section').scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(400);
  let shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(DIR + "/cta-desktop.png", Buffer.from(shot.data, "base64"));
  await evalJs(`window.scrollTo({ top: 0, behavior: 'instant' })`); await sleep(300);
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(DIR + "/slide0-final.png", Buffer.from(shot.data, "base64"));
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await sleep(500);
  await evalJs(`document.querySelector('.question-section').scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(400);
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(DIR + "/cta-mobile.png", Buffer.from(shot.data, "base64"));

  check("zero console/runtime errors", errors.length === 0, errors.join(" | "));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} PASS`);
  for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + "  " + r.name + (r.ok ? "" : "  " + (r.extra || "")));
  ws.close(); chrome.kill(); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });