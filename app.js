/* 《史脉·大明》多页共享外壳：导航、页眉、页脚、首页轮播、时间线与进度存储。 */

(function () {
  "use strict";

  const data = SITE_DATA;
  const page = document.body.dataset.page || "index";
  const app = document.getElementById("app");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const PROGRESS_KEY = "shimais-daming:progress:v1";

  document.documentElement.lang = data.meta.lang;
  const currentModule = data.modules.find((m) => m.id === page);
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
    updateProgress((p) => {
      p.timeline = p.timeline || {};
      p.timeline.read = Array.isArray(p.timeline.read) ? p.timeline.read : [];
      if (!p.timeline.read.includes(id)) p.timeline.read.push(id);
    });
  }

  /* ---------- 固定顶部导航 ---------- */

  function renderNav() {
    const nav = el("header", "site-nav");
    const inner = el("div", "nav-inner");

    const brand = el("a", "nav-brand", data.meta.title);
    brand.href = "index.html";
    inner.appendChild(brand);

    const links = el("nav", "nav-links");
    links.setAttribute("aria-label", data.modulesLabel);
    data.modules.forEach((m) => {
      const a = el("a", "nav-link");
      a.href = m.page;
      a.appendChild(el("span", "nav-full", m.title));
      a.appendChild(el("span", "nav-short", m.short));
      if (m.id === page) {
        a.classList.add("is-current");
        a.setAttribute("aria-current", "page");
      }
      links.appendChild(a);
    });
    inner.appendChild(links);
    nav.appendChild(inner);
    document.body.prepend(nav);
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
    let hovering = false;

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
      if (reducedMotion.matches || hovering || document.hidden) return;
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

    region.addEventListener("mouseenter", () => {
      hovering = true;
      stop();
    });
    region.addEventListener("mouseleave", () => {
      hovering = false;
      start();
    });
    region.addEventListener("focusin", () => {
      hovering = true;
      stop();
    });
    region.addEventListener("focusout", (e) => {
      if (!region.contains(e.relatedTarget)) {
        hovering = false;
        start();
      }
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
    app.appendChild(renderPageHead(data.meta.title, data.meta.subtitle));
    app.appendChild(buildCarousel());

    const question = el("section", "question-section container");
    const block = el("div", "question-block");
    block.appendChild(el("p", "main-question", data.hero.question));
    block.appendChild(el("p", "question-note", data.hero.questionNote));
    question.appendChild(block);
    app.appendChild(question);

    const entries = el("section", "entries-section container");
    const head = el("div", "section-head");
    head.appendChild(el("h2", "section-title", data.modulesLabel));
    head.appendChild(el("p", "section-hint", data.modulesHint));
    entries.appendChild(head);

    const grid = el("div", "entry-grid");
    data.modules.forEach((m) => {
      const a = el("a", "entry-block");
      a.href = m.page;
      a.appendChild(el("span", "entry-index", m.index));
      a.appendChild(el("h3", "entry-title", m.title));
      a.appendChild(el("p", "entry-tagline", m.tagline));
      a.appendChild(el("p", "entry-desc", m.desc));
      a.appendChild(el("span", "entry-arrow", "→"));
      grid.appendChild(a);
    });
    entries.appendChild(grid);
    app.appendChild(entries);
  }

  /* ---------- 时间线 ---------- */

  function renderTimeline() {
    const tl = data.timeline;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));

    const wrap = el("div", "container tl-wrap");

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
        const tags = el("div", "tl-tags");
        ev.tags.forEach((t) => tags.appendChild(el("span", "tl-tag", t)));
        detail.appendChild(tags);

        row.addEventListener("click", () => {
          const open = detail.hidden;
          detail.hidden = !open;
          row.setAttribute("aria-expanded", open ? "true" : "false");
          article.classList.toggle("is-open", open);
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

    window.addEventListener("storage", (e) => {
      if (e.key === PROGRESS_KEY) refreshProgress();
    });
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
  else renderPlaceholder();
  app.appendChild(renderFooter());
})();