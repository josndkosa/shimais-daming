const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9271;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud33`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
let stub = spawn(process.execPath, [DIR + "/stub-practice.js", "8001"], { stdio: "ignore" });
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
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const setMode = (m) => fs.writeFileSync(DIR + "/stub-mode.txt", m);
const progress = () => evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
const click = (sel) => evalJs(`(() => { const n = document.querySelector(${JSON.stringify(sel)}); if (n) { n.click(); return true; } return false; })()`);
const pickAll = () => evalJs(`(() => {
  const items = [...document.querySelectorAll('.qz-practice-list .qz-item')];
  items.forEach((item, qi) => { [...item.querySelectorAll('.qz-choice')][qi % 4].click(); });
  return items.length;
})()`);
const submitPractice = () => evalJs(`(() => { const R = document.querySelector('.qz-practice-root:not([hidden])'); const b = R && R.querySelector('.qz-submit-btn'); if (b) { b.click(); return true; } return false; })()`);
const practiceState = () => evalJs(`(() => { const R = document.querySelector('.qz-practice-root:not([hidden])'); const modes = [...document.querySelectorAll('.qz-mode')].map(b => [b.textContent, b.classList.contains('is-on')]); if (!R) return { modes, hint: null, gen: null, fallback: false, again: false, items: 0, stems: [], dims: [], sources: [], sourcesHidden: true, explainsVisible: 0, submitHidden: true, submitDisabled: true, result: null }; return {
  hint: R.querySelector('.qz-practice-hint') ? R.querySelector('.qz-practice-hint').textContent : null,
  gen: R.querySelector('.qz-gen-btn') ? { text: R.querySelector('.qz-gen-btn').textContent, disabled: R.querySelector('.qz-gen-btn').disabled } : null,
  fallback: !!R.querySelector('.qz-fallback-btn'),
  again: !!R.querySelector('.qz-again-btn'),
  items: R.querySelectorAll('.qz-practice-list .qz-item').length,
  stems: [...R.querySelectorAll('.qz-practice-list .qz-stem')].map(x => x.textContent),
  dims: [...R.querySelectorAll('.qz-practice-list .qz-dim')].map(x => x.textContent),
  sources: [...R.querySelectorAll('.qz-practice-list .qz-source-line')].map(x => x.textContent),
  sourcesHidden: [...R.querySelectorAll('.qz-practice-list .qz-source-line')].every(x => x.closest('.qz-explain').hidden),
  explainsVisible: [...R.querySelectorAll('.qz-practice-list .qz-explain')].filter(x => !x.hidden).length,
  submitHidden: R.querySelector('.qz-submit').hidden,
  submitDisabled: R.querySelector('.qz-submit-btn').disabled,
  result: R.querySelector('.qz-result') ? { score: R.querySelector('.qz-score-num').textContent, note: R.querySelector('.qz-submitted-note').textContent, again: !!R.querySelector('.qz-again-btn'), profileLink: !!R.querySelector('.qz-result a') } : null,
  modes: [...document.querySelectorAll('.qz-mode')].map(b => [b.textContent, b.classList.contains('is-on')])
}; })()`);

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
  setMode("ok");
  await sleep(600);

  await nav("http://127.0.0.1:8001/quiz.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:8001/quiz.html");
  let st = await practiceState();
  check("default formal: two mode buttons, formal on, 10 formal items", st.modes.length === 3 && st.modes[0][1] === true && st.modes[1][1] === false && st.modes[2][1] === false && (await evalJs(`document.querySelectorAll('.qz-formal-root .qz-item').length`)) === 10, JSON.stringify(st.modes));
  await evalJs(`document.querySelectorAll('.qz-formal-root .qz-item')[0].querySelectorAll('.qz-choice')[1].click()`);
  const pFormal = JSON.parse(await progress());
  check("formal pick still writes progress.quiz.picks", pFormal.quiz && pFormal.quiz.picks[0] === 1, JSON.stringify(pFormal));

  await click(".qz-mode:nth-child(2)");
  st = await practiceState();
  check("practice intro: hint verbatim + genBtn, no items", st.hint === "AI 依据本站史料卡现场出题，练习成绩不计入研读画像。 每地址每小时最多 6 次生成尝试，失败与取消也可能消耗次数；取消仅停止本次等待。模型审题不能替代人工核对。" && st.gen && st.gen.text === "生成一组练习题" && !st.gen.disabled && st.fallback && st.items === 0, JSON.stringify(st));
  const before = await progress();
  await click(".qz-gen-btn");
  const generating = await evalJs(`(() => { const c = document.querySelector('.qz-cancel-btn'); const h = document.querySelector('.qz-practice-hint'); return c && h ? { cancel: true, text: h.textContent } : null; })()`);
  check("generating state: cancel button + verbatim wait text", generating && generating.cancel && generating.text === "正在出题并核对材料，最长等待 130 秒；切换模式不会丢失本次请求。", JSON.stringify(generating));
  await sleep(900);
  st = await practiceState();
  const dimCount = st.dims.reduce((o, d) => ((o[d] = (o[d] || 0) + 1), o), {});
  check("generated set: 10 items, dims 4/3/3, source lines hidden pre-pick", st.items === 10 && dimCount["时间线感"] === 4 && dimCount["人物洞察"] === 3 && dimCount["制度理解"] === 3 && st.sources.length === 10 && st.sourcesHidden, JSON.stringify([st.items, dimCount]));
  check("generation writes no progress", (await progress()) === before, "changed");

  await pickAll();
  st = await practiceState();
  check("after picks: no reveal before submit, submit enabled", st.explainsVisible === 0 && st.sourcesHidden && !st.submitDisabled && !st.submitHidden, JSON.stringify([st.explainsVisible, st.sourcesHidden]));
  check("picks write no progress", (await progress()) === before, "changed");
  await submitPractice();
  await sleep(300);
  st = await practiceState();
  check("practice result: score 10, reveals + sources, note verbatim, againBtn, no profile link", st.result && st.result.score === "10" && st.explainsVisible === 10 && st.sources.every((s) => s === "依据材料 · 《明史· stub 本纪》") && st.result.note === "这是练习结果，不计入研读画像。" && st.result.again && !st.result.profileLink, JSON.stringify(st.result));
  check("submit writes no progress", (await progress()) === before, "changed");
  await shot("quiz-practice-result");

  await nav("http://127.0.0.1:8001/profile.html"); await sleep(600);
  const pf1 = await evalJs(`(() => { const stat = [...document.querySelectorAll('.pf-stat')].find(s => s.querySelector('.pf-stat-title').textContent === SITE_DATA.profileUI.modulesTitle); return stat.querySelector('.pf-count').textContent; })()`);
  check("profile unchanged by practice (1/6)", pf1 === "1 / 6", pf1);
  await nav("http://127.0.0.1:8001/quiz.html");
  await click(".qz-mode:nth-child(2)");
  await sleep(300);

  // again regenerates (stub ok)
  await click(".qz-gen-btn");
  await sleep(900);
  await pickAll();
  await submitPractice();
  await sleep(200);
  await click(".qz-again-btn");
  await sleep(900);
  st = await practiceState();
  check("againBtn regenerates a fresh set", st.items === 10 && st.result === null && st.explainsVisible === 0, JSON.stringify([st.items, st.result]));

  // 503 -> genFail + fallback
  setMode("fail503");
  await pickAll();
  await submitPractice();
  await sleep(200);
  await click(".qz-again-btn");
  await sleep(900);
  st = await practiceState();
  check("503 -> genFail verbatim + fallbackBtn", st.hint === "这次出题没通过校验，可重试，或先用固定题库练习。" && st.fallback, JSON.stringify([st.hint, st.fallback]));
  await click(".qz-fallback-btn");
  st = await practiceState();
  const fixedStems = await evalJs(`SITE_DATA.quiz.map(q => q.stem)`);
  check("fallback renders fixed 10 without source lines", st.items === 10 && JSON.stringify(st.stems) === JSON.stringify(fixedStems) && st.sources.length === 0, JSON.stringify([st.items, st.sources.length]));
  await pickAll();
  await submitPractice();
  await sleep(200);
  st = await practiceState();
  const fixedScore = await evalJs(`SITE_DATA.quiz.reduce((n, q, i) => n + (q.answer === i % 4 ? 1 : 0), 0)`);
  check("fallback submit: local score + note, still no progress", st.result && st.result.score === String(fixedScore) && st.result.note === "这是练习结果，不计入研读画像。" && (await progress()) === before, JSON.stringify([st.result, fixedScore]));

  // 429 friendly
  setMode("rate429");
  await click(".qz-again-btn");
  await sleep(900);
  st = await practiceState();
  check("429 -> rate message shown, page alive", st.hint === "本时段生成次数已用尽，失败和取消也计入尝试次数。请稍后重试。" && st.fallback, JSON.stringify(st.hint));

  // backend down -> network fail via again after fallback submit
  await click(".qz-fallback-btn");
  await pickAll();
  await submitPractice();
  await sleep(200);
  stub.kill();
  await sleep(400);
  await click(".qz-again-btn");
  await sleep(1200);
  st = await practiceState();
  check("backend down -> network message + fallback, no crash", st.hint === "网络或出题服务暂不可用，请重试或使用固定题库。" && st.fallback, JSON.stringify(st.hint));
  await click(".qz-fallback-btn");
  st = await practiceState();
  check("fallback works fully offline", st.items === 10, st.items);

  stub = spawn(process.execPath, [DIR + "/stub-practice.js", "8001"], { stdio: "ignore" });
  await sleep(700);
  // formal after practice
  await click(".qz-mode:nth-child(1)");
  const formalPick = await evalJs(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz.picks[0]`);
  check("formal remount keeps earlier formal pick", formalPick === 1, formalPick);
  await evalJs(`(() => { const items = [...document.querySelectorAll('.qz-formal-root .qz-item')]; items.forEach((item, qi) => { [...item.querySelectorAll('.qz-choice')][SITE_DATA.quiz[qi].answer].click(); }); document.querySelector('.qz-submit-btn').click(); })()`);
  await sleep(300);
  const pFinal = JSON.parse(await progress());
  check("formal submit after practice writes score 10", pFinal.quiz.score === 10, JSON.stringify(pFinal.quiz));
  await nav("http://127.0.0.1:8001/profile.html"); await sleep(600);
  const pf2 = await evalJs(`(() => { const stat = [...document.querySelectorAll('.pf-stat')].find(s => s.querySelector('.pf-stat-title').textContent === SITE_DATA.profileUI.modulesTitle); return stat.querySelector('.pf-count').textContent; })()`);
  check("profile now counts formal quiz (2/6)", pf2 === "2 / 6", pf2);

  // mobile with stub restarted
  stub = spawn(process.execPath, [DIR + "/stub-practice.js", "8001"], { stdio: "ignore" });
  setMode("ok");
  await sleep(600);
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:8001/quiz.html");
  await click(".qz-mode:nth-child(2)");
  await click(".qz-gen-btn");
  await sleep(900);
  const mob = await evalJs(`(() => ({ docW: document.documentElement.scrollWidth, items: document.querySelectorAll('.qz-practice-list .qz-item').length }))()`);
  check("mobile practice: no overflow, 10 items", mob.docW <= 375 && mob.items === 10, JSON.stringify(mob));
  await shot("quiz-practice-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill(); stub.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(2); });