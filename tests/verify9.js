const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9249;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud11`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
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
const activeIdx = () => evalJs(`[...document.querySelectorAll('.slide')].findIndex(n => n.classList.contains('is-active'))`);
const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
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

  // 鼠标停在轮播上，什么都不碰
  await nav("http://127.0.0.1:4173/index.html");
  await evalJs(`localStorage.clear()`);
  await nav("http://127.0.0.1:4173/index.html");
  await mouse(640, 500);
  const a0 = await activeIdx();
  await sleep(5600);
  const a1 = await activeIdx();
  check("mouse resting on carousel: autoplay 0 -> 1 within ~6.9s", a0 === 0 && a1 === 1, a0 + "->" + a1);

  // 悬停中手动点下一张：重置 6s 且继续自动
  await evalJs(`document.querySelector('.car-next').click()`);
  const b0 = await activeIdx();
  await sleep(5200);
  const b1 = await activeIdx();
  await sleep(1700);
  const b2 = await activeIdx();
  check("manual next while hovered: reset then continue (2 held at 5.2s, 3 by 6.9s)", b0 === 2 && b1 === 2 && b2 === 3, [b0, b1, b2].join(","));

  // 焦点在轮播内（圆点）仍自动播放
  await evalJs(`document.querySelectorAll('.car-dot')[0].focus()`);
  const c0 = await activeIdx();
  await sleep(6600);
  const c1 = await activeIdx();
  check("keyboard focus inside carousel no longer pauses", c0 === 3 && c1 === 4, c0 + "->" + c1);

  // 左右键手动切换后重置并继续
  await evalJs(`document.querySelector('.carousel').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
  const d0 = await activeIdx();
  await sleep(5200);
  const d1 = await activeIdx();
  await sleep(1700);
  const d2 = await activeIdx();
  check("ArrowRight resets timer and autoplay continues", d0 === 0 && d1 === 0 && d2 === 1, [d0, d1, d2].join(","));

  // 后台暂停；前台是否自动播放取决于 reduced-motion
  await evalJs(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));`);
  const e0 = await activeIdx();
  await sleep(7000);
  const e1 = await activeIdx();
  await evalJs(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));`);
  await sleep(6600);
  const e2 = await activeIdx();
  await evalJs(`delete document.visibilityState; delete document.hidden;`);
  check("hidden pauses, foreground resumes", e0 === e1 && e2 === (e1 + 1) % 5, [e0, e1, e2].join(","));

  // reduced-motion 下不自动播放，但手动切换与指示点照常
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await nav("http://127.0.0.1:4173/index.html");
  await mouse(640, 500);
  const f0 = await activeIdx();
  await sleep(5600);
  const f1 = await activeIdx();
  check("reduced-motion + hovered: no autoplay", f0 === 0 && f1 === 0, f0 + "->" + f1);
  await evalJs(`document.querySelector('.car-next').click()`);
  const f2 = await activeIdx();
  await evalJs(`document.querySelectorAll('.car-dot')[3].click()`);
  const f3 = await activeIdx();
  await sleep(5600);
  const f4 = await activeIdx();
  check("reduced-motion: manual next and dots work without autoplay", f2 === 1 && f3 === 3 && f4 === 3, [f2, f3, f4].join(","));
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "" }] });
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(__dirname + "/car-hover-autoplay.png", Buffer.from(s.data, "base64"));

  // 六页无回归、零错误
  for (const f of ["timeline.html", "decisions.html", "cards.html", "quiz.html", "profile.html"]) {
    await nav("http://127.0.0.1:4173/" + f);
    const ok = await evalJs(`!!document.querySelector('.site-nav') && document.getElementById('app').children.length > 0`);
    check("page renders: " + f, ok, String(ok));
  }
  check("zero console/runtime errors", errors.length === 0, errors.join(" ;; ").slice(0, 300));

  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });