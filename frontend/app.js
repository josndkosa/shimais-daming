/* 《史脉·大明》多页共享外壳：导航、页眉、页脚、首页轮播、时间线与进度存储。 */

(function () {
  "use strict";

  const data = SITE_DATA;
  const page = document.body.dataset.page || "index";
  const app = document.getElementById("app");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const PROGRESS_KEY = "shimais-daming:progress:v1";
  const apiSetting = document.querySelector('meta[name="api-base"]')?.content.trim();
  const CHAT_API_BASE = (() => {
    if (apiSetting === "offline") return null;
    if (apiSetting === "same-origin") return location.origin;
    if (apiSetting) {
      try {
        const url = new URL(apiSetting, location.href);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
            (location.protocol === 'https:' && url.protocol !== 'https:')) return null;
        return url.href.replace(/\/$/, '');
      } catch { return null; }
    }
    return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      ? 'http://localhost:8000' : null;
  })();

  document.documentElement.lang = data.meta.lang;
  function chapterById(id) {
    return data.chapters.find((c) => c.id === id) || data.chapters[0];
  }
  function selectedChapter() {
    return chapterById(new URLSearchParams(location.search).get("ch"));
  }
  const currentModule =
    data.modules.find((m) => m.id === page) ||
    (page === "relations" ? { title: data.relationsUI.headTitle } : null) ||
    (page === "qinli" ? { title: data.qinliUI.sectionTitle } : null) ||
    (page === "search" ? { title: data.searchUI.navTitle } : null) ||
    (page === "chapter" ? { title: data.chapterUI.series + " · " + selectedChapter().title } : null);
  document.title = currentModule
    ? currentModule.title + " · " + data.meta.title
    : data.meta.title;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", data.meta.description);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- 进度存储：单一 key，读-改-写，多页共用 ---------- */

  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  /* ---------- 对话记忆存储：独立 key，与研读进度分开存放 ---------- */

  const CHATMEM_KEY = "shimais-daming:chatmem:v1";
  const CHATMEM_HISTORY_MAX = 30;
  const CHATMEM_TOPIC_MAX = 40;

  function loadChatMem() {
    try {
      const raw = localStorage.getItem(CHATMEM_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveChatMem(map) {
    try {
      localStorage.setItem(CHATMEM_KEY, JSON.stringify(map));
    } catch {
      /* 隐私模式等写入失败时保持只读体验 */
    }
  }

  function chatTier(rounds) {
    const n = Number(rounds) || 0;
    if (n < 5) return "初见";
    if (n < 15) return "相熟";
    return "深谈";
  }

  function updateProgress(mutate) {
    const p = loadProgress();
    mutate(p);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch {
      /* 隐私模式等写入失败时保持只读体验 */
    }
    return p;
  }

  function readIds() {
    const p = loadProgress();
    return p.timeline && Array.isArray(p.timeline.read) ? p.timeline.read : [];
  }

  function markRead(id) {
    if (!resolveLastRead({ kind: "timeline", id })) return;
    updateProgress((p) => {
      p.timeline = p.timeline || {};
      p.timeline.read = Array.isArray(p.timeline.read) ? p.timeline.read : [];
      if (!p.timeline.read.includes(id)) p.timeline.read.push(id);
    });
    markLastRead("timeline", id);
  }

  function resolveLastRead(record) {
    if (!record || typeof record.id !== "string") return null;
    let item;
    if (record.kind === "timeline") {
      item = data.timeline.events.find((e) => e.id === record.id);
      return item ? { label: item.title, href: "timeline.html?event=" + item.id } : null;
    }
    if (record.kind === "card") {
      item = data.cards.find((c) => c.id === record.id);
      return item ? { label: item.name, href: "cards.html?card=" + item.id } : null;
    }
    if (record.kind === "qinli") {
      item = data.qinli.find((s) => s.playable && s.id === record.id);
      return item ? { label: item.title, href: "qinli.html?story=" + item.id } : null;
    }
    return null;
  }

  function markLastRead(kind, id) {
    if (!resolveLastRead({ kind, id })) return;
    updateProgress((p) => { p.lastRead = { kind, id }; });
  }

  function buildTopicPath(activeHref) {
    const section = el("section", "topic-path");
    section.setAttribute("aria-label", data.topic.title);
    section.appendChild(el("h3", "topic-title", "专题 · " + data.topic.title));
    const active = data.topic.steps.findIndex((step) => step.href === activeHref);
    if (active >= 0) section.appendChild(el("p", "topic-goal", "本步目标：" + data.topic.steps[active].goal));
    const steps = el("ol", "topic-steps");
    data.topic.steps.forEach((step, i) => {
      const item = el("li", i === active ? "is-current" : "");
      const link = el("a", "topic-link", step.label);
      link.href = step.href;
      if (link.getAttribute("href").startsWith("qinli.html")) { link.target = "_blank"; link.rel = "noopener"; }
      link.title = step.goal;
      if (i === active) link.setAttribute("aria-current", "step");
      item.appendChild(link);
      steps.appendChild(item);
    });
    section.appendChild(steps);
    if (active >= 0 && active < data.topic.steps.length - 1) {
      const next = data.topic.steps[active + 1];
      const link = el("a", "topic-next", "下一步：" + next.label + " — " + next.goal);
      link.href = next.href;
      if (link.getAttribute("href").startsWith("qinli.html")) { link.target = "_blank"; link.rel = "noopener"; }
      section.appendChild(link);
    }
    return section;
  }

  function chatState() {
    const p = loadProgress();
    const c = p.chat && typeof p.chat === "object" ? p.chat : {};
    return { started: !!c.started };
  }

  function markChatStarted() {
    if (chatState().started) return;
    updateProgress((p) => {
      p.chat = { started: true };
    });
  }

  /* ---------- 固定顶部导航 ---------- */

  function renderNav() {
    const nav = el("header", "site-nav");
    const inner = el("div", "nav-inner");

    const brand = el("a", "nav-brand");
    brand.href = "index.html";
    const brandParts = data.meta.title.split("·");
    brand.appendChild(el("span", "nav-brand-a", brandParts[0]));
    brand.appendChild(el("span", "nav-brand-dot", "·"));
    brand.appendChild(el("span", "nav-brand-b", brandParts[1]));
    inner.appendChild(brand);

    const links = el("nav", "nav-links");
    links.setAttribute("aria-label", data.modulesLabel);
    const navItems = [{ id: "index", page: "index.html", title: "首页" }];
    data.modules.forEach((m) => {
      navItems.push(m);
      if (m.id === "timeline") {
        navItems.push({ id: "relations", page: "relations.html", title: data.relationsUI.navTitle });
      }
      if (m.id === "decision") {
        navItems.push({ id: "qinli", page: "qinli.html", title: data.qinliUI.navTitle });
      }
      if (m.id === "cards") {
        navItems.push({ id: "search", page: "search.html", title: data.searchUI.navTitle });
      }
    });
    navItems.forEach((m) => {
      const a = el("a", "nav-link");
      a.href = m.page;
      a.appendChild(el("span", "nav-full", m.title));
      if (m.short) a.appendChild(el("span", "nav-short", m.short));
      if (m.id === page) {
        a.classList.add("is-current");
        a.setAttribute("aria-current", "page");
      }
      links.appendChild(a);
    });
    links.setAttribute("aria-describedby", "nav-scroll-hint");
    inner.appendChild(links);
    const hint = el("span", "nav-scroll-hint", "栏目可横向滑动");
    hint.id = "nav-scroll-hint";
    inner.appendChild(hint);
    nav.appendChild(inner);
    document.body.prepend(nav);

    /* 顶栏单行横滑后高度仍可能随字号变化，实测高度同步给 --nav-h，供正文偏移与吸顶组件使用 */
    const syncNavHeight = () => {
      document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px");
      requestAnimationFrame(() => {
        const active = links.querySelector('[aria-current="page"]');
        if (!active) return;
        const viewport = links.getBoundingClientRect();
        const item = active.getBoundingClientRect();
        // 只改变导航内部横向位置，不调用会移动整页的 scrollIntoView。
        if (item.left < viewport.left) links.scrollLeft -= viewport.left - item.left + 8;
        else if (item.right > viewport.right) links.scrollLeft += item.right - viewport.right + 8;
      });
    };
    syncNavHeight();
    if ("ResizeObserver" in window) {
      new ResizeObserver(syncNavHeight).observe(nav);
    } else {
      window.addEventListener("resize", syncNavHeight);
    }
  }

  /* ---------- 窄幅页眉区 ---------- */

  function renderPageHead(title, hint) {
    const head = el("div", "page-head");
    const inner = el("div", "page-head-inner container");
    inner.appendChild(el("span", "head-rule"));
    inner.appendChild(el("h1", "head-title", title));
    if (hint) inner.appendChild(el("p", "head-hint", hint));
    head.appendChild(inner);
    return head;
  }

  /* ---------- 页脚 ---------- */

  function renderFooter() {
    const footer = el("footer", "site-footer");
    const inner = el("div", "container footer-inner");
    inner.appendChild(el("p", "footer-series", data.footer.series));
    inner.appendChild(el("p", "footer-note", data.footer.note));
    footer.appendChild(inner);
    return footer;
  }

  /* ---------- 首页轮播 ---------- */

  function buildCarousel() {
    const slides = data.slides;
    const region = el("section", "carousel");
    region.setAttribute("role", "region");
    region.setAttribute("aria-roledescription", "carousel");
    region.setAttribute("aria-label", data.carouselLabel);
    region.tabIndex = 0;

    let idx = 0;
    let timer = null;

    const slideNodes = slides.map((s, i) => {
      const isPortrait = /02-taizu/.test(s.img);
      const slide = el("div", "slide" + (isPortrait ? " slide-frame" : " slide-cover"));
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute("aria-label", (i + 1) + " / " + slides.length);

      const img = el("img");
      img.src = s.img;
      img.alt = s.headline;
      img.decoding = "async";
      img.draggable = false;
      if (isPortrait) {
        const frame = el("div", "frame-wrap");
        frame.appendChild(img);
        slide.appendChild(frame);
      } else {
        slide.appendChild(img);
      }
      slide.appendChild(el("div", "slide-scrim"));

      const copy = el("div", "slide-copy container");
      copy.appendChild(el("h2", "slide-headline", s.headline));
      copy.appendChild(el("p", "slide-sub", s.sub));
      slide.appendChild(copy);

      region.appendChild(slide);
      return slide;
    });

    const prev = el("button", "car-arrow car-prev");
    prev.type = "button";
    prev.setAttribute("aria-label", data.carouselPrev);
    prev.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 4 L7 12 L15 20" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
    const next = el("button", "car-arrow car-next");
    next.type = "button";
    next.setAttribute("aria-label", data.carouselNext);
    next.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 4 L17 12 L9 20" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

    const dots = el("div", "car-dots");
    const dotNodes = slides.map((s, i) => {
      const d = el("button", "car-dot");
      d.type = "button";
      d.setAttribute("aria-label", data.carouselDot.replace("%n", String(i + 1)));
      d.addEventListener("click", () => {
        go(i);
        restart();
      });
      dots.appendChild(d);
      return d;
    });

    region.append(prev, next, dots);

    function paint() {
      slideNodes.forEach((n, i) => {
        n.classList.toggle("is-active", i === idx);
        n.setAttribute("aria-hidden", i === idx ? "false" : "true");
      });
      dotNodes.forEach((n, i) => {
        n.classList.toggle("is-active", i === idx);
        if (i === idx) n.setAttribute("aria-current", "true");
        else n.removeAttribute("aria-current");
      });
    }

    function go(n) {
      idx = (n + slides.length) % slides.length;
      paint();
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function start() {
      stop();
      /* 自动切换不受 prefers-reduced-motion 限制，该设置只影响过渡动画；唯一暂停条件是标签页在后台 */
      if (document.hidden) return;
      timer = setInterval(() => go(idx + 1), 6000);
    }

    function restart() {
      start();
    }

    prev.addEventListener("click", () => {
      go(idx - 1);
      restart();
    });
    next.addEventListener("click", () => {
      go(idx + 1);
      restart();
    });

    document.addEventListener("visibilitychange", () => {
      document.hidden ? stop() : start();
    });
    region.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(idx - 1);
        restart();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(idx + 1);
        restart();
      }
    });

    let touchX = 0;
    let touchY = 0;
    region.addEventListener(
      "touchstart",
      (e) => {
        touchX = e.changedTouches[0].clientX;
        touchY = e.changedTouches[0].clientY;
      },
      { passive: true }
    );
    region.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - touchX;
        const dy = e.changedTouches[0].clientY - touchY;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
          go(idx + (dx < 0 ? 1 : -1));
          restart();
        }
      },
      { passive: true }
    );

    paint();
    start();
    return region;
  }

  /* ---------- 首页 ---------- */

  function renderIndex() {
    const start = el("section", "topic-start container");
    const copy = el("div");
    copy.appendChild(el("p", "topic-title", "第一次来？从一个制度问题开始"));
    copy.appendChild(el("p", "topic-goal", data.topic.title + " · 读背景、试处境、做迁移、回材料"));
    const begin = el("a", "cta-button cta-gold", "开始一条鞭法专题");
    begin.href = data.topic.steps[0].href;
    if (begin.getAttribute("href").startsWith("qinli.html")) { begin.target = "_blank"; begin.rel = "noopener"; }
    start.append(copy, begin);
    const last = resolveLastRead(loadProgress().lastRead);
    if (last) {
      const resume = el("a", "topic-next", "继续上次：" + last.label);
      resume.href = last.href;
      if (resume.getAttribute("href").startsWith("qinli.html")) { resume.target = "_blank"; resume.rel = "noopener"; }
      start.appendChild(resume);
    }
    app.appendChild(start);
    app.appendChild(buildCarousel());

    const question = el("section", "question-section container");
    const block = el("div", "question-block");
    block.appendChild(el("p", "main-question", data.hero.question));
    block.appendChild(el("p", "question-note", data.hero.questionNote));
    question.appendChild(block);
    const ctaModule = data.modules.find((m) => m.id === data.hero.ctaTarget);
    const cta = el("a", "cta-button", data.hero.cta);
    cta.href = ctaModule ? ctaModule.page : "timeline.html";
    question.appendChild(cta);
    app.appendChild(question);

    const chEntry = el("section", "ch-entry container");
    chEntry.appendChild(el("h2", "ch-entry-title", data.chapterUI.entryTitle));
    chEntry.appendChild(el("p", "ch-entry-desc", data.chapterUI.entryDesc));
    const chBtn = el("a", "cta-button", data.chapterUI.entryBtn);
    chBtn.href = "chapter.html";
    chBtn.target = "_blank";
    chBtn.rel = "noopener";
    chEntry.appendChild(chBtn);
    const chSecond = el("a", "ch-entry-second", data.chapterUI.secondLink);
    chSecond.href = "chapter.html?ch=" + data.chapters[1].id;
    chSecond.target = "_blank";
    chSecond.rel = "noopener";
    chEntry.appendChild(chSecond);
    app.appendChild(chEntry);

    const entries = el("section", "entries-section container");
    const head = el("div", "section-head");
    head.appendChild(el("h2", "section-title", data.modulesLabel));
    head.appendChild(el("p", "section-hint", data.modulesHint));
    entries.appendChild(head);

    const list = el("div", "entry-list");
    data.modules.forEach((m, i) => {
      const a = el("a", "entry-block");
      a.href = m.page;
      if (a.getAttribute("href").startsWith("qinli.html")) { a.target = "_blank"; a.rel = "noopener"; }
      a.appendChild(el("span", "entry-index", String(i + 1).padStart(2, "0")));
      a.appendChild(el("h3", "entry-title", m.title));
      a.appendChild(el("p", "entry-desc", m.desc));
      list.appendChild(a);
    });
    entries.appendChild(list);
    app.appendChild(entries);
  }

  /* ---------- 时间线 ---------- */

  function renderTerritory() {
    const ui = data.territory;
    const geometry = typeof TERRITORY_GEOMETRY !== "undefined" ? TERRITORY_GEOMETRY : null;
    const statesOk = ui && Array.isArray(ui.states) && ui.states.length > 0 && ui.states.every((s) =>
      s && typeof s.id === "string" && typeof s.label === "string" && typeof s.note === "string" &&
      Number.isFinite(s.year) && Array.isArray(s.show) && Array.isArray(s.range) && s.range.length === 2);
    const textsOk = ui && ["title", "legend", "disclaimer", "readingNote"].every((k) => typeof ui[k] === "string");
    const geoOk = geometry && typeof geometry.viewBox === "string" && typeof geometry.base === "string" &&
      Array.isArray(geometry.overlays) && Array.isArray(geometry.labels) && Array.isArray(geometry.sources);
    if (!statesOk || !textsOk || !geoOk) {
      console.warn("版图数据缺失或结构不合法，版图板块不渲染；时间线照常。");
      return null;
    }
    const section = el("section", "tm-section");
    section.setAttribute("aria-labelledby", "territory-heading");
    const heading = el("h2", "section-title tm-heading", ui.title);
    heading.id = "territory-heading";
    section.appendChild(heading);

    const controls = el("div", "tm-states");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "切换疆域阶段");
    const buttons = new Map();
    ui.states.forEach((state) => {
      const button = el("button", "tm-state");
      button.type = "button";
      button.appendChild(el("span", "tm-state-year", String(state.year)));
      button.appendChild(el("span", "tm-state-label", state.label));
      button.setAttribute("aria-controls", "territory-stage");
      button.addEventListener("click", () => selectState(state));
      controls.appendChild(button);
      buttons.set(state.id, button);
    });
    section.appendChild(controls);
    section.appendChild(el("p", "tm-scroll-hint", "左右滑动可查看全部六个阶段"));

    function svgEl(tag, attrs = {}, text) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
      if (text != null) node.textContent = text;
      return node;
    }
    const stage = el("div", "tm-stage");
    stage.id = "territory-stage";
    const map = svgEl("svg", { class: "tm-map", viewBox: geometry.viewBox, role: "img", "aria-labelledby": "territory-map-title territory-map-desc" });
    const mapTitle = svgEl("title", { id: "territory-map-title" });
    map.append(mapTitle, svgEl("desc", { id: "territory-map-desc" }, ui.disclaimer + ui.readingNote));
    const defs = svgEl("defs");
    const hatch = svgEl("pattern", { id: "territory-hatch", class: "tm-hatch-pattern", width: 10, height: 10, patternUnits: "userSpaceOnUse" });
    hatch.appendChild(svgEl("path", { d: "M-2 2L2-2M0 10L10 0M8 12L12 8", class: "tm-hatch-line" }));
    defs.appendChild(hatch);
    map.appendChild(defs);
    const base = svgEl("g", { class: "tm-base" });
    base.appendChild(svgEl("path", { class: "tm-core", d: geometry.base }));
    map.appendChild(base);

    const layerNodes = new Map();
    const layers = svgEl("g", { class: "tm-layers" });
    geometry.overlays.forEach((overlay) => {
      const group = svgEl("g", { class: "tm-layer overlay-" + overlay.id, "data-overlay": overlay.id });
      if (overlay.id === "yunnan-contested") {
        group.appendChild(svgEl("path", { class: "tm-contested-ground", d: overlay.d }));
      }
      group.appendChild(svgEl("path", { class: "tm-shape tm-" + overlay.kind, d: overlay.d }));
      (overlay.forts || []).forEach((fort) => {
        group.appendChild(svgEl("rect", { class: "tm-fort", x: fort.x - 3, y: fort.y - 3, width: 6, height: 6 }));
      });
      layers.appendChild(group);
      layerNodes.set(overlay.id, group);
    });
    map.appendChild(layers);
    const placeNodes = [];
    geometry.labels.forEach((place) => {
      const text = svgEl("text", { class: "tm-place", x: place.x, y: place.y, "text-anchor": place.anchor || "middle" }, place.text);
      map.appendChild(text);
      placeNodes.push({ node: text, overlay: place.overlay });
    });
    const nominal = svgEl("text", { class: "tm-nominal", x: 30, y: 786, "text-anchor": "start" }, "羁縻 · 名义统辖");
    map.appendChild(nominal);
    stage.appendChild(map);

    const copy = el("div", "tm-copy");
    const summary = el("div", "tm-summary");
    summary.setAttribute("aria-live", "polite");
    summary.setAttribute("aria-atomic", "true");
    const year = el("p", "tm-year");
    const label = el("h3", "tm-label");
    const note = el("p", "tm-note");
    summary.append(year, label, note);
    const eventTitle = el("h4", "tm-event-title");
    const events = el("ul", "tm-events");
    const empty = el("p", "tm-empty", "本站时间线暂无此段事件");
    copy.append(summary, eventTitle, events, empty);
    stage.appendChild(copy);
    section.appendChild(stage);
    const foot = el("div", "tm-foot");
    foot.appendChild(el("p", "tm-legend", ui.legend));
    foot.appendChild(el("p", "tm-reading-note", ui.readingNote));
    foot.appendChild(el("p", "tm-disclaimer", ui.disclaimer));
    const sourceLine = el("p", "tm-sources", "轮廓资料：");
    geometry.sources.forEach((source, i) => {
      if (i) sourceLine.appendChild(el("span", "", " · "));
      const link = el("a", "tm-source", source.name);
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = [source.license, source.detail].filter(Boolean).join("；");
      sourceLine.appendChild(link);
    });
    foot.appendChild(sourceLine);
    section.appendChild(foot);

    function selectState(state) {
      mapTitle.textContent = state.year + " · " + state.label + "，疆域大势示意";
      map.classList.toggle("is-fallen", state.id === "1644");
      layerNodes.forEach((node, id) => {
        const visible = state.show.includes(id);
        node.classList.toggle("is-visible", visible);
        node.setAttribute("aria-hidden", String(!visible));
      });
      placeNodes.forEach(({ node, overlay }) => {
        const visible = !overlay || state.show.includes(overlay);
        node.classList.toggle("is-hidden", !visible);
        node.setAttribute("aria-hidden", String(!visible));
      });
      const hasNominal = state.show.includes("jimi") || state.show.includes("nuergan");
      nominal.classList.toggle("is-hidden", !hasNominal);
      nominal.setAttribute("aria-hidden", String(!hasNominal));
      buttons.forEach((button, id) => {
        button.classList.toggle("is-current", state.id === id);
        button.setAttribute("aria-pressed", String(state.id === id));
      });
      year.textContent = String(state.year);
      label.textContent = state.label;
      note.textContent = state.note;
      eventTitle.textContent = state.range.join("–") + " · 本站事件";
      events.replaceChildren();
      const matches = data.timeline.events.filter((event) => state.range[0] <= Number(event.year) && Number(event.year) <= state.range[1]);
      matches.forEach((event) => {
        const item = el("li", "tm-event");
        const link = el("a", "tm-event-link", event.year + " · " + event.title);
        link.href = "timeline.html?event=" + event.id;
        item.appendChild(link);
        events.appendChild(item);
      });
      empty.hidden = matches.length > 0;
    }
    selectState(ui.states[0]);
    return section;
  }

  function renderTimeline() {
    const tl = data.timeline;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));

    const ctx = el("div", "tl-context");
    const ctxInner = el("div", "container tl-context-inner");
    const ctxLine = el("p", "tl-context-line");
    ctxInner.appendChild(ctxLine);
    ctxInner.appendChild(el("span", "tl-context-note", "首辅以本站帝王首辅表收录为准。"));
    ctx.appendChild(ctxInner);
    app.appendChild(ctx);
    const syncCtxHeight = () => {
      document.documentElement.style.setProperty("--tl-ctx-h", ctx.offsetHeight + "px");
    };
    syncCtxHeight();
    if ("ResizeObserver" in window) {
      new ResizeObserver(syncCtxHeight).observe(ctx);
    } else {
      window.addEventListener("resize", syncCtxHeight);
    }

    // 首辅分段以离任年为区间末（不含），故 1644 年无覆盖；皇帝按闭区间、同年起始最早者
    function contextFor(ev) {
      const y = Number(ev.year);
      const lords = data.relations.emperors
        .filter((p) => p.from <= y && y <= p.to)
        .sort((a, b) => a.from - b.from);
      // 年号唯一命中 reign 者优先（1457 天顺元年→英宗）；零或多命中仍取 from 最早
      const eraHits = lords.filter((p) => p.era && ev.reign.includes(p.era));
      const lord = eraHits.length === 1 ? eraHits[0] : lords[0];
      let chief = "内阁未设";
      if (y >= 1402) {
        const covers = [];
        data.relations.chiefs.forEach((p) => {
          p.segments.forEach((s) => {
            if (s[0] <= y && y < s[1]) covers.push([s[0], p.name]);
          });
        });
        covers.sort((a, b) => a[0] - b[0]);
        chief = covers.length ? covers[0][1] : "—";
      }
      return ev.reign + " · 在位：" + (lords.length ? lord.name : "—") + " · 首辅：" + chief;
    }
    function setContext(ev) {
      ctxLine.textContent = contextFor(ev);
    }

    const wrap = el("div", "container tl-wrap");
    // 版图与时间线列表相互独立：版图初始化失败只移除自身，不拖垮列表渲染。
    try {
      const territory = renderTerritory();
      if (territory) wrap.appendChild(territory);
    } catch (err) {
      wrap.querySelectorAll(".tm-section").forEach((node) => node.remove());
      console.warn("版图板块初始化失败，已移除；时间线照常渲染。", err);
    }

    const strip = el("div", "tl-progress");
    const label = el("p", "tl-progress-label");
    const bar = el("div", "tl-bar");
    const fill = el("span", "tl-bar-fill");
    bar.appendChild(fill);
    strip.append(label, bar);
    wrap.appendChild(strip);

    const rows = new Map();

    function refreshProgress() {
      const read = readIds();
      label.textContent =
        tl.progressLabel + " " + read.length + " / " + tl.events.length;
      fill.style.width = (read.length / tl.events.length) * 100 + "%";
      rows.forEach((row, id) => {
        const isRead = read.includes(id);
        row.classList.toggle("is-read", isRead);
        const badge = row.querySelector(".tl-read");
        badge.hidden = !isRead;
      });
    }

    tl.eras.forEach((era) => {
      const events = tl.events.filter((e) => e.era === era.id);
      if (!events.length) return;

      const group = el("section", "tl-era");
      const head = el("div", "tl-era-head");
      head.appendChild(el("h2", "tl-era-name", era.name));
      head.appendChild(el("span", "tl-era-span", era.span));
      group.appendChild(head);

      const list = el("div", "tl-list");
      events.forEach((ev) => {
        const article = el("article", "tl-event");
        article.dataset.id = ev.id;

        const row = el("button", "tl-row");
        row.type = "button";
        row.setAttribute("aria-expanded", "false");
        row.appendChild(el("span", "tl-year", ev.year));
        row.appendChild(el("span", "tl-node"));
        const body = el("span", "tl-row-body");
        body.appendChild(el("span", "tl-reign", ev.reign));
        body.appendChild(el("span", "tl-title", ev.title));
        body.appendChild(el("span", "tl-summary", ev.summary));
        row.appendChild(body);
        const tail = el("span", "tl-row-tail");
        const badge = el("span", "tl-read", tl.readBadge);
        badge.hidden = true;
        tail.appendChild(badge);
        tail.appendChild(el("span", "tl-chev"));
        row.appendChild(tail);

        const detail = el("div", "tl-detail");
        detail.hidden = true;
        ev.detail.forEach((p) => detail.appendChild(el("p", "tl-detail-p", p)));
        if (ev.sourceId) {
          const source = el("a", "topic-next", "查看引文、出处与版本限制");
          source.href = "search.html?source=" + encodeURIComponent(ev.sourceId);
          detail.appendChild(source);
        }
        if (ev.id === "e1581") detail.appendChild(buildTopicPath("timeline.html?event=e1581"));
        const tags = el("div", "tl-tags");
        ev.tags.forEach((t) => tags.appendChild(el("span", "tl-tag", t)));
        detail.appendChild(tags);

        row.addEventListener("click", () => {
          const open = detail.hidden;
          detail.hidden = !open;
          row.setAttribute("aria-expanded", open ? "true" : "false");
          article.classList.toggle("is-open", open);
          setContext(ev);
          if (open) {
            markRead(ev.id);
            refreshProgress();
          }
        });

        article.append(row, detail);
        list.appendChild(article);
        rows.set(ev.id, article);
      });
      group.appendChild(list);
      wrap.appendChild(group);
    });

    app.appendChild(wrap);
    refreshProgress();

    const evNodes = tl.events.map((ev) => ({ ev, node: rows.get(ev.id) }));
    function pickCurrent() {
      // 页底时末条永远到不了顶线，触底即视为当前
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        setContext(evNodes[evNodes.length - 1].ev);
        return;
      }
      const ref = ctx.getBoundingClientRect().bottom;
      let best = evNodes[0];
      let bestDist = Infinity;
      evNodes.forEach((item) => {
        const d = Math.abs(item.node.getBoundingClientRect().top - ref);
        if (d < bestDist) {
          bestDist = d;
          best = item;
        }
      });
      setContext(best.ev);
    }
    let ctxTick = false;
    let ctxLock = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ctxTick || ctxLock) return;
        ctxTick = true;
        requestAnimationFrame(() => {
          ctxTick = false;
          pickCurrent();
        });
      },
      { passive: true }
    );
    setContext(tl.events[0]);

    const deepId = new URLSearchParams(location.search).get("event");
    const deepEvent = deepId && rows.get(deepId);
    if (deepEvent) {
      if (deepEvent.querySelector(".tl-detail").hidden) {
        deepEvent.querySelector(".tl-row").click();
      }
      deepEvent.classList.add("is-deep-hit");
      ctxLock = true;
      // scrollIntoView 的 scroll-margin 在本布局有偏差，手动对齐到信息条下沿
      const navH = document.querySelector(".site-nav").offsetHeight;
      const docTop = deepEvent.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, docTop - navH - ctx.offsetHeight - 8), behavior: "instant" });
      setTimeout(() => {
        ctxLock = false;
      }, 350);
      setContext(tl.events.find((ev) => ev.id === deepId));
    }

    window.addEventListener("storage", (e) => {
      if (e.key === PROGRESS_KEY) refreshProgress();
    });
  }

  /* ---------- 决策模式 ---------- */

  function decisionState() {
    const p = loadProgress();
    const d = p.decisions && typeof p.decisions === "object" ? p.decisions : {};
    return {
      done: Array.isArray(d.done) ? d.done : [],
      picks: d.picks && typeof d.picks === "object" ? d.picks : {},
    };
  }

  function renderDecisions() {
    const ui = data.decisionLabels;
    const scenarios = data.decisions;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));

    const wrap = el("div", "container dc-wrap");
    const strip = el("div", "dc-progress");
    const label = el("p", "dc-progress-label");
    label.appendChild(el("span", "dc-progress-text", ui.progressLabel));
    const count = el("span", "dc-count");
    label.appendChild(count);
    const bar = el("div", "dc-bar");
    const fill = el("span", "dc-bar-fill");
    bar.appendChild(fill);
    strip.append(label, bar);
    wrap.appendChild(strip);

    const note = el("p", "dc-complete-note", ui.completeNote);
    note.hidden = true;
    wrap.appendChild(note);

    const nodes = new Map();

    function applyState(sc, node) {
      const pick = decisionState().picks[sc.id];
      const hint = node.querySelector(".dc-lock-hint");
      const result = node.querySelector(".dc-result");
      node.classList.toggle("is-done", !!pick);
      node.querySelector(".dc-seal").hidden = !pick;
      hint.textContent = pick ? ui.lockedHint : ui.lockHint;
      node.querySelectorAll(".dc-choice").forEach((btn) => {
        const key = btn.dataset.key;
        btn.disabled = !!pick;
        btn.classList.toggle("is-picked", pick === key);
        btn.classList.toggle("is-dim", !!pick && pick !== key);
        btn.setAttribute("aria-pressed", pick === key ? "true" : "false");
      });
      if (pick) {
        const choice = sc.choices.find((c) => c.key === pick);
        result.querySelector(".dc-consequence-p").textContent = choice.consequence;
        result.querySelector(".dc-history-p").textContent = choice.history;
        result.hidden = false;
      } else {
        result.hidden = true;
      }
    }

    function refreshStrip() {
      const done = decisionState().done;
      count.textContent = done.length + " / " + scenarios.length;
      fill.style.width = (done.length / scenarios.length) * 100 + "%";
      note.hidden = done.length < scenarios.length;
    }

    scenarios.forEach((sc) => {
      const article = el("article", "dc-scenario");
      article.dataset.id = sc.id;

      const head = el("div", "dc-head");
      head.appendChild(el("span", "dc-num", sc.num));
      const headMain = el("div", "dc-head-main");
      headMain.appendChild(el("p", "dc-meta", sc.year + " · " + sc.reign));
      headMain.appendChild(el("h2", "dc-title", sc.title));
      head.appendChild(headMain);
      const seal = el("span", "dc-seal", ui.doneBadge);
      seal.hidden = true;
      head.appendChild(seal);
      article.appendChild(head);

      const role = el("p", "dc-role");
      role.appendChild(el("span", "dc-role-label", ui.roleLabel));
      role.appendChild(el("span", "dc-role-name", sc.role));
      role.appendChild(el("span", "dc-role-note", sc.roleNote));
      article.appendChild(role);

      const bg = el("div", "dc-bg");
      sc.background.forEach((s) => bg.appendChild(el("p", "dc-bg-p", s)));
      article.appendChild(bg);

      article.appendChild(el("p", "dc-lock-hint", ui.lockHint));

      const choices = el("div", "dc-choices");
      choices.setAttribute("role", "group");
      choices.setAttribute("aria-label", sc.title);
      sc.choices.forEach((c) => {
        const btn = el("button", "dc-choice");
        btn.type = "button";
        btn.dataset.key = c.key;
        btn.setAttribute("aria-pressed", "false");
        btn.appendChild(el("span", "dc-key", c.key));
        btn.appendChild(el("span", "dc-choice-label", c.label));
        btn.addEventListener("click", () => {
          if (decisionState().picks[sc.id]) return;
          updateProgress((p) => {
            p.decisions = p.decisions || {};
            p.decisions.done = Array.isArray(p.decisions.done) ? p.decisions.done : [];
            if (!p.decisions.done.includes(sc.id)) p.decisions.done.push(sc.id);
            p.decisions.picks = p.decisions.picks || {};
            p.decisions.picks[sc.id] = c.key;
          });
          applyState(sc, article);
          refreshStrip();
          const result = article.querySelector(".dc-result");
          result.scrollIntoView({
            behavior: reducedMotion.matches ? "auto" : "smooth",
            block: "nearest",
          });
        });
        choices.appendChild(btn);
      });
      article.appendChild(choices);

      const result = el("div", "dc-result");
      result.hidden = true;
      result.setAttribute("aria-live", "polite");
      const cons = el("div", "dc-block dc-consequence");
      cons.appendChild(el("h3", "dc-block-title", ui.consequenceLabel));
      cons.appendChild(el("p", "dc-consequence-p"));
      const hist = el("div", "dc-block dc-history");
      hist.appendChild(el("h3", "dc-block-title", ui.historyLabel));
      hist.appendChild(el("p", "dc-history-p"));
      result.append(cons, hist);
      article.appendChild(result);

      wrap.appendChild(article);
      nodes.set(sc.id, article);
      applyState(sc, article);
    });

    const entry = el("div", "ql-entry");
    entry.appendChild(el("p", "ql-entry-text", data.qinliUI.entryText));
    const entryLink = el("a", "ql-entry-link", data.qinliUI.entryLink);
    entryLink.href = "qinli.html";
    entryLink.target = "_blank";
    entryLink.rel = "noopener";
    entry.appendChild(entryLink);
    wrap.appendChild(entry);

    app.appendChild(wrap);
    refreshStrip();

    window.addEventListener("storage", (e) => {
      if (e.key !== PROGRESS_KEY) return;
      scenarios.forEach((sc) => applyState(sc, nodes.get(sc.id)));
      refreshStrip();
    });
  }

  /* ---------- 亲历 · 长剧本（独立页） ---------- */

  function renderQinli() {
    const qu = data.qinliUI;
    const stories = data.qinli;
    app.appendChild(renderPageHead(qu.sectionTitle, qu.sectionHint));
    const wrap = el("div", "container ql-wrap");
    const clampStat = (v) => Math.max(0, Math.min(100, v));
    const signed = (v) => (v > 0 ? "+" + v : String(v));
    const ml = (k) => (run && run.story.meterLabels && run.story.meterLabels[k]) || qu[k];

    function judgeEnding() {
      const p = run.prestige;
      const m = run.morale;
      if (run.story.id === "q1402") return p >= 75 ? "martyr" : m >= 70 ? "exile" : "new";
      if (run.story.id === "q1380") return p <= 25 || (run.sixC && p < 40) ? "purge" : m >= 75 ? "qingming" : "survive";
      if (run.story.id === "q1548") return m >= 75 ? "wanren" : p >= 75 ? "yupai" : "chenmo";
      if (run.story.id === "q1581") return m <= 25 ? "minren" : m >= 75 ? "qingtian" : p >= 75 ? "nengli" : "pingchang";
      if (run.story.id === "q1644") return p >= 70 ? "nandu" : m >= 70 ? "xingcun" : "wuming";
      return p >= 75 && m >= 75 ? "hero" : "plain";
    }

    function qinliState() {
      const p = loadProgress();
      const q = p.qinli && typeof p.qinli === "object" ? p.qinli : {};
      return {
        done: Array.isArray(q.done) ? q.done : [],
        current: q.current && typeof q.current === "object" ? q.current : null,
      };
    }

    function saveCurrent(cur) {
      updateProgress((p) => {
        p.qinli = p.qinli && typeof p.qinli === "object" ? p.qinli : {};
        p.qinli.done = Array.isArray(p.qinli.done) ? p.qinli.done : [];
        p.qinli.current = cur;
      });
    }

    function finishStory(id) {
      updateProgress((p) => {
        p.qinli = p.qinli && typeof p.qinli === "object" ? p.qinli : {};
        p.qinli.done = Array.isArray(p.qinli.done) ? p.qinli.done : [];
        if (!p.qinli.done.includes(id)) p.qinli.done.push(id);
        p.qinli.current = null;
      });
    }

    const cards = el("div", "ql-cards");
    const cardNodes = new Map();
    const play = el("div", "ql-play");
    play.hidden = true;
    let run = null;

    const stats = el("div", "ql-stats");
    const statRows = {};
    ["prestige", "morale"].forEach((k) => {
      const row = el("div", "ql-stat-row");
      const lab = el("span", "ql-stat-label", qu[k]);
      row.appendChild(lab);
      const bar = el("div", "ql-bar");
      const fill = el("span", "ql-bar-fill");
      bar.appendChild(fill);
      row.appendChild(bar);
      const val = el("span", "ql-stat-val", "50");
      row.appendChild(val);
      stats.appendChild(row);
      statRows[k] = { fill, val, lab };
    });
    play.appendChild(stats);
    const headBox = el("div", "ql-head-box");
    play.appendChild(headBox);
    const stage = el("div", "ql-stage");
    play.appendChild(stage);

    function paintStats() {
      ["prestige", "morale"].forEach((k) => {
        statRows[k].fill.style.width = run[k] + "%";
        statRows[k].val.textContent = String(run[k]);
      });
    }

    function paintCards() {
      const st = qinliState();
      stories.forEach((s) => {
        const node = cardNodes.get(s.id);
        const done = st.done.includes(s.id);
        node.classList.toggle("is-done", done);
        node.querySelector(".ql-done").hidden = !done;
        if (s.playable) {
          node.querySelector(".ql-play-btn").textContent =
            st.current && st.current.storyId === s.id ? qu.resume : qu.play;
        }
      });
    }

    function storyHead(s) {
      const head = el("div", "ql-story-head");
      head.appendChild(el("h3", "ql-story-title", s.title));
      const role = el("p", "ql-story-role");
      role.appendChild(el("span", "ql-mini-label", qu.roleLabel));
      role.appendChild(el("span", "ql-story-role-text", s.roleText));
      head.appendChild(role);
      const opening = el("p", "ql-story-opening");
      opening.appendChild(el("span", "ql-mini-label", qu.openingLabel));
      opening.appendChild(el("span", "ql-story-opening-text", s.opening));
      head.appendChild(opening);
      head.appendChild(el("p", "content-note", qu.mechanismNote));
      if (s.id === "q1581") head.appendChild(buildTopicPath("qinli.html?story=q1581"));
      return head;
    }

    function showEnding(eid) {
      const e = run.story.endings.find((x) => x.id === eid);
      stage.replaceChildren();
      const box = el("div", "ql-ending");
      box.appendChild(el("h4", "ql-ending-title", e.title));
      box.appendChild(el("p", "ql-ending-text", e.text));
      const cl = el("div", "ql-closure");
      cl.appendChild(el("h5", "ql-block-title", qu.closure));
      cl.appendChild(el("p", "ql-closure-p", e.closure));
      box.appendChild(cl);
      const review = el("div", "ql-closure");
      review.appendChild(el("h5", "ql-block-title", qu.mechanismTitle));
      review.appendChild(el("p", "ql-closure-p", run.story.review));
      review.appendChild(el("p", "content-note", qu.mechanismNote));
      box.appendChild(review);
      const btns = el("div", "ql-ending-btns");
      const again = el("button", "cta-button ql-again", qu.restart);
      again.type = "button";
      again.addEventListener("click", () => {
        run = { story: run.story, index: 0, prestige: 50, morale: 50, sixC: false };
        saveCurrent({ storyId: run.story.id, sceneIndex: 0, prestige: 50, morale: 50 });
        paintStats();
        paintScene();
        paintCards();
        play.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
      });
      btns.appendChild(again);
      const chatLink = run.story.chatLink || { label: qu.toChat, href: "chat.html?figure=yuqian" };
      const toChat = el("a", "cta-button cta-gold ql-tochat", chatLink.label);
      toChat.href = chatLink.href;
      btns.appendChild(toChat);
      run.story.followups.forEach((followup) => {
        const link = el("a", "cta-button cta-gold", followup.label);
        link.href = followup.href;
        btns.appendChild(link);
      });
      box.appendChild(btns);
      stage.appendChild(box);
      box.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest" });
    }

    function pick(sc, c, box, btn) {
      if (box.dataset.locked) return;
      box.dataset.locked = "1";
      box.querySelectorAll(".ql-choice").forEach((b) => {
        b.disabled = true;
        b.classList.toggle("is-picked", b === btn);
        b.classList.toggle("is-dim", b !== btn);
      });
      const result = box.querySelector(".ql-result");
      result.hidden = false;
      result.querySelector(".ql-cons-p").textContent = c.consequence;
      result.querySelector(".ql-hist-p").textContent = c.history;
      const delta = result.querySelector(".ql-delta");
      const next = result.querySelector(".ql-next");
      if (c.effect) {
        run.prestige = clampStat(run.prestige + c.effect.prestige);
        run.morale = clampStat(run.morale + c.effect.morale);
      }
      if (sc.n === 6 && c.key === "C") run.sixC = true;
      if (c.ending) {
        delta.hidden = true;
        next.hidden = true;
        paintStats();
        finishStory(run.story.id);
        paintCards();
        showEnding(c.ending);
        return;
      }
      if (c.judge) {
        delta.hidden = false;
        delta.textContent =
          ml("prestige") + " " + signed(c.effect ? c.effect.prestige : 0) + "，" + ml("morale") + " " + signed(c.effect ? c.effect.morale : 0);
        next.hidden = true;
        paintStats();
        finishStory(run.story.id);
        paintCards();
        showEnding(judgeEnding());
        return;
      }
      delta.hidden = false;
      delta.textContent =
        ml("prestige") + " " + signed(c.effect.prestige) + "，" + ml("morale") + " " + signed(c.effect.morale);
      paintStats();
      saveCurrent({
        storyId: run.story.id,
        sceneIndex: run.index + 1,
        prestige: run.prestige,
        morale: run.morale,
        sixC: run.sixC ? true : undefined,
      });
      const last = run.index >= run.story.scenes.length - 1;
      next.hidden = false;
      next.textContent = last ? qu.finish : qu.next;
      next.onclick = () => {
        if (last) {
          const eid = judgeEnding();
          finishStory(run.story.id);
          paintCards();
          showEnding(eid);
        } else {
          run.index += 1;
          paintScene();
          stage.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
        }
      };
      result.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest" });
    }

    function paintScene() {
      stage.replaceChildren();
      const sc = run.story.scenes[run.index];
      const box = el("div", "ql-scene");
      box.appendChild(el("h4", "ql-scene-label", sc.label));
      box.appendChild(el("p", "ql-bg", sc.background));
      const choices = el("div", "ql-choices");
      sc.choices.forEach((c) => {
        const btn = el("button", "ql-choice");
        btn.type = "button";
        btn.appendChild(el("span", "ql-key", c.key));
        btn.appendChild(el("span", "ql-choice-text", c.text));
        btn.addEventListener("click", () => pick(sc, c, box, btn));
        choices.appendChild(btn);
      });
      box.appendChild(choices);
      const result = el("div", "ql-result");
      result.hidden = true;
      result.setAttribute("aria-live", "polite");
      const cons = el("div", "ql-block");
      cons.appendChild(el("h5", "ql-block-title", qu.consequence));
      cons.appendChild(el("p", "ql-cons-p"));
      const hist = el("div", "ql-block");
      hist.appendChild(el("h5", "ql-block-title", qu.history));
      hist.appendChild(el("p", "ql-hist-p"));
      const delta = el("p", "ql-delta");
      delta.hidden = true;
      const next = el("button", "cta-button ql-next", qu.next);
      next.type = "button";
      next.hidden = true;
      result.append(cons, hist, delta, next);
      box.appendChild(result);
      stage.appendChild(box);
    }

    function enter(s, scroll) {
      markLastRead("qinli", s.id);
      const st = qinliState();
      let awaitingJudge = false;
      if (st.current && st.current.storyId === s.id) {
        // 存档越界＝最后一场已选完待判结局：直接落结局，防刷新重复加分
        awaitingJudge = (st.current.sceneIndex || 0) >= s.scenes.length;
        run = {
          story: s,
          index: Math.min(st.current.sceneIndex || 0, s.scenes.length - 1),
          prestige: clampStat(typeof st.current.prestige === "number" ? st.current.prestige : 50),
          morale: clampStat(typeof st.current.morale === "number" ? st.current.morale : 50),
          sixC: !!st.current.sixC,
        };
      } else {
        run = { story: s, index: 0, prestige: 50, morale: 50, sixC: false };
        saveCurrent({ storyId: s.id, sceneIndex: 0, prestige: 50, morale: 50 });
      }
      play.hidden = false;
      headBox.replaceChildren(storyHead(s));
      ["prestige", "morale"].forEach((k) => {
        statRows[k].lab.textContent = ml(k);
      });
      paintStats();
      if (awaitingJudge) {
        finishStory(s.id);
        paintCards();
        showEnding(judgeEnding());
      } else {
        paintScene();
        paintCards();
      }
      if (scroll !== false) {
        play.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
      }
    }

    stories.forEach((s) => {
      const card = el("article", "ql-card" + (s.playable ? "" : " is-locked"));
      if (s.cover) {
        const cover = el("img", "ql-cover");
        cover.alt = s.title + "封面";
        cover.loading = "lazy";
        cover.decoding = "async";
        cover.addEventListener("error", () => cover.remove());
        cover.src = s.cover;
        card.appendChild(cover);
      }
      card.appendChild(el("span", "ql-year", String(s.year)));
      card.appendChild(el("h3", "ql-title", s.title));
      card.appendChild(el("p", "ql-role", s.role));
      const theme = el("p", "ql-theme", s.theme);
      if (!s.playable) theme.hidden = true;
      card.appendChild(theme);
      const done = el("span", "ql-done", qu.doneBadge);
      done.hidden = true;
      card.appendChild(done);
      const btn = el("button", "ql-play-btn", s.playable ? qu.play : qu.comingSoon);
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (s.playable) enter(s);
        else theme.hidden = !theme.hidden;
      });
      card.appendChild(btn);
      cards.appendChild(card);
      cardNodes.set(s.id, card);
    });
    wrap.appendChild(cards);
    wrap.appendChild(play);
    app.appendChild(wrap);
    paintCards();
    const resumeStory = stories.find(
      (s) => s.playable && qinliState().current && qinliState().current.storyId === s.id
    );
    const storyParam = new URLSearchParams(location.search).get("story");
    const paramStory = stories.find((s) => s.playable && s.id === storyParam);
    if (paramStory) enter(paramStory);
    else if (resumeStory) enter(resumeStory, false);

    window.addEventListener("storage", (e) => {
      if (e.key !== PROGRESS_KEY) return;
      paintCards();
    });
  }  /* ---------- 卡片墙 ---------- */

  function renderCards() {
    const ui = data.cardsLabels;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));
    const seen = loadProgress();
    if (!(seen.cards && seen.cards.opened)) {
      updateProgress((p) => {
        p.cards = Object.assign({}, p.cards, { opened: true });
      });
    }

    const wrap = el("div", "container cw-wrap");
    const banner = el("a", "cw-chapter-banner");
    banner.href = "chapter.html";
    banner.target = "_blank";
    banner.rel = "noopener";
    const bannerCopy = el("div", "cw-banner-copy");
    bannerCopy.appendChild(el("span", "cw-banner-eyebrow", data.chapterUI.bannerEyebrow));
    bannerCopy.appendChild(el("h2", "cw-banner-title", data.chapterUI.bannerTitle));
    bannerCopy.appendChild(el("p", "cw-banner-desc", data.chapterUI.bannerDesc));
    banner.appendChild(bannerCopy);
    banner.appendChild(el("span", "cw-banner-btn", data.chapterUI.bannerBtn));
    wrap.appendChild(banner);
    const bannerSecond = el("a", "cw-banner-second", data.chapterUI.secondLink);
    bannerSecond.href = "chapter.html?ch=" + data.chapters[1].id;
    bannerSecond.target = "_blank";
    bannerSecond.rel = "noopener";
    wrap.appendChild(bannerSecond);
    const reveal = [];
    const groups = [
      { kind: "person", title: ui.peopleTitle, hint: ui.peopleHint },
      { kind: "institution", title: ui.institutionTitle, hint: ui.institutionHint },
    ];

    groups.forEach((g) => {
      const list = data.cards.filter((c) => c.kind === g.kind);
      const section = el("section", "cw-group");
      const head = el("div", "section-head");
      head.appendChild(el("h2", "section-title", g.title));
      head.appendChild(el("p", "section-hint", g.hint));
      section.appendChild(head);

      const grid = el(
        "div",
        "cw-grid " + (g.kind === "person" ? "cw-people" : "cw-institutions")
      );
      list.forEach((c, i) => {
        const card = el(
          "article",
          "cw-card " + (g.kind === "person" ? "cw-person" : "cw-inst")
        );
        card.id = "card-" + c.id;
        card.dataset.card = c.id;
        card.style.setProperty("--d", (i % 3) * 70 + "ms");
        card.addEventListener("click", () => markLastRead("card", c.id));
        card.addEventListener("focusin", () => markLastRead("card", c.id));

        if (g.kind === "person") {
          const photo = el("figure", "cw-photo");
          const img = el("img");
          img.src = c.img;
          img.alt = c.mode === "backdrop" ? c.note : c.name + "画像";
          img.loading = "lazy";
          img.decoding = "async";
          photo.appendChild(img);
          if (c.note) photo.appendChild(el("figcaption", "cw-note", c.note));
          card.appendChild(photo);
        }

        const body = el("div", "cw-body");
        if (g.kind === "institution") body.appendChild(el("span", "cw-glyph", c.glyph));
        const headRow = el("div", "cw-head");
        headRow.appendChild(el("h3", "cw-name", c.name));
        if (c.role) headRow.appendChild(el("span", "cw-role", c.role));
        if (c.era) headRow.appendChild(el("span", "cw-era", c.era));
        body.appendChild(headRow);
        if (c.sub) body.appendChild(el("p", "cw-sub", c.sub));
        body.appendChild(el("p", "cw-position", c.position));
        if (c.cbdbUrl) {
          const link = el("a", "topic-next cbdb-link", "CBDB 人物条目 ↗");
          link.href = c.cbdbUrl;
          link.target = "_blank";
          link.rel = "noopener";
          body.appendChild(link);
        }

        const facts = el("div", "cw-facts");
        facts.appendChild(el("p", "cw-facts-label", ui.factsLabel));
        const ul = el("ul", "cw-fact-list");
        c.facts.forEach((f) => ul.appendChild(el("li", "cw-fact", f)));
        facts.appendChild(ul);
        body.appendChild(facts);

        if (c.quote) {
          const paper = el("div", "cw-paper");
          const mid = el("div", "cw-paper-mid");
          const inner = el("div", "cw-paper-in");
          const fish = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          fish.setAttribute("viewBox", "0 0 30 13");
          fish.setAttribute("class", "cw-paper-fish");
          fish.setAttribute("aria-hidden", "true");
          const fishPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
          fishPath.setAttribute("d", "M1 1 L15 12 L29 1 L29 4.5 L15 13 L1 4.5 Z");
          fish.appendChild(fishPath);
          inner.appendChild(fish);
          inner.appendChild(el("p", "cw-paper-quote", "「" + c.quote + "」"));
          inner.appendChild(el("p", "cw-paper-from", "—— " + c.quoteFrom));
          inner.appendChild(el("p", "cw-paper-verification", c.quoteVerification));
          mid.appendChild(inner);
          paper.appendChild(mid);
          body.appendChild(paper);
        }

        const comment = el("div", "cw-comment");
        comment.appendChild(el("span", "cw-comment-label", ui.commentLabel));
        comment.appendChild(el("p", "cw-comment-p", c.comment));
        body.appendChild(comment);
        const permalink = el("a", "topic-next", "定位此卡 · 留作续读");
        permalink.href = "cards.html?card=" + c.id;
        body.appendChild(permalink);
        if (c.sourceId) {
          const source = el("a", "topic-next", "查看引文、出处与版本限制");
          source.href = "search.html?source=" + encodeURIComponent(c.sourceId);
          body.appendChild(source);
        }
        if (c.id === "i3") body.appendChild(buildTopicPath("cards.html?card=i3"));

        card.appendChild(body);
        grid.appendChild(card);
        reveal.push(card);
      });
      section.appendChild(grid);
      wrap.appendChild(section);
    });

    wrap.appendChild(el("p", "cw-source", ui.sourceNote));
    app.appendChild(wrap);

    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      reveal.forEach((n) => n.classList.add("is-in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add("is-in");
              io.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12 }
      );
      reveal.forEach((n) => io.observe(n));
    }
    const wanted = new URLSearchParams(location.search).get("card");
    const hit = data.cards.some((c) => c.id === wanted) && reveal.find((n) => n.dataset.card === wanted);
    if (hit) {
      hit.classList.add("is-in", "is-deep-hit");
      markLastRead("card", wanted);
      hit.tabIndex = -1;
      requestAnimationFrame(() => {
        hit.scrollIntoView({ block: "start", behavior: "instant" });
        hit.focus({ preventScroll: true });
      });
    }
  }

  /* ---------- 小测 ---------- */

  function quizState() {
    const p = loadProgress();
    const q = p.quiz && typeof p.quiz === "object" ? p.quiz : {};
    return {
      picks: Array.isArray(q.picks) ? q.picks : [],
      submitted: typeof q.score === "number",
      score: q.score,
      dims: q.dims && typeof q.dims === "object" ? q.dims : null,
    };
  }

  function renderQuiz() {
    const ui = data.quizUI;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));

    const wrap = el("div", "container qz-wrap");
    const modeRow = el("div", "qz-modes");
    const modeBtns = {};
    [["formal", ui.modeFormal], ["practice", ui.modePractice], ["topic", "一条鞭法专题"]].forEach(([key, text]) => {
      const b = el("button", "qz-mode", text);
      b.type = "button";
      b.addEventListener("click", () => setMode(key));
      modeBtns[key] = b;
      modeRow.appendChild(b);
    });
    wrap.appendChild(modeRow);
    const stage = el("div", "qz-stage");
    wrap.appendChild(stage);
    app.appendChild(wrap);

    let formalRefresh = null;
    const modeRoots = {};

    function setMode(next) {
      Object.entries(modeBtns).forEach(([key, button]) => {
        button.classList.toggle("is-on", key === next);
        button.setAttribute("aria-pressed", String(key === next));
      });
      if (!modeRoots[next]) {
        const root = el("div", "qz-" + next + "-root");
        modeRoots[next] = root;
        stage.appendChild(root);
        if (next === "formal") renderFormal(root);
        else if (next === "topic") {
          root.appendChild(buildTopicPath("quiz.html?topic=yitiaobian"));
          renderPractice(root, data.topicQuiz);
        } else renderPractice(root);
      }
      Object.entries(modeRoots).forEach(([key, root]) => { root.hidden = key !== next; });
      if (next === "formal" && formalRefresh) formalRefresh();
    }

    function appendReview(node, q) {
      if (q.source) node.appendChild(el("p", "qz-source-line", "依据材料 · " + q.source));
      const href = q.sourceId ? "search.html?source=" + encodeURIComponent(q.sourceId) : q.reviewHref;
      if (href && /^(search|timeline|cards)\.html\?/.test(href)) {
        const link = el("a", "pf-link qz-review-link", "回看依据材料");
        link.href = href;
        node.appendChild(link);
      }
    }

    function applyQuestion(q, node, pick) {
      const has = pick != null;
      node.querySelectorAll(".qz-choice").forEach((btn) => {
        const i = Number(btn.dataset.i);
        const badge = btn.querySelector(".qz-badge");
        btn.disabled = has;
        btn.classList.toggle("is-correct", has && i === pick && i === q.answer);
        btn.classList.toggle("is-wrong", has && i === pick && i !== q.answer);
        btn.classList.toggle("is-answer", has && i === q.answer && pick !== q.answer);
        btn.classList.toggle("is-mute", has && i !== pick && i !== q.answer);
        if (has && i === pick) {
          badge.textContent = i === q.answer ? ui.correctBadge : ui.wrongBadge;
          badge.hidden = false;
        } else if (has && i === q.answer) {
          badge.textContent = ui.answerLabel;
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      });
      const explain = node.querySelector(".qz-explain");
      if (has) {
        explain.querySelector(".qz-answer-line").textContent =
          ui.answerLabel + " · " + "ABCD"[q.answer] + "　" + q.options[q.answer];
        explain.querySelector(".qz-explain-p").textContent = q.explain;
        explain.hidden = false;
      } else {
        explain.hidden = true;
      }
    }

    /* ---------- 正式小测：读写 progress.quiz，行为与版式保持原样 ---------- */

    function renderFormal(root) {
      const questions = data.quiz;
      const strip = el("div", "dc-progress");
      const label = el("p", "dc-progress-label");
      label.appendChild(el("span", "dc-progress-text", ui.progressLabel));
      const count = el("span", "dc-count");
      label.appendChild(count);
      const bar = el("div", "dc-bar");
      const fill = el("span", "dc-bar-fill");
      bar.appendChild(fill);
      strip.append(label, bar);
      root.appendChild(strip);

      const nodes = new Map();

      const submitWrap = el("div", "qz-submit");
      const submitBtn = el("button", "cta-button qz-submit-btn", ui.submit);
      submitBtn.type = "button";
      submitBtn.disabled = true;
      const submitHint = el("p", "qz-submit-hint", ui.submitHint);
      submitWrap.append(submitBtn, submitHint);

      let resultNode = null;

      function buildResult() {
        const st = quizState();
        const sec = el("section", "qz-result");
        sec.appendChild(el("h2", "section-title", ui.resultTitle));
        const score = el("p", "qz-score");
        score.appendChild(el("span", "qz-score-num", String(st.score)));
        score.appendChild(el("span", "qz-score-total", " / " + questions.length));
        sec.appendChild(score);
        const dims = el("div", "qz-dims");
        ["timeline", "person", "institution"].forEach((d) => {
          const v = (st.dims && st.dims[d]) || { hit: 0, total: 0 };
          const row = el("div", "qz-dim-row");
          row.appendChild(el("span", "qz-dim-name", data.dimLabels[d]));
          row.appendChild(el("span", "qz-dim-frac", v.hit + " / " + v.total));
          const b = el("div", "pf-bar");
          const f = el("span", "pf-bar-fill");
          b.appendChild(f);
          row.appendChild(b);
          row.appendChild(
            el("span", "qz-dim-pct", Math.round((v.hit / (v.total || 1)) * 100) + "%")
          );
          dims.appendChild(row);
          requestAnimationFrame(() => {
            f.style.width = (v.hit / (v.total || 1)) * 100 + "%";
          });
        });
        sec.appendChild(dims);
        sec.appendChild(el("p", "qz-submitted-note", ui.submittedNote));
        const link = el("a", "cta-button cta-gold", ui.viewProfile);
        link.href = "profile.html";
        sec.appendChild(link);
        return sec;
      }

      function showResult() {
        if (resultNode) resultNode.remove();
        resultNode = buildResult();
        root.appendChild(resultNode);
        submitWrap.hidden = true;
      }

      function refresh() {
        const st = quizState();
        const answered = questions.filter((q, i) => st.picks[i] != null).length;
        count.textContent = answered + " / " + questions.length;
        fill.style.width = (answered / questions.length) * 100 + "%";
        if (st.submitted) {
          showResult();
        } else {
          if (resultNode) {
            resultNode.remove();
            resultNode = null;
          }
          submitWrap.hidden = false;
          submitBtn.disabled = answered < questions.length;
          submitHint.textContent =
            answered < questions.length ? ui.submitHint : ui.submitReady;
        }
      }

      questions.forEach((q, qi) => {
        const item = el("article", "qz-item");
        item.id = q.id;
        const head = el("div", "qz-head");
        head.appendChild(el("span", "qz-num", String(qi + 1).padStart(2, "0")));
        head.appendChild(el("span", "qz-dim", data.dimLabels[q.dim]));
        head.appendChild(el("h2", "qz-stem", q.stem));
        item.appendChild(head);

        const choices = el("div", "qz-choices");
        choices.setAttribute("role", "group");
        choices.setAttribute("aria-label", q.stem);
        q.options.forEach((opt, i) => {
          const btn = el("button", "qz-choice");
          btn.type = "button";
          btn.dataset.i = String(i);
          btn.appendChild(el("span", "qz-key", "ABCD"[i]));
          btn.appendChild(el("span", "qz-choice-label", opt));
          const badge = el("span", "qz-badge");
          badge.hidden = true;
          btn.appendChild(badge);
          btn.addEventListener("click", () => {
            if (quizState().picks[qi] != null || quizState().submitted) return;
            updateProgress((p) => {
              p.quiz = p.quiz || {};
              p.quiz.picks = Array.isArray(p.quiz.picks) ? p.quiz.picks : [];
              p.quiz.picks[qi] = i;
            });
            applyQuestion(q, item, i);
            refresh();
          });
          choices.appendChild(btn);
        });
        item.appendChild(choices);

        const explain = el("div", "qz-explain");
        explain.hidden = true;
        explain.setAttribute("aria-live", "polite");
        explain.appendChild(el("p", "qz-answer-line"));
        explain.appendChild(el("span", "qz-explain-label", ui.explainLabel));
        explain.appendChild(el("p", "qz-explain-p"));
        appendReview(explain, q);
        item.appendChild(explain);

        root.appendChild(item);
        nodes.set(q.id, item);
        applyQuestion(q, item, quizState().picks[qi]);
      });

      root.appendChild(submitWrap);
      refresh();

      submitBtn.addEventListener("click", () => {
        const st = quizState();
        if (st.submitted || st.picks.filter((x) => x != null).length < questions.length) return;
        const dims = {};
        let score = 0;
        questions.forEach((q, i) => {
          const d = (dims[q.dim] = dims[q.dim] || { hit: 0, total: 0 });
          d.total += 1;
          if (st.picks[i] === q.answer) {
            d.hit += 1;
            score += 1;
          }
        });
        updateProgress((p) => {
          p.quiz = p.quiz || {};
          p.quiz.picks = st.picks;
          p.quiz.score = score;
          p.quiz.dims = dims;
        });
        refresh();
        resultNode.scrollIntoView({
          behavior: reducedMotion.matches ? "auto" : "smooth",
          block: "nearest",
        });
      });

      formalRefresh = () => {
        const st = quizState();
        questions.forEach((q, i) => applyQuestion(q, nodes.get(q.id), st.picks[i]));
        refresh();
      };
    }

    /* ---------- AI 练习：本地判分，全程不写进度 ---------- */

    function renderPractice(root, topicQuestions = null) {
      const strip = el("div", "dc-progress");
      const label = el("p", "dc-progress-label");
      label.appendChild(el("span", "dc-progress-text", ui.progressLabel));
      const count = el("span", "dc-count");
      label.appendChild(count);
      const bar = el("div", "dc-bar");
      const fill = el("span", "dc-bar-fill");
      bar.appendChild(fill);
      strip.append(label, bar);
      const panel = el("div", "qz-practice-panel");
      panel.setAttribute("aria-live", "polite");
      const list = el("div", "qz-practice-list");
      const submitWrap = el("div", "qz-submit");
      const submitBtn = el("button", "cta-button qz-submit-btn", ui.submit);
      submitBtn.type = "button";
      submitBtn.disabled = true;
      const submitHint = el("p", "qz-submit-hint", ui.submitHint);
      submitWrap.append(submitBtn, submitHint);
      submitWrap.hidden = true;
      root.append(strip, panel, list, submitWrap);

      let questions = null;
      let picks = [];
      let submitted = false;
      let resultNode = null;
      let pendingRequest = null;

      function refresh() {
        const total = questions ? questions.length : 10;
        const answered = questions ? picks.filter((x) => x != null).length : 0;
        count.textContent = answered + " / " + total;
        fill.style.width = (answered / total) * 100 + "%";
        if (questions && !submitted) {
          submitBtn.disabled = answered < questions.length;
          submitHint.textContent =
            answered < questions.length ? "答完 " + questions.length + " 题后可提交" : ui.practiceResultNote;
        }
      }

      function clearResult() {
        if (resultNode) {
          resultNode.remove();
          resultNode = null;
        }
      }

      function genButton(label = ui.genBtn) {
        const gen = el("button", "cta-button qz-gen-btn", label);
        gen.type = "button";
        gen.disabled = CHAT_API_BASE === null;
        gen.addEventListener("click", generate);
        return gen;
      }

      function cancelRequest() {
        if (!pendingRequest) return;
        const request = pendingRequest;
        pendingRequest = null;
        clearTimeout(request.timer);
        request.controller.abort();
      }

      function fallbackButton() {
        const fb = el("button", "cta-button qz-fallback-btn", ui.fallbackBtn);
        fb.type = "button";
        fb.addEventListener("click", () => {
          cancelRequest();
          startSet(data.quiz);
        });
        return fb;
      }

      function showIntro() {
        panel.replaceChildren();
        panel.appendChild(el("p", "qz-practice-hint", CHAT_API_BASE === null
          ? "当前未启用在线出题，可直接使用固定题库。"
          : ui.practiceHint + " 每地址每小时最多 6 次生成尝试，失败与取消也可能消耗次数；取消仅停止本次等待。模型审题不能替代人工核对。"));
        panel.append(genButton(), fallbackButton());
        refresh();
      }

      async function generate() {
        if (pendingRequest || CHAT_API_BASE === null) return;
        const request = { controller: new AbortController(), timedOut: false };
        pendingRequest = request;
        request.timer = setTimeout(() => {
          request.timedOut = true;
          request.controller.abort();
        }, 130000);
        panel.replaceChildren();
        panel.appendChild(el("p", "qz-practice-hint", "正在出题并核对材料，最长等待 130 秒；切换模式不会丢失本次请求。"));
        const cancel = el("button", "cta-button qz-cancel-btn", "取消等待");
        cancel.type = "button";
        cancel.addEventListener("click", () => { cancelRequest(); showIntro(); });
        panel.append(cancel, fallbackButton());
        try {
          const resp = await fetch(CHAT_API_BASE + "/api/quiz/practice", { method: "POST", signal: request.controller.signal });
          const payload = await resp.json().catch(() => null);
          if (!resp.ok) {
            const error = new Error("服务请求失败");
            error.status = resp.status;
            error.code = payload?.code || payload?.detail;
            error.retryAfter = payload?.retry_after || Number(resp.headers.get("Retry-After"));
            throw error;
          }
          const qs = payload && payload.questions;
          if (!Array.isArray(qs) || qs.length !== 10 || !qs.every(q =>
            q && typeof q.stem === "string" && Array.isArray(q.options) && q.options.length === 4 &&
            q.options.every(o => typeof o === "string") && Number.isInteger(q.answer) &&
            q.answer >= 0 && q.answer < 4 && typeof q.explain === "string" &&
            ["timeline", "person", "institution"].includes(q.dim))) throw new Error("响应格式异常");
          if (pendingRequest !== request) return;
          startSet(qs);
        } catch (error) {
          if (pendingRequest !== request) return;
          let message = "网络或出题服务暂不可用，请重试或使用固定题库。";
          if (request.timedOut || error.code === "upstream_timeout") message = "本次出题等待超时，可重新尝试或使用固定题库。";
          else if (error.status === 429) message = "本时段生成次数已用尽，失败和取消也计入尝试次数。" +
            (error.retryAfter > 0 ? "约 " + Math.ceil(error.retryAfter / 60) + " 分钟后可重试。" : "请稍后重试。");
          else if (error.code === "generation_failed") message = ui.genFail;
          else if (error.code === "materials_unavailable") message = "出题资料暂不可用，请稍后重试或使用固定题库。";
          showFail(message);
        } finally {
          clearTimeout(request.timer);
          if (pendingRequest === request) pendingRequest = null;
        }
      }

      function showFail(message) {
        panel.replaceChildren();
        panel.appendChild(el("p", "qz-practice-hint", message));
        panel.append(genButton("重新尝试生成"), fallbackButton());
        refresh();
      }

      function startSet(qs) {
        questions = qs;
        picks = new Array(qs.length).fill(null);
        submitted = false;
        clearResult();
        panel.replaceChildren();
        list.replaceChildren();
        qs.forEach((q, qi) => {
          const item = el("article", "qz-item");
          const head = el("div", "qz-head");
          head.appendChild(el("span", "qz-num", String(qi + 1).padStart(2, "0")));
          head.appendChild(el("span", "qz-dim", data.dimLabels[q.dim]));
          head.appendChild(el("h2", "qz-stem", q.stem));
          item.appendChild(head);

          const choices = el("div", "qz-choices");
          choices.setAttribute("role", "group");
          choices.setAttribute("aria-label", q.stem);
          q.options.forEach((opt, i) => {
            const btn = el("button", "qz-choice");
            btn.type = "button";
            btn.dataset.i = String(i);
            btn.appendChild(el("span", "qz-key", "ABCD"[i]));
            btn.appendChild(el("span", "qz-choice-label", opt));
            const badge = el("span", "qz-badge");
            badge.hidden = true;
            btn.appendChild(badge);
            btn.addEventListener("click", () => {
              if (submitted || picks[qi] != null) return;
              picks[qi] = i;
              applyQuestion(q, item, i);
              refresh();
            });
            choices.appendChild(btn);
          });
          item.appendChild(choices);

          const explain = el("div", "qz-explain");
          explain.hidden = true;
          explain.setAttribute("aria-live", "polite");
          explain.appendChild(el("p", "qz-answer-line"));
          explain.appendChild(el("span", "qz-explain-label", ui.explainLabel));
          explain.appendChild(el("p", "qz-explain-p"));
          appendReview(explain, q);
          item.appendChild(explain);
          list.appendChild(item);
        });
        submitWrap.hidden = false;
        refresh();
      }

      submitBtn.addEventListener("click", () => {
        if (!questions || submitted || picks.filter((x) => x != null).length < questions.length) return;
        submitted = true;
        const dims = {};
        let score = 0;
        questions.forEach((q, i) => {
          const d = (dims[q.dim] = dims[q.dim] || { hit: 0, total: 0 });
          d.total += 1;
          if (picks[i] === q.answer) {
            d.hit += 1;
            score += 1;
          }
        });
        submitWrap.hidden = true;
        clearResult();
        const sec = el("section", "qz-result");
        sec.appendChild(el("h2", "section-title", ui.resultTitle));
        const scoreP = el("p", "qz-score");
        scoreP.appendChild(el("span", "qz-score-num", String(score)));
        scoreP.appendChild(el("span", "qz-score-total", " / " + questions.length));
        sec.appendChild(scoreP);
        const dimsBox = el("div", "qz-dims");
        ["timeline", "person", "institution"].forEach((d) => {
          const v = dims[d] || { hit: 0, total: 0 };
          const row = el("div", "qz-dim-row");
          row.appendChild(el("span", "qz-dim-name", data.dimLabels[d]));
          row.appendChild(el("span", "qz-dim-frac", v.hit + " / " + v.total));
          const b = el("div", "pf-bar");
          const f = el("span", "pf-bar-fill");
          b.appendChild(f);
          row.appendChild(b);
          row.appendChild(
            el("span", "qz-dim-pct", Math.round((v.hit / (v.total || 1)) * 100) + "%")
          );
          dimsBox.appendChild(row);
          requestAnimationFrame(() => {
            f.style.width = (v.hit / (v.total || 1)) * 100 + "%";
          });
        });
        sec.appendChild(dimsBox);
        sec.appendChild(el("p", "qz-submitted-note", ui.practiceResultNote));
        const again = el("button", "cta-button qz-again-btn", topicQuestions ? "重做专题题" : "再来一组（替换当前题组）");
        again.type = "button";
        again.addEventListener("click", () => {
          if (topicQuestions) startSet(topicQuestions);
          else if (CHAT_API_BASE === null) startSet(data.quiz);
          else generate();
        });
        sec.appendChild(again);
        resultNode = sec;
        root.appendChild(sec);
        refresh();
        sec.scrollIntoView({
          behavior: reducedMotion.matches ? "auto" : "smooth",
          block: "nearest",
        });
      });

      if (topicQuestions) startSet(topicQuestions);
      else showIntro();
      window.addEventListener("pagehide", () => {
        if (!pendingRequest) return;
        cancelRequest();
        showIntro();
      });
    }

    window.addEventListener("storage", (e) => {
      if (e.key !== PROGRESS_KEY) return;
      if (formalRefresh) formalRefresh();
    });

    const quizParams = new URLSearchParams(location.search);
    setMode(quizParams.get("topic") === "yitiaobian" ? "topic" : "formal");
    const wantedQuestion = data.quiz.find(q => q.id === quizParams.get("question"));
    if (wantedQuestion) requestAnimationFrame(() => document.getElementById(wantedQuestion.id)?.scrollIntoView({ block: "start" }));
  }

  /* ---------- 研读画像（只读汇总） ---------- */

  function renderProfile() {
    const ui = data.profileUI;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));
    const wrap = el("div", "container pf-wrap");

    function buildContent() {
      const box = el("div", "pf-content");
      const read = readIds();
      const p = loadProgress();
      const done =
        p.decisions && Array.isArray(p.decisions.done) ? p.decisions.done : [];
      const quiz = p.quiz && typeof p.quiz.score === "number" ? p.quiz : null;
      const resumeSection = el("section", "pf-section");
      resumeSection.appendChild(el("h2", "section-title", ui.resumeTitle));
      const last = resolveLastRead(p.lastRead);
      if (last) {
        const link = el("a", "cta-button cta-gold", last.label);
        link.href = last.href;
        if (link.getAttribute("href").startsWith("qinli.html")) { link.target = "_blank"; link.rel = "noopener"; }
        resumeSection.appendChild(link);
      } else {
        resumeSection.appendChild(el("p", "content-note", ui.resumeEmpty));
      }
      box.appendChild(resumeSection);

      const foot = el("section", "pf-section");
      foot.appendChild(el("h2", "section-title", ui.footprintTitle));
      const stats = el("div", "pf-stats");

      const tlStat = el("div", "pf-stat");
      tlStat.appendChild(el("p", "pf-stat-title", ui.timelineTitle));
      tlStat.appendChild(
        el("p", "pf-count", read.length + " / " + data.timeline.events.length)
      );
      const tlBar = el("div", "pf-bar");
      const tlFill = el("span", "pf-bar-fill");
      tlBar.appendChild(tlFill);
      tlStat.appendChild(tlBar);
      const tlLink = el("a", "pf-link", ui.timelineLink);
      tlLink.href = "timeline.html";
      tlStat.appendChild(tlLink);
      stats.appendChild(tlStat);

      const dcStat = el("div", "pf-stat");
      dcStat.appendChild(el("p", "pf-stat-title", ui.decisionsTitle));
      dcStat.appendChild(el("p", "pf-count", done.length + " / " + data.decisions.length));
      const seals = el("div", "pf-seals");
      data.decisions.forEach((sc) => {
        const s = el("span", "pf-seal", sc.num);
        if (done.includes(sc.id)) s.classList.add("is-done");
        seals.appendChild(s);
      });
      dcStat.appendChild(seals);
      const dcLink = el("a", "pf-link", ui.decisionsLink);
      dcLink.href = "decisions.html";
      dcStat.appendChild(dcLink);
      stats.appendChild(dcStat);
      const qinliDone = p.qinli && Array.isArray(p.qinli.done) ? p.qinli.done : [];
      const playable = data.qinli.filter((s) => s.playable);
      const completed = playable.filter((s) => qinliDone.includes(s.id));
      const qlStat = el("div", "pf-stat");
      qlStat.appendChild(el("p", "pf-stat-title", ui.qinliTitle));
      qlStat.appendChild(el("p", "pf-count", completed.length + " / " + playable.length));
      const qlLink = el("a", "pf-link", "继续亲历");
      const currentStory = resolveLastRead({ kind: "qinli", id: p.qinli && p.qinli.current && p.qinli.current.storyId });
      qlLink.href = currentStory ? currentStory.href : "qinli.html";
      qlLink.target = "_blank";
      qlLink.rel = "noopener";
      qlStat.appendChild(qlLink);
      stats.appendChild(qlStat);

      const signals = {
        timeline: read.length > 0,
        decision: done.length > 0,
        cards: !!(p.cards && p.cards.opened),
        chat: !!(p.chat && p.chat.started),
        quiz: !!quiz,
        profile: true,
      };
      const startedModules = data.modules.filter((m) => signals[m.id]).length;
      const mdStat = el("div", "pf-stat");
      mdStat.appendChild(el("p", "pf-stat-title", ui.modulesTitle));
      mdStat.appendChild(
        el("p", "pf-count", startedModules + " / " + data.modules.length)
      );
      const mdBar = el("div", "pf-bar");
      const mdFill = el("span", "pf-bar-fill");
      mdBar.appendChild(mdFill);
      mdStat.appendChild(mdBar);
      const mdLink = el("a", "pf-link", ui.modulesLink);
      mdLink.href = "chat.html";
      mdStat.appendChild(mdLink);
      stats.appendChild(mdStat);
      foot.appendChild(stats);
      foot.appendChild(el("p", "content-note", ui.visitNote));
      box.appendChild(foot);

      const qzSec = el("section", "pf-section");
      const qzHead = el("div", "pf-head-row");
      qzHead.appendChild(el("h2", "section-title", ui.quizTitle));
      if (quiz) {
        qzHead.appendChild(
          el("span", "pf-score-line", ui.quizScoreLabel + " " + quiz.score + " / " + data.quiz.length)
        );
      }
      qzSec.appendChild(qzHead);
      if (quiz) {
        const dims = el("div", "pf-dims");
        ["timeline", "person", "institution"].forEach((d) => {
          const v = (quiz.dims && quiz.dims[d]) || { hit: 0, total: 0 };
          const rate = v.hit / (v.total || 1);
          const row = el("div", "pf-dim-row");
          row.appendChild(el("span", "pf-dim-name", data.dimLabels[d]));
          row.appendChild(el("span", "pf-dim-frac", v.hit + " / " + v.total));
          const b = el("div", "pf-bar");
          const f = el("span", "pf-bar-fill");
          b.appendChild(f);
          row.appendChild(b);
          row.appendChild(el("span", "pf-dim-pct", Math.round(rate * 100) + "%"));
          dims.appendChild(row);
          requestAnimationFrame(() => {
            f.style.width = rate * 100 + "%";
          });
        });
        qzSec.appendChild(dims);
      } else {
        const empty = el("div", "pf-empty");
        empty.appendChild(el("p", "pf-empty-p", ui.quizEmpty));
        const cta = el("a", "cta-button", ui.quizCta);
        cta.href = "quiz.html";
        empty.appendChild(cta);
        qzSec.appendChild(empty);
      }
      box.appendChild(qzSec);

      const mem = loadChatMem();
      const friends = data.chatFigures.filter((f) => mem[f.id] && (Number(mem[f.id].totalRounds) || 0) > 0);
      if (friends.length) {
        const oldSec = el("section", "pf-section pf-old");
        oldSec.appendChild(el("h2", "section-title", ui.oldFriendsTitle));
        const oldList = el("div", "pf-old-list");
        friends.forEach((f) => {
          const n = Number(mem[f.id].totalRounds) || 0;
          oldList.appendChild(
            el("p", "pf-old-row", ui.oldFriendsLine
              .replace("{人物名}", f.name)
              .replace("{档位}", chatTier(n))
              .replace("{轮数}", String(n)))
          );
        });
        oldSec.appendChild(oldList);
        box.appendChild(oldSec);
      }

      if (quiz) {
        const perfect = quiz.score === data.quiz.length;
        const recSec = el("section", "pf-section");
        recSec.appendChild(el("h2", "section-title", perfect ? ui.perfectTitle : ui.recTitle));
        if (perfect) {
          recSec.appendChild(el("p", "pf-rec-p", ui.perfectNote));
          const deeper = el("a", "cta-button cta-gold", "继续专题 · 理解条件与成本");
          deeper.href = "quiz.html?topic=yitiaobian";
          recSec.appendChild(deeper);
        } else {
          const picks = Array.isArray(quiz.picks) ? quiz.picks : [];
          const wrong = data.quiz.filter((q, i) => Number.isInteger(picks[i]) && picks[i] >= 0 && picks[i] < q.options.length && picks[i] !== q.answer);
          if (wrong.length) {
            const list = el("ul", "pf-review-list");
            wrong.forEach((q) => {
              const item = el("li");
              item.appendChild(el("p", "pf-rec-p", "答错了：" + q.stem));
              const link = el("a", "topic-next", "回看依据 · " + data.dimLabels[q.dim]);
              link.href = q.reviewHref;
              item.appendChild(link);
              list.appendChild(item);
            });
            recSec.appendChild(list);
          } else {
            recSec.appendChild(el("p", "content-note", ui.legacyNote));
            const review = el("a", "topic-next", "从一条鞭法专题继续");
            review.href = "timeline.html?event=e1581";
            recSec.appendChild(review);
          }
        }
        box.appendChild(recSec);
      }

      box.appendChild(el("p", "pf-privacy", ui.privacy));
      requestAnimationFrame(() => {
        tlFill.style.width = (read.length / data.timeline.events.length) * 100 + "%";
        mdFill.style.width = (startedModules / data.modules.length) * 100 + "%";
      });
      return box;
    }

    wrap.appendChild(buildContent());
    app.appendChild(wrap);

    window.addEventListener("storage", (e) => {
      if (e.key !== PROGRESS_KEY) return;
      wrap.replaceChildren(buildContent());
    });
  }

  /* ---------- 人物对话 ---------- */

  function renderChat() {
    const ui = data.chatUI;
    const figures = data.chatFigures;
    app.appendChild(renderPageHead(ui.headTitle, ui.headHint));

    const online = CHAT_API_BASE !== null;

    const wrap = el("div", "container ct-wrap");
    const sessions = {};
    const chatMem = loadChatMem();
    let current = figures[0].id;
    const wanted = new URLSearchParams(window.location.search).get("figure");
    if (wanted && figures.some((f) => f.id === wanted)) current = wanted;

    const picker = el("div", "ct-picker");
    picker.setAttribute("aria-label", ui.pickerLabel);
    const pickerBtns = new Map();
    const tierNodes = new Map();
    figures.forEach((f) => {
      const b = el("button", "ct-figure");
      b.type = "button";
      const img = el("img");
      img.src = f.img;
      img.alt = f.name;
      img.loading = "lazy";
      img.decoding = "async";
      b.appendChild(img);
      const meta = el("span", "ct-figure-meta");
      meta.appendChild(el("span", "ct-figure-name", f.name));
      meta.appendChild(el("span", "ct-figure-era", f.era));
      const tier = el("span", "ct-tier", ui.tierLabelPrefix + "初见");
      meta.appendChild(tier);
      tierNodes.set(f.id, tier);
      b.appendChild(meta);
      b.addEventListener("click", () => select(f.id));
      picker.appendChild(b);
      pickerBtns.set(f.id, b);
    });
    wrap.appendChild(picker);

    const personBar = el("div", "ct-person-bar");
    const qinliLink = el("a", "ct-qinli-link", ui.qinliLink);
    const qinliBadge = el("span", "ct-qinli-badge", ui.qinliDoneBadge);
    qinliBadge.hidden = true;
    const forgetBtn = el("button", "ct-forget-btn", ui.forgetBtn);
    forgetBtn.type = "button";
    personBar.append(qinliLink, qinliBadge, forgetBtn);
    wrap.appendChild(personBar);

    const conv = el("section", "ct-conv");
    const offlineNote = el("p", "ct-offline", ui.offline);
    offlineNote.hidden = true;
    conv.appendChild(offlineNote);

    const memNote = el("p", "ct-memory-note");
    memNote.hidden = true;
    conv.appendChild(memNote);

    conv.appendChild(el("p", "qz-practice-hint ct-privacy", online
      ? "在线对话：发送的问题及近期对话会传至本站后端和模型服务。请勿输入个人隐私；实际日志与保留期限需向部署方确认。"
      : "当前为离线剧本模式，不发送对话；可使用推荐问题了解人物立场。"));
    const status = el("p", "qz-practice-hint ct-status");
    status.setAttribute("role", "status");
    conv.appendChild(status);
    const chips = el("div", "ct-chips");
    conv.appendChild(chips);

    const flow = el("div", "ct-flow");
    conv.appendChild(flow);

    const inputArea = el("div", "ct-input");
    const text = el("textarea", "ct-text");
    text.rows = 2;
    text.placeholder = ui.inputPlaceholder;
    const sendBtn = el("button", "cta-button ct-send", ui.send);
    sendBtn.type = "button";
    inputArea.append(text, sendBtn);
    conv.appendChild(inputArea);

    const endArea = el("div", "ct-end");
    endArea.hidden = true;
    endArea.appendChild(el("p", "ct-end-text", ui.roundEnd));
    const switchBtn = el("button", "cta-button ct-end-btn", ui.switchFigure);
    switchBtn.type = "button";
    const restartBtn = el("button", "cta-button cta-gold ct-end-btn", ui.restart);
    restartBtn.type = "button";
    endArea.append(switchBtn);
    conv.append(endArea, restartBtn);
    wrap.appendChild(conv);
    app.appendChild(wrap);

    const disclaimer = el("p", "ct-disclaimer", ui.disclaimer);
    document.body.appendChild(disclaimer);

    function session() {
      if (!sessions[current]) {
        const mem = chatMem[current];
        const restored = mem && Array.isArray(mem.history)
          ? mem.history
              .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
              .slice(-CHATMEM_HISTORY_MAX)
              .map((m) => ({ role: m.role, content: m.content }))
          : [];
        sessions[current] = {
          messages: restored,
          offline: !online,
          pending: false,
          error: "",
          baseUsers: restored.filter((m) => m.role === "user").length,
        };
      }
      return sessions[current];
    }

    function figure() {
      return figures.find((f) => f.id === current);
    }

    function rounds() {
      const s = session();
      return Math.max(0, s.messages.filter((m) => m.role === "user").length - s.baseUsers);
    }

    function messageNode(m) {
      const box = el("div", "ct-msg " + (m.role === "user" ? "ct-user" : "ct-figure"));
      box.appendChild(el("span", "ct-who", m.role === "user" ? ui.youLabel : figure().name));
      box.appendChild(el("p", "ct-text", m.content));
      if (m.note) box.appendChild(el("p", "ct-note", m.note));
      return box;
    }

    function paintFlow() {
      flow.replaceChildren();
      session().messages.forEach((m) => flow.appendChild(messageNode(m)));
      if (session().pendingNode) flow.appendChild(session().pendingNode);
    }

    function paintChips() {
      chips.replaceChildren();
      chips.appendChild(el("span", "ct-chips-label", ui.askLabel));
      const f = figure();
      f.qas.forEach((qa) => {
        const c = el("button", "ct-chip", qa.q);
        c.type = "button";
        c.addEventListener("click", () => send(qa.q));
        chips.appendChild(c);
      });
      const tier = chatTier((chatMem[current] && chatMem[current].totalRounds) || 0);
      if (tier !== "初见" && Array.isArray(f.deepQuestions)) {
        f.deepQuestions.forEach((q) => {
          const c = el("button", "ct-chip ct-chip-deep");
          c.type = "button";
          c.appendChild(el("span", "ct-deep-badge", ui.deepBadge));
          c.appendChild(el("span", "ct-chip-text", q));
          c.addEventListener("click", () => send(q));
          chips.appendChild(c);
        });
      }
    }

    function paintMem() {
      const mem = chatMem[current];
      const topics = mem && Array.isArray(mem.lastTopics) ? mem.lastTopics.filter(Boolean) : [];
      memNote.textContent = topics.length ? ui.memoryHintPrefix + topics.join("、") : "";
      memNote.hidden = !topics.length;
      figures.forEach((f) => {
        const node = tierNodes.get(f.id);
        if (node) node.textContent = ui.tierLabelPrefix + chatTier((chatMem[f.id] && chatMem[f.id].totalRounds) || 0);
      });
      forgetBtn.hidden = !mem;
      const storyId = figure().qinliStory;
      qinliLink.href = "qinli.html?story=" + storyId;
      qinliLink.target = "_blank";
      qinliLink.rel = "noopener";
      const done = loadProgress();
      const doneIds = done.qinli && Array.isArray(done.qinli.done) ? done.qinli.done : [];
      qinliBadge.hidden = !doneIds.includes(storyId);
    }

    function saveMem(id, s) {
      const mem = chatMem[id] || { history: [], totalRounds: 0, lastTopics: [], lastVisit: 0 };
      const history = s.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-CHATMEM_HISTORY_MAX);
      const topics = Array.isArray(mem.lastTopics) ? mem.lastTopics.slice() : [];
      const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
      if (lastUser) topics.push(Array.from(lastUser.content).slice(0, CHATMEM_TOPIC_MAX).join(""));
      chatMem[id] = {
        history,
        totalRounds: (Number(mem.totalRounds) || 0) + 1,
        lastTopics: topics.slice(-3),
        lastVisit: Date.now(),
      };
      saveChatMem(chatMem);
    }

    function refreshInput() {
      const s = session();
      const ended = rounds() >= ui.roundsMax;
      inputArea.hidden = ended;
      endArea.hidden = !ended;
      sendBtn.disabled = s.pending || ended;
      text.disabled = s.pending || ended;
      chips.querySelectorAll("button").forEach((b) => { b.disabled = s.pending || ended; });
      status.textContent = s.error || (s.pending ? ui.thinking : "问题最多 500 字，同一人物每次处理一个问题。");
      offlineNote.hidden = !s.offline;
      conv.setAttribute("aria-busy", String(s.pending));
    }

    function select(id) {
      session().draft = text.value;
      current = id;
      text.value = session().draft || "";
      pickerBtns.forEach((b, fid) => b.classList.toggle("is-current", fid === id));
      offlineNote.hidden = !session().offline;
      paintChips();
      paintMem();
      paintFlow();
      refreshInput();
      flow.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest" });
    }

    function scriptReply(message, fig) {
      const f = fig || figure();
      const hit =
        f.qas.find((qa) => qa.q === message) ||
        f.qas.find((qa) => qa.keywords.some((k) => message.includes(k)));
      return hit ? hit.a : f.fallback;
    }

    async function send(message) {
      const msg = (message || "").trim();
      const s = session();
      if (s.pending || rounds() >= ui.roundsMax) return;
      if (!msg || Array.from(msg).length > 500) {
        s.error = "问题须为 1–500 字，请缩短后再发送。";
        refreshInput();
        return;
      }
      const sentId = current;
      const sentFig = figure();
      // 恢复的历史会一起进上下文，但后端单次上限为 20 条，故最多带 19 条历史。
      const history = s.messages.slice(-Math.max(2, ui.historyRounds * 2 - 1)).map((m) => ({
        role: m.role,
        content: Array.from(m.content).slice(0, m.role === "user" ? 500 : 2000).join(""),
      }));
      while (history.reduce((n, m) => n + Array.from(m.content).length, Array.from(msg).length) > 20000) {
        history.splice(0, 2);
      }
      s.error = "";
      s.pending = true;
      s.messages.push({ role: "user", content: msg });
      text.value = "";
      const pending = el("div", "ct-msg ct-figure ct-pending");
      pending.appendChild(el("span", "ct-who", sentFig.name));
      pending.appendChild(el("p", "ct-text", ui.thinking));
      const cold = el("p", "ct-cold", ui.coldStart);
      cold.hidden = true;
      pending.appendChild(cold);
      s.pendingNode = pending;
      paintFlow();
      refreshInput();
      flow.scrollTop = flow.scrollHeight;
      const coldTimer = setTimeout(() => { cold.hidden = false; }, ui.coldHintMs);
      const ctrl = new AbortController();
      s.controller = ctrl;
      const timer = setTimeout(() => ctrl.abort(), ui.timeoutMs);
      let reply;
      let note = null;
      let counted = false;
      try {
        if (!online) {
          reply = scriptReply(msg, sentFig);
        } else {
          const mem = chatMem[sentId];
          const payload = { figure: sentId, history, message: msg };
          if (mem && (Number(mem.totalRounds) || 0) > 0) {
            payload.memory = {
              tier: chatTier(mem.totalRounds),
              lastTopics: Array.isArray(mem.lastTopics) ? mem.lastTopics.slice(0, 3) : [],
            };
          }
          const resp = await fetch(CHAT_API_BASE + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
          });
          const body = await resp.json().catch(() => null);
          if (!resp.ok) {
            const message = resp.status === 429 ? "本时段提问次数已用尽，请稍后再试。"
              : [400, 404, 413, 422].includes(resp.status) ? "请求被拒绝，请检查人物及输入长度。" : "服务暂不可用";
            const error = new Error(typeof body?.detail === "string" ? body.detail : message);
            error.status = resp.status;
            throw error;
          }
          if (typeof body?.reply !== "string" || !body.reply.trim()) throw new Error("服务返回格式异常");
          reply = body.reply;
          note = typeof body.note === "string" ? body.note : null;
          s.offline = false;
          counted = true;
        }
      } catch (error) {
        if (sessions[sentId] !== s) return;
        if ([400, 404, 413, 422, 429].includes(error.status)) {
          s.messages.pop();
          s.error = error.message + "（本次未计入对话回合）";
          s.draft = msg;
          if (current === sentId) text.value = msg;
        } else {
          s.offline = true;
          s.error = (error.name === "AbortError" ? "等待超时" : "在线服务暂不可用") + "，本次改用离线剧本；下次可重新尝试在线对话。";
          reply = scriptReply(msg, sentFig);
        }
      } finally {
        clearTimeout(timer);
        clearTimeout(coldTimer);
        pending.remove();
        s.pending = false;
        s.pendingNode = null;
        s.controller = null;
      }
      if (sessions[sentId] !== s) return;
      if (reply != null) {
        s.messages.push({ role: "assistant", content: reply, note });
        markChatStarted();
      }
      if (counted) {
        saveMem(sentId, s);
        if (current === sentId) {
          paintMem();
          paintChips();
        }
      }
      if (current === sentId) {
        paintFlow();
        refreshInput();
        flow.scrollTop = flow.scrollHeight;
      }
    }

    sendBtn.addEventListener("click", () => send(text.value));
    forgetBtn.addEventListener("click", () => {
      if (!window.confirm(ui.forgetConfirm)) return;
      delete chatMem[current];
      saveChatMem(chatMem);
      const s = sessions[current];
      if (s) {
        s.messages = [];
        s.baseUsers = 0;
        s.error = "";
      }
      paintMem();
      paintChips();
      paintFlow();
      refreshInput();
    });
    text.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(text.value);
      }
    });
    switchBtn.addEventListener("click", () => {
      picker.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    });
    restartBtn.addEventListener("click", () => {
      session().controller?.abort();
      delete sessions[current];
      text.value = "";
      select(current);
      text.focus();
    });

    select(current);
  }

  /* ---------- 帝王首辅关系全图 ---------- */

  function renderRelations() {
    const ui = data.relationsUI;
    const rl = data.relations;
    app.appendChild(renderPageHead(ui.headTitle, ui.headHint));

    const wrap = el("div", "container rl-wrap");
    const span = ui.axisEnd - ui.axisStart;
    const pct = (y) => ((y - ui.axisStart) / span) * 100;

    const legend = el("div", "rl-legend");
    ui.legend.forEach((g) => {
      const item = el("span", "rl-legend-item");
      item.appendChild(el("span", "rl-swatch rl-swatch-" + g.kind));
      item.appendChild(el("span", "rl-legend-label", g.label));
      legend.appendChild(item);
    });
    legend.appendChild(el("p", "rl-legend-note", ui.legendNote));
    wrap.appendChild(legend);

    const ticks = [];
    for (let y = ui.axisStart; y <= ui.axisEnd; y += ui.axisStep) ticks.push(y);
    if (ticks[ticks.length - 1] !== ui.axisEnd) ticks.push(ui.axisEnd);

    const overlay = el("div", "rl-overlay");
    overlay.hidden = true;
    const dialog = el("div", "rl-card");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const closeBtn = el("button", "rl-close", ui.close);
    closeBtn.type = "button";
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    let lastBar = null;

    function closeCard() {
      overlay.hidden = true;
      if (lastBar) lastBar.focus();
    }
    closeBtn.addEventListener("click", closeCard);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeCard();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeCard();
    });

    function openCard(kind, p, bar) {
      lastBar = bar;
      dialog.replaceChildren(closeBtn);
      dialog.appendChild(el("h3", "rl-card-name", p.name));
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
      rows.forEach(([label, value]) => {
        const row = el("div", "rl-card-row");
        row.appendChild(el("span", "rl-card-label", label));
        row.appendChild(el("span", "rl-card-value", value));
        dialog.appendChild(row);
      });
      if (p.cbdbUrl) {
        const link = el("a", "topic-next cbdb-link", "CBDB 人物条目 ↗");
        link.href = p.cbdbUrl;
        link.target = "_blank";
        link.rel = "noopener";
        dialog.appendChild(link);
      }
      overlay.hidden = false;
      closeBtn.focus();
    }

    const scroll = el("div", "rl-scroll");
    const chart = el("div", "rl-chart");

    const axis = el("div", "rl-axis");
    axis.appendChild(el("span", "rl-name-cell rl-axis-name", ui.axisName));
    const axisTrack = el("div", "rl-track");
    ticks.forEach((y, i) => {
      const t = el("span", "rl-tick", String(y));
      if (i === 0) t.classList.add("is-first");
      if (i === ticks.length - 1) t.classList.add("is-last");
      t.style.left = pct(y) + "%";
      axisTrack.appendChild(t);
    });
    axis.appendChild(axisTrack);
    chart.appendChild(axis);

    const lanes = el("div", "rl-lanes");
    const grid = el("div", "rl-grid");
    ticks.forEach((y) => {
      const g = el("span", "rl-gridline");
      g.style.left = pct(y) + "%";
      grid.appendChild(g);
    });
    lanes.appendChild(grid);

    [
      { kind: "emperor", people: rl.emperors },
      { kind: "chief", people: rl.chiefs },
      { kind: "guest", people: rl.guests },
    ].forEach((lane) => {
      const section = el("section", "rl-lane rl-lane-" + lane.kind);
      const head = el("div", "rl-lane-head");
      head.appendChild(el("span", "rl-name-cell rl-lane-title", ui.lanes[lane.kind]));
      const headTrack = el("div", "rl-track");
      headTrack.appendChild(
        el("span", "rl-lane-count", lane.people.length + " " + ui.laneUnits[lane.kind])
      );
      head.appendChild(headTrack);
      section.appendChild(head);

      lane.people.forEach((p) => {
        const row = el("div", "rl-row");
        row.appendChild(el("span", "rl-name-cell rl-person", p.name));
        const track = el("div", "rl-track");
        const segs = lane.kind === "emperor" ? [[p.from, p.to]] : p.segments;
        segs.forEach((s, si) => {
          const bar = el("button", "rl-bar rl-bar-" + lane.kind);
          bar.type = "button";
          const left = pct(s[0]);
          bar.style.left = left + "%";
          bar.style.width = Math.max(pct(s[1]) - left, 0.45) + "%";
          bar.setAttribute("aria-label", p.name + " " + s[0] + "–" + s[1]);
          if (s[1] - s[0] >= 18) {
            bar.classList.add("is-wide");
            bar.appendChild(el("span", "rl-bar-label", p.name));
          } else if (si === segs.length - 1) {
            bar.appendChild(el("span", "rl-bar-label is-out", p.name));
          }
          bar.addEventListener("click", () => openCard(lane.kind, p, bar));
          track.appendChild(bar);
        });
        row.appendChild(track);
        section.appendChild(row);
      });

      if (lane.kind === "chief") {
        const gap = el("div", "rl-gap");
        gap.style.left = "var(--rl-name-w)";
        gap.style.width =
          "calc((100% - var(--rl-name-w)) * " + (ui.gapTo - ui.gapFrom) / span + ")";
        gap.appendChild(el("span", "rl-gap-text", ui.gapNote));
        section.appendChild(gap);
      }
      lanes.appendChild(section);
    });

    chart.appendChild(lanes);
    scroll.appendChild(chart);
    wrap.appendChild(scroll);
    app.appendChild(wrap);

    const qp = new URLSearchParams(location.search);
    const person = qp.get("person");
    if (person) {
      const kindParam = qp.get("kind");
      const kinds = kindParam === "guest" || kindParam === "chief" ? [kindParam] : ["chief", "guest"];
      for (const k of kinds) {
        const p = (k === "guest" ? rl.guests : rl.chiefs).find((x) => x.name === person);
        if (!p) continue;
        const bar = [...scroll.querySelectorAll(".rl-lane-" + k + " .rl-bar")].find((b) =>
          b.getAttribute("aria-label").startsWith(person + " ")
        );
        if (bar) bar.scrollIntoView({ block: "center", inline: "center" });
        openCard(k, p, bar || null);
        break;
      }
    }
  }

  /* ---------- 史料检索：静态 materials.json 为材料正文单源，不依赖 AI API ---------- */

  function renderSearch() {
    const ui = data.searchUI;
    app.appendChild(renderPageHead(ui.headTitle, ui.headHint));

    const wrap = el("div", "container sr-wrap");
    const requestedSource = new URLSearchParams(location.search).get("source");
    const materialStatus = el("p", "sr-material-status content-note", ui.loading);
    materialStatus.setAttribute("role", "status");
    const retry = el("button", "sr-retry sr-btn", ui.retry);
    retry.type = "button";
    retry.hidden = true;
    retry.addEventListener("click", loadMaterials);
    const detail = el("section", "sr-material-detail");
    detail.hidden = true;
    detail.setAttribute("aria-label", ui.detailTitle);
    wrap.append(materialStatus, retry, detail);

    // 旧索引只提供检索别名；其史料正文、标题和出处永不作为展示或搜索来源。
    const aliases = new Map(SEARCH_INDEX.filter((e) => e.kind === "source").map((e) => {
      const figure = new URLSearchParams(e.target.split("?")[1]).get("figure");
      return [figure + "/" + e.id, e.keywords];
    }));
    const baseIndex = SEARCH_INDEX.filter((e) => e.kind !== "source").map((e) => {
      const event = e.kind === "timeline" && data.timeline.events.find((item) => item.id === e.id);
      return event ? { ...e, title: event.title, text: event.summary + event.detail.join(" ") } : e;
    });
    let searchIndex = baseIndex;
    let loading = false;

    function appendChatLink(parent, figureId) {
      const figure = data.chatFigures.find((f) => f.id === figureId);
      if (!figure) return;
      const chat = el("a", "sr-chat-link", "向" + figure.name + "提问 · AI 人物对话（非史料）");
      chat.href = "chat.html?figure=" + encodeURIComponent(figure.id);
      parent.appendChild(chat);
    }

    function showMaterial(material) {
      detail.replaceChildren();
      detail.hidden = false;
      if (!material) {
        detail.appendChild(el("p", "content-note", ui.missing));
        return;
      }
      detail.appendChild(el("h2", "section-title", material.title));
      detail.appendChild(el("p", "sr-kind", material.kind || "现代转述 · 待核"));
      detail.appendChild(el("p", "sr-material-text", material.text));
      const meta = el("dl", "sr-material-meta");
      [["材料 ID", material.id], ["出处", material.source], ["卷篇定位", material.locator], ["所据版本", material.edition], ["核验范围与限制", material.verification]].forEach(([label, value]) => {
        meta.appendChild(el("dt", "", label));
        meta.appendChild(el("dd", "", value || "尚未登记，待核对"));
      });
      detail.appendChild(meta);
      if (typeof material.url === "string" && /^https?:\/\//i.test(material.url)) {
        const external = el("a", "topic-next", "打开已记录的外部出处（网页不等于校勘本）");
        external.href = material.url;
        external.target = "_blank";
        external.rel = "noopener noreferrer";
        detail.appendChild(external);
      }
      appendChatLink(detail, material.figure);
      if (material.id === "zhangjuzheng/c4") detail.appendChild(buildTopicPath("search.html?source=zhangjuzheng%2Fc4"));
    }

    async function loadMaterials() {
      if (loading) return;
      loading = true;
      retry.hidden = true;
      materialStatus.textContent = ui.loading;
      try {
        const response = await fetch("materials.json");
        if (!response.ok) throw new Error("materials unavailable");
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.sources) || !payload.sources.every((s) => s && typeof s.id === "string" && /^[a-z]+\/c\d+$/.test(s.id) && typeof s.title === "string" && typeof s.text === "string" && typeof s.source === "string")) throw new Error("invalid materials");
        const sources = payload.sources;
        if (new Set(sources.map((s) => s.id)).size !== sources.length) throw new Error("duplicate materials");
        searchIndex = sources.map((s) => ({
          ...s, kind: "source", contentKind: s.kind || "现代转述 · 待核",
          keywords: aliases.get(s.id) || [], target: "search.html?source=" + encodeURIComponent(s.id),
        })).concat(baseIndex);
        materialStatus.textContent = "已载入 " + sources.length + " 条静态材料 · 核验限制见详情；无需 AI 服务。";
        if (requestedSource !== null) showMaterial(sources.find((s) => s.id === requestedSource));
        run(input.value);
      } catch {
        materialStatus.textContent = ui.loadError;
        retry.hidden = false;
      } finally {
        loading = false;
      }
    }

    const form = el("form", "sr-form");
    const input = el("input", "sr-input");
    input.type = "search";
    input.placeholder = ui.placeholder;
    input.setAttribute("aria-label", ui.navTitle);
    const btn = el("button", "sr-btn", ui.searchBtn);
    btn.type = "submit";
    form.append(input, btn);
    wrap.appendChild(form);

    function hotRow(parent) {
      const hot = el("div", "sr-hot");
      hot.appendChild(el("span", "sr-hot-label", ui.hotLabel));
      ui.hot.forEach((w) => {
        const b = el("button", "sr-hot-word", w);
        b.type = "button";
        b.addEventListener("click", () => {
          input.value = w;
          run(w);
        });
        hot.appendChild(b);
      });
      parent.appendChild(hot);
    }
    hotRow(wrap);

    const status = el("p", "sr-status");
    const results = el("div", "sr-results");
    wrap.append(status, results);

    const books = el("section", "sr-books");
    const booksHead = el("div", "section-head");
    booksHead.appendChild(el("h2", "section-title", ui.booksTitle));
    booksHead.appendChild(el("p", "section-hint", ui.booksHint));
    books.appendChild(booksHead);
    const bookList = el("div", "sr-book-list");
    ui.books.forEach((b) => {
      const item = el("article", "sr-book");
      item.appendChild(el("h3", "sr-book-title", b.title));
      const meta = el("div", "sr-book-meta");
      meta.appendChild(el("span", "sr-book-author", b.author));
      meta.appendChild(el("span", "sr-book-level", b.level));
      item.appendChild(meta);
      const note = el("p", "sr-book-note");
      const pieces = b.note.split("ctext.org");
      pieces.forEach((piece, i) => {
        note.appendChild(document.createTextNode(piece));
        if (i < pieces.length - 1) {
          const link = el("a", "sr-book-link", "ctext.org");
          link.href = "https://ctext.org";
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          note.appendChild(link);
        }
      });
      item.appendChild(note);
      bookList.appendChild(item);
    });
    books.appendChild(bookList);
    wrap.appendChild(books);
    app.appendChild(wrap);

    function paintHit(node, text, q) {
      let rest = text;
      let at;
      while ((at = rest.indexOf(q)) >= 0) {
        node.appendChild(document.createTextNode(rest.slice(0, at)));
        node.appendChild(el("strong", "sr-hit", q));
        rest = rest.slice(at + q.length);
      }
      node.appendChild(document.createTextNode(rest));
    }

    function run(raw) {
      const q = raw.trim();
      results.replaceChildren();
      if (!q) {
        status.textContent = ui.emptyHint;
        return;
      }
      const hits = [];
      searchIndex.forEach((e, i) => {
        // 年份是事件标题的一部分：搜年份须命中对应时间线条目
        const tier =
          e.title.includes(q) || (e.year && e.year.includes(q))
            ? 0
            : e.keywords.some((k) => k.includes(q) || q.includes(k))
              ? 1
              : [e.text, e.source, e.locator, e.edition].some((value) => typeof value === "string" && value.includes(q))
                ? 2
                : -1;
        if (tier >= 0) hits.push({ e, i, tier });
      });
      hits.sort((a, b) => a.tier - b.tier || a.i - b.i);
      if (!hits.length) {
        status.textContent = ui.noResultTitle;
        hotRow(results);
        results.appendChild(el("p", "sr-empty-hint", ui.noResultHint));
        return;
      }
      status.textContent = ui.countPrefix + " " + hits.length + " " + ui.countSuffix;
      hits.forEach(({ e }) => {
        const card = el(e.kind === "source" ? "article" : "a", "sr-card");
        if (e.kind !== "source") card.href = e.target;
        card.appendChild(el("span", "sr-kind sr-kind-" + e.kind, e.kind === "source" ? "材料 · " + e.contentKind : ui.kindLabels[e.kind] + " · 编辑概述"));
        const title = el("h3", "sr-title");
        if (e.kind === "source") {
          const link = el("a", "sr-detail-link", e.title + " · " + ui.detailLink);
          link.href = e.target;
          title.appendChild(link);
        } else title.textContent = e.title;
        card.appendChild(title);
        const sum = el("p", "sr-text");
        paintHit(sum, e.text, q);
        card.appendChild(sum);
        const src =
          e.kind === "timeline"
            ? e.source + " · " + e.year
            : e.kind === "relation"
              ? e.source + " · " + e.lord
              : e.source;
        card.appendChild(el("p", "sr-source", src));
        if (e.kind === "source") appendChatLink(card, e.figure);
        results.appendChild(card);
      });
    }

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      run(input.value);
    });
    run("");
    loadMaterials();
  }

  /* ---------- 白话明史 · 长文阅读 ---------- */

  function renderChapter() {
    const ui = data.chapterUI;
    const ch = selectedChapter();
    const idx = data.chapters.indexOf(ch);
    app.appendChild(renderPageHead(ui.series + " · " + ch.title, null));

    const wrap = el("div", "container ch-wrap");
    const read = el("div", "ch-read");
    const tabs = el("div", "ch-tabs");
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "章节切换");
    const nums = ["一", "二"];
    data.chapters.forEach((c, i) => {
      const tab = el("a", "ch-tab" + (c === ch ? " is-current" : ""), "第" + nums[i] + "章 · " + c.title);
      tab.href = "chapter.html?ch=" + c.id;
      if (c === ch) tab.setAttribute("aria-current", "page");
      tabs.appendChild(tab);
    });
    read.appendChild(tabs);
    read.appendChild(el("p", "ch-intro", ch.intro));
    ch.sections.forEach((sec) => {
      const section = el("section", "ch-section");
      section.appendChild(el("h2", "ch-sec-title", sec.title));
      sec.paragraphs.forEach((p) => section.appendChild(el("p", "ch-p", p)));
      if (sec.sources && sec.sources.length) {
        const slip = el("details", "ch-sources");
        slip.appendChild(el("summary", "ch-sources-summary", "本节史料（" + sec.sources.length + " 条）"));
        const list = el("div", "ch-sources-list");
        sec.sources.forEach((s) => {
          const card = el("div", "ch-slip");
          const mid = el("div", "ch-slip-mid");
          const inner = el("div", "ch-slip-in");
          inner.appendChild(el("h3", "ch-slip-title", s.title));
          inner.appendChild(el("p", "ch-slip-text", s.text));
          inner.appendChild(el("p", "ch-slip-from", "—— " + s.source));
          mid.appendChild(inner);
          card.appendChild(mid);
          list.appendChild(card);
        });
        slip.appendChild(list);
        section.appendChild(slip);
      }
      section.appendChild(el("p", "ch-source", ui.sourcePrefix + sec.sourceNote));
      read.appendChild(section);
    });
    const prev = data.chapters[idx - 1];
    const nextChapter = data.chapters[idx + 1];
    if (prev || nextChapter) {
      const chapterNav = el("div", "ch-chapter-nav");
      if (prev) {
        const a = el("a", "ch-chapter-link", "← 上一章：" + prev.title);
        a.href = "chapter.html?ch=" + prev.id;
        chapterNav.appendChild(a);
      }
      if (nextChapter) {
        const a = el("a", "ch-chapter-link", "下一章：" + nextChapter.title + " →");
        a.href = "chapter.html?ch=" + nextChapter.id;
        chapterNav.appendChild(a);
      }
      read.appendChild(chapterNav);
    }
    const next = el("section", "ch-next");
    next.appendChild(el("h2", "ch-sec-title", ui.nextTitle));
    ch.nextSteps.forEach((l) => {
      const a = el("a", "topic-next ch-next-link", l.label);
      a.href = l.href;
      if (a.getAttribute("href").startsWith("qinli.html")) { a.target = "_blank"; a.rel = "noopener"; }
      next.appendChild(a);
    });
    read.appendChild(next);
    wrap.appendChild(read);
    app.appendChild(wrap);
  }

  /* ---------- 占位模块页 ---------- */

  function renderPlaceholder() {
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));
    const wrap = el("div", "container placeholder-wrap");
    const box = el("div", "placeholder-box");
    box.appendChild(el("span", "placeholder-badge", data.placeholderBadge));
    box.appendChild(el("p", "placeholder-text", currentModule.placeholder));
    wrap.appendChild(box);
    app.appendChild(wrap);
  }

  /* ---------- 组装 ---------- */

  renderNav();
  if (page === "index") renderIndex();
  else if (page === "timeline") renderTimeline();
  else if (page === "decision") renderDecisions();
  else if (page === "cards") renderCards();
  else if (page === "search") renderSearch();
  else if (page === "chapter") renderChapter();
  else if (page === "quiz") renderQuiz();
  else if (page === "profile") renderProfile();
  else if (page === "relations") renderRelations();
  else if (page === "chat") renderChat();
  else if (page === "qinli") renderQinli();
  else renderPlaceholder();
  app.appendChild(renderFooter());
})();