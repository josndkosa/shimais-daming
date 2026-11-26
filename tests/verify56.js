const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9256;
const BASE = "http://127.0.0.1:4173/";
const ROOT = path.resolve(__dirname, "../frontend");
const PROFILE = path.join(os.tmpdir(), `shimais-daily-${process.pid}`);
const materials = JSON.parse(fs.readFileSync(path.join(ROOT, "materials.json"), "utf8")).sources;
const ordered = materials.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const dataContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, "data.js"), "utf8") + "\nthis.siteData = SITE_DATA;", dataContext);
const figureNames = new Map(dataContext.siteData.chatFigures.map(figure => [figure.id, figure.name]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const runtimeErrors = [];
const networkErrors = [];
const chrome = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--disable-gpu",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + detail));
}

async function listPages() {
  const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return response.json();
}

async function connect(target, observedNetworkErrors) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  const handlers = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  socket.onmessage = message => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      const task = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) task.reject(new Error(data.error.message));
      else task.resolve(data.result);
      return;
    }
    if (data.method === "Runtime.exceptionThrown") {
      runtimeErrors.push(JSON.stringify(data.params.exceptionDetails).slice(0, 300));
    } else if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
      runtimeErrors.push(data.params.args.map(arg => arg.value || arg.description || "").join(" ").slice(0, 300));
    }
    const handler = handlers.get(data.method);
    if (handler) handler(data.params);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  await send("Runtime.enable");
  await send("Page.enable");
  if (observedNetworkErrors) {
    await send("Network.enable");
    handlers.set("Network.loadingFailed", params => {
      if (!params.canceled && params.request?.url) observedNetworkErrors.push({ url: params.request.url, error: params.errorText });
    });
    handlers.set("Network.responseReceived", params => {
      const url = params.response?.url || params.request?.url;
      if (params.response?.status >= 400 && url) observedNetworkErrors.push({ url, status: params.response.status });
    });
  }
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails.exception));
    return result.result.value;
  };
  const waitFor = async (expression, label) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error("等待超时：" + label);
  };
  return { socket, send, evaluate, waitFor, on: (method, handler) => handlers.set(method, handler) };
}

const cardState = connection => connection.evaluate(`(() => {
  const card = document.querySelector('.daily-material');
  if (!card) return null;
  const text = selector => card.querySelector(selector)?.textContent || '';
  return {
    href: card.getAttribute('href'),
    target: card.target,
    rel: card.rel,
    label: text('.daily-label'),
    title: text('.daily-title'),
    excerpt: text('.daily-excerpt'),
    person: text('.daily-person'),
  };
})()`);

async function navigate(connection, pathname, selector = ".daily-material") {
  await connection.send("Page.navigate", { url: BASE + pathname });
  await connection.waitFor(`location.pathname === '/${pathname}' && document.readyState === 'complete' && !!document.querySelector('#app') && document.querySelector('#app').children.length > 0 && !!document.querySelector(${JSON.stringify(selector)})`, pathname);
}

async function freezeDate(connection, iso, previousId) {
  if (previousId) await connection.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: previousId });
  const source = `(() => {
    const NativeDate = Date;
    const fixed = NativeDate.parse(${JSON.stringify(iso)});
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    }
    window.Date = FixedDate;
  })();`;
  const result = await connection.send("Page.addScriptToEvaluateOnNewDocument", { source });
  return result.identifier;
}

function expectedCard(material, month, day) {
  const firstSentence = material.text.match(/^.*?[。！？]/u)?.[0] || material.text;
  const candidate = Array.from(firstSentence).length >= 40 ? firstSentence : material.text;
  const chars = Array.from(candidate);
  const excerpt = chars.length > 60 ? chars.slice(0, 60).join("").trimEnd() + "…" : candidate;
  return {
    href: "search.html?source=" + encodeURIComponent(material.id),
    target: "_blank",
    rel: "noopener",
    label: `每日一史料 · ${month}月${day}日`,
    title: material.title,
    excerpt,
    person: figureNames.get(material.figure),
  };
}

async function screenshot(connection, filename) {
  const { data } = await connection.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const file = path.join(os.tmpdir(), filename);
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  return file;
}

(async () => {
  let main;
  let popup;
  let dateScript;
  try {
    check("materials pool has 48 unique canonical IDs", ordered.length === 48 && new Set(ordered.map(m => m.id)).size === 48, String(ordered.length));

    let target;
    for (let i = 0; i < 50; i++) {
      try {
        target = (await listPages()).find(page => page.type === "page");
        if (target) break;
      } catch {}
      await sleep(100);
    }
    if (!target) throw new Error("Chrome DevTools 未就绪");
    const mainId = target.id;
    main = await connect(target, networkErrors);
    await main.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await main.send("Emulation.setTimezoneOverride", { timezoneId: "UTC" });

    dateScript = await freezeDate(main, "2026-11-25T04:00:00Z");
    await navigate(main, "index.html");
    await main.evaluate(`localStorage.clear()`);
    await main.send("Page.reload");
    await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, "首次每日史料");

    const dayOne = materials.find(m => m.id === "zhuyuanzhang/c1");
    const expectedOne = expectedCard(dayOne, 11, 25);
    const refreshes = [];
    for (let i = 0; i < 3; i++) {
      if (i) {
        await main.send("Page.reload");
        await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, "刷新 " + i);
      }
      refreshes.push(await cardState(main));
    }
    check("Beijing 2026-11-25 stays identical across three refreshes", refreshes.every(state => JSON.stringify(state) === JSON.stringify(expectedOne)), JSON.stringify(refreshes));

    const layout = await main.evaluate(`(() => {
      const classes = [...document.querySelector('#app').children].map(node => node.className);
      const daily = classes.indexOf('daily-material-slot container');
      return {
        daily,
        carousel: classes.indexOf('carousel'),
        question: classes.indexOf('question-section container'),
        first: classes.indexOf('topic-start container'),
        entry: !!document.querySelector('.ch-entry'),
        progress: localStorage.getItem('shimais-daming:progress:v1'),
      };
    })()`);
    check("daily card follows carousel and precedes module entries without changing first-visit order", layout.first >= 0 && layout.carousel > layout.first && layout.daily > layout.carousel && layout.question > layout.daily && layout.entry, JSON.stringify(layout));
    check("homepage daily card writes no progress state", layout.progress === null, String(layout.progress));

    await main.evaluate(`document.querySelector('.daily-material').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    const desktopShot = await screenshot(main, "shimais-daming-ba-desktop.png");

    dateScript = await freezeDate(main, "2026-11-26T04:00:00Z", dateScript);
    await main.send("Page.reload");
    await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, "次日每日史料");
    const dayTwo = materials.find(m => m.id === "zhuyuanzhang/c2");
    const nextState = await cardState(main);
    check("Beijing next day advances exactly one sorted material", JSON.stringify(nextState) === JSON.stringify(expectedCard(dayTwo, 11, 26)) && ordered.indexOf(dayTwo) === ordered.indexOf(dayOne) + 1, JSON.stringify(nextState));

    dateScript = await freezeDate(main, "2026-11-25T20:00:00Z", dateScript);
    const timezoneStates = [];
    for (const timezoneId of ["America/Los_Angeles", "Asia/Tokyo"]) {
      await main.send("Emulation.setTimezoneOverride", { timezoneId });
      await main.send("Page.reload");
      await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, timezoneId);
      timezoneStates.push(await cardState(main));
    }
    check("same instant selects the same Beijing material in different visitor timezones", timezoneStates.every(state => JSON.stringify(state) === JSON.stringify(expectedCard(dayTwo, 11, 26))), JSON.stringify(timezoneStates));

    await main.send("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
    dateScript = await freezeDate(main, "2026-01-28T04:00:00Z", dateScript);
    await main.send("Page.reload");
    await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, "原文摘录");
    const original = materials.find(m => m.id === "zhangjuzheng/c4");
    const originalState = await cardState(main);
    const firstSentence = '【原文摘录·经网页转引】「一條鞭法者，總括一州縣之賦役，量地計丁，丁糧畢輸於官。一歲之役，官為僉募。」';
    check("original quotation keeps its exact first sentence", originalState.title === original.title && originalState.excerpt === firstSentence, JSON.stringify(originalState));

    dateScript = await freezeDate(main, "2026-11-25T04:00:00Z", dateScript);
    await main.send("Page.reload");
    await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, "深链点击");
    const rect = await main.evaluate(`(() => {
      const card = document.querySelector('.daily-material');
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = card.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await main.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
    await main.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    await main.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
    let popupTarget;
    for (let i = 0; i < 60; i++) {
      popupTarget = (await listPages()).find(page => page.id !== mainId && page.type === "page" && /search\.html\?source=/.test(page.url));
      if (popupTarget) break;
      await sleep(100);
    }
    if (!popupTarget) throw new Error("可信点击未打开检索页新标签");
    popup = await connect(popupTarget, networkErrors);
    await popup.waitFor(`document.readyState === 'complete' && !!document.querySelector('.sr-material-detail:not([hidden]) .sr-material-text')`, "检索材料详情");
    const detail = await popup.evaluate(`(() => ({
      title: document.querySelector('.sr-material-detail .section-title')?.textContent,
      text: document.querySelector('.sr-material-detail .sr-material-text')?.textContent,
      id: [...document.querySelectorAll('.sr-material-meta dt')].findIndex(node => node.textContent === '材料 ID') >= 0
        ? document.querySelectorAll('.sr-material-meta dd')[[...document.querySelectorAll('.sr-material-meta dt')].findIndex(node => node.textContent === '材料 ID')]?.textContent
        : null,
      source: new URLSearchParams(location.search).get('source'),
    }))()`);
    check("trusted whole-card click opens encoded source in a new tab and locates exact material", detail.source === dayOne.id && detail.id === dayOne.id && detail.title === dayOne.title && detail.text === dayOne.text, JSON.stringify(detail));
    try { await popup.send("Page.close"); } catch {}
    popup.socket.close();
    popup = null;

    dateScript = await freezeDate(main, "2026-11-26T04:00:00Z", dateScript);
    await main.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await main.send("Page.reload");
    await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, "390px 每日史料");
    const mobile = await main.evaluate(`(() => {
      const card = document.querySelector('.daily-material');
      const excerpt = document.querySelector('.daily-excerpt');
      const c = card.getBoundingClientRect();
      const e = excerpt.getBoundingClientRect();
      const style = getComputedStyle(excerpt);
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        cardLeft: c.left,
        cardRight: c.right,
        viewport: innerWidth,
        clamp: style.webkitLineClamp,
        clientHeight: excerpt.clientHeight,
        scrollHeight: excerpt.scrollHeight,
        lineHeight: parseFloat(style.lineHeight),
        excerptHeight: e.height,
        columns: getComputedStyle(card).gridTemplateColumns.split(' ').length,
      };
    })()`);
    check("390px keeps horizontal card inside viewport with no document overflow", mobile.overflow <= 0 && mobile.cardLeft >= 0 && mobile.cardRight <= mobile.viewport + 0.5 && mobile.columns === 2, JSON.stringify(mobile));
    check("390px excerpt is clamped to two lines and actually truncates", mobile.clamp === "2" && mobile.scrollHeight > mobile.clientHeight && Math.abs(mobile.excerptHeight - mobile.lineHeight * 2) <= 1, JSON.stringify(mobile));
    await main.evaluate(`document.querySelector('.daily-material').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    const mobileShot = await screenshot(main, "shimais-daming-ba-mobile.png");
    console.log("SHOTS " + desktopShot + " ; " + mobileShot);

    const errorCountBeforeFailure = runtimeErrors.length;
    await main.send("Fetch.enable", { patterns: [{ urlPattern: "*/materials.json", requestStage: "Request" }] });
    main.on("Fetch.requestPaused", params => {
      main.send("Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 503,
        responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }],
        body: Buffer.from(JSON.stringify({ error: "unavailable" })).toString("base64"),
      }).catch(() => {});
    });
    await main.send("Page.reload");
    await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('#app') && document.querySelector('#app').children.length > 0 && !document.querySelector('.daily-material-slot') && !document.querySelector('.daily-material')`, "材料失败隐藏");
    await main.send("Fetch.disable");
    const failed = await main.evaluate(`(() => ({
      first: !!document.querySelector('.topic-start'),
      carousel: !!document.querySelector('.carousel'),
      question: !!document.querySelector('.question-section'),
      entry: !!document.querySelector('.ch-entry'),
      empty: !!document.querySelector('.daily-material-slot'),
      text: document.querySelector('#app').innerText,
    }))()`);
    check("materials failure removes the whole card and error UI while preserving homepage modules", !failed.empty && failed.first && failed.carousel && failed.question && failed.entry && !/材料载入失败|materials unavailable|每日一史料/.test(failed.text), JSON.stringify({ ...failed, text: failed.text.slice(0, 180) }));

    const saved = JSON.stringify({ lastRead: { kind: "card", id: "i3" } });
    await main.evaluate(`localStorage.setItem('shimais-daming:progress:v1', ${JSON.stringify(saved)})`);
    await main.send("Page.reload");
    await main.waitFor(`document.readyState === 'complete' && !!document.querySelector('.daily-material')`, "继续上次");
    const resume = await main.evaluate(`(() => ({
      text: [...document.querySelectorAll('.topic-start .topic-next')].map(node => node.textContent).find(text => text.startsWith('继续上次：')) || '',
      stored: localStorage.getItem('shimais-daming:progress:v1'),
    }))()`);
    check("existing continue-last-read entry remains and daily rendering does not rewrite it", resume.text.startsWith("继续上次：") && resume.stored === saved, JSON.stringify(resume));

    const failureErrors = runtimeErrors.slice(errorCountBeforeFailure);
    const expectedMaterialsUrl = new URL("materials.json", BASE);
    const unexpectedNetworkErrors = networkErrors.filter(error => {
      try {
        const url = new URL(error.url);
        return !(url.origin === expectedMaterialsUrl.origin && url.pathname === expectedMaterialsUrl.pathname && error.status === 503);
      } catch {
        return true;
      }
    });
    const unexpectedErrors = [
      ...runtimeErrors.slice(0, errorCountBeforeFailure),
      ...failureErrors.filter(message => !/Failed to load resource/.test(message)),
      ...unexpectedNetworkErrors,
    ];
    check("zero unexpected console/runtime/network errors", unexpectedErrors.length === 0, JSON.stringify(unexpectedErrors));

    const passed = results.filter(result => result.ok).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  } finally {
    if (popup) popup.socket.close();
    if (main) main.socket.close();
    chrome.kill();
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
})().catch(error => {
  console.error("FATAL", error);
  chrome.kill();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  process.exitCode = 2;
});
