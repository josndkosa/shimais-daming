const { spawn } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9253;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud15`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const load = (p) => vm.runInNewContext(fs.readFileSync(p, "utf8") + "\nSITE_DATA;", {});
const NEW_NOTES = {
  李如松: "万历三大征占了两个，死在最后一次出塞上。本条画其统兵主段 1592–1598，辽东总兵本任仅 1597–1598。",
  孙传庭: "「传庭死而明亡」——他自己出关前就说过此去不返。此前 1636–1639 年任陕西巡抚、1639–1642 年下狱，与本段不连续。",
  杨嗣昌: "「四正六隅」一度见效，但福王、襄王一死，他先垮了。正式督师仅 1640–1641，此前为兵部尚书在京主持。",
};
(async () => {
  // ---- node 侧：HEAD 数据 vs 工作区数据，仅三条 note 不同 ----
  const old = load(__dirname + "/old-data.js");
  const cur = load("D:/shimais-daming/data.js");
  const diffs = [];
  const walk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      keys.forEach((k) => walk(a[k], b[k], path + "." + k));
    } else diffs.push(path);
  };
  walk(old, cur, "root");
  const expectPaths = ["root.relations.guests.3.note", "root.relations.guests.5.note", "root.relations.guests.7.note"];
  check("data.js: exactly 3 note fields differ vs HEAD", JSON.stringify(diffs) === JSON.stringify(expectPaths), JSON.stringify(diffs));
  const patched = JSON.parse(JSON.stringify(old));
  [3, 5, 7].forEach((i) => { patched.relations.guests[i].note = NEW_NOTES[patched.relations.guests[i].name]; });
  check("data.js: new notes verbatim (house 「」 quotes), rest byte-identical", JSON.stringify(patched) === JSON.stringify(cur), "mismatch");
  check("guests order/index sanity: 3=李如松 5=孙传庭 7=杨嗣昌", cur.relations.guests[3].name === "李如松" && cur.relations.guests[5].name === "孙传庭" && cur.relations.guests[7].name === "杨嗣昌", JSON.stringify(cur.relations.guests.map(g => g.name)));

  // ---- 渲染侧：45 张卡逐字段比对（期望 = HEAD 数据 + 三条新 note） ----
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
  await send("Page.navigate", { url: "http://127.0.0.1:4173/relations.html" }); await sleep(1400);

  const ui = patched.relationsUI;
  const expected = [];
  const pushPerson = (kind, p) => {
    const rows = [];
    if (kind === "emperor") {
      rows.push([ui.cardLabels.identity, p.era]);
      rows.push([ui.cardLabels.tenure, p.from + "–" + p.to]);
      rows.push([ui.cardLabels.reign, p.from + "–" + p.to + (p.note ? " · " + p.note : "")]);
    } else {
      rows.push([ui.cardLabels.identity, kind === "chief" ? ui.chiefIdentity : p.office]);
      rows.push([ui.cardLabels.tenure, p.segments.map((s) => s[0] + "–" + s[1]).join("、")]);
      rows.push([ui.cardLabels.lord, p.lord]);
      rows.push([ui.cardLabels.tag, p.tag]);
      rows.push([ui.cardLabels.end, p.end]);
      rows.push([ui.cardLabels.note, p.note]);
    }
    expected.push({ kind, name: p.name, rows });
  };
  patched.relations.emperors.forEach((p) => pushPerson("emperor", p));
  patched.relations.chiefs.forEach((p) => pushPerson("chief", p));
  patched.relations.guests.forEach((p) => pushPerson("guest", p));

  const got = await evalJs(`(() => {
    const out = [];
    for (const kind of ['emperor', 'chief', 'guest']) {
      for (const row of document.querySelectorAll('.rl-lane-' + kind + ' .rl-row')) {
        row.querySelector('.rl-bar').click();
        out.push({ kind, name: document.querySelector('.rl-card-name').textContent, rows: [...document.querySelectorAll('.rl-card-row')].map(r => [r.querySelector('.rl-card-label').textContent, r.querySelector('.rl-card-value').textContent]) });
        document.querySelector('.rl-close').click();
      }
    }
    return out;
  })()`);
  check("all 45 cards render field-identical to HEAD+3 notes", JSON.stringify(got) === JSON.stringify(expected), JSON.stringify(got.filter((g, i) => JSON.stringify(g) !== JSON.stringify(expected[i])).slice(0, 2)));
  const three = got.filter((g) => NEW_NOTES[g.name]);
  check("3 cards carry appended annotations verbatim at note end", three.length === 3 && three.every((g) => g.rows[g.rows.length - 1][1] === NEW_NOTES[g.name]), JSON.stringify(three.map(g => g.name)));

  // ---- 图表几何与结构不变 ----
  const span = ui.axisEnd - ui.axisStart;
  const pct = (y) => ((y - ui.axisStart) / span) * 100;
  const expBars = [];
  const addBars = (kind, people) => people.forEach((p) => {
    const segs = kind === "emperor" ? [[p.from, p.to]] : p.segments;
    segs.forEach((s) => expBars.push({ kind, left: pct(s[0]) + "%", width: Math.max(pct(s[1]) - pct(s[0]), 0.45) + "%" }));
  });
  addBars("emperor", patched.relations.emperors);
  addBars("chief", patched.relations.chiefs);
  addBars("guest", patched.relations.guests);
  const chart = await evalJs(`(() => ({
    bars: [...document.querySelectorAll('.rl-bar')].map(b => ({ kind: b.classList.contains('rl-bar-emperor') ? 'emperor' : b.classList.contains('rl-bar-chief') ? 'chief' : 'guest', left: b.style.left, width: b.style.width })),
    ticks: [...document.querySelectorAll('.rl-tick')].map(t => t.textContent),
    gap: document.querySelector('.rl-gap-text').textContent,
    counts: [...document.querySelectorAll('.rl-lane-count')].map(x => x.textContent),
    legend: document.querySelector('.rl-legend-note').textContent,
  }))()`);
  const geoOk = chart.bars.length === expBars.length && chart.bars.every((b, i) => b.kind === expBars[i].kind && Math.abs(parseFloat(b.left) - parseFloat(expBars[i].left)) < 0.001 && Math.abs(parseFloat(b.width) - parseFloat(expBars[i].width)) < 0.001);
  check("chart geometry: all 53 bars left/width identical to HEAD data", geoOk, JSON.stringify(chart.bars.slice(0, 3)));
  check("ticks / gap note / counts / legend unchanged", chart.ticks.length === 15 && chart.gap === ui.gapNote && JSON.stringify(chart.counts) === JSON.stringify(["17 段在位", "20 人任期", "8 人任职"]) && chart.legend === ui.legendNote, JSON.stringify([chart.ticks.length, chart.counts]));

  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));
  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });