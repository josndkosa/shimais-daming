const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9246;
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud8`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => results.push({ name, ok, extra });
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1200); };
const clickChoice = (qi, i) => evalJs(`document.querySelectorAll('.qz-item')[${qi}].querySelectorAll('.qz-choice')[${i}].click()`);
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
  await nav("http://127.0.0.1:4173/quiz.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/quiz.html");

  const struct = await evalJs(`(() => {
    const items = [...document.querySelectorAll('.qz-item')];
    return {
      n: items.length,
      dims: items.map(n => n.querySelector('.qz-dim').textContent),
      opts: items.map(n => n.querySelectorAll('.qz-choice').length),
      stemsOk: items.every((n, i) => n.querySelector('.qz-stem').textContent === SITE_DATA.quiz[i].stem),
      strip: document.querySelector('.dc-count').textContent,
      submitDisabled: document.querySelector('.qz-submit-btn').disabled,
      hint: document.querySelector('.qz-submit-hint').textContent,
    };
  })()`);
  check("10 questions, 4 options, dims 4/3/3", struct.n === 10 && struct.opts.every((n) => n === 4) && JSON.stringify(struct.dims) === JSON.stringify(["时间线感","时间线感","时间线感","时间线感","人物洞察","人物洞察","人物洞察","制度理解","制度理解","制度理解"]), JSON.stringify(struct.dims));
  check("stems verbatim + strip 0/10 + submit locked", struct.stemsOk && struct.strip === "0 / 10" && struct.submitDisabled && struct.hint === "十题答完后方可提交", struct.strip);

  await clickChoice(0, 0); // wrong
  await sleep(500);
  const w = await evalJs(`(() => {
    const n = document.querySelectorAll('.qz-item')[0];
    const b = [...n.querySelectorAll('.qz-choice')];
    return { disabled: b.every(x => x.disabled), wrong: b[0].classList.contains('is-wrong'), wrongBadge: b[0].querySelector('.qz-badge').textContent,
      answerMark: b[1].classList.contains('is-answer'), answerBadge: b[1].querySelector('.qz-badge').textContent,
      explain: !n.querySelector('.qz-explain').hidden, line: n.querySelector('.qz-answer-line').textContent, text: n.querySelector('.qz-explain-p').textContent,
      strip: document.querySelector('.dc-count').textContent };
  })()`);
  check("wrong pick: lock + 答错 + correct revealed + explain", w.disabled && w.wrong && w.wrongBadge === "答错" && w.answerMark && w.answerBadge === "正确答案" && w.explain && w.line === "正确答案 · B　1380" && w.text === "借胡惟庸案废中书省，主线问题由此开始。" && w.strip === "1 / 10", JSON.stringify(w).slice(0, 200));
  await clickChoice(0, 2);
  await sleep(200);
  const unchanged = await evalJs(`JSON.parse(localStorage.getItem('${KEY}')).quiz.picks[0]`);
  check("locked question cannot change", unchanged === 0, String(unchanged));

  await clickChoice(1, 1); // correct
  await sleep(400);
  const c = await evalJs(`(() => { const b = document.querySelectorAll('.qz-item')[1].querySelectorAll('.qz-choice'); return { correct: b[1].classList.contains('is-correct'), badge: b[1].querySelector('.qz-badge').textContent }; })()`);
  check("correct pick: 答对 gold state", c.correct && c.badge === "答对", JSON.stringify(c));
  const shotQ = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/qz-answered.png", Buffer.from(shotQ.data, "base64"));

  await nav("http://127.0.0.1:4173/quiz.html");
  const rest = await evalJs(`(() => ({
    strip: document.querySelector('.dc-count').textContent,
    q1wrong: document.querySelectorAll('.qz-item')[0].querySelectorAll('.qz-choice')[0].classList.contains('is-wrong'),
    q1explain: !document.querySelectorAll('.qz-item')[0].querySelector('.qz-explain').hidden,
    q2correct: document.querySelectorAll('.qz-item')[1].querySelectorAll('.qz-choice')[1].classList.contains('is-correct'),
    submitDisabled: document.querySelector('.qz-submit-btn').disabled,
    noResult: !document.querySelector('.qz-result'),
  }))()`);
  check("reload restores locks + explains, no result yet", rest.strip === "2 / 10" && rest.q1wrong && rest.q1explain && rest.q2correct && rest.submitDisabled && rest.noResult, JSON.stringify(rest));

  for (let qi = 2; qi < 10; qi++) {
    const a = await evalJs(`SITE_DATA.quiz[${qi}].answer`);
    await clickChoice(qi, a);
    await sleep(150);
  }
  await sleep(400);
  const ready = await evalJs(`(() => ({ strip: document.querySelector('.dc-count').textContent, disabled: document.querySelector('.qz-submit-btn').disabled, hint: document.querySelector('.qz-submit-hint').textContent }))()`);
  check("10/10 enables submit with ready hint", ready.strip === "10 / 10" && !ready.disabled && ready.hint === "十题已答完。提交后成绩存入研读画像。", JSON.stringify(ready));

  await evalJs(`document.querySelector('.qz-submit-btn').click()`);
  await sleep(800);
  const sub = await evalJs(`(() => {
    const q = JSON.parse(localStorage.getItem('${KEY}')).quiz;
    const r = document.querySelector('.qz-result');
    return { score: q.score, dims: q.dims, picks: q.picks.length,
      result: !!r, scoreNum: r ? r.querySelector('.qz-score-num').textContent : null,
      pcts: r ? [...r.querySelectorAll('.qz-dim-pct')].map(x => x.textContent) : null,
      submitHidden: document.querySelector('.qz-submit').hidden,
      link: r ? r.querySelector('a.cta-gold').getAttribute('href') : null };
  })()`);
  check("submit stores score 9 + dims 3/4,3/3,3/3", sub.score === 9 && JSON.stringify(sub.dims) === JSON.stringify({ timeline: { hit: 3, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 3, total: 3 } }) && sub.picks === 10, JSON.stringify(sub.dims));
  check("result panel 9/10 + 75/100/100 + profile link", sub.result && sub.scoreNum === "9" && JSON.stringify(sub.pcts) === JSON.stringify(["75%", "100%", "100%"]) && sub.submitHidden && sub.link === "profile.html", JSON.stringify(sub.pcts));
  const shotR = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/qz-result.png", Buffer.from(shotR.data, "base64"));

  await nav("http://127.0.0.1:4173/quiz.html");
  const rest2 = await evalJs(`(() => ({ result: !!document.querySelector('.qz-result'), locked: [...document.querySelectorAll('.qz-choice')].every(b => b.disabled), strip: document.querySelector('.dc-count').textContent }))()`);
  check("post-submit reload: result + all locked", rest2.result && rest2.locked && rest2.strip === "10 / 10", JSON.stringify(rest2));

  // ---- profile ----
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${KEY}')); p.timeline = { read: ['e1368', 'e1380'] }; p.decisions = { done: ['d1380'], picks: { d1380: 'B' } }; localStorage.setItem('${KEY}', JSON.stringify(p)); })()`);
  await nav("http://127.0.0.1:4173/profile.html");
  await sleep(600);
  const pf = await evalJs(`(() => ({
    counts: [...document.querySelectorAll('.pf-count')].map(x => x.textContent),
    seals: [...document.querySelectorAll('.pf-seal')].map(x => x.classList.contains('is-done')),
    scoreLine: document.querySelector('.pf-score-line').textContent,
    pcts: [...document.querySelectorAll('.pf-dim-pct')].map(x => x.textContent),
    fracs: [...document.querySelectorAll('.pf-dim-frac')].map(x => x.textContent),
    rec: document.querySelector('.pf-rec-p') ? document.querySelector('.pf-rec-p').textContent : null,
    recLinks: [...document.querySelectorAll('.pf-rec-links a')].map(a => a.getAttribute('href')),
    privacy: document.querySelector('.pf-privacy').textContent,
    tlWidth: document.querySelector('.pf-stat .pf-bar-fill').style.width,
  }))()`);
  check("footprint 2/23 + 1/3 + one seal done", JSON.stringify(pf.counts) === JSON.stringify(["2 / 23", "1 / 3"]) && JSON.stringify(pf.seals) === JSON.stringify([true, false, false]), JSON.stringify(pf.counts));
  check("quiz dims 75/100/100 + score line", pf.scoreLine === "总分 9 / 10" && JSON.stringify(pf.pcts) === JSON.stringify(["75%", "100%", "100%"]) && JSON.stringify(pf.fracs) === JSON.stringify(["3 / 4", "3 / 3", "3 / 3"]), JSON.stringify(pf.pcts));
  check("weakest=timeline rec + link", !!pf.rec && pf.rec.includes("时间线感最弱") && JSON.stringify(pf.recLinks) === JSON.stringify(["timeline.html"]), JSON.stringify(pf.recLinks));
  check("privacy note exact", pf.privacy === "本页所有数据只读取本机浏览器 localStorage，不上传任何服务器。", pf.privacy);
  check("timeline bar filled 2/23", pf.tlWidth !== "0%" && pf.tlWidth !== "", pf.tlWidth);
  const shotP = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/pf-desktop.png", Buffer.from(shotP.data, "base64"));

  // read-only guarantee
  const before = await evalJs(`localStorage.getItem('${KEY}')`);
  await evalJs(`window.dispatchEvent(new StorageEvent('storage', { key: '${KEY}' }))`);
  await sleep(500);
  const after = await evalJs(`localStorage.getItem('${KEY}')`);
  check("profile never writes storage", before === after);

  // institution weakest path
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${KEY}')); p.quiz.dims = { timeline: { hit: 4, total: 4 }, person: { hit: 3, total: 3 }, institution: { hit: 1, total: 3 } }; p.quiz.score = 8; localStorage.setItem('${KEY}', JSON.stringify(p)); })()`);
  await nav("http://127.0.0.1:4173/profile.html");
  await sleep(500);
  const rec2 = await evalJs(`(() => ({ text: document.querySelector('.pf-rec-p').textContent, links: [...document.querySelectorAll('.pf-rec-links a')].map(a => a.getAttribute('href')) }))()`);
  check("institution weakest -> cards + decisions links", rec2.text.includes("制度理解最弱") && JSON.stringify(rec2.links) === JSON.stringify(["cards.html", "decisions.html"]), JSON.stringify(rec2.links));

  // quiz-empty path
  await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('${KEY}')); delete p.quiz; localStorage.setItem('${KEY}', JSON.stringify(p)); })()`);
  await nav("http://127.0.0.1:4173/profile.html");
  await sleep(500);
  const empty = await evalJs(`(() => ({ empty: !!document.querySelector('.pf-empty'), cta: document.querySelector('.pf-empty a') ? document.querySelector('.pf-empty a').getAttribute('href') : null, noRec: !document.querySelector('.pf-rec'), noDims: !document.querySelector('.pf-dims') }))()`);
  check("no quiz -> guidance + quiz CTA, no rec", empty.empty && empty.cta === "quiz.html" && empty.noRec && empty.noDims, JSON.stringify(empty));
  const shotE = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/pf-empty.png", Buffer.from(shotE.data, "base64"));

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const ovP = await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : null`);
  check("profile mobile no overflow", ovP === null, String(ovP));
  await evalJs(`window.scrollTo({ top: 0, behavior: 'instant' })`); await sleep(300);
  const shotM = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/pf-mobile.png", Buffer.from(shotM.data, "base64"));
  await nav("http://127.0.0.1:4173/quiz.html");
  const ovQ = await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : null`);
  check("quiz mobile no overflow", ovQ === null, String(ovQ));

  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await nav("http://127.0.0.1:4173/index.html");
  const entry = await evalJs(`[...document.querySelectorAll('.entry-block')][3].querySelector('.entry-desc').textContent`);
  check("index quiz entry copy updated", entry.includes("十道题"), entry);
  check("zero console/runtime errors", errors.length === 0, errors.join(" | "));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} PASS`);
  for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + "  " + r.name + (r.ok ? "" : "  " + (r.extra || "")));
  ws.close(); chrome.kill(); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });