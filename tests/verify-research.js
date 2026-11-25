const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9250;
const BASE = "http://127.0.0.1:4173/";
const chrome = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--disable-gpu",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), `shimais-research-${process.pid}`)}`,
  "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
let ws;
let nextId = 0;
const pending = new Map();
const runtimeErrors = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails.exception));
  return result.result.value;
}
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + detail));
}
async function waitFor(expression, label) {
  for (let i = 0; i < 80; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error("等待超时：" + label);
}
async function nav(pathname) {
  await send("Page.navigate", { url: BASE + pathname });
  await waitFor(`location.pathname === '/${pathname}' && document.readyState === 'complete' && !!document.querySelector('#app') && document.querySelector('#app').children.length > 0`, pathname);
}
(async () => {
  let target;
  try {
    for (let i = 0; i < 50; i++) {
      try {
        const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        target = pages.find(page => page.type === "page");
        if (target) break;
      } catch {}
      await sleep(100);
    }
    if (!target) throw new Error("Chrome DevTools 未就绪");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    ws.onmessage = message => {
      const data = JSON.parse(message.data);
      if (data.id && pending.has(data.id)) {
        const task = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) task.reject(new Error(data.error.message));
        else task.resolve(data.result);
      } else if (data.method === "Runtime.exceptionThrown") {
        runtimeErrors.push(JSON.stringify(data.params.exceptionDetails).slice(0, 300));
      } else if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
        runtimeErrors.push(data.params.args.map(arg => arg.value || arg.description || "").join(" ").slice(0, 300));
      }
    };
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    await nav("profile.html");
    await evaluate(`localStorage.removeItem('shimais-daming:progress:v1')`);
    await nav("profile.html");
    const desktop = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('.research-card')];
      return {
        count: cards.length,
        columns: getComputedStyle(document.querySelector('.research-cards')).gridTemplateColumns.split(' ').length,
        overflow: document.documentElement.scrollWidth - innerWidth,
        stored: localStorage.getItem('shimais-daming:progress:v1'),
      };
    })()`);
    check("profile research: desktop three cards", desktop.count === 3, String(desktop.count));
    check("profile research: desktop three columns", desktop.columns === 3, String(desktop.columns));
    check("profile research: desktop no document overflow", desktop.overflow <= 0, String(desktop.overflow));
    check("profile research: unstarted read-only", desktop.stored === null, String(desktop.stored));

    await evaluate(`document.querySelector('.research-start').click()`);
    await waitFor(`!!document.querySelector('.research-chain')`, "开始线索");
    const activeDesktop = await evaluate(`getComputedStyle(document.querySelector('.research-chain')).gridTemplateColumns.split(' ').length`);
    check("profile research: active desktop three slots", activeDesktop === 3, String(activeDesktop));

    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await nav("profile.html");
    const mobile = await evaluate(`(() => {
      const slots = [...document.querySelectorAll('.research-slot')];
      const rects = slots.map(node => node.getBoundingClientRect());
      return {
        columns: getComputedStyle(document.querySelector('.research-chain')).gridTemplateColumns.split(' ').length,
        vertical: rects.length === 3 && rects[0].top < rects[1].top && rects[1].top < rects[2].top,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    })()`);
    check("profile research: 390px evidence chain single column", mobile.columns === 1, String(mobile.columns));
    check("profile research: 390px evidence chain vertical", mobile.vertical, JSON.stringify(mobile));
    check("profile research: 390px no document overflow", mobile.overflow <= 0, String(mobile.overflow));

    await evaluate(`localStorage.removeItem('shimais-daming:progress:v1')`);
    await nav("profile.html");
    const mobileCards = await evaluate(`getComputedStyle(document.querySelector('.research-cards')).gridTemplateColumns.split(' ').length`);
    check("profile research: 390px cards single column", mobileCards === 1, String(mobileCards));

    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await nav("profile.html");
    const transition = await evaluate(`getComputedStyle(document.querySelector('.nav-link')).transitionDuration`);
    check("profile research: reduced motion disables existing transitions", transition === "0s", transition);
    check("profile research: zero console/runtime errors", runtimeErrors.length === 0, runtimeErrors.join(" ;; "));

    const passed = results.filter(result => result.ok).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  } finally {
    if (ws) ws.close();
    chrome.kill();
  }
})().catch(error => {
  console.error("FATAL", error);
  chrome.kill();
  process.exitCode = 2;
});
