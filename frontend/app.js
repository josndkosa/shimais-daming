/* 《史脉·大明》多页共享外壳：导航、页眉、页脚、首页轮播、时间线与进度存储。 */

(function () {
  "use strict";

  const data = SITE_DATA;
  const page = document.body.dataset.page || "index";
  const app = document.getElementById("app");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const PROGRESS_KEY = "shimais-daming:progress:v1";
  // 占位地址：上线前替换为真实 Render 服务地址（后端地址仅在此一处定义）
  const CHAT_API_BASE = "http://localhost:8000";

  document.documentElement.lang = data.meta.lang;
  const currentModule =
    data.modules.find((m) => m.id === page) ||
    (page === "relations" ? { title: data.relationsUI.headTitle } : null) ||
    (page === "qinli" ? { title: data.qinliUI.sectionTitle } : null);
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
    inner.appendChild(links);
    nav.appendChild(inner);
    document.body.prepend(nav);

    /* 移动端顶栏换行后高度不定，实测高度同步给 --nav-h，供正文偏移与吸顶组件使用 */
    const syncNavHeight = () => {
      document.documentElement.style.setProperty("--nav-h", nav.offsetHeight + "px");
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

    const entries = el("section", "entries-section container");
    const head = el("div", "section-head");
    head.appendChild(el("h2", "section-title", data.modulesLabel));
    head.appendChild(el("p", "section-hint", data.modulesHint));
    entries.appendChild(head);

    const list = el("div", "entry-list");
    data.modules.forEach((m, i) => {
      const a = el("a", "entry-block");
      a.href = m.page;
      a.appendChild(el("span", "entry-index", String(i + 1).padStart(2, "0")));
      a.appendChild(el("h3", "entry-title", m.title));
      a.appendChild(el("p", "entry-desc", m.desc));
      list.appendChild(a);
    });
    entries.appendChild(list);
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
      const toChat = el("a", "cta-button cta-gold ql-tochat", qu.toChat);
      toChat.href = "chat.html?figure=yuqian";
      btns.append(again, toChat);
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
      const st = qinliState();
      if (st.current && st.current.storyId === s.id) {
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
      paintScene();
      paintCards();
      if (scroll !== false) {
        play.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
      }
    }

    stories.forEach((s) => {
      const card = el("article", "ql-card" + (s.playable ? "" : " is-locked"));
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
    if (resumeStory) enter(resumeStory, false);

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
        card.style.setProperty("--d", (i % 3) * 70 + "ms");

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

        const facts = el("div", "cw-facts");
        facts.appendChild(el("p", "cw-facts-label", ui.factsLabel));
        const ul = el("ul", "cw-fact-list");
        c.facts.forEach((f) => ul.appendChild(el("li", "cw-fact", f)));
        facts.appendChild(ul);
        body.appendChild(facts);

        const comment = el("div", "cw-comment");
        comment.appendChild(el("span", "cw-comment-label", ui.commentLabel));
        comment.appendChild(el("p", "cw-comment-p", c.comment));
        body.appendChild(comment);

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
    const questions = data.quiz;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));

    const wrap = el("div", "container qz-wrap");
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

    const nodes = new Map();

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
      wrap.appendChild(resultNode);
      submitWrap.hidden = true;
    }

    function refresh() {
      const st = quizState();
      const answered = questions.filter((q, i) => st.picks[i] != null).length;
      count.textContent = answered + " / " + questions.length;
      fill.style.width = (answered / questions.length) * 100 + "%";
      if (st.submitted) {
        if (!resultNode) showResult();
      } else {
        submitBtn.disabled = answered < questions.length;
        submitHint.textContent =
          answered < questions.length ? ui.submitHint : ui.submitReady;
      }
    }

    questions.forEach((q, qi) => {
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
      item.appendChild(explain);

      wrap.appendChild(item);
      nodes.set(q.id, item);
      applyQuestion(q, item, quizState().picks[qi]);
    });

    wrap.appendChild(submitWrap);
    app.appendChild(wrap);
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

    window.addEventListener("storage", (e) => {
      if (e.key !== PROGRESS_KEY) return;
      const st = quizState();
      questions.forEach((q, i) => applyQuestion(q, nodes.get(q.id), st.picks[i]));
      refresh();
    });
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

      if (quiz) {
        let weakest = null;
        let weakestRate = Infinity;
        ["timeline", "person", "institution"].forEach((d) => {
          const v = (quiz.dims && quiz.dims[d]) || { hit: 0, total: 0 };
          if (!v.total) return;
          const rate = v.hit / v.total;
          if (rate < weakestRate) {
            weakestRate = rate;
            weakest = d;
          }
        });
        if (weakest) {
          const rec = ui.recs[weakest];
          const recSec = el("section", "pf-section");
          recSec.appendChild(el("h2", "section-title", ui.recTitle));
          const recBox = el("div", "pf-rec");
          recBox.appendChild(el("p", "pf-rec-p", rec.text));
          const links = el("div", "pf-rec-links");
          rec.links.forEach((l) => {
            const a = el("a", "cta-button cta-gold", l.label);
            a.href = l.href;
            links.appendChild(a);
          });
          recBox.appendChild(links);
          recSec.appendChild(recBox);
          box.appendChild(recSec);
        }
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

    // 预热请求：不阻塞渲染，失败静默
    fetch(CHAT_API_BASE + "/api/health").catch(() => {});

    const wrap = el("div", "container ct-wrap");
    const sessions = {};
    let current = figures[0].id;
    const wanted = new URLSearchParams(window.location.search).get("figure");
    if (wanted && figures.some((f) => f.id === wanted)) current = wanted;

    const picker = el("div", "ct-picker");
    picker.setAttribute("aria-label", ui.pickerLabel);
    const pickerBtns = new Map();
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
      b.appendChild(meta);
      b.addEventListener("click", () => select(f.id));
      picker.appendChild(b);
      pickerBtns.set(f.id, b);
    });
    wrap.appendChild(picker);

    const conv = el("section", "ct-conv");
    const offlineNote = el("p", "ct-offline", ui.offline);
    offlineNote.hidden = true;
    conv.appendChild(offlineNote);

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
    endArea.append(switchBtn, restartBtn);
    conv.appendChild(endArea);
    wrap.appendChild(conv);
    app.appendChild(wrap);

    const disclaimer = el("p", "ct-disclaimer", ui.disclaimer);
    document.body.appendChild(disclaimer);

    function session() {
      if (!sessions[current]) sessions[current] = { messages: [], offline: false };
      return sessions[current];
    }

    function figure() {
      return figures.find((f) => f.id === current);
    }

    function rounds() {
      return session().messages.filter((m) => m.role === "user").length;
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
    }

    function paintChips() {
      chips.replaceChildren();
      chips.appendChild(el("span", "ct-chips-label", ui.askLabel));
      figure().qas.forEach((qa) => {
        const c = el("button", "ct-chip", qa.q);
        c.type = "button";
        c.addEventListener("click", () => send(qa.q));
        chips.appendChild(c);
      });
    }

    function refreshInput() {
      const ended = rounds() >= ui.roundsMax;
      inputArea.hidden = ended;
      endArea.hidden = !ended;
    }

    function select(id) {
      current = id;
      pickerBtns.forEach((b, fid) => b.classList.toggle("is-current", fid === id));
      offlineNote.hidden = !session().offline;
      paintChips();
      paintFlow();
      refreshInput();
      flow.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest" });
    }

    function scriptReply(message) {
      const f = figure();
      const hit =
        f.qas.find((qa) => qa.q === message) ||
        f.qas.find((qa) => qa.keywords.some((k) => message.includes(k)));
      return hit ? hit.a : f.fallback;
    }

    async function send(message) {
      const msg = (message || "").trim();
      if (!msg || rounds() >= ui.roundsMax) return;
      const s = session();
      const history = s.messages.slice(-ui.historyRounds * 2).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      s.messages.push({ role: "user", content: msg });
      flow.appendChild(messageNode({ role: "user", content: msg }));
      text.value = "";
      refreshInput();

      const pending = el("div", "ct-msg ct-figure ct-pending");
      pending.appendChild(el("span", "ct-who", figure().name));
      pending.appendChild(el("p", "ct-text", ui.thinking));
      const cold = el("p", "ct-cold", ui.coldStart);
      cold.hidden = true;
      pending.appendChild(cold);
      flow.appendChild(pending);
      flow.scrollTop = flow.scrollHeight;
      const coldTimer = setTimeout(() => {
        cold.hidden = false;
      }, ui.coldHintMs);

      let reply = null;
      let note = null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ui.timeoutMs);
      try {
        const resp = await fetch(CHAT_API_BASE + "/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ figure: current, history, message: msg }),
          signal: ctrl.signal,
        });
        if (!resp.ok) throw new Error("status " + resp.status);
        const body = await resp.json();
        reply = body.reply;
        note = body.note || null;
        s.offline = false;
        offlineNote.hidden = true;
      } catch {
        s.offline = true;
        offlineNote.hidden = false;
        reply = scriptReply(msg);
        note = null;
      } finally {
        clearTimeout(timer);
        clearTimeout(coldTimer);
        pending.remove();
      }

      s.messages.push({ role: "assistant", content: reply, note });
      flow.appendChild(messageNode({ role: "assistant", content: reply, note }));
      markChatStarted();
      refreshInput();
      flow.scrollTop = flow.scrollHeight;
    }

    sendBtn.addEventListener("click", () => send(text.value));
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
      const s = session();
      s.messages = [];
      paintFlow();
      refreshInput();
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
  else if (page === "quiz") renderQuiz();
  else if (page === "profile") renderProfile();
  else if (page === "relations") renderRelations();
  else if (page === "chat") renderChat();
  else if (page === "qinli") renderQinli();
  else renderPlaceholder();
  app.appendChild(renderFooter());
})();