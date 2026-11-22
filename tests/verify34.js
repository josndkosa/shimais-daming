const { spawn, execSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9290;
const DIR = __dirname;
const KEY = "shimais-daming:progress:v1";
const backend = JSON.parse(fs.readFileSync("D:/shimais-daming/backend/data/zhuyuanzhang.json", "utf8")).chunks;
const headData = vm.runInContext(execSync("git show HEAD:frontend/data.js", { cwd: "D:/shimais-daming", encoding: "utf8" }) + "\nSITE_DATA;", vm.createContext({ window: {} }));
const headCh = headData.chapter || headData.chapters[0];
const headNext = (headData.chapterUI.next || headData.chapters[0].nextSteps).map((l) => ({ label: l.label, href: l.href.replace("qinli.html?story=", "qinli-play.html?story=") }));
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud46`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const stub = spawn(process.execPath, [DIR + "/stub-chat-delay.js", "8001"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const excs = []; const errs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1800); };

(async () => {
  let t;
  for (let i = 0; i < 40; i++) { await sleep(300); try { t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page"); if (t) break; } catch {} }
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

  await nav("http://127.0.0.1:8001/chapter.html");
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({ timeline: { read: ["e1380"] }, sentinel: "aj" }))`);
  const before = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  await nav("http://127.0.0.1:8001/chapter.html");

  // 1) structure: 4 collapsed details, counts 3/1/2/2, section 5 none
  const st = await evalJs(`(() => {
    const secs = [...document.querySelectorAll('.ch-section')];
    return {
      secCount: secs.length,
      perSec: secs.map(s => { const d = s.querySelector('details.ch-sources'); return d ? { n: d.querySelectorAll('.ch-slip').length, open: d.open, summary: d.querySelector('summary').textContent, h: d.getBoundingClientRect().height, sh: d.querySelector('summary').getBoundingClientRect().height } : null; }),
      summariesOneLine: [...document.querySelectorAll('.ch-sources-summary')].every(x => x.getBoundingClientRect().height < 48)
    };
  })()`);
  check("five sections, details only in first four", st.secCount === 5 && st.perSec.slice(0, 4).every(Boolean) && st.perSec[4] === null, JSON.stringify(st.perSec));
  check("counts 3/1/2/2 with exact summary copy", JSON.stringify(st.perSec.slice(0, 4).map(x => x.n)) === JSON.stringify([3, 1, 2, 2]) && JSON.stringify(st.perSec.slice(0, 4).map(x => x.summary)) === JSON.stringify(["本节史料（3 条）", "本节史料（1 条）", "本节史料（2 条）", "本节史料（2 条）"]), JSON.stringify(st.perSec));
  check("all collapsed by default, one line each", st.perSec.slice(0, 4).every(x => !x.open && Math.abs(x.h - x.sh) < 2) && st.summariesOneLine, JSON.stringify(st.perSec));

  // 2) toggle open/close repeatedly
  const tg = await evalJs(`(() => {
    const d = document.querySelector('details.ch-sources');
    const s = d.querySelector('summary');
    const seq = [];
    for (let i = 0; i < 3; i++) { s.click(); seq.push(d.open); s.click(); seq.push(d.open); }
    s.click();
    return { seq, open: d.open, visibleCards: [...d.querySelectorAll('.ch-slip')].filter(c => c.getBoundingClientRect().height > 0).length };
  })()`);
  check("toggle open/close x3 then open", JSON.stringify(tg.seq) === JSON.stringify([true, false, true, false, true, false]) && tg.open && tg.visibleCards === 3, JSON.stringify(tg));

  // 3) verbatim card content vs backend (all 8 across sections)
  await evalJs(`document.querySelectorAll('details.ch-sources').forEach(d => d.open = true); true`);
  const cards = await evalJs(`[...document.querySelectorAll('.ch-slip')].map(c => ({ title: c.querySelector('.ch-slip-title').textContent, text: c.querySelector('.ch-slip-text').textContent, from: c.querySelector('.ch-slip-from').textContent }))`);
  const order = [["c1", "c2", "c6"], ["c3"], ["c4", "c5"], ["c7", "c8"]].flat();
  const expect = order.map(id => { const c = backend.find(x => x.id === id); return { title: c.title, text: c.text, from: "—— " + c.source }; });
  check("8 cards verbatim title/text/source vs backend", JSON.stringify(cards) === JSON.stringify(expect), JSON.stringify({ cards, expect }).slice(0, 400));

  // 4) no overlap: expanded block above 依据 line; 依据 above next title
  const geo = await evalJs(`(() => {
    const secs = [...document.querySelectorAll('.ch-section')];
    const out = [];
    secs.forEach((s, i) => {
      const d = s.querySelector('details.ch-sources');
      const src = s.querySelector('.ch-source');
      if (d) out.push({ i, slipBottom: d.getBoundingClientRect().bottom, srcTop: src.getBoundingClientRect().top });
      if (i < 4) out.push({ i, srcBottom: src.getBoundingClientRect().bottom, nextTop: secs[i + 1].querySelector('.ch-sec-title').getBoundingClientRect().top });
    });
    return out;
  })()`);
  check("expanded slips never cover 依据 line or next title", geo.every(g => g.slipBottom !== undefined ? g.slipBottom <= g.srcTop + 1 : g.srcBottom < g.nextTop), JSON.stringify(geo));

  // 5) body copy verbatim vs HEAD (titles/paragraphs/sourceNote/next links)
  const copy = await evalJs(`(() => ({
    titles: [...document.querySelectorAll('.ch-section > .ch-sec-title')].map(x => x.textContent),
    paras: [...document.querySelectorAll('.ch-section')].map(s => [...s.querySelectorAll('.ch-p')].map(p => p.textContent)),
    notes: [...document.querySelectorAll('.ch-source')].map(x => x.textContent),
    next: [...document.querySelectorAll('.ch-next-link')].map(a => [a.textContent, a.getAttribute('href')])
  }))()`);
  const headNotes = headCh.sections.map(s => headData.chapterUI.sourcePrefix + s.sourceNote);
  check("section titles/paragraphs verbatim vs HEAD", JSON.stringify(copy.titles) === JSON.stringify(headCh.sections.map(s => s.title)) && JSON.stringify(copy.paras) === JSON.stringify(headCh.sections.map(s => s.paragraphs)), "copy drift");
  check("依据 lines verbatim vs HEAD", JSON.stringify(copy.notes) === JSON.stringify(headNotes), JSON.stringify({ copy: copy.notes, headNotes }));
  check("next three links verbatim vs HEAD", JSON.stringify(copy.next) === JSON.stringify(headNext.map(l => [l.label, l.href])), JSON.stringify(copy.next));

  // 6) 390px all expanded: no overflow
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await nav("http://127.0.0.1:8001/chapter.html");
  await evalJs(`document.querySelectorAll('details.ch-sources').forEach(d => d.open = true); true`);
  await sleep(400);
  const mob = await evalJs(`(() => ({ sw: document.documentElement.scrollWidth, slips: [...document.querySelectorAll('.ch-slip')].every(c => c.getBoundingClientRect().right <= 390) }))()`);
  check("390px expanded: no h-overflow, slips inside viewport", mob.sw <= 390 && mob.slips, JSON.stringify(mob));
  await send("Emulation.clearDeviceMetricsOverride");

  // 7) zero progress writes + zero errors
  const after = await evalJs(`localStorage.getItem(${JSON.stringify(KEY)})`);
  check("localStorage progress untouched", after === before, JSON.stringify({ before, after }));
  check("zero console/runtime errors", excs.length === 0 && errs.length === 0, JSON.stringify({ excs, errs }));

  const failed = results.filter((r) => !r.ok).length;
  console.log("== verify34 " + (results.length - failed) + "/" + results.length + " ==");
  ws.close(); chrome.kill(); stub.kill();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); stub.kill(); process.exit(1); });