const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9278;
const DIR = __dirname;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${DIR}/ud40`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(DIR + "/" + name + ".png", Buffer.from(s.data, "base64")); };
const typo = () => evalJs(`(() => {
  const pick = (sel, root) => { const n = (root || document).querySelector(sel); if (!n) return null; const cs = getComputedStyle(n); return { align: cs.textAlign, size: cs.fontSize }; };
  const person = document.querySelector('.cw-person');
  const inst = document.querySelector('.cw-inst');
  return {
    person: {
      card: pick('.cw-person') && getComputedStyle(person).textAlign,
      name: pick('.cw-name', person), role: pick('.cw-role', person), era: pick('.cw-era', person),
      position: pick('.cw-position', person), note: pick('.cw-note', document.querySelectorAll('.cw-person')[5]),
      factLabel: pick('.cw-facts-label', person), fact: pick('.cw-fact', person),
      commentLabel: pick('.cw-comment-label', person), commentP: pick('.cw-comment-p', person),
      link: pick('.topic-next', person), quote: pick('.cw-paper-quote', person), from: pick('.cw-paper-from', person),
      headJustify: getComputedStyle(person.querySelector('.cw-head')).justifyContent,
      commentBorderLeft: getComputedStyle(person.querySelector('.cw-comment')).borderLeftWidth,
      linkCentered: (() => { const a = person.querySelector('.topic-next'); const r = a.getBoundingClientRect(); const c = person.getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (c.left + c.width / 2)) < 2; })()
    },
    inst: { align: getComputedStyle(inst).textAlign, name: pick('.cw-name', inst), glyph: pick('.cw-glyph', inst), position: pick('.cw-position', inst), fact: pick('.cw-fact', inst), commentP: pick('.cw-comment-p', inst) }
  };
})()`);

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
  await nav("http://127.0.0.1:4173/cards.html");
  await sleep(2600);
  const t1 = await typo();
  const p = t1.person;
  check("person card centered (card/head/links/from)", p.card === "center" && p.headJustify === "center" && p.linkCentered && p.from.align === "center", JSON.stringify([p.card, p.headJustify, p.linkCentered, p.from.align]));
  check("person type +4px: name28 role/era17 position20 note17 labels15 fact17.5 comment17.5 link18 quote21 from17", p.name.size === "28px" && p.role.size === "17px" && p.era.size === "17px" && p.position.size === "20px" && p.note.size === "17px" && p.factLabel.size === "15px" && p.fact.size === "17.5px" && p.commentP.size === "17.5px" && p.link.size === "18px" && p.quote.size === "21px" && p.from.size === "17px", JSON.stringify(p));
  check("comment rule moved to top for centered plaque", p.commentBorderLeft === "0px", p.commentBorderLeft);
  const i = t1.inst;
  check("institution cards untouched (start align, original sizes)", i.align === "start" && i.name.size === "24px" && i.position.size === "16px" && i.fact.size === "13.5px" && i.commentP.size === "13.5px", JSON.stringify(i));
  const overflow = await evalJs(`document.documentElement.scrollWidth`);
  check("desktop no overflow", overflow <= 1280, overflow);
  await evalJs(`document.querySelectorAll('.cw-person')[0].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(600);
  await shot("cards-centered-p1");
  await evalJs(`document.querySelectorAll('.cw-person')[4].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(600);
  await shot("cards-centered-p5");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/cards.html");
  await sleep(2600);
  const mob = await evalJs(`(() => ({ docW: document.documentElement.scrollWidth, align: getComputedStyle(document.querySelector('.cw-person')).textAlign, nameSize: getComputedStyle(document.querySelector('.cw-person .cw-name')).fontSize }))()`);
  check("390px: centered, bumped, no overflow", mob.docW <= 390 && mob.align === "center" && mob.nameSize === "28px", JSON.stringify(mob));
  await evalJs(`document.querySelectorAll('.cw-person')[2].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(600);
  await shot("cards-centered-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });