const { spawn, execSync } = require("child_process");
const fs = require("fs");
const vm = require("vm");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9269;
const ROOT = "D:/shimais-daming";
const KEY = "shimais-daming:progress:v1";
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud31`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const QUOTES = {
  朱元璋: ["驱除胡虏，恢复中华，立纲陈纪，救济斯民。", "北伐《谕中原檄》"],
  于谦: ["粉身碎骨浑不怕，要留清白在人间。", "《石灰吟》"],
  海瑞: ["盖天下之人不直陛下久矣。", "《治安疏》"],
  张居正: ["天下之事，不难于立法，而难于法之必行。", "张居正奏疏"],
};
const readCards = () => evalJs(`(() => [...document.querySelectorAll('.cw-card')].map(card => {
  const body = card.querySelector('.cw-body');
  const paper = card.querySelector('.cw-paper');
  const facts = card.querySelector('.cw-facts');
  const comment = card.querySelector('.cw-comment');
  const kids = [...body.children];
  let geo = null;
  if (paper) {
    const pr = paper.getBoundingClientRect(), cr = card.getBoundingClientRect(), mr = comment.getBoundingClientRect();
    const mid = paper.querySelector('.cw-paper-mid'), inn = paper.querySelector('.cw-paper-in');
    const q = paper.querySelector('.cw-paper-quote'), f = paper.querySelector('.cw-paper-from');
    const fish = paper.querySelector('.cw-paper-fish');
    const cs = getComputedStyle(paper), cm = getComputedStyle(mid), ci = getComputedStyle(inn), cq = getComputedStyle(q), cf = getComputedStyle(f);
    geo = {
      overflow: pr.right > cr.right + 1 || pr.left < cr.left - 1,
      aboveComment: pr.bottom <= mr.top + 1,
      between: kids.indexOf(facts) < kids.indexOf(paper) && kids.indexOf(paper) < kids.indexOf(comment),
      bg: cs.backgroundImage, pad: cs.paddingTop,
      midBorder: cm.borderTopWidth, midPad: cm.paddingTop,
      declMid: [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules]; } catch (e) { return []; } }).filter((r) => r.selectorText === ".cw-paper-mid").map((r) => r.style.borderTopWidth)[0],
      declIn: [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules]; } catch (e) { return []; } }).filter((r) => r.selectorText === ".cw-paper-in").map((r) => r.style.borderTopWidth)[0],
      inBorder: ci.borderTopWidth, inPad: ci.paddingTop + '/' + ci.paddingRight + '/' + ci.paddingBottom,
      qSize: cq.fontSize, qLh: cq.lineHeight, qLs: cq.letterSpacing, qColor: cq.color, qFont: cq.fontFamily,
      fSize: cf.fontSize, fColor: cf.color, fAlign: cf.textAlign,
      fishView: fish.getAttribute('viewBox'), fishD: fish.querySelector('path').getAttribute('d'), fishFill: getComputedStyle(fish.querySelector('path')).fill,
      quote: q.textContent, from: f.textContent
    };
  }
  return { name: card.querySelector('.cw-name').textContent, hasPaper: !!paper, geo, bodyKids: kids.map(k => k.className.split(' ')[0]), isInst: card.classList.contains('cw-inst'), hasSub: !!card.querySelector('.cw-sub'), hasGlyph: !!card.querySelector('.cw-glyph') };
}))()`);

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
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/cards.html");
  const cards = await readCards();
  const withPaper = cards.filter((c) => c.hasPaper);
  const without = cards.filter((c) => !c.hasPaper);
  check("exactly 4 papers on the right cards", withPaper.length === 4 && JSON.stringify(withPaper.map((c) => c.name)) === JSON.stringify(["朱元璋", "于谦", "海瑞", "张居正"]) && without.length === 6, JSON.stringify(cards.map((c) => [c.name, c.hasPaper])));
  let verbOk = true; const verbBad = [];
  for (const c of withPaper) {
    const [q, f] = QUOTES[c.name];
    if (c.geo.quote !== "「" + q + "」" || c.geo.from !== "—— " + f) { verbOk = false; verbBad.push([c.name, c.geo.quote, c.geo.from]); }
  }
  check("quotes and attributions verbatim with 「」 and ——", verbOk, JSON.stringify(verbBad));
  const g = withPaper[0].geo;
  check("paper structure values per spec", g.between && g.bg.includes("linear-gradient(160deg") && g.pad === "7px" && g.declMid === "1.6px" && g.midPad === "5px" && g.declIn === "0.7px" && g.inPad === "14px/16px/10px" && g.fishView === "0 0 30 13" && g.fishD === "M1 1 L15 12 L29 1 L29 4.5 L15 13 L1 4.5 Z" && g.fishFill === "rgb(42, 36, 23)", JSON.stringify(g));
  check("quote/from typography per spec", g.qSize === "17px" && g.qLh === "32.3px" && g.qLs === "0.51px" && g.qColor === "rgb(42, 36, 23)" && /Serif SC|FangSong|serif/.test(g.qFont) && g.fSize === "13px" && g.fColor === "rgb(109, 95, 67)" && g.fAlign === "right", JSON.stringify([g.qSize, g.qLh, g.qLs, g.qColor, g.fSize, g.fColor, g.fAlign]));
  check("desktop: no overflow, comment below paper", withPaper.every((c) => !c.geo.overflow && c.geo.aboveComment), JSON.stringify(withPaper.map((c) => [c.name, c.geo.overflow, c.geo.aboveComment])));
  check("six other cards keep original body sequence", without.every((c) => { const want = (c.hasGlyph ? ["cw-glyph"] : []).concat(["cw-head"], c.hasSub ? ["cw-sub"] : [], ["cw-position", "cw-facts", "cw-comment"]); return JSON.stringify(c.bodyKids) === JSON.stringify(want); }), JSON.stringify(without.map((c) => c.bodyKids)));
  const opened = await evalJs(`JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})).cards.opened`);
  check("cards opened mark unchanged", opened === true, opened);
  await evalJs(`document.querySelectorAll('.cw-person')[0].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(600);
  await shot("cards-paper-desktop");

  // other pages no paper
  let leak = false;
  for (const p of ["chat.html", "relations.html", "index.html", "qinli.html", "search.html"]) {
    await nav("http://127.0.0.1:4173/" + p);
    if (await evalJs(`!!document.querySelector('.cw-paper')`)) leak = true;
  }
  check("paper only on cards page", !leak, "leak");

  // red lines
  const D = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SITE_DATA", {});
  const HEAD = vm.runInNewContext(execSync("git show HEAD:frontend/data.js", { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString() + "\n;SITE_DATA", {});
  const IDX = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SEARCH_INDEX", {});
  const HIDX = vm.runInNewContext(execSync("git show HEAD:frontend/data.js", { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString() + "\n;SEARCH_INDEX", {});
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const strip = (cs) => cs.map((c) => { const o = Object.assign({}, c); delete o.quote; delete o.quoteFrom; return o; });
  check("only quote fields added; rest of data identical", same(strip(D.cards), HEAD.cards) && same(IDX, HIDX) && same(D.qinli, HEAD.qinli) && same(D.modules, HEAD.modules) && same(D.relations, HEAD.relations), "diff");
  const quoted = D.cards.filter((c) => c.quote);
  check("quote fields exactly on p1/p3/p4/p5", JSON.stringify(quoted.map((c) => c.id)) === JSON.stringify(["p1", "p3", "p4", "p5"]), JSON.stringify(quoted.map((c) => c.id)));
  const appSrc = fs.readFileSync(ROOT + "/frontend/app.js", "utf8");
  check("CHAT_API_BASE untouched", /const CHAT_API_BASE = "http:\/\/localhost:8000";/.test(appSrc), "changed");

  // mobile
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/cards.html");
  const mob = await readCards();
  const mp = mob.filter((c) => c.hasPaper);
  check("mobile: 4 papers, no overflow, comment below", mp.length === 4 && mp.every((c) => !c.geo.overflow && c.geo.aboveComment) && (await evalJs(`document.documentElement.scrollWidth`)) <= 375, JSON.stringify(mp.map((c) => [c.name, c.geo.overflow, c.geo.aboveComment])));
  await evalJs(`document.querySelectorAll('.cw-person')[2].scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(600);
  await shot("cards-paper-mobile");
  await send("Emulation.clearDeviceMetricsOverride");

  check("zero console errors", errors.length === 0, JSON.stringify(errors.slice(0, 6)));
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); chrome.kill(); process.exit(2); });