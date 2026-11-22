const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9251;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud13`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const activeIdx = () => evalJs(`[...document.querySelectorAll('.slide')].findIndex(n => n.classList.contains('is-active'))`);
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };

const AUDIT = `(() => {
  const golds = ["rgb(176, 141, 79)", "rgb(201, 162, 39)"];
  const reds = ["rgb(112, 51, 41)", "rgb(158, 27, 27)"];
  const sealOk = (n) => n.closest('.dc-seal, .pf-seal, .qz-badge, .head-rule');
  const badBorder = [], badBg = [], badLs = [], badIndent = [], badWeight = [];
  for (const n of document.querySelectorAll('body *')) {
    if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') continue;
    const cs = getComputedStyle(n);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const c = cs['border' + side + 'Color'];
      const w = parseFloat(cs['border' + side + 'Width']);
      if (w > 0 && cs['border' + side + 'Style'] !== 'none') {
        if (golds.includes(c)) badBorder.push(n.className + ':' + c);
        if (reds.includes(c) && !sealOk(n)) badBorder.push(n.className + ':' + c);
      }
    }
    if (golds.includes(cs.backgroundColor) || (reds.includes(cs.backgroundColor) && !sealOk(n))) badBg.push(String(n.className) + ':' + cs.backgroundColor);
    if (cs.textIndent !== '0px') badIndent.push(String(n.className) + ':' + cs.textIndent);
    if (cs.fontWeight === '900' || Number(cs.fontWeight) > 700) badWeight.push(String(n.className) + ':' + cs.fontWeight);
    const hasText = [...n.childNodes].some(x => x.nodeType === 3 && x.textContent.trim());
    if (hasText) {
      const ls = parseFloat(cs.letterSpacing) || 0;
      const fsz = parseFloat(cs.fontSize);
      if (ls > fsz * 0.22 + 0.6) badLs.push(String(n.className) + ':' + cs.letterSpacing + '/' + cs.fontSize);
    }
  }
  return { badBorder, badBg, badLs, badIndent, badWeight };
})()`;

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
  const pages = ["index.html", "timeline.html", "decisions.html", "cards.html", "quiz.html", "profile.html"];

  await nav("http://127.0.0.1:4173/index.html");
  await evalJs(`localStorage.clear()`);

  // 变量层
  const vars = await evalJs(`(() => { const cs = getComputedStyle(document.documentElement); return { gold: cs.getPropertyValue('--gold').trim(), accent: cs.getPropertyValue('--site-accent').trim(), fg: cs.getPropertyValue('--site-fg').trim(), muted: cs.getPropertyValue('--site-muted').trim() }; })()`);
  check("palette: brass #B08D4F / sunken red #703329 / cool paper #E8E8E6 / gray-brown muted", vars.gold === "#b08d4f" && vars.accent === "#703329" && vars.fg === "#e8e8e6" && vars.muted === "#857e71", JSON.stringify(vars));

  // 六页审计：无金边、无彩底、字距字重indent
  let auditOk = true; const auditDetail = [];
  for (const f of pages) {
    await nav("http://127.0.0.1:4173/" + f);
    if (f === "cards.html") await evalJs(`window.scrollTo(0, document.body.scrollHeight)`), await sleep(900);
    const a = await evalJs(AUDIT);
    const bad = [...a.badBorder, ...a.badBg, ...a.badLs, ...a.badIndent, ...a.badWeight];
    auditDetail.push([f, bad.length, bad.slice(0, 4)]);
    if (bad.length) auditOk = false;
  }
  check("6 pages: zero gold borders, zero colored fills, ls<=0.22em, no indent, weight<=700", auditOk, JSON.stringify(auditDetail));

  // 顶栏
  await nav("http://127.0.0.1:4173/index.html");
  const navp = await evalJs(`(() => {
    const b = document.querySelector('.nav-brand'); const cb = getComputedStyle(b);
    const spans = [...b.querySelectorAll('span')].map(s => getComputedStyle(s).color);
    const cur = document.querySelector('.nav-link.is-current'); const ca = getComputedStyle(cur, '::after');
    const nav = document.querySelector('.site-nav');
    return { spans, w: cb.fontWeight, ls: cb.letterSpacing, h: nav.offsetHeight, minH: getComputedStyle(document.querySelector('.nav-inner')).minHeight, border: getComputedStyle(nav).borderBottomColor, u: [ca.left, ca.right, ca.bottom, ca.height, ca.backgroundColor], curColor: getComputedStyle(cur).color };
  })()`);
  const vb = await evalJs(`getComputedStyle(document.querySelector('.nav-brand-dot')).color`);
  check("nav 58px, brand 700/0.18em three-tone, hairline bottom, gold current + inset red underline", navp.minH === "58px" && navp.h === 59 && navp.w === "700" && navp.ls === "3.78px" && navp.spans[0] === "rgb(232, 232, 230)" && navp.spans[1] === vb && navp.spans[2] === "rgb(176, 141, 79)" && navp.border === "rgba(232, 232, 230, 0.12)" && JSON.stringify(navp.u) === JSON.stringify(["13px", "13px", "2px", "2px", "rgb(112, 51, 41)"]) && navp.curColor === "rgb(176, 141, 79)", JSON.stringify(navp));

  // 首页：无页眉带 + 自动播放 + 指示器/箭头/细框
  const geo = await evalJs(`(() => { const nav = document.querySelector('.site-nav').getBoundingClientRect(); const car = document.querySelector('.carousel').getBoundingClientRect(); return { head: !!document.querySelector('.page-head'), top: car.top, nb: nav.bottom, first: document.getElementById('app').firstElementChild.classList.contains('carousel') }; })()`);
  check("index: no page-head, carousel flush first", !geo.head && geo.first && Math.abs(geo.top - geo.nb) <= 1, JSON.stringify(geo));
  const i0 = await activeIdx(); await sleep(5600); const i1 = await activeIdx();
  check("index autoplay 0 -> 1 untouched", i0 === 0 && i1 === 1, i0 + "->" + i1);
  const car = await evalJs(`(() => {
    const d = document.querySelector('.car-dot'); const da = getComputedStyle(d, '::after');
    const ar = getComputedStyle(document.querySelector('.car-next'));
    return { dotH: da.height, dotW: d.getBoundingClientRect().width, dotBg: da.backgroundColor, activeBg: getComputedStyle(document.querySelector('.car-dot.is-active'), '::after').backgroundColor, radius: ar.borderRadius, borderW: ar.borderTopWidth, bg: ar.backgroundColor };
  })()`);
  check("segment dots 26x2 + translucent circular arrows, no border", car.dotH === "2px" && car.dotW === 26 && car.radius === "50%" && car.borderW === "0px" && car.bg === "rgba(12, 10, 9, 0.45)", JSON.stringify(car));
  await evalJs(`document.querySelectorAll('.car-dot')[1].click()`); await sleep(900);
  const fr = await evalJs(`(() => { const f = getComputedStyle(document.querySelector('.slide-frame.is-active .frame-wrap')); return { outline: f.outlineStyle, bw: f.borderTopWidth, bc: f.borderTopColor }; })()`);
  check("taizu single thin neutral frame, no double gold", fr.outline === "none" && fr.bw === "1px" && fr.bc === "rgba(232, 232, 230, 0.24)", JSON.stringify(fr));
  await shot("rev-index-desktop");

  // 入口目录列表
  const ent = await evalJs(`(() => [...document.querySelectorAll('.entry-block')].map(a => ({ num: a.querySelector('.entry-index').textContent, title: a.querySelector('.entry-title').textContent, desc: !!a.querySelector('.entry-desc'), bg: getComputedStyle(a).backgroundColor, bt: getComputedStyle(a).borderTopColor, bs: getComputedStyle(a).borderTopStyle, arrow: !!a.querySelector('.entry-arrow') })))()`);
  check("entries: 01-05 catalog list, hairline separators, no cards/arrows", ent.length === 5 && ent.map(e => e.num).join(",") === "01,02,03,04,05" && ent.every(e => e.desc && !e.arrow && e.bg === "rgba(0, 0, 0, 0)") && ent[0].bs === "none" && ent.slice(1).every(e => e.bt === "rgba(232, 232, 230, 0.12)"), JSON.stringify(ent));

  // 时间线
  await nav("http://127.0.0.1:4173/timeline.html");
  const tl = await evalJs(`(() => { const n = getComputedStyle(document.querySelector('.tl-node')); const f = getComputedStyle(document.querySelector('.tl-bar-fill')); return { r: n.borderRadius, bg: n.backgroundColor, fillBg: f.backgroundColor, fillImg: f.backgroundImage, year: getComputedStyle(document.querySelector('.tl-year')).color }; })()`);
  check("timeline: round dot markers + monochrome progress line + brass years", tl.r === "50%" && tl.fillImg === "none" && tl.fillBg === "rgba(232, 232, 230, 0.55)" && tl.year === "rgb(176, 141, 79)", JSON.stringify(tl));
  await evalJs(`document.querySelector('.tl-row').click()`); await sleep(500);
  const tl2 = await evalJs(`(() => ({ read: document.querySelector('.tl-event').classList.contains('is-read'), badge: !document.querySelector('.tl-read').hidden, w: document.querySelector('.tl-bar-fill').style.width }))()`);
  check("timeline read interaction intact", tl2.read && tl2.badge && parseFloat(tl2.w) > 0, JSON.stringify(tl2));
  await shot("rev-timeline");

  // 决策
  await nav("http://127.0.0.1:4173/decisions.html");
  const dc0 = await evalJs(`(() => { const n = getComputedStyle(document.querySelector('.dc-num')); return { bw: n.borderTopWidth, c: n.color }; })()`);
  await evalJs(`document.querySelectorAll('.dc-scenario')[0].querySelectorAll('.dc-choice')[1].click()`); await sleep(600);
  const dc = await evalJs(`(() => { const s = document.querySelectorAll('.dc-scenario')[0]; const b = s.querySelectorAll('.dc-choice'); return { locked: [...b].every(x => x.disabled), picked: b[1].classList.contains('is-picked'), result: !s.querySelector('.dc-result').hidden, seal: !s.querySelector('.dc-seal').hidden, blockBorder: getComputedStyle(s.querySelector('.dc-consequence')).borderLeftColor, blockBg: getComputedStyle(s.querySelector('.dc-consequence')).backgroundColor, title: getComputedStyle(s.querySelector('.dc-consequence .dc-block-title')).color }; })()`);
  check("decisions: num unboxed brass, lock/result intact, result blocks hairline+body hierarchy", dc0.bw === "0px" && dc0.c === "rgb(176, 141, 79)" && dc.locked && dc.picked && dc.result && dc.seal && dc.blockBorder === "rgba(232, 232, 230, 0.24)" && dc.blockBg === "rgba(0, 0, 0, 0)" && dc.title === "rgb(232, 232, 230)", JSON.stringify([dc0, dc]));
  await shot("rev-decisions");

  // 小测
  await nav("http://127.0.0.1:4173/quiz.html");
  await evalJs(`document.querySelectorAll('.qz-item')[0].querySelectorAll('.qz-choice')[0].click()`); await sleep(400);
  for (let qi = 1; qi < 10; qi++) { const a = await evalJs(`SITE_DATA.quiz[${qi}].answer`); await evalJs(`document.querySelectorAll('.qz-item')[${qi}].querySelectorAll('.qz-choice')[${a}].click()`); await sleep(120); }
  await evalJs(`document.querySelector('.qz-submit-btn').click()`); await sleep(700);
  const qz = await evalJs(`(() => { const r = document.querySelector('.qz-result'); const w = document.querySelectorAll('.qz-item')[0]; return { score: JSON.parse(localStorage.getItem('${KEY}')).quiz.score, resultBorder: getComputedStyle(r).borderTopColor, resultBg: getComputedStyle(r).backgroundColor, scoreColor: getComputedStyle(r.querySelector('.qz-score-num')).color, wrongBadge: getComputedStyle(w.querySelector('.qz-choice.is-wrong .qz-badge')).color, explainBorder: getComputedStyle(w.querySelector('.qz-explain')).borderLeftColor, explainBg: getComputedStyle(w.querySelector('.qz-explain')).backgroundColor }; })()`);
  check("quiz: scoring intact, result/explain neutral, brass score num", qz.score === 9 && qz.resultBorder === "rgba(232, 232, 230, 0.12)" && qz.resultBg === "rgba(0, 0, 0, 0)" && qz.scoreColor === "rgb(176, 141, 79)" && qz.explainBorder === "rgba(232, 232, 230, 0.24)" && qz.explainBg === "rgba(0, 0, 0, 0)", JSON.stringify(qz));
  await shot("rev-quiz-result");

  // 画像
  const before = await evalJs(`localStorage.getItem('${KEY}')`);
  await nav("http://127.0.0.1:4173/profile.html"); await sleep(700);
  const pf = await evalJs(`(() => ({ fill: getComputedStyle(document.querySelector('.pf-bar-fill')).backgroundColor, fillImg: getComputedStyle(document.querySelector('.pf-bar-fill')).backgroundImage, count: getComputedStyle(document.querySelector('.pf-count')).color, statBg: getComputedStyle(document.querySelector('.pf-stat')).backgroundColor }))()`);
  const after = await evalJs(`localStorage.getItem('${KEY}')`);
  check("profile: monochrome bars, brass counts, read-only", pf.fill === "rgba(232, 232, 230, 0.55)" && pf.fillImg === "none" && pf.count === "rgb(176, 141, 79)" && pf.statBg === "rgba(0, 0, 0, 0)" && before === after, JSON.stringify(pf));
  await shot("rev-profile");

  // 卡片墙
  await nav("http://127.0.0.1:4173/cards.html");
  await evalJs(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(1000);
  const cw = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('.cw-person')];
    const rows = cards.map(c => {
      const img = c.querySelector('.cw-photo img'); const body = c.querySelector('.cw-body');
      const ir = img.getBoundingClientRect(); const br = body.getBoundingClientRect();
      return { name: c.querySelector('.cw-name').textContent, ratio: +(ir.width / ir.height).toFixed(3), natural: +(img.naturalWidth / img.naturalHeight).toFixed(3), fit: getComputedStyle(img).objectFit, h: getComputedStyle(img).height, photoFirst: ir.bottom <= br.top + 1, note: c.querySelector('.cw-photo .cw-note') ? c.querySelector('.cw-photo .cw-note').textContent : null, cardBorder: getComputedStyle(c).borderTopColor, cardBg: getComputedStyle(c).backgroundColor };
    });
    return { rows, glyphs: [...document.querySelectorAll('.cw-glyph')].map(g => getComputedStyle(g).color), source: document.querySelector('.cw-source').textContent, noBackdrop: !document.querySelector('.cw-bg') && !document.querySelector('.cw-scrim') };
  })()`);
  const order = ["朱元璋", "朱棣", "于谦", "海瑞", "张居正", "崇祯"];
  const ratioOk = cw.rows.every(r => Math.abs(r.ratio - r.natural) / r.natural < 0.02 && r.fit !== "cover" && r.photoFirst);
  check("cards: 6 in dynasty order, full uncropped photos above text", cw.rows.length === 6 && JSON.stringify(cw.rows.map(r => r.name)) === JSON.stringify(order) && ratioOk, JSON.stringify(cw.rows.map(r => [r.name, r.ratio, r.natural, r.fit, r.photoFirst])));
  check("chongzhen note under photo + source note + no backdrop/scrim", cw.rows[5].note === "崇祯无御容传世，以雪夜宫阙代之。" && cw.source.includes("Wikimedia Commons") && cw.noBackdrop, JSON.stringify([cw.rows[5].note, cw.noBackdrop]));
  check("cards: hairline rules, no box borders/fills, muted glyphs", cw.rows.every(r => r.cardBg === "rgba(0, 0, 0, 0)") && cw.glyphs.every(c => c === "rgb(133, 126, 113)"), JSON.stringify(cw.glyphs));
  await evalJs(`document.querySelectorAll('.cw-person')[5].scrollIntoView({ block: 'center' })`); await sleep(600);
  await shot("rev-cards-chongzhen");
  await evalJs(`window.scrollTo(0, 0)`); await sleep(600);
  await shot("rev-cards-top");

  // 移动端
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  let mobOk = true; const mobDetail = [];
  for (const f of pages) {
    await nav("http://127.0.0.1:4173/" + f);
    if (f === "cards.html") { await evalJs(`window.scrollTo(0, document.body.scrollHeight)`); await sleep(900); }
    const q = await evalJs(`(() => ({ ov: document.documentElement.scrollWidth - window.innerWidth, pos: getComputedStyle(document.querySelector('.site-nav')).position, imgs: [...document.querySelectorAll('.cw-photo img')].map(i => { const r = i.getBoundingClientRect(); return { ratio: +(r.width / r.height).toFixed(3), nat: +(i.naturalWidth / i.naturalHeight).toFixed(3), w: r.width, cw: i.closest('.cw-card').getBoundingClientRect().width }; }) }))()`);
    const imgOk = q.imgs.every(i => Math.abs(i.ratio - i.nat) / i.nat < 0.02 && Math.abs(i.w - i.cw) <= 2);
    mobDetail.push([f, q.ov, q.pos, imgOk]);
    if (q.ov > 0 || q.pos !== "sticky" || !imgOk) mobOk = false;
  }
  check("mobile: no overflow, sticky nav, full-width uncropped portraits", mobOk, JSON.stringify(mobDetail));
  await nav("http://127.0.0.1:4173/index.html");
  await shot("rev-index-mobile");
  await nav("http://127.0.0.1:4173/cards.html");
  await shot("rev-cards-mobile");

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });