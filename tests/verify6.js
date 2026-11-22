const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9245;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud7`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1200); };
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

  const struct = await evalJs(`(() => {
    const people = [...document.querySelectorAll('.cw-person')];
    const inst = [...document.querySelectorAll('.cw-inst')];
    const data = SITE_DATA.cards;
    const cardOf = (id) => [...document.querySelectorAll('.cw-card')].find(n => n.querySelector('.cw-name').textContent === data.find(c => c.id === id).name);
    return {
      people: people.length, inst: inst.length,
      groups: [...document.querySelectorAll('.cw-group .section-title')].map(n => n.textContent),
      facts: [...document.querySelectorAll('.cw-card')].map(n => n.querySelectorAll('.cw-fact').length),
      copyOk: data.every(c => { const n = cardOf(c.id); return n.querySelector('.cw-position').textContent === c.position && n.querySelector('.cw-comment-p').textContent === c.comment && JSON.stringify([...n.querySelectorAll('.cw-fact')].map(x => x.textContent)) === JSON.stringify(c.facts); }),
      source: document.querySelector('.cw-source').textContent,
    };
  })()`);
  check("6 person + 3 institution cards, 2 groups", struct.people === 6 && struct.inst === 3 && JSON.stringify(struct.groups) === JSON.stringify(["人物", "制度"]), JSON.stringify(struct.groups));
  check("every card 3 facts", struct.facts.every((n) => n === 3), JSON.stringify(struct.facts));
  check("position/facts/comment verbatim vs data", struct.copyOk === true);
  check("source note exact", struct.source === "人物画像为传世古画（公有领域），源自 Wikimedia Commons。", struct.source);

  // scroll through to trigger lazy load + reveal
  await evalJs(`(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 500) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise(r => setTimeout(r, 120)); } })()`);
  await sleep(900);
  const imgs = await evalJs(`(() => {
    const ps = [...document.querySelectorAll('.cw-person:not(.cw-backdrop) .cw-frame img')];
    return ps.map(img => { const r = img.getBoundingClientRect(); return { src: img.src.split('/').pop(), nw: img.naturalWidth, nh: img.naturalHeight, w: Math.round(r.width), h: Math.round(r.height), fit: getComputedStyle(img).objectFit }; });
  })()`);
  check("5 portraits loaded", imgs.length === 5 && imgs.every((i) => i.nw > 0), imgs.map((i) => i.src + ":" + i.nw).join(","));
  check("desktop portraits contain (no stretch), tall mount", imgs.every((i) => i.fit === "contain" && i.h > i.w), JSON.stringify(imgs.map((i) => [i.w, i.h, i.fit])));
  const revealed = await evalJs(`[...document.querySelectorAll('.cw-card')].every(n => n.classList.contains('is-in') && getComputedStyle(n).opacity === '1')`);
  check("all cards revealed after scroll", revealed === true);

  const cz = await evalJs(`(() => {
    const n = [...document.querySelectorAll('.cw-card')].find(x => x.querySelector('.cw-name').textContent === '崇祯');
    const bg = n.querySelector('.cw-bg');
    return { backdrop: n.classList.contains('cw-backdrop'), src: bg ? bg.src.split('/').pop() : null, loaded: bg ? bg.naturalWidth > 0 : false,
      scrim: !!n.querySelector('.cw-scrim'), note: n.querySelector('.cw-note') ? n.querySelector('.cw-note').textContent : null,
      noPortrait: !n.querySelector('.cw-portrait'), bodyAbove: getComputedStyle(n.querySelector('.cw-body')).position === 'relative' };
  })()`);
  check("chongzhen backdrop card + note", cz.backdrop && cz.src === "05-palace-snow-night.jpg" && cz.loaded && cz.scrim && cz.note === "崇祯无御容传世，以雪夜宫阙代之。" && cz.noPortrait && cz.bodyAbove, JSON.stringify(cz));

  const glyphs = await evalJs(`[...document.querySelectorAll('.cw-glyph')].map(g => [g.textContent, getComputedStyle(g).fontSize, getComputedStyle(g).fontFamily.includes('Serif') || getComputedStyle(g).fontFamily.includes('Song') || getComputedStyle(g).fontFamily.includes('serif')])`);
  check("glyphs 阁/卫/银 at 64px serif", JSON.stringify(glyphs.map((g) => g[0])) === JSON.stringify(["阁", "卫", "银"]) && glyphs.every((g) => g[1] === "64px" && g[2]), JSON.stringify(glyphs));

  // hover feedback
  const hb = await evalJs(`(() => { const r = document.querySelectorAll('.cw-card')[0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40, before: getComputedStyle(document.querySelectorAll('.cw-card')[0]).borderTopColor }; })()`);
  await evalJs(`document.querySelectorAll('.cw-card')[0].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  const hb2 = await evalJs(`(() => { const r = document.querySelectorAll('.cw-card')[0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: hb2.x, y: hb2.y });
  await sleep(400);
  const ha = await evalJs(`getComputedStyle(document.querySelectorAll('.cw-card')[0]).borderTopColor`);
  check("hover border feedback", ha !== hb.before, hb.before + " -> " + ha);

  // screenshots desktop
  await evalJs(`window.scrollTo({ top: 0, behavior: 'instant' })`); await sleep(500);
  let shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/cw-desktop-top.png", Buffer.from(shot.data, "base64"));
  await evalJs(`(() => { const n = [...document.querySelectorAll('.cw-card')].find(x => x.querySelector('.cw-name').textContent === '崇祯'); n.scrollIntoView({ block: 'center', behavior: 'instant' }); })()`);
  await sleep(500);
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/cw-chongzhen.png", Buffer.from(shot.data, "base64"));
  await evalJs(`document.querySelectorAll('.cw-group')[1].scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(500);
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/cw-institutions.png", Buffer.from(shot.data, "base64"));

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  const ov = await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : null`);
  check("mobile no horizontal overflow", ov === null, String(ov));
  const mob = await evalJs(`(() => {
    const n = document.querySelectorAll('.cw-person')[0];
    const f = n.querySelector('.cw-frame').getBoundingClientRect();
    const b = n.querySelector('.cw-body').getBoundingClientRect();
    const c = n.getBoundingClientRect();
    return { fh: Math.round(f.height), fw: Math.round(f.width), cw: Math.round(c.width), fit: getComputedStyle(n.querySelector('.cw-frame img')).objectFit, above: f.bottom <= b.top + 1,
      instCols: getComputedStyle(document.querySelector('.cw-institutions')).gridTemplateColumns.split(' ').length };
  })()`);
  check("mobile portrait 180px cover above text", Math.abs(mob.fh - 180) <= 2 && mob.fit === "cover" && mob.above, JSON.stringify(mob));
  check("mobile portrait mount spans card width", mob.fw >= mob.cw - 30, JSON.stringify([mob.fw, mob.cw]));
  check("mobile institutions single column", mob.instCols === 1, String(mob.instCols));
  await evalJs(`document.querySelectorAll('.cw-person')[0].scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(500);
  shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/cw-mobile.png", Buffer.from(shot.data, "base64"));

  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await nav("http://127.0.0.1:4173/quiz.html");
  check("quiz still placeholder", (await evalJs(`!!document.querySelector('.placeholder-badge')`)) === true);
  check("zero console/runtime errors", errors.length === 0, errors.join(" | "));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} PASS`);
  for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + "  " + r.name + (r.ok ? "" : "  " + (r.extra || "")));
  ws.close(); chrome.kill(); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });