const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9311;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud67`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-practice.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0, mainId; const pending = new Map(); const excs = []; const errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1800); };
const pages = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).filter((x) => x.type === "page");
const prog = () => evalJs(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || '{}')`);
async function trustedClick(selector) {
  await evalJs(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: "center", behavior: "instant" }); true`);
  await sleep(300);
  const p = await evalJs(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
}
async function expectNewTab(name, urlPrefix) {
  let tab = null;
  for (let i = 0; i < 12; i++) { await sleep(300); tab = (await pages()).find((x) => x.id !== mainId && x.url.startsWith(urlPrefix)); if (tab) break; }
  check(name, !!tab, JSON.stringify((await pages()).map((x) => x.url)));
  if (tab) await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`);
  await sleep(300);
}
const answerAll = (wrongCount) => evalJs(`(() => {
  const items = [...document.querySelectorAll('.qz-formal-root .qz-item')];
  items.forEach((item, i) => [...item.querySelectorAll('.qz-choice')][i < ${wrongCount} ? (SITE_DATA.quiz[i].answer + 1) % 4 : SITE_DATA.quiz[i].answer].click());
  document.querySelector('.qz-submit-btn').click();
  return true;
})()`);

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
  mainId = t.id;
  fs.writeFileSync(DIR + "/stub-mode.txt", "ok");
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

  // 1) three wrong answers -> wrong book with three items
  await nav(BASE + "/quiz.html");
  await evalJs("localStorage.clear(); true");
  await nav(BASE + "/quiz.html");
  await answerAll(3);
  const wrong = await evalJs(`(() => {
    const items = [...document.querySelectorAll('.qz-wrong-item')];
    return {
      title: document.querySelector('.qz-wrong-title').textContent,
      empty: !!document.querySelector('.qz-wrong-empty'),
      items: items.map(item => ({
        stem: item.querySelector('.qz-wrong-stem').textContent,
        lines: [...item.querySelectorAll('.qz-wrong-line')].map(l => [l.querySelector('.qz-wrong-label').textContent, l.querySelector('.qz-wrong-value').textContent]),
        explain: item.querySelector('.qz-wrong-explain').textContent,
        review: { text: item.querySelector('.qz-wrong-review').textContent, href: item.querySelector('.qz-wrong-review').getAttribute('href'), target: item.querySelector('.qz-wrong-review').getAttribute('target'), rel: item.querySelector('.qz-wrong-review').getAttribute('rel') },
      })),
    };
  })()`);
  const p1 = await prog();
  check("wrong book: title + exactly three items, no empty line", wrong.title === "错题本" && wrong.items.length === 3 && !wrong.empty, JSON.stringify({ title: wrong.title, n: wrong.items.length }));
  const wantIds = await evalJs(`SITE_DATA.quiz.slice(0, 3).map(q => q.id)`);
  check("progress.quizWrong records the three ids", JSON.stringify(p1.quizWrong) === JSON.stringify(wantIds), JSON.stringify(p1.quizWrong));
  const wantItems = await evalJs(`SITE_DATA.quiz.slice(0, 3).map((q, i) => { const pick = (q.answer + 1) % 4; return { stem: q.stem, yours: 'ABCD'[pick] + '　' + q.options[pick], right: 'ABCD'[q.answer] + '　' + q.options[q.answer], explain: q.explain, href: q.reviewHref }; })`);
  const itemsOk = wrong.items.every((it, k) => it.stem === wantItems[k].stem && it.lines[0][0] === "你的答案" && it.lines[0][1] === wantItems[k].yours && it.lines[1][0] === "正确答案" && it.lines[1][1] === wantItems[k].right && it.explain === wantItems[k].explain && it.review.text === "回看这条史料 →" && it.review.href === wantItems[k].href && it.review.target === "_blank" && it.review.rel === "noopener");
  check("wrong items: stem/your/correct/explain/review verbatim + new tab", itemsOk, JSON.stringify(wrong.items[0]));

  // 2) each review link reaches its page in a new tab
  for (let k = 0; k < 3; k++) {
    await trustedClick(`.qz-wrong-item:nth-of-type(${k + 1}) .qz-wrong-review`);
    await expectNewTab("review link " + (k + 1) + " opens its target new tab", BASE + "/" + wantItems[k].href.split("?")[0]);
  }

  // 3) profile shows the three pending materials
  await nav(BASE + "/profile.html");
  const pf = await evalJs(`(() => {
    const sec = document.querySelector('.pf-wrong');
    if (!sec) return null;
    return { title: sec.querySelector('.section-title').textContent, rows: [...sec.querySelectorAll('.pf-wrong-row')].map(r => ({ stem: r.querySelector('.pf-wrong-stem').textContent, href: r.querySelector('.pf-wrong-link').getAttribute('href'), target: r.querySelector('.pf-wrong-link').getAttribute('target'), text: r.querySelector('.pf-wrong-link').textContent })) };
  })()`);
  check("profile 待补史料: three rows with review links", pf && pf.title === "待补史料" && pf.rows.length === 3 && pf.rows.every((r, k) => r.stem === wantItems[k].stem && r.href === wantItems[k].href && r.target === "_blank" && r.text === "回看 →"), JSON.stringify(pf));

  // 4) retake, all correct -> empty copy, profile section hidden
  await nav(BASE + "/quiz.html");
  await evalJs(`document.querySelector('.qz-retake').click(); true`);
  await sleep(400);
  await answerAll(0);
  const clean = await evalJs(`(() => ({ empty: document.querySelector('.qz-wrong-empty') ? document.querySelector('.qz-wrong-empty').textContent : null, items: document.querySelectorAll('.qz-wrong-item').length, score: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz.score, wrong: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quizWrong }))()`);
  check("all correct: empty copy, no items, quizWrong cleared", clean.empty === "全对，无待补史料。" && clean.items === 0 && clean.score === 10 && JSON.stringify(clean.wrong) === JSON.stringify([]), JSON.stringify(clean));
  await nav(BASE + "/profile.html");
  const pf2 = await evalJs(`!!document.querySelector('.pf-wrong')`);
  check("profile section hidden after clean submission", pf2 === false, pf2);

  // 5) practice flow intact (no wrong book added)
  await nav(BASE + "/quiz.html");
  await evalJs(`document.querySelectorAll('.qz-mode')[1].click(); true`);
  await evalJs(`document.querySelector('.qz-gen-btn').click(); true`);
  await sleep(1000);
  const prac = await evalJs(`(() => {
    const R = document.querySelector('.qz-practice-root:not([hidden])');
    R.querySelectorAll('.qz-item').forEach((it, i) => [...it.querySelectorAll('.qz-choice')][i % 4].click());
    R.querySelector('.qz-submit-btn').click();
    return { score: R.querySelector('.qz-score-num').textContent, wrongBook: !!R.querySelector('.qz-wrong'), again: !!R.querySelector('.qz-again-btn') };
  })()`);
  check("practice: submit works, no wrong book forced", prac.score === "10" && !prac.wrongBook && prac.again, JSON.stringify(prac));

  // 6) 390px wrong book no overflow
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/quiz.html");
  await evalJs("localStorage.clear(); true");
  await nav(BASE + "/quiz.html");
  await answerAll(3);
  const mob = await evalJs(`(() => ({ sw: document.documentElement.scrollWidth, items: document.querySelectorAll('.qz-wrong-item').length }))()`);
  check("390px wrong book: no overflow, three items", mob.sw <= 390 && mob.items === 3, JSON.stringify(mob));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify48 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });