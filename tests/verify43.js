const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9305;
const DIR = __dirname;
const BASE = "http://127.0.0.1:4173";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud61`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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

  // 1) guest lane structure
  await nav(BASE + "/relations.html");
  const lane = await evalJs(`(() => {
    const rows = [...document.querySelectorAll('.rl-lane-guest .rl-row')];
    const names = rows.map(r => r.querySelector('.rl-person').textContent);
    const lichengliang = rows.find(r => r.querySelector('.rl-person').textContent === '李成梁');
    const bars = [...lichengliang.querySelectorAll('.rl-bar')].map(b => ({ left: b.style.left, width: b.style.width }));
    const xuxiake = rows[rows.length - 1];
    const xbar = xuxiake.querySelector('.rl-bar');
    const xs = getComputedStyle(xbar);
    const other = rows[0].querySelector('.rl-bar');
    const os = getComputedStyle(other);
    return {
      count: rows.length, names,
      countText: document.querySelector('.rl-lane-guest .rl-lane-count').textContent,
      bars,
      civilian: { cls: xbar.className.includes('is-civilian'), border: xs.borderTopStyle, bg: xs.backgroundColor, otherBg: os.backgroundColor, otherCls: other.className.includes('is-civilian') },
      legend: document.querySelector('.rl-legend-note').textContent,
      civilianCount: document.querySelectorAll('.rl-bar-guest.is-civilian').length
    };
  })()`);
  check("guest lane 16 rows, six generals first, 徐霞客 last", lane.count === 16 && JSON.stringify(lane.names.slice(0, 6)) === JSON.stringify(["徐达", "常遇春", "李文忠", "冯胜", "傅友德", "蓝玉"]) && lane.names[15] === "徐霞客", JSON.stringify(lane.names));
  check("lane count text 16 人任职", lane.countText === "16 人任职", lane.countText);
  const pct = (y) => ((y - 1368) / (1644 - 1368)) * 100;
  const wantBars = [[1570, 1591], [1601, 1608]].map(([a, b]) => ({ left: pct(a), width: Math.max(pct(b) - pct(a), 0.45) }));
  const barsOk = lane.bars.length === 2 && lane.bars.every((b, i) => Math.abs(parseFloat(b.left) - wantBars[i].left) < 0.001 && Math.abs(parseFloat(b.width) - wantBars[i].width) < 0.001);
  check("李成梁 two segments positioned by year", barsOk, JSON.stringify(lane.bars));
  check("徐霞客 civilian bar distinct (dashed + different hue), only one", lane.civilian.cls && lane.civilian.border === "dashed" && lane.civilian.bg !== lane.civilian.otherBg && !lane.civilian.otherCls && lane.civilianCount === 1, JSON.stringify(lane.civilian));
  check("legend note carries civilian sentence", lane.legend === "特邀：不走内阁线的统兵重臣，及一位布衣旅行家。官职以小卡为准。", lane.legend);

  // 2) all 16 guest popups verbatim office/tenure/end
  const cards = await evalJs(`(() => {
    const out = [];
    for (const row of document.querySelectorAll('.rl-lane-guest .rl-row')) {
      row.querySelector('.rl-bar').click();
      const rows = [...document.querySelectorAll('.rl-card-row')].map(r => [r.querySelector('.rl-card-label').textContent, r.querySelector('.rl-card-row, .rl-card-value') ? r.querySelector('.rl-card-value').textContent : '']);
      out.push({ name: document.querySelector('.rl-card-name').textContent, rows });
      document.querySelector('.rl-close').click();
    }
    return out;
  })()`);
  const want = await evalJs(`SITE_DATA.relations.guests.map(g => ({ name: g.name, office: g.office, tenure: g.segments.map(s => s[0] + '–' + s[1]).join('、'), end: g.end }))`);
  const cardsOk = cards.every((c, i) => c.name === want[i].name && c.rows[0][0] === "身份" && c.rows[0][1] === want[i].office && c.rows[1][0] === "任期" && c.rows[1][1] === want[i].tenure && c.rows[4][0] === "结局" && c.rows[4][1] === want[i].end);
  check("16 guest popups: office/任期/结局 verbatim, 身份 label kept", cardsOk, JSON.stringify(cards.filter((c, i) => !(c.name === want[i].name && c.rows[0][1] === want[i].office)).slice(0, 2)));

  // 3) index 107 in page
  const idxLen = await evalJs(`SEARCH_INDEX.length`);
  check("SEARCH_INDEX total 107 in page", idxLen === 107, idxLen);

  // 4) search hits + deep links for three new names
  for (const name of ["徐达", "李成梁", "徐霞客"]) {
    await nav(BASE + "/search.html");
    const hit = await evalJs(`(() => { const i = document.querySelector('.sr-input'); i.value = ${JSON.stringify(name)}; document.querySelector('.sr-form').dispatchEvent(new Event('submit', { cancelable: true })); const cards = [...document.querySelectorAll('.sr-card')]; const rel = cards.find(c => c.querySelector('.sr-kind').textContent.startsWith('关系表') && c.textContent.includes(${JSON.stringify(name)})); return rel ? { href: rel.getAttribute('href') } : null; })()`);
    check("search " + name + " hits new relation entry", !!hit && hit.href === "relations.html?person=" + name + "&kind=guest", JSON.stringify(hit));
    if (hit) {
      await nav(BASE + "/" + hit.href);
      const card = await evalJs(`(() => { const o = document.querySelector('.rl-overlay'); return { open: !o.hidden, name: o.querySelector('.rl-card-name') ? o.querySelector('.rl-card-name').textContent : null, office: o.querySelector('.rl-card-row .rl-card-value') ? o.querySelector('.rl-card-row .rl-card-value').textContent : null }; })()`);
      const g = want.find(w => w.name === name);
      check(name + " deep link opens correct guest card", card.open && card.name === name && card.office === g.office, JSON.stringify(card));
    }
  }

  // 5) 390px
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/relations.html");
  const mob = await evalJs(`(() => ({ docW: document.documentElement.scrollWidth, count: document.querySelector('.rl-lane-guest .rl-lane-count').textContent, rows: document.querySelectorAll('.rl-lane-guest .rl-row').length, civilian: !!document.querySelector('.rl-bar-guest.is-civilian') }))()`);
  check("390px: no overflow, 16 rows, count 16, civilian bar present", mob.docW <= 390 && mob.count === "16 人任职" && mob.rows === 16 && mob.civilian, JSON.stringify(mob));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify43 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(1); });