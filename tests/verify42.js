const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9304;
const DIR = __dirname;
const BASE = "http://127.0.0.1:4173";
const FULL = { 太祖: "朱元璋", 惠宗: "朱允炆", 成祖: "朱棣", 仁宗: "朱高炽", 宣宗: "朱瞻基", 英宗: "朱祁镇", 代宗: "朱祁钰", 宪宗: "朱见深", 孝宗: "朱祐樘", 武宗: "朱厚照", 世宗: "朱厚熜", 穆宗: "朱载坖", 神宗: "朱翊钧", 光宗: "朱常洛", 熹宗: "朱由校", 思宗: "朱由检" };
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud60`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const excs = []; const errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(2000); };

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
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

  // 1) row labels: two-line emperors, single chief/guest
  await nav(BASE + "/relations.html");
  const labels = await evalJs(`(() => ({
    emperors: [...document.querySelectorAll('.rl-lane-emperor .rl-person')].map(n => ({ name: n.querySelector('.rl-person-name') ? n.querySelector('.rl-person-name').textContent : null, full: n.querySelector('.rl-person-full') ? n.querySelector('.rl-person-full').textContent : null })),
    chiefs: [...document.querySelectorAll('.rl-lane-chief .rl-person')].map(n => ({ text: n.textContent, twoLine: !!n.querySelector('.rl-person-full') })),
    guests: [...document.querySelectorAll('.rl-lane-guest .rl-person')].map(n => ({ text: n.textContent, twoLine: !!n.querySelector('.rl-person-full') })),
    barLabels: [...document.querySelectorAll('.rl-bar-emperor .rl-bar-label')].every(l => !l.textContent.includes('朱')),
    rowH: getComputedStyle(document.querySelector('.rl-lane-emperor .rl-row')).height,
    chiefRowH: getComputedStyle(document.querySelector('.rl-lane-chief .rl-row')).height
  }))()`);
  const wantEmperors = await evalJs(`SITE_DATA.relations.emperors.map(e => ({ name: e.name, full: e.fullName }))`);
  check("17 emperor labels two-line with exact fullNames", JSON.stringify(labels.emperors) === JSON.stringify(wantEmperors) && labels.emperors.length === 17, JSON.stringify(labels.emperors.slice(0, 3)));
  check("chief/guest labels unchanged single-line", labels.chiefs.length === 20 && labels.guests.length === 16 && labels.chiefs.every(c => !c.twoLine) && labels.guests.every(g => !g.twoLine) && labels.chiefs.some(c => c.text === "夏言"), JSON.stringify([labels.chiefs.length, labels.guests.length]));
  check("bar short labels stay temple-name only", labels.barLabels === true, labels.barLabels);
  check("emperor rows taller, chief rows unchanged", labels.rowH === "40px" && labels.chiefRowH === "26px", JSON.stringify([labels.rowH, labels.chiefRowH]));

  // 2) desktop geometry: no overflow, bar positions intact
  const geo = await evalJs(`(() => {
    const chart = document.querySelector('.rl-chart');
    const bars = [...document.querySelectorAll('.rl-bar-emperor')];
    const first = bars[0];
    return { docW: document.documentElement.scrollWidth, chartW: Math.round(chart.getBoundingClientRect().width), bars: bars.length, firstLeft: first.style.left, firstWidth: first.style.width, nameW: getComputedStyle(document.querySelector('.rl-name-cell')).width };
  })()`);
  check("desktop: no overflow, 17 bars, positions intact", geo.docW <= 1280 && geo.chartW >= 900 && geo.bars === 17 && geo.firstLeft === "0%" && geo.nameW === "92px", JSON.stringify(geo));

  // 3) every emperor popup: title + 年号 row
  const cards = await evalJs(`(() => {
    const out = [];
    const rows = [...document.querySelectorAll('.rl-lane-emperor .rl-row')];
    for (const row of rows) {
      row.querySelector('.rl-bar').click();
      out.push({ name: document.querySelector('.rl-card-name').textContent, first: [document.querySelector('.rl-card-row .rl-card-label').textContent, document.querySelector('.rl-card-row .rl-card-value').textContent] });
      document.querySelector('.rl-close').click();
    }
    return out;
  })()`);
  const wantCards = wantEmperors.map((e, i) => ({ name: e.name + "（" + e.full + "）" }));
  const eraOk = await evalJs(`SITE_DATA.relations.emperors.map(e => e.era)`);
  check("all 17 emperor popups: title（本名）+ 年号 row", cards.every((c, i) => c.name === wantCards[i].name && c.first[0] === "年号" && c.first[1] === eraOk[i]), JSON.stringify(cards.slice(0, 3)));

  // 4) chief/guest popups unchanged
  const others = await evalJs(`(() => {
    const out = {};
    const xia = [...document.querySelectorAll('.rl-lane-chief .rl-row')].find(r => r.querySelector('.rl-person').textContent === '夏言');
    xia.querySelector('.rl-bar').click();
    out.chief = { name: document.querySelector('.rl-card-name').textContent, first: [document.querySelector('.rl-card-row .rl-card-label').textContent, document.querySelector('.rl-card-row .rl-card-value').textContent] };
    document.querySelector('.rl-close').click();
    const yu = [...document.querySelectorAll('.rl-lane-guest .rl-row')].find(r => r.querySelector('.rl-person').textContent === '于谦');
    yu.querySelector('.rl-bar').click();
    out.guest = { name: document.querySelector('.rl-card-name').textContent, first: [document.querySelector('.rl-card-row .rl-card-label').textContent, document.querySelector('.rl-card-row .rl-card-value').textContent] };
    document.querySelector('.rl-close').click();
    return out;
  })()`);
  check("chief/guest popups unchanged (身份 label)", others.chief.name === "夏言" && others.chief.first[0] === "身份" && others.chief.first[1] === "内阁首辅" && others.guest.name === "于谦" && others.guest.first[0] === "身份" && others.guest.first[1] === "兵部尚书", JSON.stringify(others));

  // 5) chief deep link unchanged
  await nav(BASE + "/relations.html?person=" + encodeURIComponent("解缙") + "&kind=chief");
  const deep = await evalJs(`(() => { const o = document.querySelector('.rl-overlay'); return { open: !o.hidden, name: o.querySelector('.rl-card-name') ? o.querySelector('.rl-card-name').textContent : null, firstLabel: o.querySelector('.rl-card-row .rl-card-label') ? o.querySelector('.rl-card-row .rl-card-label').textContent : null }; })()`);
  check("chief deep link unchanged", deep.open && deep.name === "解缙" && deep.firstLabel === "身份", JSON.stringify(deep));

  // 6) 390px: two-line labels, no overflow, bars not squeezed
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/relations.html");
  const mob = await evalJs(`(() => {
    const full = document.querySelector('.rl-lane-emperor .rl-person-full');
    const fr = full.getBoundingClientRect();
    const nameCell = document.querySelector('.rl-lane-emperor .rl-name-cell');
    const sc = document.querySelector('.rl-scroll');
    return { docW: document.documentElement.scrollWidth, fullVisible: fr.height > 0 && fr.width > 0, fullRight: Math.round(fr.right), cellRight: Math.round(nameCell.getBoundingClientRect().right), cellW: Math.round(nameCell.getBoundingClientRect().width), chartMin: Math.round(document.querySelector('.rl-chart').getBoundingClientRect().width), scrollable: sc.scrollWidth > sc.clientWidth, fullText: full.textContent };
  })()`);
  check("390px: two-line labels fit name column, page no overflow", mob.docW <= 390 && mob.fullVisible && mob.fullRight <= mob.cellRight + 1 && mob.chartMin >= 900 && mob.scrollable && mob.fullText === "朱元璋", JSON.stringify(mob));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify42 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(1); });