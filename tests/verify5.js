const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9244;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud6`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
  await nav("http://127.0.0.1:4173/decisions.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/decisions.html");

  const struct = await evalJs(`(() => {
    const sc = [...document.querySelectorAll('.dc-scenario')];
    return {
      count: sc.length,
      bg: sc.map(n => n.querySelectorAll('.dc-bg-p').length),
      roles: sc.map(n => n.querySelector('.dc-role-name').textContent),
      keys: sc.map(n => [...n.querySelectorAll('.dc-choice')].map(b => b.dataset.key)),
      labels: sc.map(n => [...n.querySelectorAll('.dc-choice-label')].map(b => b.textContent)),
      dataLabels: SITE_DATA.decisions.map(s => s.choices.map(c => c.label)),
      strip: document.querySelector('.dc-count').textContent,
      hint: document.querySelector('.dc-lock-hint').textContent,
      resultsHidden: sc.map(n => n.querySelector('.dc-result').hidden),
      resultsVisible: sc.map(n => n.querySelector('.dc-result').getBoundingClientRect().height > 0),
      sealsHidden: sc.map(n => n.querySelector('.dc-seal').hidden),
    };
  })()`);
  check("3 scenarios, 3-sentence backgrounds", struct.count === 3 && JSON.stringify(struct.bg) === "[3,3,3]", JSON.stringify(struct.bg));
  check("roles 朱元璋/于谦/张居正", JSON.stringify(struct.roles) === JSON.stringify(["朱元璋", "于谦", "张居正"]), struct.roles.join(","));
  check("3 choices A/B/C each, labels match data", JSON.stringify(struct.keys) === JSON.stringify([["A","B","C"],["A","B","C"],["A","B","C"]]) && JSON.stringify(struct.labels) === JSON.stringify(struct.dataLabels));
  check("strip 0 / 3, results+seals hidden", struct.strip === "0 / 3" && struct.resultsHidden.every(Boolean) && struct.sealsHidden.every(Boolean) && struct.resultsVisible.every(v => !v), struct.strip + " vis:" + JSON.stringify(struct.resultsVisible));

  const shot0 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/dc-initial.png", Buffer.from(shot0.data, "base64"));

  // pick B on scenario 1
  await evalJs(`document.querySelectorAll('.dc-scenario')[0].querySelectorAll('.dc-choice')[1].click()`);
  await sleep(700);
  const s1 = await evalJs(`(() => {
    const n = document.querySelectorAll('.dc-scenario')[0];
    const btns = [...n.querySelectorAll('.dc-choice')];
    const c = SITE_DATA.decisions[0].choices[1];
    const store = JSON.parse(localStorage.getItem('shimais-daming:progress:v1'));
    return {
      disabled: btns.map(b => b.disabled), picked: btns.map(b => b.classList.contains('is-picked')), dim: btns.map(b => b.classList.contains('is-dim')),
      resultHidden: n.querySelector('.dc-result').hidden,
      cons: n.querySelector('.dc-consequence-p').textContent, hist: n.querySelector('.dc-history-p').textContent,
      consOk: n.querySelector('.dc-consequence-p').textContent === c.consequence,
      histOk: n.querySelector('.dc-history-p').textContent === c.history,
      seal: !n.querySelector('.dc-seal').hidden, hint: n.querySelector('.dc-lock-hint').textContent,
      strip: document.querySelector('.dc-count').textContent,
      done: store.decisions.done, picks: store.decisions.picks,
    };
  })()`);
  check("pick locks all 3 buttons", JSON.stringify(s1.disabled) === "[true,true,true]" && JSON.stringify(s1.picked) === "[false,true,false]" && JSON.stringify(s1.dim) === "[true,false,true]");
  check("consequence + history verbatim", s1.consOk && s1.histOk && !s1.resultHidden, s1.hist.slice(0, 40));
  check("seal + locked hint + strip 1/3", s1.seal && s1.hint === "此局已锁 · 选择不可更改" && s1.strip === "1 / 3", s1.strip);
  check("progress decisions.done + picks", JSON.stringify(s1.done) === JSON.stringify(["d1380"]) && s1.picks.d1380 === "B", JSON.stringify(s1.picks));

  // clicking a disabled option changes nothing
  await evalJs(`document.querySelectorAll('.dc-scenario')[0].querySelectorAll('.dc-choice')[0].click()`);
  await sleep(300);
  const still = await evalJs(`JSON.parse(localStorage.getItem('shimais-daming:progress:v1')).decisions.picks.d1380`);
  check("locked pick cannot change", still === "B", still);

  // reload restores locked state
  await nav("http://127.0.0.1:4173/decisions.html");
  const restored = await evalJs(`(() => {
    const n = document.querySelectorAll('.dc-scenario')[0];
    return { picked: n.querySelectorAll('.dc-choice')[1].classList.contains('is-picked'), disabled: n.querySelectorAll('.dc-choice')[0].disabled, result: !n.querySelector('.dc-result').hidden, strip: document.querySelector('.dc-count').textContent };
  })()`);
  check("reload restores lock + result + 1/3", restored.picked && restored.disabled && restored.result && restored.strip === "1 / 3", JSON.stringify(restored));

  // cross-tab sync: external write + storage event
  await evalJs(`(() => {
    const p = JSON.parse(localStorage.getItem('shimais-daming:progress:v1'));
    p.decisions.done.push('d1449'); p.decisions.picks.d1449 = 'A';
    localStorage.setItem('shimais-daming:progress:v1', JSON.stringify(p));
    window.dispatchEvent(new StorageEvent('storage', { key: 'shimais-daming:progress:v1' }));
  })()`);
  await sleep(400);
  const sync = await evalJs(`(() => {
    const n = document.querySelectorAll('.dc-scenario')[1];
    return { picked: n.querySelectorAll('.dc-choice')[0].classList.contains('is-picked'), result: !n.querySelector('.dc-result').hidden, strip: document.querySelector('.dc-count').textContent };
  })()`);
  check("storage event syncs lock + 2/3", sync.picked && sync.result && sync.strip === "2 / 3", JSON.stringify(sync));

  // timeline progress coexists
  await nav("http://127.0.0.1:4173/timeline.html");
  await evalJs(`document.querySelector('.tl-row').click()`);
  await sleep(400);
  await nav("http://127.0.0.1:4173/decisions.html");
  const co = await evalJs(`(() => { const p = JSON.parse(localStorage.getItem('shimais-daming:progress:v1')); return { done: p.decisions.done, read: p.timeline.read, strip: document.querySelector('.dc-count').textContent }; })()`);
  check("timeline + decisions progress coexist", co.read.includes("e1368") && co.done.length === 2 && co.strip === "2 / 3", JSON.stringify(co));

  // finish third
  await evalJs(`document.querySelectorAll('.dc-scenario')[2].querySelectorAll('.dc-choice')[2].click()`);
  await sleep(700);
  const fin = await evalJs(`(() => ({
    strip: document.querySelector('.dc-count').textContent,
    note: !document.querySelector('.dc-complete-note').hidden,
    noteText: document.querySelector('.dc-complete-note').textContent,
    seals: [...document.querySelectorAll('.dc-seal')].map(s => !s.hidden),
    fill: document.querySelector('.dc-bar-fill').style.width,
  }))()`);
  check("3/3 + complete note + all seals + full bar", fin.strip === "3 / 3" && fin.note && fin.seals.every(Boolean) && fin.fill === "100%", JSON.stringify(fin));
  const shot1 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/dc-done-top.png", Buffer.from(shot1.data, "base64"));
  await evalJs(`document.querySelectorAll('.dc-scenario')[0].scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(400);
  const headClear = await evalJs(`(() => { const h = document.querySelectorAll('.dc-scenario')[0].querySelector('.dc-head').getBoundingClientRect(); const s = document.querySelector('.dc-progress').getBoundingClientRect(); return { headTop: Math.round(h.top), stripBottom: Math.round(s.bottom) }; })()`);
  check("scenario head clears sticky strip on jump", headClear.headTop >= headClear.stripBottom, JSON.stringify(headClear));
  const shot2 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/dc-done-s1.png", Buffer.from(shot2.data, "base64"));

  // sticky strip stays under nav while scrolled deep
  await evalJs(`document.querySelectorAll('.dc-scenario')[2].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(300);
  const sticky = await evalJs(`(() => { const r = document.querySelector('.dc-progress').getBoundingClientRect(); const nav = document.querySelector('.site-nav').getBoundingClientRect(); return { top: Math.round(r.top), navBottom: Math.round(nav.bottom) }; })()`);
  check("progress strip sticky under nav", Math.abs(sticky.top - sticky.navBottom) <= 2, JSON.stringify(sticky));

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await sleep(600);
  const ov = await evalJs(`document.documentElement.scrollWidth > window.innerWidth ? document.documentElement.scrollWidth : null`);
  check("mobile no horizontal overflow", ov === null, String(ov));
  const mres = await evalJs(`getComputedStyle(document.querySelector('.dc-result')).gridTemplateColumns.split(' ').length`);
  check("mobile result single column", mres === 1, String(mres));
  await evalJs(`document.querySelectorAll('.dc-scenario')[1].scrollIntoView({ block: 'start', behavior: 'instant' })`);
  await sleep(400);
  const shot3 = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/dc-mobile.png", Buffer.from(shot3.data, "base64"));

  // other pages intact
  await send("Emulation.clearDeviceMetricsOverride");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await nav("http://127.0.0.1:4173/cards.html");
  const ph = await evalJs(`!!document.querySelector('.placeholder-badge')`);
  check("cards still placeholder", ph === true);
  await nav("http://127.0.0.1:4173/index.html");
  const entry = await evalJs(`[...document.querySelectorAll('.entry-block')][1].querySelector('.entry-desc').textContent`);
  check("index entry copy updated", entry.includes("1380 废相"), entry);

  check("zero console/runtime errors", errors.length === 0, errors.join(" | "));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} PASS`);
  for (const r of results) console.log((r.ok ? "PASS" : "FAIL") + "  " + r.name + (r.ok ? "" : "  " + (r.extra || "")));
  ws.close(); chrome.kill(); process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });