const { spawn } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const { execSync } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9260;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud22`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const shot = async (name, beyond) => { const s = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!beyond }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };

const NODES = {
  "pw-emperor": ["皇帝", "朱批 · 最终裁决", null],
  "pw-zoushu": ["百官奏疏", null, "地方与京官的报告、请示，从这里进宫"],
  "pw-tongzheng": ["通政司", null, "收文、登记、呈送，是奏疏进宫的唯一入口"],
  "pw-neige": ["内阁", "票拟 · 首辅领班", "拟处理意见，贴于疏上，只建议、不决定。"],
  "pw-sili": ["司礼监", "批红 · 掌印与秉笔太监", "皇帝用朱笔批示；皇帝怠政时，由秉笔太监代批、掌印太监盖印。"],
  "pw-changwei": ["厂卫", "东厂 · 锦衣卫", "只对皇帝负责。"],
  "pw-liubu": ["六部 · 地方", null, "执行批红后的政令，政令到此落地。"],
  "pw-liuke": ["六科给事中", "抄发章疏 · 有权封驳", "给事中抄录诏旨、发往各部；不合体制的诏旨，理论上可以封驳。"],
};
const LABELS = ["呈进", "任免阁臣", "批红本是皇权", "票拟", "无批红不生效", "秉笔多兼", "提督东厂", "批红后抄发", "执行"];
const RED_LABELS = ["直属 · 不经内阁", "监察百官 · 诏狱（绕过司法）"];
const CLOSE = [
  "废丞相之后，权力一分为二：拟的人和批的人不是同一拨人，失控的缝，就开在这里。",
  "皇帝勤政则衡；怠政时批红旁落司礼监：王振（正统）· 刘瑾（正德）· 魏忠贤（天启）。",
];
const WATCH = "监察线：东厂 ＋ 锦衣卫——只对皇帝负责，可不经刑部逮问官员，盯着上面流程里的所有人。";
const CASES = [
  "张居正为什么推得动改革：首辅张居正（1572–1582 年当政）与司礼监掌印太监冯保联手，票拟与批红捏到了一起。",
  "魏忠贤为什么可怕：天启朝他以司礼监秉笔太监兼掌东厂，批红与监察一手抓，内阁成了摆设。",
  "王振为什么能挟持皇帝出塞：正统朝他是司礼监掌印太监，批红与印都在他手里，1449 年土木堡之变正接本站亲历剧本《正统十四年 · 京师》。",
];
const NEW_CARD = {
  name: "通政司与六科", glyph: "疏", position: "奏疏的入口与出口",
  facts: ["通政司掌收内外章疏，是奏疏进宫的唯一入口", "内阁票拟、司礼监批红之后，诏旨由六科给事中抄发各部", "六科给事中官小权大，分科稽察六部，不合体制的诏旨理论上可以封驳"],
  comment: "入口与出口都在皇帝身边，中间的票拟与批红一分家，权力就有了可钻的缝。",
};

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

  // ---- relations page ----
  await nav("http://127.0.0.1:4173/relations.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/relations.html");

  const pos = await evalJs(`(() => {
    const app = document.getElementById('app');
    const kids = [...app.children];
    const pw = document.querySelector('.pw-wrap');
    return { hasPw: !!pw, idxPw: kids.indexOf(pw), idxRl: kids.indexOf(document.querySelector('.rl-wrap')), idxHead: kids.indexOf(document.querySelector('.page-head')), title: pw && pw.querySelector('.section-title').textContent, hint: pw && pw.querySelector('.section-hint').textContent, imgInPw: pw ? pw.querySelectorAll('img').length : -1, hasSvg: pw ? !!pw.querySelector('svg.pw-wires') : false };
  })()`);
  check("pw section between page-head and chart, no img, has svg", pos.hasPw && pos.idxHead < pos.idxPw && pos.idxPw < pos.idxRl && pos.imgInPw === 0 && pos.hasSvg, JSON.stringify(pos));
  check("section title/hint verbatim", pos.title === "权力怎么流转" && pos.hint === "废丞相之后，一份奏疏要走完的路", JSON.stringify([pos.title, pos.hint]));

  const nodes = await evalJs(`(() => {
    const stage = document.querySelector('.pw-stage').getBoundingClientRect();
    const o = {};
    document.querySelectorAll('.pw-node').forEach(n => {
      const r = n.getBoundingClientRect();
      const cls = [...n.classList].find(c => c.startsWith('pw-') && c !== 'pw-node');
      o[cls] = { name: n.querySelector('.pw-name').textContent, sub: n.querySelector('.pw-sub') ? n.querySelector('.pw-sub').textContent : null, note: n.querySelector('.pw-note') ? n.querySelector('.pw-note').textContent : null, left: Math.round(r.left - stage.left), top: Math.round(r.top - stage.top), right: Math.round(r.right - stage.left), bottom: Math.round(r.bottom - stage.top), border: getComputedStyle(n).borderTopStyle, borderColor: getComputedStyle(n).borderTopColor };
    });
    return o;
  })()`);
  let nodeOk = true; const nodeBad = [];
  for (const [cls, [name, sub, note]] of Object.entries(NODES)) {
    const g = nodes[cls];
    if (!g || g.name !== name || g.sub !== sub || g.note !== note) { nodeOk = false; nodeBad.push(cls); }
  }
  check("8 nodes text verbatim", nodeOk, JSON.stringify(nodeBad));

  const E = nodes["pw-emperor"], N = nodes["pw-neige"], S = nodes["pw-sili"], C = nodes["pw-changwei"], LK = nodes["pw-liuke"], LB = nodes["pw-liubu"], Z = nodes["pw-zoushu"], T = nodes["pw-tongzheng"];
  const layoutOk =
    E.top < N.top && E.top < S.top && E.top < C.top && E.top < Z.top &&
    Math.abs((E.left + E.right) / 2 - 540) <= 2 &&
    N.top === S.top && S.right < C.left && C.border === "dashed" &&
    LK.top >= S.bottom && LK.left < S.right && LK.right > S.left &&
    LB.top >= N.bottom && LB.left < N.right && LB.right > N.left &&
    Z.right < N.left && T.top > Z.bottom && T.right < N.left;
  check("layout: emperor top-center, neige/sili row2, changwei dashed aside, liuke under sili, liubu under neige, entry left", layoutOk, JSON.stringify({ E, N: [N.left, N.top], S: [S.left, S.top], C: [C.left, C.border], LK: [LK.left, LK.top], LB: [LB.left, LB.top] }));
  const goldEmperor = await evalJs(`getComputedStyle(document.querySelector('.pw-emperor')).borderTopColor`);
  const redSili = await evalJs(`getComputedStyle(document.querySelector('.pw-sili')).borderTopColor`);
  check("emperor gold border, sili/changwei vermilion", goldEmperor === "rgb(176, 141, 79)" && redSili === C.borderColor && redSili !== "rgba(232, 232, 230, 0.24)", JSON.stringify([goldEmperor, redSili]));

  const wires = await evalJs(`(() => ({
    labels: [...document.querySelectorAll('.pw-wire-label text')].map(t => t.textContent),
    redLabels: [...document.querySelectorAll('.pw-wire-label-red text')].map(t => t.textContent),
    neutralPaths: document.querySelectorAll('.pw-wire path').length,
    redPaths: [...document.querySelectorAll('.pw-wire-red path')].map(p => p.getAttribute('stroke-dasharray')),
    markers: document.querySelectorAll('.pw-wires marker').length
  }))()`);
  check("all 9 neutral + 2 red arrow labels verbatim, 2 red dashed wires", JSON.stringify(wires.labels) === JSON.stringify(LABELS) && JSON.stringify(wires.redLabels) === JSON.stringify(RED_LABELS) && wires.neutralPaths === 9 && wires.redPaths.length === 2 && wires.redPaths.every(d => d) && wires.markers === 2, JSON.stringify(wires));

  const tail = await evalJs(`(() => ({
    close: [...document.querySelectorAll('.pw-close p')].map(p => p.textContent),
    watch: document.querySelector('.pw-watch').textContent,
    watchInStage: !!document.querySelector('.pw-stage .pw-watch'),
    cases: [...document.querySelectorAll('.pw-cases li')].map(li => li.textContent)
  }))()`);
  check("two closing sentences verbatim", JSON.stringify(tail.close) === JSON.stringify(CLOSE), JSON.stringify(tail.close));
  check("watch line verbatim, outside diagram", tail.watch === WATCH && !tail.watchInStage, JSON.stringify([tail.watch, tail.watchInStage]));
  check("three examples verbatim", JSON.stringify(tail.cases) === JSON.stringify(CASES), JSON.stringify(tail.cases));

  const chart = await evalJs(`(() => {
    const rl = SITE_DATA.relations;
    const segs = (arr) => arr.reduce((n, p) => n + (p.segments ? p.segments.length : 1), 0);
    return {
      bars: { emperor: document.querySelectorAll('.rl-bar-emperor').length, chief: document.querySelectorAll('.rl-bar-chief').length, guest: document.querySelectorAll('.rl-bar-guest').length },
      want: { emperor: rl.emperors.length, chief: segs(rl.chiefs), guest: segs(rl.guests) },
      gap: document.querySelector('.rl-gap-text') ? document.querySelector('.rl-gap-text').textContent : null,
      legendNote: document.querySelector('.rl-legend-note').textContent
    };
  })()`);
  check("chart intact: bars match data segments + hongwu gap note", JSON.stringify(chart.bars) === JSON.stringify(chart.want) && chart.bars.emperor === 17 && !!chart.gap && chart.gap.includes("无内阁"), JSON.stringify(chart));

  const navItems = await evalJs(`[...document.querySelectorAll('.nav-link .nav-full')].map(a => a.textContent)`);
  check("nav still 10 items", navItems.length === 10 && navItems[0] === "首页" && navItems.includes("亲历"), JSON.stringify(navItems));
  await shot("relations-pw-full", true);

  // ---- cards page ----
  await nav("http://127.0.0.1:4173/cards.html");
  const cardState = await evalJs(`(() => {
    const inst = [...document.querySelectorAll('.cw-inst')];
    const last = inst[inst.length - 1];
    return {
      people: document.querySelectorAll('.cw-person').length,
      inst: inst.length,
      last: { name: last.querySelector('.cw-name').textContent, glyph: last.querySelector('.cw-glyph').textContent, position: last.querySelector('.cw-position').textContent, facts: [...last.querySelectorAll('.cw-fact')].map(f => f.textContent), comment: last.querySelector('.cw-comment-p').textContent, glyphColor: getComputedStyle(last.querySelector('.cw-glyph')).color, glyphSize: getComputedStyle(last.querySelector('.cw-glyph')).fontSize, hasImg: !!last.querySelector('img') },
      source: document.querySelector('.cw-source').textContent,
      instTitles: [...document.querySelectorAll('.cw-inst .cw-name')].map(x => x.textContent)
    };
  })()`);
  const lc = cardState.last;
  check("cards 6+4=10, new card verbatim, gold 疏 64px no img", cardState.people === 6 && cardState.inst === 4 && lc.name === NEW_CARD.name && lc.glyph === NEW_CARD.glyph && lc.position === NEW_CARD.position && JSON.stringify(lc.facts) === JSON.stringify(NEW_CARD.facts) && lc.comment === NEW_CARD.comment && lc.glyphColor === "rgb(176, 141, 79)" && lc.glyphSize === "64px" && !lc.hasImg, JSON.stringify(cardState));
  check("old institution titles untouched + source note", JSON.stringify(cardState.instTitles.slice(0, 3)) === JSON.stringify(["内阁与司礼监", "厂卫", "一条鞭法与白银财政"]) && cardState.source === "人物画像为传世古画（公有领域），源自 Wikimedia Commons。", JSON.stringify([cardState.instTitles, cardState.source]));
  await shot("cards-inst", true);

  // ---- data scope vs HEAD ----
  const headSrc = execSync("git show HEAD:frontend/data.js", { cwd: "D:/shimais-daming", maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  const curSrc = fs.readFileSync("D:/shimais-daming/frontend/data.js", "utf8");
  const sandboxA = {}, sandboxB = {};
  const A = vm.runInNewContext(headSrc + "\n;SITE_DATA", sandboxA);
  const B = vm.runInNewContext(curSrc + "\n;SITE_DATA", sandboxB);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check("old 9 cards byte-identical to HEAD (quote fields excepted)", same(A.cards.slice(0, 9), B.cards.slice(0, 9).map((c) => { const o = Object.assign({}, c); delete o.quote; delete o.quoteFrom; return o; })) && B.cards.length === 10, B.cards.length);
  check("qinli / relations / modules / relationsUI / cardsLabels untouched", same(A.qinli, B.qinli) && same(A.relations, B.relations) && same(A.modules, B.modules) && same(A.relationsUI, B.relationsUI) && same(A.cardsLabels, B.cardsLabels), "diff");
  const appDiff = execSync("git diff --stat -- frontend/app.js", { cwd: "D:/shimais-daming" }).toString().trim();
  const apiBase = fs.readFileSync("D:/shimais-daming/frontend/app.js", "utf8").match(/const CHAT_API_BASE = "([^"]+)"/)[1];
  const appDel = execSync("git diff -- frontend/app.js", { cwd: "D:/shimais-daming" }).toString().split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
  check("app.js additive-only diff, CHAT_API_BASE still localhost:8000", appDel === 0 && apiBase === "http://localhost:8000", JSON.stringify([appDel, apiBase]));

  // ---- profile口径 ----
  const pfCount = () => evalJs(`(() => { const stat = [...document.querySelectorAll('.pf-stat')].find(s => s.querySelector('.pf-stat-title').textContent === '模块进度'); return stat ? stat.querySelector('.pf-count').textContent : null; })()`);
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/profile.html");
  const pf1 = await pfCount();
  await nav("http://127.0.0.1:4173/cards.html");
  await nav("http://127.0.0.1:4173/profile.html");
  const pf2 = await pfCount();
  check("profile module stat: fresh 1/6, after cards 2/6, denominator 6", pf1 === "1 / 6" && pf2 === "2 / 6", JSON.stringify([pf1, pf2]));

  // ---- mobile ----
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/relations.html");
  const mob = await evalJs(`(() => {
    const sc = document.querySelector('.pw-scroll');
    const stage = document.querySelector('.pw-stage');
    return { docW: document.documentElement.scrollWidth, scrollW: sc.scrollWidth, clientW: sc.clientWidth, stageW: stage.getBoundingClientRect().width, overflowX: getComputedStyle(sc).overflowX };
  })()`);
  check("mobile: page no h-overflow, diagram h-scrolls at full 1080 width", mob.docW <= 375 && mob.scrollW >= 1080 && mob.clientW < 1080 && Math.round(mob.stageW) === 1080 && mob.overflowX === "auto", JSON.stringify(mob));
  await shot("relations-pw-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 5)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });