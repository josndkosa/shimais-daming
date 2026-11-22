const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9312;
const DIR = __dirname;
const URL = "http://127.0.0.1:4173/relations.html";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud49`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1100); };
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const clickSel = (sel) => evalJs(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (n) { n.click(); return true; } return false; })()`);
const modeState = () => evalJs(`(() => {
  const btns = [...document.querySelectorAll('.rl-mode')].map(b => [b.textContent, b.classList.contains('is-on'), b.getAttribute('aria-pressed')]);
  const legendItems = [...document.querySelectorAll('.rl-legend-item .rl-legend-label')].map(x => x.textContent);
  const note = document.querySelector('.rl-legend-note') ? document.querySelector('.rl-legend-note').textContent : null;
  const endBars = document.querySelectorAll('.rl-bar[class*="rl-end-"]').length;
  return { btns, legendItems, note, endBars, totalBars: document.querySelectorAll('.rl-bar').length };
})()`);
const barSnap = () => evalJs(`JSON.stringify([...document.querySelectorAll('.rl-bar')].map(b => {
  const cs = getComputedStyle(b);
  return { a: b.getAttribute('aria-label'), c: b.className, bg: cs.backgroundColor, bi: cs.backgroundImage, bs: cs.borderStyle, left: b.style.left, width: b.style.width };
}))`);
const legendSnap = () => evalJs(`document.querySelector('.rl-legend').innerHTML`);
const barByName = (name) => evalJs(`(() => {
  const b = [...document.querySelectorAll('.rl-bar')].find(x => x.getAttribute('aria-label').startsWith(${JSON.stringify(name)} + ' '));
  if (!b) return null; const cs = getComputedStyle(b);
  return { c: b.className, bg: cs.backgroundColor, bi: cs.backgroundImage, bs: cs.borderStyle };
})()`);
const popupEnd = (name) => evalJs(`(() => {
  const b = [...document.querySelectorAll('.rl-bar')].find(x => x.getAttribute('aria-label').startsWith(${JSON.stringify(name)} + ' '));
  if (!b) return { err: 'no bar' }; b.click();
  const row = document.querySelector('.rl-card-endtype');
  const out = row ? { label: row.querySelector('.rl-card-label').textContent, value: row.querySelector('.rl-card-value').textContent } : { err: 'no row' };
  const close = document.querySelector('.rl-close'); if (close) close.click();
  return out;
})()`);

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
  await nav(URL);

  // default tenure
  let st = await modeState();
  check("default tenure: two buttons, tenure on, no end bars, 3-item legend", st.btns.length === 2 && st.btns[0][0] === "按任期看" && st.btns[0][1] === true && st.btns[1][1] === false && st.endBars === 0 && st.totalBars === 62 && st.legendItems.length === 3 && st.note === "特邀：不走内阁线的统兵重臣，及一位布衣旅行家。官职以小卡为准。", JSON.stringify(st));
  const baseBars = await barSnap();
  const baseLegend = await legendSnap();
  const civTenure = await barByName("徐霞客");
  check("tenure 徐霞客 keeps AY civilian dashed style", civTenure.c.includes("is-civilian") && !civTenure.c.includes("rl-end-") && civTenure.bs === "dashed", JSON.stringify(civTenure));
  await shot("bc-tenure");

  // popup category in tenure mode
  let pe = await popupEnd("严嵩");
  check("tenure popup carries 结局类别：非命", pe.label === "结局类别" && pe.value === "非命", JSON.stringify(pe));

  // switch to end mode
  await clickSel(".rl-mode:nth-child(2)");
  st = await modeState();
  check("end mode: end button on, all 62 segment bars colored, 5-item legend with counts", st.btns[1][1] === true && st.btns[0][1] === false && st.endBars === 62 && JSON.stringify(st.legendItems) === JSON.stringify(["善终 23", "罢黜 8", "非命 10", "战殁殉国 5", "特殊存疑 7"]) && st.note === "结局按本人离世或最终处境归类，不计身后事。徐霞客保留布衣虚线标识，按善终染色。", JSON.stringify(st));
  const shan = await barByName("太祖");
  const bazhu = await barByName("陈循");
  const feiming = await barByName("解缙");
  const zhanshang = await barByName("思宗");
  const teshu = await barByName("惠宗");
  check("end colors: shan gold", shan.bg === "rgb(176, 141, 79)", JSON.stringify(shan));
  check("end colors: bazhu gray-blue", bazhu.bg === "rgb(125, 140, 163)", JSON.stringify(bazhu));
  check("end colors: feiming vermilion", feiming.bg === "rgb(192, 73, 47)", JSON.stringify(feiming));
  check("end colors: zhanshang deep ochre-red", zhanshang.bg === "rgb(124, 58, 45)", JSON.stringify(zhanshang));
  check("end colors: teshu hatch + dashed", teshu.bi.includes("repeating-linear-gradient") && teshu.bs === "dashed", JSON.stringify(teshu));
  const civEnd = await barByName("徐霞客");
  check("end 徐霞客: shan gold fill + civilian dashed border kept", civEnd.c.includes("is-civilian") && civEnd.c.includes("rl-end-shan") && civEnd.bg === "rgb(176, 141, 79)" && civEnd.bs === "dashed", JSON.stringify(civEnd));
  await shot("bc-end");

  // popup category in end mode (emperor + guest)
  pe = await popupEnd("思宗");
  check("end popup emperor 思宗 → 战殁殉国", pe.value === "战殁殉国", JSON.stringify(pe));
  pe = await popupEnd("徐霞客");
  check("end popup guest 徐霞客 → 善终", pe.value === "善终", JSON.stringify(pe));

  // switch back to tenure: pixel-identical bars + legend
  await clickSel(".rl-mode:nth-child(1)");
  const backBars = await barSnap();
  const backLegend = await legendSnap();
  check("back to tenure: bars pixel-identical to baseline", backBars === baseBars, "bar snapshot differs");
  check("back to tenure: legend identical to baseline", backLegend === baseLegend, "legend differs");
  const civBack = await barByName("徐霞客");
  check("back to tenure: 徐霞客 AY style restored", civBack.c.includes("is-civilian") && !civBack.c.includes("rl-end-") && civBack.bs === "dashed" && civBack.bg === civTenure.bg, JSON.stringify(civBack));

  // mode not persisted: reload returns to tenure
  await clickSel(".rl-mode:nth-child(2)");
  await nav(URL);
  st = await modeState();
  check("reload resets to tenure (not persisted)", st.btns[0][1] === true && st.endBars === 0, JSON.stringify(st.btns));

  // mobile 390px
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav(URL);
  let mob = await evalJs(`(() => ({ docW: document.documentElement.scrollWidth, modes: document.querySelectorAll('.rl-mode').length, legend: document.querySelectorAll('.rl-legend-item').length }))()`);
  check("mobile tenure: no overflow, modes + legend present", mob.docW <= 390 && mob.modes === 2 && mob.legend === 3, JSON.stringify(mob));
  await clickSel(".rl-mode:nth-child(2)");
  mob = await evalJs(`(() => ({ docW: document.documentElement.scrollWidth, legend: document.querySelectorAll('.rl-legend-item').length, endBars: document.querySelectorAll('.rl-bar[class*="rl-end-"]').length }))()`);
  check("mobile end: no overflow, 5 legend items, 62 colored bars", mob.docW <= 390 && mob.legend === 5 && mob.endBars === 62, JSON.stringify(mob));
  await shot("bc-end-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });