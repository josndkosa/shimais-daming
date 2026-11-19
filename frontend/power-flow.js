/* 「权力怎么流转」导读：仅 relations 页加载，插在三泳道关系表之前。不改动 app.js 的渲染与数据。 */

(function () {
  "use strict";

  if (document.body.dataset.page !== "relations") return;
  const chartWrap = document.querySelector(".rl-wrap");
  if (!chartWrap) return;

  const section = document.createElement("section");
  section.className = "container pw-wrap";
  section.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">权力怎么流转</h2>
      <p class="section-hint">废丞相之后，一份奏疏要走完的路</p>
    </div>

    <div class="pw-scroll">
      <div class="pw-stage">
        <svg class="pw-wires" viewBox="0 0 1080 620" aria-hidden="true" focusable="false">
          <defs>
            <marker id="pw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z"></path>
            </marker>
            <marker id="pw-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z"></path>
            </marker>
          </defs>

          <g class="pw-wire">
            <path d="M115,242 V286" marker-end="url(#pw-arrow)"></path>
            <path d="M210,338 H245 V219 H280" marker-end="url(#pw-arrow)"></path>
            <path d="M470,96 L390,160" marker-end="url(#pw-arrow)"></path>
            <path d="M610,96 L695,160" marker-end="url(#pw-arrow)"></path>
            <path d="M500,210 H580" marker-end="url(#pw-arrow)"></path>
            <path d="M580,252 H500" stroke-dasharray="5 4" marker-end="url(#pw-arrow)"></path>
            <path d="M810,236 H890" stroke-dasharray="2 4" opacity="0.6"></path>
            <path d="M695,310 V430" marker-end="url(#pw-arrow)"></path>
            <path d="M580,480 H500" marker-end="url(#pw-arrow)"></path>
          </g>
          <g class="pw-wire-red">
            <path d="M665,56 H970 V160" stroke-dasharray="6 4" marker-end="url(#pw-arrow-red)"></path>
            <path d="M970,264 V580 H390 V526" stroke-dasharray="6 4" marker-end="url(#pw-arrow-red)"></path>
          </g>

          <g class="pw-wire-label">
            <text x="241" y="296" text-anchor="end">呈进</text>
            <text x="420" y="122" text-anchor="end">任免阁臣</text>
            <text x="648" y="122">批红本是皇权</text>
            <text x="540" y="198" text-anchor="middle">票拟</text>
            <text x="540" y="272" text-anchor="middle">无批红不生效</text>
            <text x="850" y="196" text-anchor="middle">秉笔多兼</text>
            <text x="850" y="214" text-anchor="middle">提督东厂</text>
            <text x="707" y="376">批红后抄发</text>
            <text x="540" y="468" text-anchor="middle">执行</text>
          </g>
          <g class="pw-wire-label-red">
            <text x="818" y="44" text-anchor="middle">直属 · 不经内阁</text>
            <text x="690" y="570" text-anchor="middle">监察百官 · 诏狱（绕过司法）</text>
          </g>
        </svg>

        <div class="pw-node pw-emperor">
          <h3 class="pw-name">皇帝</h3>
          <p class="pw-sub">朱批 · 最终裁决</p>
        </div>

        <div class="pw-node pw-zoushu">
          <h3 class="pw-name">百官奏疏</h3>
          <p class="pw-note">地方与京官的报告、请示，从这里进宫</p>
        </div>

        <div class="pw-node pw-tongzheng">
          <h3 class="pw-name">通政司</h3>
          <p class="pw-note">收文、登记、呈送，是奏疏进宫的唯一入口</p>
        </div>

        <div class="pw-node pw-neige">
          <h3 class="pw-name">内阁</h3>
          <p class="pw-sub">票拟 · 首辅领班</p>
          <p class="pw-note">拟处理意见，贴于疏上，只建议、不决定。</p>
        </div>

        <div class="pw-node pw-sili">
          <h3 class="pw-name">司礼监</h3>
          <p class="pw-sub">批红 · 掌印与秉笔太监</p>
          <p class="pw-note">皇帝用朱笔批示；皇帝怠政时，由秉笔太监代批、掌印太监盖印。</p>
        </div>

        <div class="pw-node pw-changwei">
          <h3 class="pw-name">厂卫</h3>
          <p class="pw-sub">东厂 · 锦衣卫</p>
          <p class="pw-note">只对皇帝负责。</p>
        </div>

        <div class="pw-node pw-liubu">
          <h3 class="pw-name">六部 · 地方</h3>
          <p class="pw-note">执行批红后的政令，政令到此落地。</p>
        </div>

        <div class="pw-node pw-liuke">
          <h3 class="pw-name">六科给事中</h3>
          <p class="pw-sub">抄发章疏 · 有权封驳</p>
          <p class="pw-note">给事中抄录诏旨、发往各部；不合体制的诏旨，理论上可以封驳。</p>
        </div>
      </div>
    </div>

    <div class="pw-close">
      <p>废丞相之后，权力一分为二：拟的人和批的人不是同一拨人，失控的缝，就开在这里。</p>
      <p>皇帝勤政则衡；怠政时批红旁落司礼监：王振（正统）· 刘瑾（正德）· 魏忠贤（天启）。</p>
    </div>

    <p class="pw-watch">监察线：东厂 ＋ 锦衣卫——只对皇帝负责，可不经刑部逮问官员，盯着上面流程里的所有人。</p>

    <ul class="pw-cases">
      <li><strong>张居正为什么推得动改革：</strong>首辅张居正（1572–1582 年当政）与司礼监掌印太监冯保联手，票拟与批红捏到了一起。</li>
      <li><strong>魏忠贤为什么可怕：</strong>天启朝他以司礼监秉笔太监兼掌东厂，批红与监察一手抓，内阁成了摆设。</li>
      <li><strong>王振为什么能挟持皇帝出塞：</strong>正统朝他是司礼监掌印太监，批红与印都在他手里，1449 年土木堡之变正接本站亲历剧本《正统十四年 · 京师》。</li>
    </ul>
  `;

  chartWrap.parentNode.insertBefore(section, chartWrap);
})();