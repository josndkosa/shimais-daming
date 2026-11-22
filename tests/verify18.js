const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9258;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud20`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const pickKey = (k) => evalJs(`(() => { const box = document.querySelector('.ql-scene'); if (!box) return false; const btn = [...box.querySelectorAll('.ql-choice')].find(b => b.querySelector('.ql-key').textContent === '${k}'); if (!btn || btn.disabled) return false; btn.click(); return true; })()`);
const nextClick = () => evalJs(`(() => { const n = document.querySelector('.ql-next'); if (n && !n.hidden) { n.click(); return true; } return false; })()`);
const endingState = () => evalJs(`(() => { const e = document.querySelector('.ql-ending'); return e ? { title: e.querySelector('.ql-ending-title').textContent, text: e.querySelector('.ql-ending-text').textContent, closure: e.querySelector('.ql-closure-p').textContent } : null; })()`);
const labels = () => evalJs(`[...document.querySelectorAll('.ql-stat-label')].map(x => x.textContent)`);
async function restart(cardIdx) {
  const hasEnd = await evalJs(`!!document.querySelector('.ql-ending')`);
  if (hasEnd) await evalJs(`document.querySelector('.ql-again').click()`);
  else await evalJs(`document.querySelectorAll('.ql-card')[${cardIdx}].querySelector('.ql-play-btn').click()`);
  await sleep(400);
}
async function walk(keys) {
  for (const k of keys) {
    if (await evalJs(`!!document.querySelector('.ql-ending')`)) break;
    const ok = await pickKey(k);
    if (!ok) break;
    await sleep(220);
    if (await evalJs(`!!document.querySelector('.ql-ending')`)) break;
    await nextClick();
    await sleep(220);
  }
  await nextClick();
  await sleep(350);
  return endingState();
}
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
  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/qinli.html");

  const struct = await evalJs(`(() => {
    const ids = ['q1380', 'q1402'];
    return ids.map(id => { const s = SITE_DATA.qinli.find(x => x.id === id); return { id, playable: s.playable, meters: s.meterLabels, scenes: s.scenes.length, choices: s.scenes.map(sc => sc.choices.length), effects: s.scenes.every(sc => sc.choices.every(c => c.effect && Number.isInteger(c.effect.prestige) && Number.isInteger(c.effect.morale))), endings: s.endings.map(e => e.id), special: s.scenes.flatMap(sc => sc.choices.filter(c => c.ending || c.judge).map(c => [sc.n, c.key, c.ending || 'judge'])) }; });
  })()`);
  check("both stories: playable, 8 scenes x3 choices, integer effects, 3 endings, specials encoded", struct.every(s => s.playable && s.scenes === 8 && s.choices.every(n => n === 3) && s.effects && s.endings.length === 3) && JSON.stringify(struct[0].special) === JSON.stringify([]) && JSON.stringify(struct[1].special) === JSON.stringify([[6, "C", "judge"], [7, "C", "martyr"]]), JSON.stringify(struct));
  const cards = await evalJs(`[...document.querySelectorAll('.ql-card')].map(c => ({ year: c.querySelector('.ql-year').textContent, locked: c.classList.contains('is-locked') }))`);
  check("cards: all six unlocked", JSON.stringify(cards.map(c => c.locked)) === JSON.stringify([false, false, false, false, false, false]), JSON.stringify(cards));

  // meter labels per story
  await evalJs(`document.querySelectorAll('.ql-card')[1].querySelector('.ql-play-btn').click()`); await sleep(400);
  const l1402 = await labels();
  await restart(1);
  await evalJs(`document.querySelectorAll('.ql-card')[0].querySelector('.ql-play-btn').click()`); await sleep(400);
  const l1380 = await labels();
  await restart(0);
  await evalJs(`document.querySelectorAll('.ql-card')[2].querySelector('.ql-play-btn').click()`); await sleep(400);
  const l1449 = await labels();
  check("meter labels: 1402 士节/生机, 1380 圣眷/清名, 1449 朝议声望/京师军心", JSON.stringify(l1402) === JSON.stringify(["士节", "生机"]) && JSON.stringify(l1380) === JSON.stringify(["圣眷", "清名"]) && JSON.stringify(l1449) === JSON.stringify(["朝议声望", "京师军心"]), JSON.stringify([l1402, l1380, l1449]));
  await shot("qinli-meters-1449");

  // q1402 endings
  const E1402 = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1402').endings`);
  await restart(2);
  await evalJs(`document.querySelectorAll('.ql-card')[1].querySelector('.ql-play-btn').click()`); await sleep(400);
  const m1 = await walk(["A", "A", "A", "A", "A", "A", "C"]);
  check("1402 scene7 C direct 殉节 · 青史之名", m1 && m1.title === E1402[0].title && m1.text === E1402[0].text && m1.closure === E1402[0].closure, JSON.stringify(m1 && m1.title));
  await restart(1);
  const m2 = await walk(["C", "C", "A", "B", "C", "C"]);
  const noScene7 = await evalJs(`!document.querySelector('.ql-scene')`);
  check("1402 scene6 C skips scene7 into judgment (exile by morale)", m2 && m2.title === E1402[1].title && noScene7, JSON.stringify([m2 && m2.title, noScene7]));
  await restart(1);
  const m3 = await walk(["B", "B", "A", "B", "A", "A", "A", "C"]);
  check("1402 full walk middle path -> 新朝 · 永乐臣子", m3 && m3.title === E1402[2].title && m3.text === E1402[2].text, JSON.stringify(m3 && m3.title));
  await restart(1);
  const m4 = await walk(["A", "A", "B", "A", "B", "A", "A", "B"]);
  check("1402 full walk high 士节 -> 殉节 by stats", m4 && m4.title === E1402[0].title, JSON.stringify(m4 && m4.title));
  await restart(1);
  const m5 = await walk(["C", "C", "A", "B", "C", "B", "B", "A"]);
  check("1402 full walk high 生机 -> 出亡 · 人间蒸发", m5 && m5.title === E1402[1].title && m5.closure === E1402[1].closure, JSON.stringify(m5 && m5.title));
  await shot("qinli-1402-ending");

  // q1380 endings
  const E1380 = await evalJs(`SITE_DATA.qinli.find(s => s.id === 'q1380').endings`);
  await restart(1);
  await evalJs(`document.querySelectorAll('.ql-card')[0].querySelector('.ql-play-btn').click()`); await sleep(400);
  const p1 = await walk(["C", "B", "B", "A", "B", "B", "A", "B"]);
  check("1380 low 圣眷 -> 诛连 · 名单中人", p1 && p1.title === E1380[0].title && p1.text === E1380[0].text, JSON.stringify(p1 && p1.title));
  await restart(0);
  const p2 = await walk(["C", "B", "C", "C", "C", "A", "B", "A"]);
  check("1380 high 清名 -> 青史 · 清名之臣", p2 && p2.title === E1380[1].title && p2.closure === E1380[1].closure, JSON.stringify(p2 && p2.title));
  await restart(0);
  const p3 = await walk(["B", "B", "C", "C", "C", "B", "A", "B"]);
  check("1380 middle -> 幸存 · 沉默的大多数", p3 && p3.title === E1380[2].title && p3.text === E1380[2].text, JSON.stringify(p3 && p3.title));
  // 6C flag + refresh persistence
  await restart(0);
  for (const k of ["A", "C", "C", "C", "C", "C"]) { await pickKey(k); await sleep(200); await nextClick(); await sleep(200); }
  const curFlag = await evalJs(`JSON.parse(localStorage.getItem('${KEY}')).qinli.current`);
  await nav("http://127.0.0.1:4173/qinli.html");
  const resumedLabel = await evalJs(`document.querySelector('.ql-scene-label').textContent`);
  const p4 = await walk(["C", "C"]);
  check("1380 6C flag persists refresh; 圣眷35<40 -> 诛连", curFlag.sixC === true && resumedLabel.includes("第七场") && p4 && p4.title === E1380[0].title, JSON.stringify([curFlag, resumedLabel, p4 && p4.title]));
  const done = await evalJs(`JSON.parse(localStorage.getItem('${KEY}')).qinli.done`);
  const badges = await evalJs(`[...document.querySelectorAll('.ql-card')].slice(0, 3).map(c => c.querySelector('.ql-done').hidden ? null : c.querySelector('.ql-done').textContent)`);
  check("done contains both new ids + badges 已亲历", done.includes("q1380") && done.includes("q1402") && JSON.stringify(badges) === JSON.stringify(["已亲历", "已亲历", null]), JSON.stringify([done, badges]));

  // cross-page invariants
  await nav("http://127.0.0.1:4173/decisions.html");
  const dec = await evalJs(`(() => ({ sc: document.querySelectorAll('.dc-scenario').length, entry: !!document.querySelector('.ql-entry-link'), cards: document.querySelectorAll('.ql-card').length }))()`);
  await nav("http://127.0.0.1:4173/index.html");
  const ent = await evalJs(`document.querySelectorAll('.entry-block').length`);
  const nav9 = await evalJs(`[...document.querySelectorAll('.nav-link')].map(a => a.querySelector('.nav-full').textContent)`);
  await nav("http://127.0.0.1:4173/profile.html"); await sleep(400);
  const pf = await evalJs(`[...document.querySelectorAll('.pf-count')].map(x => x.textContent)`);
  check("decisions 3 scenarios+entry only; homepage 6; nav 9; profile X/6", dec.sc === 3 && dec.entry && dec.cards === 0 && ent === 6 && nav9.length === 10 && pf[2].endsWith("/ 6"), JSON.stringify([dec, ent, nav9.length, pf]));

  // mobile judge path
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`document.querySelectorAll('.ql-card')[1].querySelector('.ql-play-btn').click()`); await sleep(400);
  const m6 = await walk(["C", "C", "A", "B", "C", "C"]);
  const mobOv = await evalJs(`document.documentElement.scrollWidth - window.innerWidth`);
  check("mobile 1402 judge path completes, no overflow", m6 && m6.title === "出亡 · 人间蒸发" && mobOv <= 0, JSON.stringify([m6 && m6.title, mobOv]));
  await shot("qinli-1402-mobile");

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });