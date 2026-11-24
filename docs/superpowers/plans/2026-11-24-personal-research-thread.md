# 个人研读线索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有页面与 `shimais-daming:progress:v1` 内实现三条可开始、可取证、可切换、可恢复的个人研读线索，不新增页面、后端或未经确认的研究问题文案。

**Architecture:** 线索定义与证据映射集中在 `frontend/data.js`；`frontend/app.js` 提供统一存储、校验、记录和只读渲染 helper。现有事件、决策、人物卡、亲历结局、错题回看、聊天成功回复与章节入口调用同一记录函数；画像页读取状态，首页与全站底部提供轻量入口和回声。

**Tech Stack:** 原生 JavaScript、现有 DOM helper、localStorage、Node `node:test` + VM、现有无头 Chrome 回归。

**执行基线：** `f423d06`（相对设计中的 `e732786` 只多了已获确认的设计文档）；本轮不发布。

---

## File Structure

- Modify `frontend/data.js`：新增 `researchThreads` 与 `researchUI`，只引用现有标题和已确认界面短语。
- Modify `frontend/app.js`：新增研读线索存储/记录/渲染 helper，接入既有行为入口。
- Modify `frontend/styles.css`：新增线索卡、证据槽、回声样式，复用既有色彩与发丝线。
- Modify `frontend/content.test.cjs`：验证定义、深链、存储白名单、去重、损坏数据与只读渲染。
- Modify `frontend/browser-tests.html`：验证真实 DOM 交互、写入失败、恢复与检索标记。
- Create `tests/verify-research.js`：验证桌面与 390px 布局、无横向溢出和 reduced-motion。

## Task 1: 线索定义与证据映射

**Files:**
- Modify: `frontend/data.js`
- Test: `frontend/content.test.cjs`

- [ ] **Step 1: 增加会失败的内容测试**

在 `frontend/content.test.cjs` 的 `checkHref()` 中补两个既有目标类型：

```js
else if (url.pathname === '/chapter.html') assert.ok(data.chapters.some(c => c.id === id.get('ch')));
else if (url.pathname === '/chat.html') assert.ok(data.chatFigures.some(f => f.id === id.get('figure')));
else if (url.pathname === '/decisions.html') assert.ok(data.decisions.some(d => '#' + d.id === url.hash));
```

追加测试：

```js
test('research threads define three canonical IDs, three slots and valid destinations', () => {
  assert.deepEqual(Array.from(data.researchThreads, t => t.id), ['yitiaobian', 'tumubao', 'chongzhen']);
  assert.deepEqual(Array.from(data.researchThreads, t => t.title), ['一条鞭法：从赋役合并到农户成本', '土木堡与北京保卫战', '崇祯']);
  for (const thread of data.researchThreads) {
    assert.equal(thread.slots.length, 3);
    assert.equal(thread.question, undefined, '研究问题文案尚未定版，不得自拟');
    for (const slot of thread.slots) {
      assert.ok(slot.title && slot.keys.length && slot.href);
      checkHref(slot.href);
    }
  }
  assert.deepEqual(data.researchThreads[0].slots.map(s => s.keys), [
    ['event:e1581'],
    ['card:i3', 'review:zhangjuzheng/c4', 'topic:yitiaobian'],
    ['story:q1581'],
  ]);
  assert.deepEqual(data.researchThreads[1].slots.map(s => s.keys), [
    ['event:e1449'],
    ['decision:d1449', 'card:p3', 'chapter:tumubao'],
    ['story:q1449'],
  ]);
  assert.deepEqual(data.researchThreads[2].slots.map(s => s.keys), [
    ['event:e1644'],
    ['story:q1644'],
    ['chat:chongzhen', 'card:p6', 'chapter:chongzhen'],
  ]);
  assert.deepEqual(data.researchThreads.flatMap(t => t.slots.map(s => s.title)), [
    '一条鞭法推行全国', '一条鞭法与白银财政', '万历九年 · 清丈',
    '土木之变', '守不守北京', '正统十四年 · 京师',
    '甲申之变，煤山', '崇祯十七年 · 煤山前夜', '崇祯',
  ]);
  assert.deepEqual(data.researchUI, {
    title: '研读线索', related: '相关足迹', start: '开始追索', continue: '继续研读线索',
    switch: '切换线索', complete: '已形成第一轮判断', review: '回看证据链',
    echo: '已为「{title}」线索取证 · 查看线索', recorded: '已记录',
  });
});

test('research evidence keys resolve only to existing canonical objects', () => {
  const keys = data.researchThreads.flatMap(t => t.slots.flatMap(s => s.keys));
  for (const key of keys) {
    const [kind, id] = key.split(':');
    if (kind === 'event') assert.ok(data.timeline.events.some(e => e.id === id), key);
    else if (kind === 'card') assert.ok(data.cards.some(c => c.id === id), key);
    else if (kind === 'decision') assert.ok(data.decisions.some(d => d.id === id), key);
    else if (kind === 'story') assert.ok(data.qinli.some(s => s.id === id && s.playable), key);
    else if (kind === 'chapter') assert.ok(data.chapters.some(c => c.id === id), key);
    else if (kind === 'chat') assert.ok(data.chatFigures.some(f => f.id === id), key);
    else if (kind === 'review') assert.ok(sources.has(id), key);
    else if (kind === 'topic') assert.equal(id, data.topic.id);
    else assert.fail('unknown research evidence kind: ' + key);
  }
});
```

将既有整站数据摘要测试改为排除本轮新增字段，保持旧数据摘要不变：

```js
const { territory, researchThreads, researchUI, ...existing } = data;
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `node --test --test-name-pattern='research' frontend/content.test.cjs`
Expected: FAIL，提示 `data.researchThreads` 不存在。

- [ ] **Step 3: 在 `frontend/data.js` 增加定义**

在 `profileUI` 前插入：

```js
researchThreads: [
  {
    id: 'yitiaobian',
    title: '一条鞭法：从赋役合并到农户成本',
    shortTitle: '一条鞭法',
    slots: [
      { title: '一条鞭法推行全国', keys: ['event:e1581'], href: 'timeline.html?event=e1581' },
      { title: '一条鞭法与白银财政', keys: ['card:i3', 'review:zhangjuzheng/c4', 'topic:yitiaobian'], href: 'cards.html?card=i3' },
      { title: '万历九年 · 清丈', keys: ['story:q1581'], href: 'qinli-play.html?story=q1581' },
    ],
  },
  {
    id: 'tumubao',
    title: '土木堡与北京保卫战',
    shortTitle: '土木堡',
    slots: [
      { title: '土木之变', keys: ['event:e1449'], href: 'timeline.html?event=e1449' },
      { title: '守不守北京', keys: ['decision:d1449', 'card:p3', 'chapter:tumubao'], href: 'decisions.html#d1449' },
      { title: '正统十四年 · 京师', keys: ['story:q1449'], href: 'qinli-play.html?story=q1449' },
    ],
  },
  {
    id: 'chongzhen',
    title: '崇祯',
    shortTitle: '崇祯',
    slots: [
      { title: '甲申之变，煤山', keys: ['event:e1644'], href: 'timeline.html?event=e1644' },
      { title: '崇祯十七年 · 煤山前夜', keys: ['story:q1644'], href: 'qinli-play.html?story=q1644' },
      { title: '崇祯', keys: ['chat:chongzhen', 'card:p6', 'chapter:chongzhen'], href: 'chat.html?figure=chongzhen' },
    ],
  },
],
researchUI: {
  title: '研读线索',
  related: '相关足迹',
  start: '开始追索',
  continue: '继续研读线索',
  switch: '切换线索',
  complete: '已形成第一轮判断',
  review: '回看证据链',
  echo: '已为「{title}」线索取证 · 查看线索',
  recorded: '已记录',
},
```

- [ ] **Step 4: 运行测试确认绿灯**

Run: `node --test --test-name-pattern='research' frontend/content.test.cjs`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/data.js frontend/content.test.cjs
git commit -m "个人研读线索（1/5）：定义三条线索与证据映射"
```

## Task 2: 统一存储、校验与记录函数

**Files:**
- Modify: `frontend/app.js:61-113`
- Test: `frontend/content.test.cjs`

- [ ] **Step 1: 增加存储 helper 测试**

在 `frontend/content.test.cjs` 增加：

```js
test('research storage starts explicitly, filters evidence and survives corrupt state', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function loadProgress()'), source.indexOf('  function chatState()'))
    + source.slice(source.indexOf('  /* ---------- 个人研读线索'), source.indexOf('  /* ---------- 结局图鉴'));
  const saved = {};
  const ctx = vm.createContext({
    data,
    PROGRESS_KEY: 'shimais-daming:progress:v1',
    localStorage: {
      getItem: () => saved.raw || null,
      setItem: (_, value) => { saved.raw = value; },
    },
    Date,
    document: { createElement: () => new Node('div'), querySelector: () => null, body: new Node('body') },
    el: (tag, cls, text) => new Node(tag, cls, text),
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  vm.runInContext(code, ctx);
  assert.equal(ctx.startResearchThread('yitiaobian'), true);
  assert.deepEqual(JSON.parse(saved.raw).research, {
    activeId: 'yitiaobian',
    byId: { yitiaobian: { evidence: [], updatedAt: JSON.parse(saved.raw).research.byId.yitiaobian.updatedAt } },
  });
  assert.equal(ctx.recordThreadEvidence('event:e1581').ok, true);
  assert.equal(ctx.recordThreadEvidence('event:e1581').repeated, true);
  assert.equal(ctx.recordThreadEvidence('event:missing').ok, false);
  assert.deepEqual(JSON.parse(saved.raw).research.byId.yitiaobian.evidence, ['event:e1581']);
  saved.raw = JSON.stringify({ research: { activeId: 'yitiaobian', byId: {
    yitiaobian: { evidence: ['event:e1581', 'event:e1581', 'event:missing', 42], updatedAt: 2 },
    tumubao: { evidence: ['event:e1449'], updatedAt: 3 },
  } } });
  assert.deepEqual(Array.from(ctx.activeResearch().entry.evidence), ['event:e1581']);
  assert.equal(ctx.startResearchThread('tumubao'), true);
  const switched = JSON.parse(saved.raw).research;
  assert.equal(switched.activeId, 'tumubao');
  assert.deepEqual(switched.byId.yitiaobian.evidence, ['event:e1581']);
  assert.deepEqual(switched.byId.tumubao.evidence, ['event:e1449']);
  saved.raw = JSON.stringify({ research: { activeId: 'missing', byId: 'broken' } });
  assert.equal(ctx.activeResearch(), null);
});

test('research record does not claim success when localStorage write fails', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function loadProgress()'), source.indexOf('  function chatState()'))
    + source.slice(source.indexOf('  /* ---------- 个人研读线索'), source.indexOf('  /* ---------- 结局图鉴'));
  let raw = JSON.stringify({ research: { activeId: 'yitiaobian', byId: { yitiaobian: { evidence: [], updatedAt: 1 } } } });
  const ctx = vm.createContext({
    data,
    PROGRESS_KEY: 'shimais-daming:progress:v1',
    localStorage: { getItem: () => raw, setItem: () => { throw new Error('quota'); } },
    Date,
    document: { createElement: () => new Node('div'), querySelector: () => null, body: new Node('body') },
    el: (tag, cls, text) => new Node(tag, cls, text),
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  vm.runInContext(code, ctx);
  assert.equal(ctx.recordThreadEvidence('event:e1581').ok, false);
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `node --test --test-name-pattern='research storage|research record' frontend/content.test.cjs`
Expected: FAIL，研读线索 helper 尚不存在。

- [ ] **Step 3: 实现写入口与研读线索 helper**

将 `updateProgress()` 中的写入抽为可返回结果的 `writeProgress()`，保持既有调用者行为：

```js
function writeProgress(p) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

function updateProgress(mutate) {
  const p = loadProgress();
  mutate(p);
  writeProgress(p);
  return p;
}
```

在 `updateProgress()` 后、结局图鉴 marker 前插入完整 helper：

```js
/* ---------- 个人研读线索：统一校验与记录，沿用 progress 单 key ---------- */

function normalizeResearch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const activeId = data.researchThreads.some((thread) => thread.id === value.activeId) ? value.activeId : null;
  const byId = {};
  if (value.byId && typeof value.byId === 'object' && !Array.isArray(value.byId)) {
    data.researchThreads.forEach((thread) => {
      const entry = value.byId[thread.id];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const valid = new Set(thread.slots.flatMap((slot) => slot.keys));
      const evidence = Array.isArray(entry.evidence)
        ? [...new Set(entry.evidence.filter((key) => typeof key === 'string' && valid.has(key)))]
        : [];
      byId[thread.id] = { evidence, updatedAt: Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0 };
    });
  }
  return activeId && byId[activeId] ? { activeId, byId } : null;
}

function researchThread(id) {
  return data.researchThreads.find((thread) => thread.id === id) || null;
}

function evidenceSlot(thread, key) {
  return thread ? thread.slots.findIndex((slot) => slot.keys.includes(key)) : -1;
}

function startResearchThread(id) {
  const thread = researchThread(id);
  if (!thread) return false;
  const p = loadProgress();
  const state = normalizeResearch(p.research) || { byId: {} };
  if (!state.byId[id]) state.byId[id] = { evidence: [], updatedAt: 0 };
  state.activeId = id;
  state.byId[id].updatedAt = Date.now();
  p.research = state;
  return writeProgress(p);
}

function researchFootprintCount(thread) {
  const p = loadProgress();
  const read = p.timeline && Array.isArray(p.timeline.read) ? p.timeline.read : [];
  const decisions = p.decisions && Array.isArray(p.decisions.done) ? p.decisions.done : [];
  const stories = p.qinli && Array.isArray(p.qinli.done) ? p.qinli.done : [];
  const cards = p.cards && Array.isArray(p.cards.opened) ? p.cards.opened : [];
  const known = new Set([
    ...read.map((id) => 'event:' + id),
    ...decisions.map((id) => 'decision:' + id),
    ...stories.map((id) => 'story:' + id),
    ...cards.map((id) => 'card:' + id),
  ]);
  return thread.slots.filter((slot) => slot.keys.some((key) => known.has(key))).length;
}

function activeResearch() {
  const state = normalizeResearch(loadProgress().research);
  if (!state) return null;
  const thread = researchThread(state.activeId);
  const entry = state.byId[state.activeId];
  if (!thread || !entry) return null;
  const filled = thread.slots.map((slot) => slot.keys.some((key) => entry.evidence.includes(key)));
  return { thread, entry, filled, complete: filled.every(Boolean) };
}

function showResearchEcho(thread, repeated) {
  let echo = document.querySelector('.research-echo');
  if (!echo) {
    echo = el('div', 'research-echo');
    echo.setAttribute('role', 'status');
    echo.setAttribute('aria-live', 'polite');
    document.body.appendChild(echo);
  }
  echo.replaceChildren();
  echo.appendChild(el('span', 'research-echo-text', repeated ? data.researchUI.recorded : data.researchUI.echo.replace('{title}', thread.shortTitle)));
  if (!repeated) {
    const link = el('a', 'research-echo-link', '查看线索');
    link.href = 'profile.html';
    echo.appendChild(link);
  }
  echo.hidden = false;
  clearTimeout(showResearchEcho.timer);
  showResearchEcho.timer = setTimeout(() => { echo.hidden = true; }, 4000);
}

function recordThreadEvidence(key) {
  const current = activeResearch();
  if (!current || typeof key !== 'string') return { ok: false };
  const slot = evidenceSlot(current.thread, key);
  if (slot < 0) return { ok: false };
  const repeated = current.entry.evidence.includes(key);
  if (repeated) {
    showResearchEcho(current.thread, true);
    return { ok: true, repeated: true, slot };
  }
  const p = loadProgress();
  const state = normalizeResearch(p.research);
  if (!state) return { ok: false };
  const entry = state.byId[state.activeId];
  entry.evidence.push(key);
  entry.updatedAt = Date.now();
  p.research = state;
  if (!writeProgress(p)) return { ok: false };
  showResearchEcho(current.thread, false);
  return { ok: true, repeated: false, slot };
}
```

- [ ] **Step 4: 运行测试确认绿灯**

Run: `node --test --test-name-pattern='research storage|research record' frontend/content.test.cjs`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/app.js frontend/content.test.cjs
git commit -m "个人研读线索（2/5）：统一存储校验与证据记录"
```

## Task 3: 接入既有行为入口

**Files:**
- Modify: `frontend/app.js`
- Test: `frontend/browser-tests.html`

- [ ] **Step 1: 增加浏览器失败测试**

在 `frontend/browser-tests.html` 末尾、结果汇总前加入以下完整测试。所有进度 fixture 都是用户已经明确开始过的线索，不测试自动启动。

```js
const researchFixture = (activeId, evidence = []) => ({
  research: { activeId, byId: { [activeId]: { evidence, updatedAt: 1 } } },
});
const researchEvidence = (t, activeId) => JSON.parse(t.store.get('shimais-daming:progress:v1')).research.byId[activeId].evidence;

await test('研读线索：时间线事件取证、去重并显示轻量回声', async () => {
  const t = await setup('timeline', { progress: researchFixture('yitiaobian') });
  try {
    const event = t.d.querySelector('.tl-event[data-id="e1581"]');
    assert(event, '缺少一条鞭法时间线事件');
    event.querySelector('.tl-row, button, .tl-head').click();
    await tick();
    assert(researchEvidence(t, 'yitiaobian').includes('event:e1581'), '展开事件未取证');
    assert(t.d.querySelector('.research-echo-text').textContent.includes('已为「一条鞭法」线索取证'), '新证据未显示回声');
    const saved = t.store.get('shimais-daming:progress:v1');
    event.querySelector('.tl-row, button, .tl-head').click();
    await tick();
    assert.equal(t.d.querySelector('.research-echo-text').textContent, '已记录', '重复证据提示错误');
    assert.equal(t.store.get('shimais-daming:progress:v1'), saved, '重复证据重复写入');
    assert.equal(researchEvidence(t, 'yitiaobian').filter(k => k === 'event:e1581').length, 1, '证据未去重');
  } finally { t.close(); }
});

await test('研读线索：决策选择取证', async () => {
  const t = await setup('decisions', { progress: researchFixture('tumubao') });
  try {
    t.d.querySelector('.dc-scenario[data-id="d1449"] .dc-choice').click();
    await tick();
    assert(researchEvidence(t, 'tumubao').includes('decision:d1449'), '决策未取证');
  } finally { t.close(); }
});

await test('研读线索：亲历完成取证且重复末场不重复写入', async () => {
  const t = await setup('qinli-play', { search: '?story=q1581', progress: researchFixture('yitiaobian') });
  try {
    for (let i = 0; i < 20 && !t.d.querySelector('.ql-ending'); i++) {
      const choice = t.d.querySelector('.ql-choice');
      assert(choice, '亲历无法继续');
      choice.click();
      await tick();
    }
    assert(t.d.querySelector('.ql-ending'), '亲历未通关');
    assert(researchEvidence(t, 'yitiaobian').includes('story:q1581'), '亲历完成未取证');
    const saved = t.store.get('shimais-daming:progress:v1');
    const replay = await setup('qinli-play', { search: '?story=q1581', progress: JSON.parse(saved) });
    try {
      await tick();
      assert.equal(replay.store.get('shimais-daming:progress:v1'), saved, '末场重算重复记录证据');
    } finally { replay.close(); }
  } finally { t.close(); }
});

await test('研读线索：制度卡打开取证', async () => {
  const t = await setup('cards', { progress: researchFixture('yitiaobian') });
  try {
    t.d.querySelector('.cw-card[data-card="i3"]').click();
    await tick();
    assert(researchEvidence(t, 'yitiaobian').includes('card:i3'), '制度卡打开未取证');
  } finally { t.close(); }
});

await test('研读线索：错题回看才取证，答错本身不取证', async () => {
  const progress = {
    ...researchFixture('yitiaobian'),
    quiz: { picks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], score: 0, dims: {} },
    quizWrong: ['q10'],
  };
  const t = await setup('quiz', { progress });
  try {
    assert(!t.store.get('shimais-daming:progress:v1').research.byId.yitiaobian.evidence.includes('review:zhangjuzheng/c4'), '答错直接取证');
    const review = t.d.querySelector('.qz-wrong-review');
    assert(review, '缺少错题回看链接');
    review.addEventListener('click', e => e.preventDefault());
    review.click();
    await tick();
    assert(researchEvidence(t, 'yitiaobian').includes('review:zhangjuzheng/c4'), '错题回看未取证');
  } finally { t.close(); }
});

await test('研读线索：画像错题回看取证', async () => {
  const t = await setup('profile', { progress: { ...researchFixture('yitiaobian'), quizWrong: ['q10'] } });
  try {
    const review = t.d.querySelector('.pf-wrong-link');
    assert(review, '画像缺少错题回看链接');
    review.addEventListener('click', e => e.preventDefault());
    review.click();
    await tick();
    assert(researchEvidence(t, 'yitiaobian').includes('review:zhangjuzheng/c4'), '画像错题回看未取证');
  } finally { t.close(); }
});

await test('研读线索：聊天成功回复取证且非当前响应不取证', async () => {
  const t = await setup('chat', { search: '?figure=chongzhen', progress: researchFixture('chongzhen') });
  try {
    const input = t.d.querySelector('textarea');
    input.value = '测试问题';
    t.d.querySelector('.ct-send').click();
    t.requests[0].resolve({ reply: '测试回答' });
    await tick();
    assert(researchEvidence(t, 'chongzhen').includes('chat:chongzhen'), '成功回复未取证');
    const saved = t.store.get('shimais-daming:progress:v1');
    const stale = await setup('chat', { search: '?figure=chongzhen', progress: JSON.parse(saved), ignoreAbort: true });
    try {
      const staleInput = stale.d.querySelector('textarea');
      staleInput.value = '旧会话问题';
      stale.d.querySelector('.ct-send').click();
      const restart = Array.from(stale.d.querySelectorAll('button')).find(b => b.textContent === '重开一轮');
      restart.click();
      stale.requests[1].resolve({ reply: '过期回答' });
      await tick();
      assert.equal(stale.store.get('shimais-daming:progress:v1'), saved, '过期回复写入了证据');
    } finally { stale.close(); }
  } finally { t.close(); }
});

await test('研读线索：进入章节取证', async () => {
  const t = await setup('chapter', { search: '?ch=tumubao', progress: researchFixture('tumubao') });
  try {
    assert(researchEvidence(t, 'tumubao').includes('chapter:tumubao'), '进入章节未取证');
  } finally { t.close(); }
});

await test('研读线索：专题题完整提交后取证，未提交不取证', async () => {
  const t = await setup('quiz', { search: '?topic=yitiaobian', progress: researchFixture('yitiaobian') });
  try {
    assert(!researchEvidence(t, 'yitiaobian').includes('topic:yitiaobian'), '进入专题未取证');
    t.d.querySelectorAll('.qz-topic-root .qz-item').forEach(item => item.querySelector('.qz-choice').click());
    t.d.querySelector('.qz-topic-root .qz-submit-btn').click();
    await tick();
    assert(researchEvidence(t, 'yitiaobian').includes('topic:yitiaobian'), '专题提交未取证');
  } finally { t.close(); }
});
```

- [ ] **Step 2: 运行浏览器测试确认红灯**

Run: `node tests/dbg-bt.js`
Expected: 新增研读线索测试失败，原 34 项保持通过。

- [ ] **Step 3: 接入记录函数**

在现有动作完成后追加调用，不改变原动作返回值与界面流程：

在 `markRead(id)` 中，`markLastRead("timeline", id);` 后追加。必须放在 `resolveLastRead()` 校验之后，非法 ID 不取证：

```js
recordThreadEvidence("event:" + id);
```

在 `renderDecisions()` 的选项 click 中，`updateProgress(...)` 后、`applyState(...)` 前追加：

```js
recordThreadEvidence("decision:" + sc.id);
```

在 `renderQinliPlay()` 的 `finishStory(id)` 中，`updateProgress(...)` 后追加：

```js
recordThreadEvidence("story:" + id);
```

人物与制度卡没有独立弹窗；现有卡片本体就是打开/研读入口。将 `renderCards()` 中现有的两个监听器替换为：

```js
card.addEventListener("click", () => {
  markLastRead("card", c.id);
  recordThreadEvidence("card:" + c.id);
});
card.addEventListener("focusin", () => {
  markLastRead("card", c.id);
  recordThreadEvidence("card:" + c.id);
});
```

深链卡片在 `hit` 已确认存在后，于 `markLastRead("card", wanted);` 后追加：

```js
recordThreadEvidence("card:" + wanted);
```

在 `renderQuiz()` 的 `appendReview(node, q)` 中，`node.appendChild(link);` 前追加。这里只接 `qz-review-link`，不接下方提交后错题区的重复链接：

```js
link.addEventListener("click", () => {
  if (q.sourceId) recordThreadEvidence("review:" + q.sourceId);
});
```

`renderProfile()` 的错题回看链接没有统一的来源映射，且第十题之外的链接也不属于本功能。仅在 `link.href === "search.html?source=zhangjuzheng%2Fc4"` 时追加：

```js
link.addEventListener("click", () => recordThreadEvidence("review:zhangjuzheng/c4"));
```

这样画像回看仍只走合法来源 ID，不从任意 URL 反推证据。

在 `renderChat()` 请求收尾处，`if (!isCurrentRequest()) return;` 之后、`if (reply != null)` 之前追加。离线剧本不算在线成功回复：

```js
if (reply != null && sentId === "chongzhen") recordThreadEvidence("chat:chongzhen");
```

在 `renderChapter()` 已通过 `selectedChapter()` 得到合法章节后，于 `const idx = data.chapters.indexOf(ch);` 后追加：

```js
recordThreadEvidence("chapter:" + ch.id);
```

在 `renderQuiz()` 专题提交回调中，`submitted = true;` 后立即追加。完整答案检查已经通过，未提交不会到达这里：

```js
if (topicQuestions) recordThreadEvidence("topic:yitiaobian");
```

- [ ] **Step 4: 运行浏览器测试确认绿灯**

Run: `node tests/dbg-bt.js`
Expected: 全部通过，新增断言确认证据 key 已去重写入。

- [ ] **Step 5: 提交**

```bash
git add frontend/app.js frontend/browser-tests.html
git commit -m "个人研读线索（3/5）：接入现有研读行为入口"
```

## Task 4: 画像、首页入口、回声与响应式样式

**Files:**
- Modify: `frontend/app.js:486-500,2382-2408`
- Modify: `frontend/styles.css`
- Test: `frontend/browser-tests.html`

- [ ] **Step 1: 扩展测试沙箱并增加画像与首页失败测试**

先在 `setup()` 的 localStorage mock 中支持写入失败，其他 key 不受影响：

```js
Object.defineProperty(w, 'localStorage', { value: {
  getItem: k => store.get(k) || null,
  setItem: (k, v) => {
    if (options.failProgressWrites && k === 'shimais-daming:progress:v1') throw new Error('quota');
    store.set(k, v);
  },
  removeItem: k => store.delete(k),
} });
```

然后在 `frontend/browser-tests.html` 末尾加入：

```js
await test('研读线索：画像未开始只读，显式开始后创建空证据链', async () => {
  const t = await setup('profile');
  try {
    assert.equal(t.d.querySelectorAll('.research-card').length, 3, '未开始应显示三张卡');
    assert.equal(t.store.size, 0, '未开始线索写入了存储');
    assert(t.d.querySelector('.research-footprint').textContent.includes('相关足迹'), '线索卡缺少相关足迹');
    t.d.querySelector('.research-start').click();
    const saved = JSON.parse(t.store.get('shimais-daming:progress:v1'));
    assert.equal(saved.research.activeId, 'yitiaobian');
    assert.deepEqual(saved.research.byId.yitiaobian.evidence, []);
    assert.equal(t.d.querySelectorAll('.research-slot').length, 3, '证据链不是三槽');
    assert.equal(t.d.querySelectorAll('.research-slot.is-filled').length, 0, '开始不应自动点亮证据');
  } finally { t.close(); }
});

await test('研读线索：完成态、恢复与切换保留各自证据', async () => {
  const initial = researchFixture('yitiaobian', ['event:e1581', 'card:i3', 'story:q1581']);
  const t = await setup('profile', { progress: initial });
  try {
    assert(t.d.querySelector('.research-complete').textContent === '已形成第一轮判断', '三槽未进入完成态');
    assert(t.d.querySelector('a[href="#research-yitiaobian"]'), '完成态缺少回看锚点');
    t.d.querySelector('.research-thread-choice').click();
    const saved = JSON.parse(t.store.get('shimais-daming:progress:v1'));
    assert.equal(saved.research.activeId, 'tumubao');
    assert.deepEqual(saved.research.byId.yitiaobian.evidence, ['event:e1581', 'card:i3', 'story:q1581']);
    assert.deepEqual(saved.research.byId.tumubao.evidence, []);
    const restored = await setup('profile', { progress: saved });
    try {
      assert.equal(restored.d.querySelector('.research-current-title').textContent, '土木堡与北京保卫战', '刷新未恢复当前线索');
      assert.equal(restored.d.querySelectorAll('.research-slot').length, 3);
    } finally { restored.close(); }
  } finally { t.close(); }
});

await test('研读线索：损坏数据按未开始渲染且不白屏不写入', async () => {
  for (const research of [null, [], { activeId: 'missing', byId: 'broken' }, { activeId: 'yitiaobian', byId: { yitiaobian: 'broken' } }]) {
    const t = await setup('profile', { progress: { research } });
    try {
      assert.equal(t.d.querySelectorAll('.research-card').length, 3, '损坏数据未按未开始渲染');
      assert(t.d.querySelector('.pf-content'), '损坏数据导致画像白屏');
      assert.equal(t.store.get('shimais-daming:progress:v1'), JSON.stringify({ research }), '只读渲染改写了损坏数据');
    } finally { t.close(); }
  }
});

await test('研读线索：首页仅在进行中线索下增加继续入口', async () => {
  const lastRead = { kind: 'timeline', id: 'e1581' };
  const active = await setup('index', { progress: { lastRead, ...researchFixture('yitiaobian') } });
  try {
    const resume = active.d.querySelector('.research-resume');
    assert(resume && resume.textContent === '继续研读线索' && resume.href === 'profile.html', '进行中线索缺少首页入口');
    assert(active.d.querySelector('a[href="timeline.html?event=e1581"]'), '原继续上次入口被改变');
  } finally { active.close(); }
  const complete = await setup('index', { progress: { lastRead, ...researchFixture('yitiaobian', ['event:e1581', 'card:i3', 'story:q1581']) } });
  try { assert(!complete.d.querySelector('.research-resume'), '完成态仍显示继续入口'); } finally { complete.close(); }
});

await test('研读线索：开始写入失败不显示假保存', async () => {
  const t = await setup('profile', { failProgressWrites: true });
  try {
    t.d.querySelector('.research-start').click();
    assert.equal(t.store.size, 0, '写入失败仍留下假存档');
    assert.equal(t.d.querySelectorAll('.research-card').length, 3, '写入失败仍伪装成已开始');
    assert(!t.d.querySelector('.research-echo'), '写入失败显示已记录回声');
  } finally { t.close(); }
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `node tests/dbg-bt.js`
Expected: 画像研读线索测试失败。

- [ ] **Step 3: 实现画像渲染**

在 `renderProfile()` 的研读足迹 section 前插入：

```js
function renderResearchSection() {
  const ui = data.researchUI;
  const section = el('section', 'pf-section research-section');
  section.appendChild(el('h2', 'section-title', ui.title));
  const current = activeResearch();
  if (!current) {
    const cards = el('div', 'research-cards');
    data.researchThreads.forEach((thread) => {
      const card = el('article', 'research-card');
      card.appendChild(el('h3', 'research-card-title', thread.title));
      card.appendChild(el('p', 'research-footprint', ui.related + ' ' + researchFootprintCount(thread) + '/3'));
      const start = el('button', 'cta-button research-start', ui.start);
      start.type = 'button';
      start.addEventListener('click', () => {
        if (startResearchThread(thread.id)) renderProfile();
      });
      card.appendChild(start);
      cards.appendChild(card);
    });
    section.appendChild(cards);
    return section;
  }
  section.id = 'research-' + current.thread.id;
  const head = el('div', 'research-head');
  head.appendChild(el('h3', 'research-current-title', current.thread.title));
  if (current.complete) head.appendChild(el('p', 'research-complete', ui.complete));
  section.appendChild(head);
  const chain = el('ol', 'research-chain');
  current.thread.slots.forEach((slot, i) => {
    const item = el('li', 'research-slot' + (current.filled[i] ? ' is-filled' : ''));
    item.appendChild(el('span', 'research-dot'));
    const link = el('a', 'research-slot-link', slot.title);
    link.href = slot.href;
    if (/^qinli(-play)?\.html/.test(slot.href)) { link.target = '_blank'; link.rel = 'noopener'; }
    item.appendChild(link);
    chain.appendChild(item);
  });
  section.appendChild(chain);
  if (current.complete) {
    const review = el('a', 'pf-link', ui.review);
    review.href = '#research-' + current.thread.id;
    section.appendChild(review);
  } else {
    const nextIndex = current.filled.findIndex((filled) => !filled);
    const next = current.thread.slots[nextIndex];
    const link = el('a', 'cta-button cta-gold', next.title);
    link.href = next.href;
    if (/^qinli(-play)?\.html/.test(next.href)) { link.target = '_blank'; link.rel = 'noopener'; }
    section.appendChild(link);
  }
  const switcher = el('div', 'research-switcher');
  switcher.appendChild(el('span', 'research-switch', ui.switch));
  data.researchThreads.filter((thread) => thread.id !== current.thread.id).forEach((thread) => {
    const button = el('button', 'pf-link research-thread-choice', thread.title);
    button.type = 'button';
    button.addEventListener('click', () => { if (startResearchThread(thread.id)) renderProfile(); });
    switcher.appendChild(button);
  });
  section.appendChild(switcher);
  return section;
}
```

在 `box.appendChild(resumeSection);` 后、研读足迹创建前调用 `box.appendChild(renderResearchSection());`。

首页 `topic-start` section 中，在原有 `if (last)` 块之后追加。保持“继续上次”原样，不要求必须先有 `lastRead`：

```js
const currentResearch = activeResearch();
if (currentResearch && !currentResearch.complete) {
  const threadLink = el("a", "topic-next research-resume", data.researchUI.continue);
  threadLink.href = "profile.html";
  start.appendChild(threadLink);
}
```

- [ ] **Step 4: 增加样式**

在 `frontend/styles.css` 末尾追加：

```css
.research-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.research-card { padding: 18px; border: 1px solid var(--line); background: var(--site-surface); }
.research-card-title { margin: 0 0 16px; font-family: var(--site-font); font-weight: 700; }
.research-chain { list-style: none; margin: 20px 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
.research-slot { position: relative; display: flex; align-items: center; gap: 10px; min-width: 0; }
.research-slot:not(:last-child)::after { content: ''; position: absolute; left: 18px; right: -18px; top: 5px; height: 1px; background: var(--line); }
.research-dot { position: relative; z-index: 1; width: 10px; height: 10px; flex: 0 0 10px; border: 1px solid var(--gold); border-radius: 50%; background: var(--site-bg); }
.research-slot.is-filled .research-dot { background: var(--gold); }
.research-slot-link { position: relative; z-index: 1; padding-right: 8px; background: var(--site-bg); color: var(--site-fg); }
.research-complete, .research-resume { color: var(--gold); }
.research-switcher { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
button.research-thread-choice { border: 0; background: none; cursor: pointer; }
.research-echo { position: fixed; z-index: 55; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; gap: 12px; align-items: center; max-width: calc(100vw - 32px); padding: 10px 14px; border: 1px solid var(--line); background: rgba(12, 10, 9, .96); color: var(--site-fg); }
.research-echo[hidden] { display: none; }
.research-echo-link { color: var(--gold); white-space: nowrap; }
@media (max-width: 640px) {
  .research-cards, .research-chain { grid-template-columns: 1fr; }
  .research-slot:not(:last-child)::after { left: 5px; right: auto; top: 10px; bottom: -18px; width: 1px; height: auto; }
  .research-echo { bottom: 12px; }
}
```

- [ ] **Step 5: 运行浏览器测试确认绿灯**

Run: `node tests/dbg-bt.js`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add frontend/app.js frontend/styles.css frontend/browser-tests.html
git commit -m "个人研读线索（4/5）：画像证据链与全站轻量回声"
```

## Task 5: 检索标记与最终验收

**Files:**
- Modify: `frontend/app.js:3447-3457`
- Test: `frontend/browser-tests.html`
- Create: `tests/verify-research.js`

- [ ] **Step 1: 增加检索标记测试**

先在 `frontend/content.test.cjs` 的 `searchPage()` VM 上下文中加入 `researchMarkerKey: () => null`，让原有纯检索测试继续独立于研读线索状态；标记行为由下方真实浏览器测试验证。

在 `frontend/browser-tests.html` 增加：

```js
await test('研读线索：检索只标记能补当前线索且尚未点亮的材料', async () => {
  const progress = researchFixture('yitiaobian', ['event:e1581']);
  const t = await setup('search', { progress });
  try {
    const material = { id: 'zhangjuzheng/c4', figure: 'zhangjuzheng', title: '一条鞭法', text: '赋役合并', source: '测试出处', kind: '现代转述', locator: '', edition: '', verification: '' };
    const unrelated = { id: 'chongzhen/c1', figure: 'chongzhen', title: '铜钱', text: '无关材料', source: '测试出处', kind: '现代转述', locator: '', edition: '', verification: '' };
    t.requests[0].resolve({ sources: [material, unrelated] });
    await tick();
    const input = t.d.querySelector('.sr-input');
    input.value = '一条鞭法';
    t.d.querySelector('.sr-form').dispatchEvent(new t.w.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    const card = Array.from(t.d.querySelectorAll('.sr-card')).find(n => n.textContent.includes('一条鞭法'));
    assert(card && card.querySelector('.research-marker'), '可补槽材料缺少标记');
    assert(!Array.from(t.d.querySelectorAll('.sr-card')).some(n => n.textContent.includes('铜钱') && n.querySelector('.research-marker')), '无关材料出现标记');
  } finally { t.close(); }
  const filled = await setup('search', { progress: researchFixture('yitiaobian', ['event:e1581', 'card:i3']) });
  try {
    filled.requests[0].resolve({ sources: [{ id: 'zhangjuzheng/c4', figure: 'zhangjuzheng', title: '一条鞭法', text: '赋役合并', source: '测试出处', kind: '现代转述', locator: '', edition: '', verification: '' }] });
    await tick();
    filled.d.querySelector('.sr-input').value = '一条鞭法';
    filled.d.querySelector('.sr-form').dispatchEvent(new filled.w.Event('submit', { bubbles: true, cancelable: true }));
    await tick();
    assert(!filled.d.querySelector('.research-marker'), '已点亮槽仍出现补全标记');
  } finally { filled.close(); }
});
```

- [ ] **Step 2: 运行测试确认红灯**

Run: `node tests/dbg-bt.js`
Expected: 检索标记测试失败。

- [ ] **Step 3: 实现标记 helper**

在研读线索 helper 区增加：

```js
function researchMarkerKey(entry) {
  if (entry.kind === 'timeline') return 'event:' + entry.id;
  if (entry.kind === 'source') return 'review:' + entry.id;
  return null;
}

function canFillResearchSlot(key) {
  const current = activeResearch();
  if (!current) return false;
  const slot = evidenceSlot(current.thread, key);
  return slot >= 0 && !current.filled[slot];
}
```

在检索结果 `title.appendChild(link);` / `title.textContent = e.title;` 之后、`card.appendChild(title);` 之前追加。标记不增加可见新文案，只复用“研读线索”作为无障碍名称：

```js
const markerKey = researchMarkerKey(e);
if (markerKey && canFillResearchSlot(markerKey)) {
  const marker = el("span", "research-marker");
  marker.setAttribute("aria-label", data.researchUI.title);
  marker.setAttribute("role", "img");
  title.appendChild(marker);
}
```

- [ ] **Step 4: 增加标记样式**

```css
.research-marker { display: inline-block; width: 6px; height: 6px; margin-left: 8px; vertical-align: middle; background: var(--gold); border-radius: 50%; }
```

- [ ] **Step 5: 创建布局验收脚本**

先在一个独立终端启动静态服务器（只服务 `frontend/`，不启动或停止真实后端）：

```bash
python -m http.server 4173 --directory frontend
```

创建 `tests/verify-research.js`：

```js
const { spawn } = require("child_process");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9250;
const BASE = "http://127.0.0.1:4173/";
const chrome = spawn(CHROME, [
  "--headless=new", "--no-first-run", "--disable-gpu",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${__dirname}/ud-research`,
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
async function nav(path) {
  await send("Page.navigate", { url: BASE + path });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#app') && document.querySelector('#app').children.length > 0`, path);
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
```

- [ ] **Step 6: 运行功能与布局验收**

```bash
node tests/dbg-bt.js
node tests/verify-research.js
node tests/verify9.js
node --test frontend/content.test.cjs
node tests/br/compare.mjs
python -m pytest -q
```

Expected: 全部通过；Python 保持 `38 passed, 112 subtests passed`，轮播保持 `13/13`。任何失败先修复再提交，不以旧结果代替本轮验收。

- [ ] **Step 7: 更新设计状态并提交**

将设计文档状态从“尚未实施”改为“已实施”，补充本计划文件链接与验收结果；不写研究问题文案。

```bash
git add frontend/app.js frontend/browser-tests.html frontend/styles.css tests/verify-research.js frontend/content.test.cjs docs/superpowers/specs/2026-11-24-personal-research-thread-design.md
git commit -m "个人研读线索（5/5）：检索标记与全量验收"
git push origin main
```

## Self-Review Coverage

- 三条定义、深链与合法证据：Task 1。
- 单 key、显式开始、去重、损坏数据、写入失败：Task 2。
- 事件、决策、亲历、错题回看、人物卡、聊天、章节、专题完成：Task 3。
- 画像、首页入口、回声、完成态、切换、恢复：Task 4。
- 检索标记、390px、reduced-motion、三套强制测试：Task 5。
- 不新增页面、后端、localStorage key、研究问题文案或发布动作：贯穿全部任务。
