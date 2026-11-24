const { spawn } = require("child_process");
const fs = require("fs");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9247;
const chrome = spawn(CHROME, ["--headless=new", "--no-first-run", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${__dirname}/ud9`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, idc = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++idc; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok, extra }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + extra)); };
const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1300); };
const activeIdx = () => evalJs(`[...document.querySelectorAll('.slide')].findIndex(n => n.classList.contains('is-active'))`);
const mouse = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
const shot = async (name) => { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(__dirname + "/" + name + ".png", Buffer.from(s.data, "base64")); };

const NAV_PROBE = `(() => {
  const nav = document.querySelector('.site-nav');
  const inner = document.querySelector('.nav-inner');
  const brand = document.querySelector('.nav-brand');
  const cs = getComputedStyle(nav), ci = getComputedStyle(inner), cb = getComputedStyle(brand);
  const spans = [...brand.querySelectorAll('span')].map(s => ({ t: s.textContent, c: getComputedStyle(s).color }));
  const before = getComputedStyle(brand, '::before').content;
  const cur = document.querySelector('.nav-link.is-current');
  const cc = cur ? getComputedStyle(cur) : null;
  const ca = cur ? getComputedStyle(cur, '::after') : null;
  const links = [...document.querySelectorAll('.nav-link')];
  return {
    pos: cs.position, top: cs.top, z: cs.zIndex, bg: cs.backgroundColor, blur: cs.backdropFilter, border: cs.borderBottomWidth + ' ' + cs.borderBottomStyle + ' ' + cs.borderBottomColor,
    inner: { maxW: ci.maxWidth, pad: ci.padding, gap: ci.gap, minH: ci.minHeight, disp: ci.display, align: ci.alignItems, ml: getComputedStyle(document.querySelector('.nav-links')).marginLeft },
    brand: { spans, before, w: cb.fontWeight, size: cb.fontSize, ls: cb.letterSpacing, fam: cb.fontFamily.split(',')[0] },
    cur: cur ? { text: cur.querySelector('.nav-full').textContent, color: cc.color, weight: cc.fontWeight, uLeft: ca.left, uRight: ca.right, uBottom: ca.bottom, uH: ca.height, uBg: ca.backgroundColor } : null,
    normalColor: getComputedStyle(links.find(a => !a.classList.contains('is-current'))).color,
    linkPad: getComputedStyle(links[0]).padding, linkSize: getComputedStyle(links[0]).fontSize, linkLs: getComputedStyle(links[0]).letterSpacing,
    navH: nav.offsetHeight, bodyPad: getComputedStyle(document.body).paddingTop,
    cssVar: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim(),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    fullTexts: links.map(a => a.querySelector('.nav-full').textContent),
    shortVisible: links.some(a => { const s = a.querySelector('.nav-short'); return s && s.offsetParent !== null; }),
  };
})()`;

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

  // ---------- 六页顶栏一致性（桌面） ----------
  const pages = [["index.html", "首页"], ["timeline.html", "时间线"], ["decisions.html", "决策模式"], ["cards.html", "人物与制度卡"], ["quiz.html", "小测"], ["profile.html", "我的研读画像"]];
  await nav("http://127.0.0.1:4173/index.html");
  await evalJs(`localStorage.clear()`);
  const perPage = [];
  for (const [file, label] of pages) {
    await nav("http://127.0.0.1:4173/" + file);
    const p = await evalJs(NAV_PROBE);
    perPage.push({ file, label, p });
  }
  const barOk = perPage.every(({ p }) => p.pos === "fixed" && p.top === "0px" && p.z === "60" && p.bg === "rgba(10, 8, 7, 0.92)" && p.blur === "blur(6px)" && p.border === "1px solid rgba(201, 162, 39, 0.38)");
  check("nav bar fixed/top0/z60/rgba(10,8,7,.92)/blur6/gold border on 6 pages", barOk, JSON.stringify(perPage.map(x => [x.file, x.p.pos, x.p.z, x.p.bg, x.p.border])));
  const innerOk = perPage.every(({ p }) => p.inner.maxW === "1180px" && p.inner.pad === "0px 20px" && p.inner.gap === "18px" && p.inner.minH === "58px" && p.inner.disp === "flex" && p.inner.align === "center");
  check("nav-inner 1180/0 20px/gap18/min58/flex center on 6 pages", innerOk, JSON.stringify(perPage[0].p.inner));
  const brandOk = perPage.every(({ p }) => JSON.stringify(p.brand.spans) === JSON.stringify([{ t: "史脉", c: "rgb(237, 228, 208)" }, { t: "·", c: "rgb(194, 42, 36)" }, { t: "大明", c: "rgb(201, 162, 39)" }]) && p.brand.before === "none" && p.brand.w === "900" && p.brand.size === "21px" && p.brand.ls === "4.62px");
  check("brand 3 spans rice/red/gold, no ::before, 900/21px/.22em on 6 pages", brandOk, JSON.stringify(perPage[0].p.brand));
  const curOk = perPage.every(({ p, label }) => p.cur && p.cur.text === label && p.cur.color === "rgb(201, 162, 39)" && p.cur.weight === "700" && p.cur.uLeft === "13px" && p.cur.uRight === "13px" && p.cur.uBottom === "2px" && p.cur.uH === "2px" && p.cur.uBg === "rgb(158, 27, 27)");
  check("current link gold 700 + inset red underline 13/13/2/2 on 6 pages", curOk, JSON.stringify(perPage.map(x => x.p.cur)));
  const linkOk = perPage.every(({ p }) => p.normalColor === "rgb(201, 191, 169)" && p.linkPad === "8px 13px" && p.linkSize === "15px" && p.linkLs === "2.1px");
  check("links 15px/.14em/8px 13px/#C9BFA9 on 6 pages", linkOk, JSON.stringify([perPage[0].p.normalColor, perPage[0].p.linkPad, perPage[0].p.linkSize]));
  const fitOk = perPage.every(({ p }) => p.bodyPad === p.navH + "px" && p.overflow <= 0);
  check("body offset == nav height, no h-overflow on 6 pages", fitOk, JSON.stringify(perPage.map(x => [x.file, x.p.bodyPad, x.p.navH, x.p.overflow])));

  // hover color
  await nav("http://127.0.0.1:4173/index.html");
  const box = await evalJs(`(() => { const a = [...document.querySelectorAll('.nav-link')].find(x => !x.classList.contains('is-current')); const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await mouse(box.x, box.y); await sleep(400);
  const hov = await evalJs(`getComputedStyle([...document.querySelectorAll('.nav-link')].find(x => !x.classList.contains('is-current'))).color`);
  check("link hover -> #EDE4D0", hov === "rgb(237, 228, 208)", hov);
  await shot("nav-desktop");

  // ---------- 自动播放（桌面，不做任何操作） ----------
  await nav("http://127.0.0.1:4173/index.html");
  const i0 = await activeIdx();
  await sleep(5600);
  const i1 = await activeIdx();
  check("autoplay: slide 0 -> 1 within ~6.9s of load, untouched", i0 === 0 && i1 === 1, i0 + "->" + i1);

  // reduced-motion 禁用自动切换，但手动切换与指示点照常
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await nav("http://127.0.0.1:4173/index.html");
  const r0 = await activeIdx();
  await sleep(5600);
  const r1 = await activeIdx();
  check("no autoplay under prefers-reduced-motion", r0 === 0 && r1 === 0, r0 + "->" + r1);
  await evalJs(`document.querySelector('.car-next').click()`);
  const r2 = await activeIdx();
  await evalJs(`document.querySelectorAll('.car-dot')[3].click()`);
  const r3 = await activeIdx();
  await sleep(5600);
  const r4 = await activeIdx();
  check("reduced-motion: manual next and dots work without autoplay", r2 === 1 && r3 === 3 && r4 === 3, [r2, r3, r4].join(","));
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "" }] });

  // 手动切换后计时重置
  await nav("http://127.0.0.1:4173/index.html");
  await evalJs(`document.querySelector('.car-next').click()`);
  const m0 = await activeIdx();
  await sleep(5200);
  const m1 = await activeIdx();
  await sleep(1700);
  const m2 = await activeIdx();
  check("manual next resets 6s timer (no jump at 5.2s, jump by 6.9s)", m0 === 1 && m1 === 1 && m2 === 2, [m0, m1, m2].join(","));
  await evalJs(`document.querySelectorAll('.car-dot')[3].click()`);
  const d0 = await activeIdx();
  await sleep(5200);
  const d1 = await activeIdx();
  check("dot click resets timer too", d0 === 3 && d1 === 3, d0 + "," + d1);

  // 悬停暂停 / 移开恢复
  await mouse(640, 500); await sleep(300);
  const h0 = await activeIdx();
  await sleep(7000);
  const h1 = await activeIdx();
  await mouse(640, 20); await sleep(300);
  await sleep(6600);
  const h2 = await activeIdx();
  check("hover pauses, mouse-leave resumes", h0 === h1 && h2 === (h1 + 1) % 5, [h0, h1, h2].join(","));

  // 焦点暂停 / 移出恢复
  await evalJs(`document.querySelectorAll('.car-dot')[0].focus()`);
  await sleep(300);
  const f0 = await activeIdx();
  await sleep(7000);
  const f1 = await activeIdx();
  await evalJs(`document.activeElement.blur()`);
  await sleep(6600);
  const f2 = await activeIdx();
  check("focus-in pauses, blur resumes", f0 === f1 && f2 === (f1 + 1) % 5, [f0, f1, f2].join(","));

  // 后台暂停 / 前台恢复（模拟 visibilitychange；真实冻结暂停见末尾）
  await evalJs(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));`);
  const v0 = await activeIdx();
  await sleep(7000);
  const v1 = await activeIdx();
  await evalJs(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));`);
  await sleep(6600);
  const v2 = await activeIdx();
  await evalJs(`delete document.visibilityState; delete document.hidden;`);
  check("visibility hidden pauses, visible resumes", v0 === v1 && v2 === (v1 + 1) % 5, [v0, v1, v2].join(","));

  // ---------- 移动端 ----------
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 720, deviceScaleFactor: 2, mobile: true });
  await nav("http://127.0.0.1:4173/index.html");
  const mp = await evalJs(NAV_PROBE);
  const mFull = await evalJs(`(() => {
    const nav = document.querySelector('.site-nav');
    const head = document.querySelector('.page-head');
    const links = [...document.querySelectorAll('.nav-link')];
    return {
      sticky: getComputedStyle(nav).position,
      wrap: getComputedStyle(document.querySelector('.nav-inner')).flexWrap,
      linksWrap: getComputedStyle(document.querySelector('.nav-links')).flexWrap,
      innerPad: getComputedStyle(document.querySelector('.nav-inner')).padding,
      innerGap: getComputedStyle(document.querySelector('.nav-inner')).gap,
      brandSize: getComputedStyle(document.querySelector('.nav-brand')).fontSize,
      linkPad: getComputedStyle(links[0]).padding, linkSize: getComputedStyle(links[0]).fontSize,
      fullVisible: links.every(a => a.querySelector('.nav-full').offsetParent !== null),
      texts: links.map(a => a.querySelector('.nav-full').textContent),
      navBottom: nav.getBoundingClientRect().bottom, headTop: head.getBoundingClientRect().top,
      bodyPad: getComputedStyle(document.body).paddingTop,
      varSync: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim() === nav.offsetHeight + 'px',
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  })()`);
  check("mobile: sticky nav, wrap, padding 8/14, gap 6, brand 18, links 8/9 14px", mFull.sticky === "sticky" && mFull.wrap === "wrap" && mFull.linksWrap === "wrap" && mFull.innerPad === "8px 14px" && mFull.innerGap === "6px" && mFull.brandSize === "18px" && mFull.linkPad === "8px 9px" && mFull.linkSize === "14px", JSON.stringify(mFull));
  check("mobile: six full labels, no short labels, margin-left 0", mFull.fullVisible && !mp.shortVisible && mp.inner.ml === "0px" && JSON.stringify(mFull.texts) === JSON.stringify(["首页", "时间线", "决策模式", "人物与制度卡", "小测", "我的研读画像"]), JSON.stringify(mFull.texts));
  check("mobile: no overlap/overflow, body pad 0, --nav-h synced", mFull.headTop >= mFull.navBottom - 1 && mFull.overflow <= 0 && mFull.bodyPad === "0px" && mFull.varSync, JSON.stringify([mFull.headTop, mFull.navBottom, mFull.overflow, mFull.bodyPad, mFull.varSync]));
  await shot("nav-mobile");

  // 移动端自动播放
  const mi0 = await activeIdx();
  await sleep(5600);
  const mi1 = await activeIdx();
  check("mobile autoplay 0 -> 1", mi0 === 0 && mi1 === 1, mi0 + "->" + mi1);

  // 移动端 decisions：吸顶进度条不被换行顶栏遮挡
  await nav("http://127.0.0.1:4173/decisions.html");
  await evalJs(`document.querySelectorAll('.dc-scenario')[1].scrollIntoView()`);
  await sleep(800);
  const strip = await evalJs(`(() => {
    const nav = document.querySelector('.site-nav');
    const bar = document.querySelector('.dc-progress');
    const nb = nav.getBoundingClientRect().bottom, bt = bar.getBoundingClientRect().top;
    return { nb, bt, ok: bt >= nb - 2, varSync: getComputedStyle(document.documentElement).getPropertyValue('--nav-h').trim() === nav.offsetHeight + 'px' };
  })()`);
  check("mobile decisions: sticky strip sits below wrapped nav", strip.ok && strip.varSync, JSON.stringify(strip));
  await shot("dc-mobile-nav");

  // 移动端其余四页顶栏一致 + 无溢出
  let mobOk = true; const mobDetail = [];
  for (const [file] of pages.slice(1)) {
    await nav("http://127.0.0.1:4173/" + file);
    const q = await evalJs(`(() => ({ pos: getComputedStyle(document.querySelector('.site-nav')).position, ov: document.documentElement.scrollWidth - window.innerWidth, spans: [...document.querySelectorAll('.nav-brand span')].map(s => getComputedStyle(s).color).join('|') }))()`);
    mobDetail.push([file, q.pos, q.ov]);
    if (q.pos !== "sticky" || q.ov > 0 || q.spans !== "rgb(237, 228, 208)|rgb(194, 42, 36)|rgb(201, 162, 39)") mobOk = false;
  }
  check("mobile: sticky + brand colors + no overflow on other 5 pages", mobOk, JSON.stringify(mobDetail));

  // 真实冻结：后台确实暂停（headless 冻结后无法恢复前台，恢复路径已由模拟事件验证）
  await send("Emulation.clearDeviceMetricsOverride");
  await nav("http://127.0.0.1:4173/index.html");
  const fz0 = await activeIdx();
  await send("Page.setWebLifecycleState", { state: "frozen" });
  await sleep(7000);
  const fz1 = await activeIdx();
  const fzVis = await evalJs(`document.visibilityState`);
  check("real tab freeze: hidden + autoplay paused", fzVis === "hidden" && fz0 === fz1, [fzVis, fz0, fz1].join(","));

  check("zero console/runtime errors across whole suite", errors.length === 0, errors.join(" ;; ").slice(0, 400));

  const pass = results.filter((r) => r.ok).length;
  console.log("\n" + pass + "/" + results.length + " passed");
  ws.close(); chrome.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error("FATAL", e); chrome.kill(); process.exit(2); });