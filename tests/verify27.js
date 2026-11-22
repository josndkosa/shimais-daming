const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9272;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud34`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1200); };
const seed = (obj) => evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(obj))})`);
const flowText = () => evalJs(`(() => [...document.querySelectorAll('.ct-flow .ct-msg')].map(m => ({ who: m.querySelector('.ct-who') ? m.querySelector('.ct-who').textContent : null, text: m.querySelector('.ct-text').textContent })))()`);
const selectFigure = (i) => evalJs(`document.querySelectorAll('.ct-picker .ct-figure')[${i}].click()`);
const sendMsg = (t) => evalJs(`(() => { const ta = document.querySelector('textarea.ct-text'); ta.value = ${JSON.stringify(t)}; document.querySelector('.ct-send').click(); })()`);

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
  await sleep(600);

  // ---- fix 1: cross-talk ----
  await nav("http://127.0.0.1:8001/chat.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:8001/chat.html");
  await sendMsg("甲问一");
  await selectFigure(2); // yuqian while reply in flight
  await sleep(1300);
  let flow = await flowText();
  check("switched figure flow has no sender reply", flow.length === 0, JSON.stringify(flow));
  const bannerOnB = await evalJs(`!document.querySelector('.ct-offline').hidden`);
  check("no offline banner leak on switched figure", bannerOnB === false, bannerOnB);
  await selectFigure(0);
  await sleep(300);
  flow = await flowText();
  check("switch back: reply in sender flow with sender name", flow.length === 2 && flow[1].text === "REP-zhuyuanzhang-甲问一" && flow[1].who === "朱元璋", JSON.stringify(flow));

  // rapid double send then switch
  await sendMsg("快一");
  await sendMsg("快二");
  await selectFigure(2);
  await sleep(1400);
  flow = await flowText();
  check("rapid sends: switched flow stays empty", flow.length === 0, JSON.stringify(flow));
  await selectFigure(0);
  await sleep(300);
  flow = await flowText();
  check("rapid sends: second send dropped while pending, first reply in sender flow", flow.length === 4 && flow[2].text === "快一" && flow[3].text === "REP-zhuyuanzhang-快一", JSON.stringify(flow.map((m) => m.text)));

  // 10-round cap unchanged
  for (let i = 0; i < 8; i++) { await sendMsg("轮" + i); await sleep(750); }
  const cap = await evalJs(`(() => ({ inputHidden: document.querySelector('.ct-input').hidden, endHidden: document.querySelector('.ct-end').hidden }))()`);
  check("10-round cap still hides input", cap.inputHidden === true && cap.endHidden === false, JSON.stringify(cap));

  // offline fallback cross-talk: load page from stub, kill stub mid-flight
  await nav("http://127.0.0.1:8001/chat.html");
  await sendMsg("兜底问");
  stub.kill();
  await selectFigure(2);
  await sleep(1200);
  flow = await flowText();
  const bannerB = await evalJs(`!document.querySelector('.ct-offline').hidden`);
  check("offline: switched flow empty, no banner leak", flow.length === 0 && bannerB === false, JSON.stringify([flow, bannerB]));
  await selectFigure(0);
  await sleep(300);
  flow = await flowText();
  const bannerA = await evalJs(`!document.querySelector('.ct-offline').hidden`);
  check("offline: fallback reply in sender flow with sender name + banner", flow.length > 0 && flow[flow.length - 1].who === "朱元璋" && flow[flow.length - 1].text.length > 0 && bannerA === true, JSON.stringify([flow.length, flow[flow.length - 1], bannerA]));

  stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
  await sleep(600);
  // ---- fix 2: last-scene refresh ----
  await seed({ qinli: { done: [], current: { storyId: "q1449", sceneIndex: 8, prestige: 60, morale: 70 } } });
  await nav("http://127.0.0.1:8001/qinli-play.html?story=q1449");
  let q = await evalJs(`(() => ({ ending: !!document.querySelector('.ql-ending'), scene: !!document.querySelector('.ql-scene'), stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent), done: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).qinli.done, current: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).qinli.current }))()`);
  check("out-of-range save lands on ending, no choices, stats kept", q.ending && !q.scene && JSON.stringify(q.stats) === JSON.stringify(["60", "70"]) && q.done.includes("q1449") && q.current === null, JSON.stringify(q));
  await evalJs(`document.querySelector('.ql-again').click()`);
  await sleep(300);
  q = await evalJs(`(() => ({ scene: !!document.querySelector('.ql-scene'), label: document.querySelector('.ql-scene-label').textContent, choices: document.querySelectorAll('.ql-choice:not([disabled])').length }))()`);
  check("again after ending restarts at scene 1", q.scene && /第一场/.test(q.label) && q.choices === 3, JSON.stringify(q));
  await seed({ qinli: { done: [], current: { storyId: "q1449", sceneIndex: 3, prestige: 55, morale: 45 } } });
  await nav("http://127.0.0.1:8001/qinli-play.html?story=q1449");
  q = await evalJs(`(() => ({ label: document.querySelector('.ql-scene-label').textContent, choices: document.querySelectorAll('.ql-choice:not([disabled])').length, stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent) }))()`);
  check("mid-range save resumes normally", /第四场/.test(q.label) && q.choices === 3 && JSON.stringify(q.stats) === JSON.stringify(["55", "45"]), JSON.stringify(q));

  // real walk: pick last scene then refresh before finish
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:8001/qinli-play.html?story=q1380");
  await sleep(400);
  await sleep(400);
  for (let i = 0; i < 8; i++) {
    await evalJs(`document.querySelector('.ql-scene .ql-choice').click()`);
    await sleep(200);
    if (i < 7) { await evalJs(`document.querySelector('.ql-next').click()`); await sleep(200); }
  }
  const preStats = await evalJs(`[...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent)`);
  const preSave = await evalJs(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).qinli.current.sceneIndex`);
  await nav("http://127.0.0.1:8001/qinli-play.html?story=q1380");
  q = await evalJs(`(() => ({ ending: !!document.querySelector('.ql-ending'), scene: !!document.querySelector('.ql-scene'), stats: [...document.querySelectorAll('.ql-stat-val')].map(x => x.textContent) }))()`);
  check("walk last pick + refresh: ending, no re-pick, no double stats", preSave === 8 && q.ending && !q.scene && JSON.stringify(q.stats) === JSON.stringify(preStats), JSON.stringify([preSave, q, preStats]));

  // ---- fix 3: perfect score no rec ----
  await seed({ quiz: { picks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 10, dims: { timeline: { hit: 4, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 3, total: 3 } } } });
  await nav("http://127.0.0.1:8001/profile.html");
  let rec = await evalJs(`(() => ({ weakest: /最弱/.test(document.body.textContent), topic: !!document.querySelector('a[href="quiz.html?topic=yitiaobian"]') }))()`);
  check("perfect score: no weakest wording, deeper topic path offered", rec.weakest === false && rec.topic === true, JSON.stringify(rec));
  await evalJs(`(() => { const picks = SITE_DATA.quiz.map(q => q.answer); picks[9] = 0; localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ quiz: { picks, score: 9, dims: { timeline: { hit: 4, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 2, total: 3 } } } })); })()`);
  await nav("http://127.0.0.1:8001/profile.html");
  const recState = await evalJs(`(() => ({ weakest: /最弱/.test(document.body.textContent), review: !!document.querySelector('a[href="' + SITE_DATA.quiz[9].reviewHref + '"]') }))()`);
  check("one wrong: review link to that material, no weakest wording", recState.review === true && recState.weakest === false, JSON.stringify(recState));
  // two wrongs: both review links present
  await evalJs(`(() => { const picks = SITE_DATA.quiz.map(q => q.answer); picks[9] = 0; picks[0] = (SITE_DATA.quiz[0].answer + 1) % 4; localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ quiz: { picks, score: 8, dims: { timeline: { hit: 3, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 2, total: 3 } } } })); })()`);
  await nav("http://127.0.0.1:8001/profile.html");
  const twoRec = await evalJs(`(() => ({ a: !!document.querySelector('a[href="' + SITE_DATA.quiz[9].reviewHref + '"]'), b: !!document.querySelector('a[href="' + SITE_DATA.quiz[0].reviewHref + '"]'), weakest: /最弱/.test(document.body.textContent) }))()`);
  check("two wrongs: both review links, no weakest wording", twoRec.a && twoRec.b && !twoRec.weakest, JSON.stringify(twoRec));

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill(); stub.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(2); });