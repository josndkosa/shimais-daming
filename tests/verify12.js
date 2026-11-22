const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9252;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud14`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const NAVORDER = ["首页", "时间线", "帝王首辅", "决策模式", "亲历", "人物与制度卡", "史料检索", "人物对话", "小测", "研读画像"];
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
  const pages = ["index.html", "timeline.html", "relations.html", "decisions.html", "qinli.html", "cards.html", "chat.html", "quiz.html", "profile.html"];

  // 导航七项顺序（七页一致）
  let navOk = true; const navDetail = [];
  for (const f of pages) {
    await nav("http://127.0.0.1:4173/" + f);
    const q = await evalJs(`(() => ({ items: [...document.querySelectorAll('.nav-link')].map(a => a.querySelector('.nav-full').textContent), hrefs: [...document.querySelectorAll('.nav-link')].map(a => a.getAttribute('href')), cur: document.querySelector('.nav-link.is-current .nav-full').textContent }))()`);
    navDetail.push([f, q.cur]);
    if (JSON.stringify(q.items) !== JSON.stringify(NAVORDER) || q.hrefs[2] !== "relations.html") navOk = false;
    if (f === "relations.html" && q.cur !== "帝王首辅") navOk = false;
  }
  check("nav 7 items in required order on all 7 pages, relations current on its page", navOk, JSON.stringify(navDetail));

  // 首页目录与画像口径不受影响
  await nav("http://127.0.0.1:4173/index.html");
  const ent = await evalJs(`[...document.querySelectorAll('.entry-block .entry-title')].map(x => x.textContent)`);
  check("homepage catalog 6 modules numbered, no relations", ent.length === 6 && ent.includes("人物对话") && !ent.includes("帝王首辅"), JSON.stringify(ent));
  await evalJs(`localStorage.setItem('${KEY}', JSON.stringify({ timeline: { read: ['e1368', 'e1380'] }, decisions: { done: ['d1380'], picks: { d1380: 'B' } }, quiz: { picks: [1,1,2,1,0,1,2,0,2,1], score: 10, dims: { timeline: { hit: 4, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 3, total: 3 } } } }))`);
  const before = await evalJs(`localStorage.getItem('${KEY}')`);
  await nav("http://127.0.0.1:4173/profile.html"); await sleep(600);
  const pf = await evalJs(`(() => ({ counts: [...document.querySelectorAll('.pf-count')].map(x => x.textContent), hasRel: document.getElementById('app').textContent.includes('帝王首辅'), after: localStorage.getItem('${KEY}') }))()`);
  check("profile stats unchanged (2/23, 1/3), no relations counted, read-only", JSON.stringify(pf.counts) === JSON.stringify(["2 / 23", "1 / 3", "0 / 6", "4 / 6"]) && !pf.hasRel && pf.after === before, JSON.stringify(pf));

  // relations 页结构
  await nav("http://127.0.0.1:4173/relations.html");
  const st = await evalJs(`(() => {
    const ticks = [...document.querySelectorAll('.rl-tick')].map(t => t.textContent);
    const lanes = [...document.querySelectorAll('.rl-lane')];
    const bars = (k) => document.querySelectorAll('.rl-bar-' + k).length;
    const rows = (k) => document.querySelectorAll('.rl-lane-' + k + ' .rl-row').length;
    const xiayan = [...document.querySelectorAll('.rl-lane-chief .rl-row')].find(r => r.querySelector('.rl-person').textContent === '夏言');
    const segs = [...xiayan.querySelectorAll('.rl-bar')].map(b => ({ l: b.style.left, w: b.style.width }));
    const gap = document.querySelector('.rl-lane-chief .rl-gap');
    const gr = gap.getBoundingClientRect(); const lr = document.querySelector('.rl-lane-chief').getBoundingClientRect();
    return {
      head: document.querySelector('.head-title').textContent, hint: document.querySelector('.head-hint').textContent,
      legendNote: document.querySelector('.rl-legend-note').textContent,
      ticks, eBars: bars('emperor'), cBars: bars('chief'), gBars: bars('guest'), eRows: rows('emperor'), cRows: rows('chief'), gRows: rows('guest'),
      segs, gapText: gap.querySelector('.rl-gap-text').textContent, gapSpan: Math.abs(gr.top - lr.top) < 2 && Math.abs(gr.bottom - lr.bottom) < 2,
      colors: ['emperor', 'chief', 'guest'].map(k => getComputedStyle(document.querySelector('.rl-bar-' + k)).backgroundColor),
      counts: [...document.querySelectorAll('.rl-lane-count')].map(x => x.textContent),
    };
  })()`);
  const tickExpect = []; for (let y = 1368; y <= 1644; y += 20) tickExpect.push(String(y)); tickExpect.push("1644");
  check("head/legend verbatim + 20y ticks 1368..1628+1644", st.head === "帝王 · 首辅 · 统兵重臣" && st.hint === "三条线，看清 276 年的权力结构" && st.legendNote === "特邀：不走内阁线的统兵重臣，及一位布衣旅行家。官职以小卡为准。" && JSON.stringify(st.ticks) === JSON.stringify(tickExpect), JSON.stringify([st.head, st.ticks]));
  check("lanes: 17 emperor bars / 20 chief rows 27 segs / 16 guest rows 18 segs", st.eBars === 17 && st.eRows === 17 && st.cRows === 20 && st.cBars === 27 && st.gRows === 16 && st.gBars === 18, JSON.stringify([st.eBars, st.cRows, st.cBars, st.gRows, st.gBars]));
  check("xia yan 4 separate segments + multi-seg others not merged", st.segs.length === 4 && new Set(st.segs.map(s => s.l)).size === 4, JSON.stringify(st.segs));
  check("hongwu gap note spans chief lane", st.gapText === "无内阁——废相之后，皇帝直理天下" && st.gapSpan, JSON.stringify([st.gapText, st.gapSpan]));
  const norm = (c) => { const m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)/); return m ? "rgb(" + [m[1], m[2], m[3]].map(x => Math.round(parseFloat(x) * 255)).join(", ") + ")" : c; };
  check("lane colors brass / paper-neutral / sunken red + counts", st.colors[0] === "rgb(176, 141, 79)" && norm(st.colors[1]) === "rgb(133, 132, 131)" && st.colors[2] === "rgb(112, 51, 41)" && JSON.stringify(st.counts) === JSON.stringify(["17 段在位", "20 人任期", "16 人任职"]), JSON.stringify([st.colors, st.counts]));
  const multi = await evalJs(`(() => { const names = ['杨廷和','严嵩','叶向高','周延儒']; const chief = names.map(n => [...document.querySelectorAll('.rl-lane-chief .rl-row')].find(r => r.querySelector('.rl-person').textContent === n).querySelectorAll('.rl-bar').length); const wang = [...document.querySelectorAll('.rl-lane-guest .rl-row')].find(r => r.querySelector('.rl-person').textContent === '王守仁').querySelectorAll('.rl-bar').length; return { chief, wang }; })()`);
  check("yang/yan/ye/zhou 2 segs each, wang shouren 2 segs", JSON.stringify(multi.chief) === JSON.stringify([2, 2, 2, 2]) && multi.wang === 2, JSON.stringify(multi));

  // 吸左姓名列（桌面容器宽于图表无横滚，改在移动端宽度下验证，见下）

  // 小卡：皇帝 / 首辅 / 特邀
  await evalJs(`document.querySelector('.rl-bar-emperor').click()`); await sleep(300);
  const c1 = await evalJs(`(() => ({ hidden: document.querySelector('.rl-overlay').hidden, name: document.querySelector('.rl-card-name').textContent, rows: [...document.querySelectorAll('.rl-card-row')].map(r => [r.querySelector('.rl-card-label').textContent, r.querySelector('.rl-card-value').textContent]) }))()`);
  check("emperor card: era identity + reign years & note + endType", !c1.hidden && c1.name === "太祖（朱元璋）" && JSON.stringify(c1.rows) === JSON.stringify([["年号", "洪武"], ["任期", "1368–1398"], ["在位", "1368–1398 · 开国；1380 年废丞相"], ["结局类别", "善终"]]), JSON.stringify(c1));
  await shot("rel-card-desktop");
  await evalJs(`document.querySelector('.rl-overlay').click()`); await sleep(200);
  const closed1 = await evalJs(`document.querySelector('.rl-overlay').hidden`);
  await evalJs(`[...document.querySelectorAll('.rl-lane-chief .rl-row')].find(r => r.querySelector('.rl-person').textContent === '夏言').querySelector('.rl-bar').click()`); await sleep(300);
  const c2 = await evalJs(`(() => ({ name: document.querySelector('.rl-card-name').textContent, rows: [...document.querySelectorAll('.rl-card-row')].map(r => [r.querySelector('.rl-card-label').textContent, r.querySelector('.rl-card-value').textContent]) }))()`);
  check("chief card: 7 fields + endType, multi-seg tenure joined", c2.name === "夏言" && c2.rows.length === 7 && c2.rows[0][1] === "内阁首辅" && c2.rows[1][1] === "1538–1539、1539–1541、1541–1542、1545–1548" && c2.rows[2][1] === "世宗" && c2.rows[5][1] === "严嵩构陷而死：嘉靖朝首辅的结局，从这里开始变惨。" && c2.rows[6][0] === "结局类别" && c2.rows[6][1] === "非命", JSON.stringify(c2));
  await evalJs(`document.querySelector('.rl-close').click()`); await sleep(200);
  const closed2 = await evalJs(`document.querySelector('.rl-overlay').hidden`);
  await evalJs(`document.querySelector('.rl-bar-guest').click()`); await sleep(300);
  const c3 = await evalJs(`(() => ({ name: document.querySelector('.rl-card-name').textContent, first: document.querySelector('.rl-card-row .rl-card-value').textContent }))()`);
  check("guest card: real office first line; overlay & close button dismiss", c3.name === "徐达" && c3.first === "大将军" && closed1 && closed2, JSON.stringify([c3, closed1, closed2]));
  await evalJs(`document.querySelector('.rl-close').click()`);

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1500, deviceScaleFactor: 1, mobile: false });
  await nav("http://127.0.0.1:4173/relations.html"); await sleep(600);
  await shot("rel-desktop");

  // 移动端：横滚容器 + 底部抽屉
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/relations.html");
  const mob = await evalJs(`(() => { const sc = document.querySelector('.rl-scroll'); const ch = document.querySelector('.rl-chart'); return { sw: sc.scrollWidth, cw: sc.clientWidth, minW: ch.getBoundingClientRect().width, ov: document.documentElement.scrollWidth - window.innerWidth, overflowX: getComputedStyle(sc).overflowX }; })()`);
  check("mobile: chart >=900px in h-scroll container, page no h-overflow", mob.sw >= 900 && mob.minW >= 900 && mob.cw < mob.sw && mob.ov <= 0 && mob.overflowX === "auto", JSON.stringify(mob));
  const sticky = await evalJs(`(() => {
    const sc = document.querySelector('.rl-scroll');
    const name = document.querySelector('.rl-person'); const bar = document.querySelector('.rl-bar-emperor');
    const n0 = name.getBoundingClientRect().left, b0 = bar.getBoundingClientRect().left, s0 = sc.getBoundingClientRect().left;
    sc.scrollLeft = 300;
    const n1 = name.getBoundingClientRect().left, b1 = bar.getBoundingClientRect().left;
    sc.scrollLeft = 0;
    return { nameFixed: Math.abs(n0 - n1) < 1 && Math.abs(n0 - s0) < 1, barMoved: Math.abs((b0 - b1) - 300) < 2 };
  })()`);
  check("name column sticky-left while bars scroll", sticky.nameFixed && sticky.barMoved, JSON.stringify(sticky));
  await evalJs(`document.querySelector('.rl-bar-guest').click()`); await sleep(300);
  const drawer = await evalJs(`(() => { const r = document.querySelector('.rl-card').getBoundingClientRect(); return { bottom: r.bottom, winH: window.innerHeight, w: r.width, winW: window.innerWidth }; })()`);
  check("mobile card = bottom drawer full width", Math.abs(drawer.bottom - drawer.winH) <= 1 && Math.abs(drawer.w - drawer.winW) <= 1, JSON.stringify(drawer));
  await shot("rel-card-mobile");
  await evalJs(`document.querySelector('.rl-close').click()`);
  await shot("rel-mobile");

  // 原六页功能回归
  await nav("http://127.0.0.1:4173/index.html");
  await evalJs("localStorage.clear()");
  await send("Emulation.clearDeviceMetricsOverride");
  await nav("http://127.0.0.1:4173/timeline.html");
  await evalJs(`document.querySelectorAll('.tl-row')[2].click()`); await sleep(300);
  const tlOk = await evalJs(`document.querySelectorAll('.tl-event')[2].classList.contains('is-read')`);
  await nav("http://127.0.0.1:4173/decisions.html");
  console.log("DBG", JSON.stringify(await evalJs("({ url: location.pathname, dc: document.querySelectorAll('.dc-scenario').length, choices: document.querySelectorAll('.dc-choice').length, body: document.body.textContent.slice(0,60) })"))); await sleep(600);
  await evalJs(`document.querySelectorAll('.dc-scenario')[1].querySelectorAll('.dc-choice')[0].click()`); await sleep(300);
  const dcOk = await evalJs(`(() => { const s = document.querySelectorAll('.dc-scenario')[1]; return [...s.querySelectorAll('.dc-choice')].every(b => !b.disabled) && [...s.querySelectorAll('.dc-choice')].some(b => b.classList.contains('is-picked')) && !s.querySelector('.dc-result').hidden; })()`);
  await nav("http://127.0.0.1:4173/quiz.html");
  await evalJs(`document.querySelectorAll('.qz-formal-root .qz-item')[0].querySelectorAll('.qz-choice')[1].click()`); await sleep(300);
  const qzOk = await evalJs(`document.querySelectorAll('.qz-formal-root .qz-item')[0].querySelectorAll('.qz-choice')[1].classList.contains('is-picked')`);
  await nav("http://127.0.0.1:4173/cards.html");
  const cwOk = await evalJs(`document.querySelectorAll('.cw-person').length === 6 && document.querySelectorAll('.cw-photo img').length === 6`);
  await nav("http://127.0.0.1:4173/index.html");
  const a0 = await evalJs(`[...document.querySelectorAll('.slide')].findIndex(n => n.classList.contains('is-active'))`);
  await sleep(5600);
  const a1 = await evalJs(`[...document.querySelectorAll('.slide')].findIndex(n => n.classList.contains('is-active'))`);
  check("six pages regression: timeline read / decision lock / quiz judge / cards / autoplay", tlOk && dcOk && qzOk && cwOk && a0 === 0 && a1 === 1, JSON.stringify([tlOk, dcOk, qzOk, cwOk, a0, a1]));

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });