const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.BV_LIVE_CDP_PORT || 9251);
const BASE = process.env.BV_LIVE_BASE || "https://shimais-daming-n7yxxgeg8rh.qoder.zone/";
const DIST = path.resolve(__dirname, "../frontend/dist");
const chrome = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--disable-gpu",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), `shimais-bv-live-${process.pid}`)}`,
  "--window-size=1280,900", "about:blank",
], { stdio: "ignore" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const runtimeErrors = [];
let ws;
let nextId = 0;
const pending = new Map();

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
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : " -> " + detail));
}

async function waitFor(expression, label) {
  for (let i = 0; i < 120; i++) {
    if (await evaluate(expression)) return;
    await sleep(100);
  }
  throw new Error("等待超时：" + label);
}

async function nav(pathname, extraExpression = "true") {
  await send("Page.navigate", { url: BASE + pathname });
  const pagePath = pathname.split("?")[0];
  await waitFor(
    `location.pathname === '/${pagePath}' && document.readyState === 'complete' && !!document.querySelector('#app') && document.querySelector('#app').children.length > 0 && (${extraExpression})`,
    pathname,
  );
}

(async () => {
  let target;
  try {
    const healthResponse = await fetch(BASE + "functions/v1/app/api/health", { cache: "no-store" });
    const health = await healthResponse.json();
    check("live health returns ok", healthResponse.status === 200 && health.status === "ok", JSON.stringify({ status: healthResponse.status, body: health }));
    check(
      "live health lists six canonical figures",
      JSON.stringify(health.figures) === JSON.stringify(["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"]),
      JSON.stringify(health.figures),
    );

    for (const file of ["app.js", "data.js", "styles.css"]) {
      const response = await fetch(BASE + file, { cache: "no-store" });
      const remote = crypto.createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
      const local = crypto.createHash("sha256").update(fs.readFileSync(path.join(DIST, file))).digest("hex");
      check(`live ${file} matches release output`, response.status === 200 && remote === local, JSON.stringify({ status: response.status, remote, local }));
    }

    for (let i = 0; i < 60; i++) {
      try {
        const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        target = pages.find(page => page.type === "page");
        if (target) break;
      } catch {}
      await sleep(100);
    }
    if (!target) throw new Error("Chrome DevTools 未就绪");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = message => {
      const data = JSON.parse(message.data);
      if (data.id && pending.has(data.id)) {
        const task = pending.get(data.id);
        pending.delete(data.id);
        if (data.error) task.reject(new Error(data.error.message));
        else task.resolve(data.result);
      } else if (data.method === "Runtime.exceptionThrown") {
        runtimeErrors.push(JSON.stringify(data.params.exceptionDetails).slice(0, 400));
      } else if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
        runtimeErrors.push(data.params.args.map(arg => arg.value || arg.description || "").join(" ").slice(0, 400));
      }
    };
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    await nav("profile.html");
    await evaluate("localStorage.removeItem('shimais-daming:progress:v1')");
    await nav("profile.html");
    const profile = await evaluate(`(() => ({
      heading: [...document.querySelectorAll('.research-section h2')].map(n => n.textContent.trim()),
      cards: [...document.querySelectorAll('.research-card')].map(card => ({title: card.querySelector('.research-card-title').textContent.trim(), question: card.querySelector('.research-question').textContent.trim()})),
      stored: localStorage.getItem('shimais-daming:progress:v1'),
      overflow: document.documentElement.scrollWidth - innerWidth,
      width: innerWidth
    }))()`);
    const expected = [
      { title: "一条鞭法：从赋役合并到农户成本", question: "一条鞭法把赋役并成白银，为什么农户的实际负担反而可能更重？" },
      { title: "土木堡与北京保卫战", question: "大军在土木堡覆没之后，北京凭什么守住了？" },
      { title: "崇祯", question: "崇祯勤政十七年，为什么还是没能挽回大明的颓势？" },
    ];
    check("live profile shows research section", profile.heading.length === 1 && profile.heading[0] === "研读线索", JSON.stringify(profile.heading));
    check("live profile titles and questions are verbatim", JSON.stringify(profile.cards) === JSON.stringify(expected), JSON.stringify(profile.cards));
    check("live unstarted profile is read-only", profile.stored === null, String(profile.stored));
    check("live desktop profile has no document overflow", profile.overflow <= 0, JSON.stringify(profile));

    await evaluate("document.querySelector('.research-start').click()");
    await waitFor("!!document.querySelector('.research-chain')", "开始线索");
    const started = await evaluate("JSON.parse(localStorage.getItem('shimais-daming:progress:v1')).research");
    check(
      "live explicit start creates empty yitiaobian thread",
      started?.activeId === "yitiaobian" && Array.isArray(started?.byId?.yitiaobian?.evidence) && started.byId.yitiaobian.evidence.length === 0,
      JSON.stringify(started),
    );

    await nav(
      "timeline.html?event=e1581",
      "JSON.parse(localStorage.getItem('shimais-daming:progress:v1') || '{}')?.research?.byId?.yitiaobian?.evidence?.includes('event:e1581') && !!document.querySelector('.research-echo') && !document.querySelector('.research-echo').hidden",
    );
    const evidence = await evaluate(`(() => {
      const p = JSON.parse(localStorage.getItem('shimais-daming:progress:v1'));
      const echo = document.querySelector('.research-echo');
      const link = echo?.querySelector('a.research-echo-link');
      const label = echo?.querySelector('.research-echo-text');
      return {
        research: p.research,
        echo: label && link ? label.textContent.trim() + ' ' + link.textContent.trim() : null,
        rawEcho: echo?.textContent.trim(),
        gap: echo ? parseFloat(getComputedStyle(echo).gap) : 0,
        linkText: link?.textContent,
        linkHref: link?.getAttribute('href'),
        linkVisible: !!link?.checkVisibility(),
      };
    })()`);
    check(
      "live timeline action records evidence once",
      evidence.research?.byId?.yitiaobian?.evidence?.filter(key => key === "event:e1581").length === 1,
      JSON.stringify(evidence),
    );
    check(
      "live evidence echo text is exact and contains one link label",
      evidence.echo === "已为「一条鞭法」线索取证 → 查看线索"
        && (evidence.rawEcho.match(/查看线索/g) || []).length === 1
        && evidence.gap > 0,
      JSON.stringify(evidence),
    );
    check(
      "live evidence echo link is visible and clickable",
      evidence.linkText === "查看线索" && evidence.linkHref === "profile.html" && evidence.linkVisible,
      JSON.stringify(evidence),
    );
    await evaluate("document.querySelector('.research-echo-link').click()");
    await waitFor("location.pathname === '/profile.html' && document.readyState === 'complete' && !!document.querySelector('#app')", "回声链接打开画像页");

    await nav("decisions.html");
    const decisions = await evaluate("({title:document.title, text:document.querySelector('#app').innerText.slice(0,300), children:document.querySelector('#app').children.length})");
    check("live decisions page opens without white screen", decisions.children > 0 && decisions.text.includes("决策"), JSON.stringify(decisions));

    await nav("chat.html");
    await waitFor("document.querySelector('#app').innerText.includes('人物对话')", "对话页内容");
    const chat = await evaluate("({title:document.title, text:document.querySelector('#app').innerText.slice(0,300), children:document.querySelector('#app').children.length})");
    check("live chat page opens without white screen", chat.children > 0 && chat.text.includes("人物对话"), JSON.stringify(chat));
    check("live browser has zero console/runtime errors", runtimeErrors.length === 0, runtimeErrors.join(" ;; "));

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
