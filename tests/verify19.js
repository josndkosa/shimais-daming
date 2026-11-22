const { spawn } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9259;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud21`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const IDS = ["q1380", "q1402", "q1449", "q1548", "q1581", "q1644"];
async function enterCard(i) {
  await nav("http://127.0.0.1:4173/qinli-play.html?story=" + IDS[i]);
}
async function walk(keys) {
  for (const k of keys) {
    if (await evalJs(`!!document.querySelector('.ql-ending')`)) break;
    if (!(await pickKey(k))) break;
    await sleep(200);
    if (await evalJs(`!!document.querySelector('.ql-ending')`)) break;
    await nextClick();
    await sleep(200);
  }
  await nextClick();
  await sleep(320);
  return endingState();
}
const EFFECTS = {
  q1548: [[[10,-15],[0,5],[-10,10]],[[10,-10],[-10,10],[0,0]],[[15,-15],[-10,10],[-5,0]],[[15,-5],[-5,5],[-15,15]],[[-15,15],[0,5],[10,-15]],[[10,-20],[0,0],[-10,10]],[[10,5],[0,0],[-5,5]],[[5,5],[5,-10],[0,10]]],
  q1581: [[[5,5],[10,-10],[-10,0]],[[10,-20],[-5,10],[0,0]],[[-5,10],[5,-10],[0,5]],[[0,-5],[-5,5],[-10,15]],[[-10,10],[10,-15],[-5,15]],[[15,-10],[-10,5],[5,-5]],[[-5,15],[5,-10],[0,10]],[[0,10],[-5,5],[5,0]]],
  q1644: [[[10,-5],[-5,5],[5,0]],[[10,-10],[0,5],[-10,0]],[[10,-5],[-5,0],[-5,10]],[[5,-5],[15,-15],[-15,15]],[[10,-10],[-5,5],[0,0]],[[10,-20],[-10,10],[5,-5]],[[10,-10],[-5,15],[20,-40]],[[5,5],[-10,10],[5,0]]],
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
  await nav("http://127.0.0.1:4173/qinli.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/qinli.html");

  const cards = await evalJs(`[...document.querySelectorAll('.ql-card')].map(c => ({ year: c.querySelector('.ql-year').textContent, locked: c.classList.contains('is-locked'), btn: c.querySelector('.ql-play-btn').textContent }))`);
  check("six cards all playable in year order", JSON.stringify(cards.map(c => c.year)) === JSON.stringify(["1380","1402","1449","1548","1581","1644"]) && cards.every(c => !c.locked && c.btn === "进入亲历"), JSON.stringify(cards));

  const dataChk = await evalJs(`(() => {
    const ids = ['q1548','q1581','q1644'];
    return ids.map(id => { const s = SITE_DATA.qinli.find(x => x.id === id); return { id, playable: s.playable, meters: s.meterLabels, scenes: s.scenes.length, per: s.scenes.map(sc => sc.choices.length), eff: s.scenes.map(sc => sc.choices.map(c => [c.effect.prestige, c.effect.morale])), endings: s.endings.map(e => e.id), bodyOk: s.endings.every(e => e.body && e.history && e.text === e.body && e.closure === e.history), special: s.scenes.flatMap(sc => sc.choices.filter(c => c.ending || c.judge).map(c => [sc.n, c.key, c.ending || 'judge'])) }; });
  })()`);
  const effOk = dataChk.every(s => JSON.stringify(s.eff) === JSON.stringify(EFFECTS[s.id]));
  check("3 new stories: 8x3 choices, effects verbatim per spec, endings body/history+mirror", effOk && dataChk.every(s => s.playable && s.scenes === 8 && s.per.every(n => n === 3) && s.bodyOk) && JSON.stringify(dataChk[2].special) === JSON.stringify([[7, "C", "xunjie"]]) && JSON.stringify(dataChk[0].special) === "[]" && JSON.stringify(dataChk[1].special) === "[]", JSON.stringify(dataChk.map(s => [s.id, s.endings, s.special])));

  // meter labels all six
  const wantLabels = [["圣眷","清名"],["士节","生机"],["朝议声望","京师军心"],["权势","清议"],["考成","民望"],["尽责","生机"]];
  let labOk = true; const labGot = [];
  for (let i = 0; i < 6; i++) {
    await enterCard(i);
    const l = await evalJs(`[...document.querySelectorAll('.ql-stat-label')].map(x => x.textContent)`);
    labGot.push(l);
    if (JSON.stringify(l) !== JSON.stringify(wantLabels[i])) labOk = false;
  }
  check("meter labels six stories correct", labOk, JSON.stringify(labGot));

  // endings walks
  const E = await evalJs(`(() => { const o = {}; ['q1548','q1581','q1644'].forEach(id => { o[id] = SITE_DATA.qinli.find(s => s.id === id).endings; }); return o; })()`);
  const walks = [
    [3, ["C","B","B","C","A","C","C","C"], "q1548", "wanren"],
    [3, ["A","A","A","A","C","A","A","B"], "q1548", "yupai"],
    [3, ["B","C","C","B","B","B","B","A"], "q1548", "chenmo"],
    [4, ["B","A","B","A","B","A","B","C"], "q1581", "minren"],
    [4, ["A","B","A","C","C","B","A","A"], "q1581", "qingtian"],
    [4, ["B","C","B","B","B","C","C","A"], "q1581", "nengli"],
    [4, ["A","C","C","A","C","C","B","C"], "q1581", "pingchang"],
    [5, ["A","A","A","B","A","A","C"], "q1644", "xunjie"],
    [5, ["A","A","A","B","A","A","A","A"], "q1644", "nandu"],
    [5, ["B","B","C","C","B","B","B","B"], "q1644", "xingcun"],
    [5, ["C","B","B","A","C","C","B","C"], "q1644", "wuming"],
  ];
  for (const [ci, keys, sid, eid] of walks) {
    await enterCard(ci);
    if (sid === "q1644" && eid === "nandu") {
      for (let i = 0; i < 7; i++) { await pickKey(keys[i]); await sleep(180); await nextClick(); await sleep(180); }
      const at8 = await evalJs(`document.querySelector('.ql-scene-label').textContent.includes("第八场")`);
      await pickKey(keys[7]); await sleep(200); await nextClick(); await sleep(300);
      const e = await endingState();
      const want = E[sid].find(x => x.id === eid);
      check("1644 7A reaches scene8 then 南渡", at8 && e && e.title === want.title && e.text === want.body, JSON.stringify([at8, e && e.title]));
      continue;
    }
    const e = await walk(keys);
    const want = E[sid].find(x => x.id === eid);
    const noScene8 = sid === "q1644" && eid === "xunjie" ? await evalJs(`!document.querySelector('.ql-scene')`) : true;
    check(sid + " -> " + eid + " verbatim body/closure", e && e.title === want.title && e.text === want.body && e.closure === want.history && noScene8, JSON.stringify([e && e.title, noScene8]));
  }
  await shot("qinli-1644-xunjie");

  // resume mid-play + done badges
  await enterCard(4);
  await pickKey("A"); await sleep(200); await nextClick(); await sleep(200);
  await pickKey("B"); await sleep(200);
  await nav("http://127.0.0.1:4173/qinli-play.html?story=q1581");
  const res = await evalJs(`(() => ({ label: document.querySelector('.ql-scene-label').textContent, stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent), meters: [...document.querySelectorAll('.ql-stat-label')].map(x => x.textContent) }))()`);
  check("1581 mid-play refresh resumes scene3 with meters", res.label.includes("第三场") && JSON.stringify(res.stats) === JSON.stringify(["50","65"]) && JSON.stringify(res.meters) === JSON.stringify(["考成","民望"]), JSON.stringify(res));
  const done = await evalJs(`JSON.parse(localStorage.getItem('${KEY}')).qinli.done`);
  await nav("http://127.0.0.1:4173/qinli.html");
  const badges = await evalJs(`[...document.querySelectorAll('.ql-card')].map(c => c.querySelector('.ql-done').hidden ? null : c.querySelector('.ql-done').textContent)`);
  check("done has 3 new ids; badges on completed cards", ["q1548","q1581","q1644"].every(id => done.includes(id)) && badges[3] === "已亲历" && badges[5] === "已亲历", JSON.stringify([done, badges]));

  // old three stories untouched vs HEAD
  const oldHead = vm.runInNewContext(fs.readFileSync(__dirname + "/old-data-head.js", "utf8") + "\nSITE_DATA;", {});
  const cur = await evalJs(`SITE_DATA`);
  const oldIds = ["q1380", "q1402", "q1449"];
  const same = oldIds.every(id => JSON.stringify(oldHead.qinli.find(s => s.id === id)) === JSON.stringify(cur.qinli.find(s => s.id === id)));
  check("q1380/q1402/q1449 data byte-identical to HEAD", same, "diff");

  // mobile quick walk
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/qinli.html");
  await enterCard(5);
  const me = await walk(["A","A","A","B","A","A","C"]);
  const ov = await evalJs(`document.documentElement.scrollWidth - window.innerWidth`);
  check("mobile 1644 7C direct xunjie, no overflow", me && me.title === "殉节 · 煤山之下" && ov <= 0, JSON.stringify([me && me.title, ov]));
  await shot("qinli-1644-mobile");

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });