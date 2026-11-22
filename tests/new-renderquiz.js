  function renderQuiz() {
    const ui = data.quizUI;
    app.appendChild(renderPageHead(currentModule.title, currentModule.tagline));

    const wrap = el("div", "container qz-wrap");
    const modeRow = el("div", "qz-modes");
    const modeBtns = {};
    [["formal", ui.modeFormal], ["practice", ui.modePractice]].forEach(([key, text]) => {
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

    function setMode(next) {
      modeBtns.formal.classList.toggle("is-on", next === "formal");
      modeBtns.practice.classList.toggle("is-on", next === "practice");
      modeBtns.formal.setAttribute("aria-pressed", String(next === "formal"));
      modeBtns.practice.setAttribute("aria-pressed", String(next === "practice"));
      stage.replaceChildren();
      formalRefresh = null;
      if (next === "formal") renderFormal(stage);
      else renderPractice(stage);
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

    function renderPractice(root) {
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

      function refresh() {
        const total = questions ? questions.length : 10;
        const answered = questions ? picks.filter((x) => x != null).length : 0;
        count.textContent = answered + " / " + total;
        fill.style.width = (answered / total) * 100 + "%";
        if (questions && !submitted) {
          submitBtn.disabled = answered < questions.length;
          submitHint.textContent =
            answered < questions.length ? ui.submitHint : ui.practiceResultNote;
        }
      }

      function clearResult() {
        if (resultNode) {
          resultNode.remove();
          resultNode = null;
        }
      }

      function genButton() {
        const gen = el("button", "cta-button qz-gen-btn", ui.genBtn);
        gen.type = "button";
        gen.addEventListener("click", () => generate(gen));
        return gen;
      }

      function showIntro() {
        questions = null;
        picks = [];
        submitted = false;
        clearResult();
        list.replaceChildren();
        submitWrap.hidden = true;
        panel.replaceChildren();
        panel.appendChild(el("p", "qz-practice-hint", ui.practiceHint));
        panel.appendChild(genButton());
        refresh();
      }

      async function generate(btn) {
        btn.disabled = true;
        btn.textContent = ui.generating;
        try {
          const resp = await fetch(CHAT_API_BASE + "/api/quiz/practice", { method: "POST" });
          if (!resp.ok) throw new Error("http " + resp.status);
          const payload = await resp.json();
          const qs = payload && payload.questions;
          if (!Array.isArray(qs) || qs.length !== 10) throw new Error("bad payload");
          startSet(qs);
        } catch {
          showFail();
        }
      }

      function showFail() {
        questions = null;
        picks = [];
        submitted = false;
        clearResult();
        list.replaceChildren();
        submitWrap.hidden = true;
        panel.replaceChildren();
        panel.appendChild(el("p", "qz-practice-hint", ui.genFail));
        const fb = el("button", "cta-button qz-fallback-btn", ui.fallbackBtn);
        fb.type = "button";
        fb.addEventListener("click", () => startSet(data.quiz));
        panel.appendChild(fb);
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
          if (q.source) {
            explain.appendChild(el("p", "qz-source-line", ui.practiceSourceLabel + "：" + q.source));
          }
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
        const again = el("button", "cta-button qz-again-btn", ui.againBtn);
        again.type = "button";
        again.addEventListener("click", () => {
          clearResult();
          list.replaceChildren();
          submitWrap.hidden = true;
          questions = null;
          panel.replaceChildren();
          const gen = genButton();
          panel.appendChild(gen);
          generate(gen);
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

      showIntro();
    }

    window.addEventListener("storage", (e) => {
      if (e.key !== PROGRESS_KEY) return;
      if (formalRefresh) formalRefresh();
    });

    setMode("formal");
  }