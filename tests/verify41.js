const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9303;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const BASE = "http://127.0.0.1:8001";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud59`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1700); };
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

  // 1) formal re-picks
  await nav(BASE + "/quiz.html");
  await evalJs("localStorage.clear(); true");
  await nav(BASE + "/quiz.html");
  const repick = await evalJs(`(() => {
    const item = document.querySelectorAll('.qz-formal-root .qz-item')[0];
    const cs = [...item.querySelectorAll('.qz-choice')];
    cs[0].click(); cs[1].click(); cs[2].click();
    const after3 = { pick: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz.picks[0], picked: cs.findIndex(b => b.className.includes('is-picked')), disabled: cs.some(b => b.disabled), explain: item.querySelector('.qz-explain').hidden, count: document.querySelector('.qz-formal-root .dc-progress-text, .qz-formal-root .qz-count') ? null : null };
    cs[1].click();
    return { after3, finalPick: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz.picks[0], finalPicked: cs.findIndex(b => b.className.includes('is-picked')) };
  })()`);
  check("formal: three re-picks replace, picked state follows, no lock/reveal", repick.after3.pick === 2 && repick.after3.picked === 2 && !repick.after3.disabled && repick.after3.explain === true && repick.finalPick === 1 && repick.finalPicked === 1, JSON.stringify(repick));
  const count1 = await evalJs(`document.querySelector('.qz-formal-root .qz-progress, .qz-formal-root') ? [...document.querySelectorAll('.qz-formal-root *')].find(n => n.textContent === '1 / 10' && n.children.length === 0).textContent : null`);
  check("formal: answered count 1/10", count1 === "1 / 10", count1);

  // 2) submit locks + judges; retake clears; latest wins
  const submitFlow = await evalJs(`(() => {
    const items = [...document.querySelectorAll('.qz-formal-root .qz-item')];
    items.forEach((item, i) => [...item.querySelectorAll('.qz-choice')][SITE_DATA.quiz[i].answer].click());
    document.querySelector('.qz-submit-btn').click();
    const cs = [...items[0].querySelectorAll('.qz-choice')];
    const locked = { score: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz.score, disabled: cs.every(b => b.disabled), correct: cs[SITE_DATA.quiz[0].answer].className.includes('is-correct'), explain: !items[0].querySelector('.qz-explain').hidden };
    cs[0].click();
    locked.pickAfter = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz.picks[0];
    const retake = document.querySelector('.qz-retake');
    locked.retakeLabel = retake.textContent;
    retake.click();
    locked.afterRetake = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz;
    locked.resultGone = !document.querySelector('.qz-result');
    locked.allFree = [...items[0].querySelectorAll('.qz-choice')].every(b => !b.disabled && !b.className.includes('is-picked'));
    items.forEach((item, i) => [...item.querySelectorAll('.qz-choice')][(SITE_DATA.quiz[i].answer + 1) % 4].click());
    document.querySelector('.qz-submit-btn').click();
    locked.latestScore = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).quiz.score;
    return locked;
  })()`);
  check("formal: submit judges final picks and locks", submitFlow.score === 10 && submitFlow.disabled && submitFlow.correct && submitFlow.explain && submitFlow.pickAfter === 1, JSON.stringify(submitFlow));
  check("formal: retake clears to fresh state", submitFlow.retakeLabel === "重新作答" && JSON.stringify(submitFlow.afterRetake) === JSON.stringify({ picks: [] }) && submitFlow.resultGone && submitFlow.allFree, JSON.stringify(submitFlow));
  check("formal: latest submission wins (score 0)", submitFlow.latestScore === 0, submitFlow.latestScore);
  await nav(BASE + "/profile.html");
  const pfQuiz = await evalJs(`(() => { const p = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})); return p.quiz.score; })()`);
  check("profile reflects latest quiz score", pfQuiz === 0, pfQuiz);

  // 3) practice re-picks before submit, locked after
  await nav(BASE + "/quiz.html");
  await evalJs(`document.querySelectorAll('.qz-mode')[1].click(); true`);
  await evalJs(`document.querySelector('.qz-gen-btn').click(); true`);
  await sleep(1000);
  const prac = await evalJs(`(() => {
    const R = document.querySelector('.qz-practice-root:not([hidden])');
    const item = R.querySelectorAll('.qz-item')[0];
    const cs = [...item.querySelectorAll('.qz-choice')];
    cs[0].click(); cs[1].click();
    const pre = { picked: cs.findIndex(b => b.className.includes('is-picked')), disabled: cs.some(b => b.disabled), explain: item.querySelector('.qz-explain').hidden };
    R.querySelectorAll('.qz-item').forEach((it, i) => [...it.querySelectorAll('.qz-choice')][i % 4].click());
    R.querySelector('.qz-submit-btn').click();
    const post = { disabled: cs.every(b => b.disabled), explain: !item.querySelector('.qz-explain').hidden, score: R.querySelector('.qz-score-num').textContent };
    cs[0].click();
    post.pickedAfter = cs.findIndex(b => b.className.includes('is-picked'));
    return { pre, post };
  })()`);
  check("practice: re-pick before submit, no reveal", prac.pre.picked === 1 && !prac.pre.disabled && prac.pre.explain === true, JSON.stringify(prac.pre));
  check("practice: submit reveals + locks", prac.post.disabled && prac.post.explain && prac.post.pickedAfter === -1, JSON.stringify(prac.post));

  // 4) decisions change picks
  await nav(BASE + "/decisions.html");
  const dc = await evalJs(`(() => {
    const out = [];
    document.querySelectorAll('.dc-scenario').forEach((s, i) => {
      const cs = [...s.querySelectorAll('.dc-choice')];
      cs[0].click(); cs[1].click();
      const sc = SITE_DATA.decisions[i];
      out.push({
        pick: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).decisions.picks[sc.id],
        want: sc.choices[1].key,
        cons: s.querySelector('.dc-consequence-p').textContent === sc.choices[1].consequence,
        hist: s.querySelector('.dc-history-p').textContent === sc.choices[1].history,
        enabled: cs.every(b => !b.disabled),
        picked: cs[1].className.includes('is-picked') && cs[0].className.includes('is-dim'),
        seal: !s.querySelector('.dc-seal').hidden,
        hint: s.querySelector('.dc-lock-hint').textContent,
      });
    });
    return { out, count: document.querySelector('.dc-count').textContent, done: JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).decisions.done };
  })()`);
  check("decisions: all three changeable, result/seal/hint follow", dc.out.every(o => o.pick === o.want && o.cons && o.hist && o.enabled && o.picked && o.seal && o.hint === "已记录，可点选其他选项更改") && dc.count === "3 / 3" && dc.done.length === 3, JSON.stringify(dc));
  await nav(BASE + "/decisions.html");
  const dcRefresh = await evalJs(`[...document.querySelectorAll('.dc-scenario')].every((s, i) => [...s.querySelectorAll('.dc-choice')][1].className.includes('is-picked'))`);
  check("decisions: refresh keeps latest picks", dcRefresh === true, dcRefresh);

  // 5) cards banner harmony
  await nav(BASE + "/cards.html");
  const banner = await evalJs(`(() => {
    const b = document.querySelector('.cw-chapter-banner');
    const card = document.querySelector('.cw-card');
    const bs = getComputedStyle(b);
    const links = [...b.querySelectorAll('.cw-banner-links .cw-banner-second')];
    const row = b.querySelector('.cw-banner-links');
    return {
      tag: b.tagName, radius: bs.borderRadius, cardRadius: getComputedStyle(card).borderRadius,
      innerRadius: getComputedStyle(b, '::before').borderRadius,
      marginTop: bs.marginTop, marginBottom: bs.marginBottom,
      links: links.map(a => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel'), top: Math.round(a.getBoundingClientRect().top) })),
      rowInside: b.contains(row), main: { href: b.querySelector('.cw-banner-main').getAttribute('href'), target: b.querySelector('.cw-banner-main').getAttribute('target') },
      outsideLinks: document.querySelectorAll('.cw-wrap > .cw-banner-second').length
    };
  })()`);
  check("banner: section with main link, radius matches cards (outer+inner)", banner.tag === "SECTION" && banner.radius === banner.cardRadius && banner.innerRadius === banner.cardRadius && banner.main.href === "chapter.html" && banner.main.target === "_blank", JSON.stringify(banner));
  check("banner: gap rhythm margin-top var(--gap), bottom kept", banner.marginTop === "24px" && banner.marginBottom === "28.8px", JSON.stringify([banner.marginTop, banner.marginBottom]));
  check("banner: seven chapter links inside one row, new tab", banner.rowInside && banner.outsideLinks === 0 && banner.links.length === 7 && new Set(banner.links.map(l => l.top)).size === 1 && banner.links.every(l => l.target === "_blank" && l.rel === "noopener") && banner.links.map(l => l.href).join(",") === "chapter.html?ch=jingnan,chapter.html?ch=tumubao,chapter.html?ch=jiajing,chapter.html?ch=zhangjuzheng,chapter.html?ch=wanli,chapter.html?ch=chongzhen,chapter.html?ch=xuxiake", JSON.stringify(banner.links));
  await trustedClick('.cw-banner-links .cw-banner-second[href="chapter.html?ch=jingnan"]');
  await expectNewTab("banner chapter link opens new tab", BASE + "/chapter.html?ch=jingnan");

  // 6) 390px banner wraps, no overflow
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav(BASE + "/cards.html");
  const mob = await evalJs(`(() => {
    const b = document.querySelector('.cw-chapter-banner');
    const links = [...b.querySelectorAll('.cw-banner-second')];
    return { docW: document.documentElement.scrollWidth, right: Math.round(b.getBoundingClientRect().right), rows: new Set(links.map(a => Math.round(a.getBoundingClientRect().top))).size, inside: links.every(a => a.getBoundingClientRect().right <= 390) };
  })()`);
  check("390px: banner links wrap inside, no overflow", mob.docW <= 390 && mob.right <= 390 && mob.rows > 1 && mob.inside, JSON.stringify(mob));
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }).slice(0, 300));
  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify41 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });