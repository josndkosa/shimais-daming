const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = __dirname;
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8') + '\nthis.data = SITE_DATA; this.index = SEARCH_INDEX;', context);
const data = context.data;
const chatTier = (rounds) => (rounds < 5 ? '初见' : rounds < 15 ? '相熟' : '深谈');
const chapterNum = (n) => {
  const d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return d[n];
  if (n === 10) return '十';
  if (n < 20) return '十' + d[n % 10];
  return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
};
const figures = ['zhuyuanzhang', 'zhudi', 'yuqian', 'hairui', 'zhangjuzheng', 'chongzhen'];
const sources = new Set(figures.flatMap(figure => JSON.parse(fs.readFileSync(path.join(root, '../backend/data', figure + '.json'), 'utf8')).chunks.map(c => figure + '/' + c.id)));
function checkHref(href) {
  const url = new URL(href, 'https://local.test/');
  assert.equal(url.origin, 'https://local.test');
  const id = url.searchParams;
  if (url.pathname === '/timeline.html') assert.ok(data.timeline.events.some(e => e.id === id.get('event')));
  else if (url.pathname === '/cards.html') assert.ok(data.cards.some(c => c.id === id.get('card')));
  else if (url.pathname === '/qinli.html') assert.ok(data.qinli.some(s => s.id === id.get('story')));
  else if (url.pathname === '/qinli-play.html') assert.ok(data.qinli.some(s => s.playable && s.id === id.get('story')));
  else if (url.pathname === '/quiz.html') assert.equal(id.get('topic'), 'yitiaobian');
  else if (url.pathname === '/search.html') assert.ok(sources.has(id.get('source')), href);
  else if (url.pathname === '/chapter.html') assert.ok(data.chapters.some(c => c.id === id.get('ch')));
  else if (url.pathname === '/chat.html') assert.ok(data.chatFigures.some(f => f.id === id.get('figure')));
  else if (url.pathname === '/decisions.html') assert.ok(data.decisions.some(d => '#' + d.id === url.hash));
  else assert.fail('Unexpected destination: ' + href);
}
test('formal quiz preserves ten IDs, indexes and answer meanings', () => {
  assert.deepEqual(Array.from(data.quiz, q => q.id), Array.from({ length: 10 }, (_, i) => 'q' + (i + 1)));
  assert.deepEqual(Array.from(data.quiz, q => q.answer), [1, 1, 2, 1, 0, 1, 2, 0, 2, 1]);
  assert.deepEqual(Array.from(data.quiz, q => q.options[q.answer]), ['1380', '1405', '福建月港', '1619', '英宗', '于谦', '张居正', '内阁票拟＋司礼监批红', '皇帝本人', '赋役合并、按亩折银征收']);
});
test('formal quiz fields and all 107 search entries remain unchanged', () => {
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(data.quiz.length, 10);
  assert.equal(digest(data.quiz.map(({ stem, options, answer, dim }) => ({ stem, options, answer, dim }))), '4cbac0f4167d64021084d9d54282f5e1d0075a8ee84512563366c3d3a1e98fbf');
  assert.equal(context.index.length, 107);
  assert.equal(digest(context.index.slice(0, 99)), 'e04a192923861f187ae95708feda6ee369a39d579018df6c43c941ff2c79311c');
  assert.equal(digest(context.index), '6ea9a537b23c5c3207f8959aad15d00181d6ee827f524cfdb25ade9dcc047db5');
});
test('topic connects five exact destinations and two sourced questions', () => {
  assert.ok(data.topic, 'topic path is missing');
  assert.equal(data.topic.id, 'yitiaobian');
  assert.deepEqual(Array.from(data.topic.steps, s => s.href), ['timeline.html?event=e1581', 'cards.html?card=i3', 'qinli-play.html?story=q1581', 'quiz.html?topic=yitiaobian', 'search.html?source=zhangjuzheng%2Fc4']);
  data.topic.steps.forEach(s => { assert.ok(s.label && s.goal); checkHref(s.href); });
  assert.equal(data.topicQuiz.length, 2);
  assert.equal(data.topicQuiz[0].stem, data.quiz[9].stem);
  assert.equal(data.topicQuiz[0].answer, data.quiz[9].answer);
  assert.match(data.topicQuiz[1].stem, /不变/);
  data.topicQuiz.forEach(q => {
    assert.equal(q.options.length, 4);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
    assert.equal(q.sourceId, 'zhangjuzheng/c4');
    assert.ok(q.id && q.dim && q.explain);
    checkHref(q.reviewHref);
  });
});
test('each formal wrong answer has an exact review target', () => data.quiz.forEach(q => checkHref(q.reviewHref)));
test('all stories have material followups, mechanism reviews and valid endings', () => {
  data.qinli.forEach(s => {
    assert.ok(s.followups && s.followups.length, s.id + ' followups missing');
    s.followups.forEach(l => { assert.ok(l.label); checkHref(l.href); });
    assert.match(s.followups[0].href, /^search\.html\?source=/);
    assert.ok(s.review, s.id + ' review missing');
    const ids = new Set(s.endings.map(e => e.id));
    assert.equal(ids.size, s.endings.length);
    s.scenes.forEach(sc => sc.choices.forEach(c => { if (c.ending) assert.ok(ids.has(c.ending), s.id + '/' + c.ending); }));
  });
  assert.match(data.qinliUI.mechanismNote, /游戏推演.*非史学测量/);
});
test('content labels disclose unchecked quotations and correct elapsed years', () => {
  assert.doesNotMatch(data.hero.questionNote, /五个模块/);
  data.cards.filter(c => c.quote).forEach(c => assert.match(c.quoteVerification, /待核/));
  const hongwu = data.qinli.find(s => s.id === 'q1380');
  assert.doesNotMatch(JSON.stringify(hongwu.scenes[5]), /十三年前/);
  assert.match(hongwu.scenes[3].choices[2].history, /对白.*非.*原句/);
  assert.doesNotMatch(data.cards.find(c => c.id === 'p3').comment, /靠人而非制度/);
  assert.match(data.footer.note, /后端.*模型/);
  assert.doesNotMatch(data.qinliUI.history, /史实对照/);
});
test('lastRead accepts only known kind/id, never an arbitrary URL or score mutation', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = app.slice(app.indexOf('  function markRead('), app.indexOf('  function chatState('));
  assert.match(code, /function markLastRead\(/, 'lastRead writer missing');
  assert.match(code, /function resolveLastRead\(/, 'lastRead whitelist missing');
  const progress = { quiz: { score: 9 }, qinli: { current: { prestige: 75, morale: 40 } } };
  const ctx = vm.createContext({ data, updateProgress: mutate => mutate(progress), recordThreadEvidence() {} });
  vm.runInContext(code, ctx);
  ctx.markLastRead('card', 'i3');
  assert.deepEqual(JSON.parse(JSON.stringify(progress.lastRead)), { kind: 'card', id: 'i3' });
  assert.equal(ctx.resolveLastRead(progress.lastRead).href, 'cards.html?card=i3');
  const before = JSON.stringify(progress);
  for (const [kind, id] of [['url', 'https://evil.test'], ['card', 'missing'], ['timeline', 'javascript:alert(1)']]) ctx.markLastRead(kind, id);
  assert.equal(JSON.stringify(progress), before);
  assert.equal(ctx.resolveLastRead({ href: 'https://evil.test' }), null);
  ctx.markRead('e1581');
  assert.equal(ctx.resolveLastRead(progress.lastRead).href, 'timeline.html?event=e1581');
  ctx.markLastRead('qinli', 'q1581');
  assert.equal(ctx.resolveLastRead(progress.lastRead).href, 'qinli-play.html?story=q1581');
  assert.equal(progress.quiz.score, 9);
  assert.equal(progress.qinli.current.prestige, 75);
  assert.equal(progress.qinli.current.morale, 40);
});
class Node {
  constructor(tag, className = '', text = '') {
    this.tag = tag; this.className = className; this.children = []; this.listeners = {}; this.textContent = text; this.hidden = false; this.value = ''; this.style = { setProperty(name, value) { this[name] = value; } }; this.dataset = {};
    this.classList = {
      add: (...names) => { this.className += ' ' + names.join(' '); },
      remove: (...names) => { this.className = this.className.split(' ').filter(n => !names.includes(n)).join(' '); },
      contains: (name) => this.className.split(' ').includes(name),
      toggle: (name, enabled) => { this.className = this.className.split(' ').filter(n => n !== name).concat(enabled ? [name] : []).join(' '); },
    };
  }
  querySelector(selector) { return walk(this, selector.slice(1))[0]; }
  querySelectorAll(selector) { return walk(this, selector.slice(1)); }
  scrollIntoView() {}
  focus() {}
  click() { this.listeners.click?.({ target: this }); }
  getBoundingClientRect() { return { top: 200, bottom: 258, left: 0, right: 100, width: 100, height: 58 }; }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  replaceChildren(...nodes) { this.children.forEach(n => { n.parentNode = null; }); this.children = nodes; nodes.forEach(n => { n.parentNode = this; }); this.textContent = ''; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); this.parentNode = null; }
  setAttribute(name, value) { this[name] = value; if (name === 'class') this.className = value; }
  getAttribute(name) { return name in this ? String(this[name]) : null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  set innerHTML(value) { throw new Error('Do not render materials as HTML: ' + value); }
}
function walk(node, className) { return [node, ...node.children.flatMap(n => walk(n, className))].filter(n => n.className.split(' ').includes(className)); }
function textOf(node) { return node.textContent + node.children.map(textOf).join(''); }
const CODEX_HELPERS = (() => { const s = fs.readFileSync(path.join(root, 'app.js'), 'utf8'); return s.slice(s.indexOf('  /* ---------- 结局图鉴：抵达即登记'), s.indexOf('  function readIds()')); })();
async function searchPage(sourceId, response) {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = appCode.slice(appCode.indexOf('  function renderSearch()'), appCode.indexOf('  /* ---------- 占位模块页'));
  const app = new Node('main');
  const requests = [];
  const ctx = vm.createContext({ data, SEARCH_INDEX: context.index, app, URL, URLSearchParams,
    location: { search: '?source=' + encodeURIComponent(sourceId) },
    document: { createTextNode: text => new Node('#text', '', text) },
    el: (tag, cls, text) => new Node(tag, cls, text),
    renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section', 'topic-path'),
    fetch: async url => { requests.push(url); if (response instanceof Error) throw response; return { ok: true, json: async () => response }; },
  });
  vm.runInContext(code + '\nrenderSearch();', ctx);
  await new Promise(resolve => setImmediate(resolve));
  return { app, requests };
}
test('search uses static canonical material, safe text, metadata and primary detail link', async () => {
  const material = { id: 'zhangjuzheng/c4', figure: 'zhangjuzheng', title: '一条鞭法', text: '<img src=x onerror=alert(1)>规范正文', source: '核验出处', kind: '现代转述', locator: '卷七十八', edition: '网页非校勘本', verification: '待核边界' };
  const { app, requests } = await searchPage(material.id, { sources: [material] });
  assert.deepEqual(requests, ['materials.json']);
  assert.match(textOf(app), /规范正文/);
  assert.match(textOf(app), /卷七十八/);
  assert.match(textOf(app), /待核边界/);
  const input = walk(app, 'sr-input')[0];
  input.value = '规范正文';
  walk(app, 'sr-form')[0].listeners.submit({ preventDefault() {} });
  const result = walk(app, 'sr-card')[0];
  assert.ok(result);
  assert.equal(walk(result, 'sr-detail-link')[0].href, 'search.html?source=zhangjuzheng%2Fc4');
  assert.match(textOf(result), /AI/);
});
test('search distinguishes missing IDs from material fetch failure', async () => {
  const missing = await searchPage('missing/c4', { sources: [] });
  assert.match(textOf(missing.app), /没有找到这个材料 ID/);
  const failed = await searchPage('zhangjuzheng/c4', new Error('offline'));
  assert.match(textOf(failed.app), /材料载入失败/);
  assert.ok(walk(failed.app, 'sr-retry').length);
});
test('topic path renders each current goal and next exact destination', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function buildTopicPath('), source.indexOf('  function chatState('));
  const ctx = vm.createContext({ data, el: (tag, cls, text) => new Node(tag, cls, text) });
  vm.runInContext(code, ctx);
  data.topic.steps.forEach((step, i) => {
    const section = ctx.buildTopicPath(step.href);
    assert.ok(textOf(section).includes(step.goal));
    assert.equal(walk(section, 'topic-link').filter(n => n['aria-current'] === 'step').length, 1);
    const next = walk(section, 'topic-next');
    if (i < data.topic.steps.length - 1) assert.equal(next[0].href, data.topic.steps[i + 1].href);
    else assert.equal(next.length, 0);
  });
});
test('profile recommends actual wrong-answer material and a deeper path for full score', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderProfile()'), source.indexOf('  /* ---------- 人物对话'));
  for (const perfect of [false, true]) {
    const app = new Node('main');
    const picks = Array.from(data.quiz, q => q.answer);
    if (!perfect) picks[9] = 0;
    const progress = { quiz: { score: perfect ? 10 : 9, picks }, qinli: { done: ['q1581', 'q1581', 'invalid'] } };
    const ctx = vm.createContext({ data, app, currentModule: { title: '画像' }, loadProgress: () => progress, readIds: () => [], resolveLastRead: () => null, loadChatMem: () => ({}), chatTier, activeResearch: () => null, researchFootprintCount: () => 0,
      el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), requestAnimationFrame: f => f(), window: { addEventListener() {} },
    });
    vm.runInContext(CODEX_HELPERS + code + '\nrenderProfile();', ctx);
    const links = walk(app, 'topic-next').concat(walk(app, 'cta-button'));
    if (perfect) assert.ok(links.some(a => a.href === 'quiz.html?topic=yitiaobian'));
    else assert.ok(links.some(a => a.href === data.quiz[9].reviewHref));
    assert.doesNotMatch(textOf(app), /最弱/);
    assert.match(textOf(app), /亲历完成1 \/ 6/);
  }
});
test('profile lists wrong-answer material from the latest submission and hides when clean', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderProfile()'), source.indexOf('  /* ---------- 人物对话'));
  const render = (progress) => {
    const app = new Node('main');
    const ctx = vm.createContext({ data, app, currentModule: { title: '画像' }, loadProgress: () => progress, readIds: () => [], resolveLastRead: () => null, loadChatMem: () => ({}), chatTier, activeResearch: () => null, researchFootprintCount: () => 0,
      el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), requestAnimationFrame: f => f(), window: { addEventListener() {} },
    });
    vm.runInContext(CODEX_HELPERS + code + '\nrenderProfile();', ctx);
    return app;
  };
  const ids = Array.from(data.quiz.slice(0, 3), q => q.id);
  const app = render({ quiz: { score: 7, picks: [] }, quizWrong: ids });
  const sec = walk(app, 'pf-wrong')[0];
  assert.ok(sec, 'wrong section missing');
  assert.equal(textOf(walk(sec, 'section-title')[0]), '待补史料');
  const rows = walk(sec, 'pf-wrong-row');
  assert.equal(rows.length, 3);
  rows.forEach((row, k) => {
    assert.equal(textOf(walk(row, 'pf-wrong-stem')[0]), data.quiz[k].stem);
    const link = walk(row, 'pf-wrong-link')[0];
    assert.equal(link.href, data.quiz[k].reviewHref);
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener');
    assert.equal(textOf(link), '回看 →');
  });
  assert.equal(walk(render({ quiz: { score: 10, picks: [] }, quizWrong: [] }), 'pf-wrong').length, 0);
  assert.equal(walk(render({}), 'pf-wrong').length, 0);
});
test('all story final-scene resumes preserve numbers and finish without applying effects again', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderQinli()'), source.indexOf('  function renderCards()'));
  for (const story of data.qinli) {
    const app = new Node('main');
    const progress = { qinli: { done: [], current: { storyId: story.id, sceneIndex: story.scenes.length, prestige: 80, morale: 45 } }, quiz: { score: 9 } };
    const ctx = vm.createContext({ data, app, URLSearchParams, location: { search: '?story=' + story.id }, reducedMotion: { matches: true },
      loadProgress: () => progress, updateProgress: f => f(progress), markLastRead() {}, recordThreadEvidence() {},
      el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'), window: { addEventListener() {} },
    });
    vm.runInContext(CODEX_HELPERS + code + '\nrenderQinliPlay();', ctx);
    assert.equal(progress.qinli.current, null, story.id);
    assert.deepEqual(Array.from(progress.qinli.done), [story.id]);
    assert.deepEqual(walk(app, 'ql-stat-val').map(n => n.textContent), ['80', '45']);
    assert.equal(progress.quiz.score, 9);
    assert.equal(walk(app, 'ql-choice').length, 0);
    assert.match(textOf(app), /游戏推演/);
    assert.ok(walk(app, 'cta-button').some(a => a.href === story.followups[0].href));
  }
});
const storyChats = {
  q1380: { label: '去跟朱元璋聊聊', href: 'chat.html?figure=zhuyuanzhang' },
  q1402: { label: '去跟朱棣聊聊', href: 'chat.html?figure=zhudi' },
  q1449: { label: '去跟于谦聊聊', href: 'chat.html?figure=yuqian' },
  q1548: { label: '去跟海瑞聊聊', href: 'chat.html?figure=hairui' },
  q1581: { label: '去跟张居正聊聊', href: 'chat.html?figure=zhangjuzheng' },
  q1644: { label: '去跟崇祯聊聊', href: 'chat.html?figure=chongzhen' },
};
function renderEnding(story, qinliUI = data.qinliUI) {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderQinli()'), source.indexOf('  function renderCards()'));
  const app = new Node('main');
  const progress = { qinli: { done: [], current: { storyId: story.id, sceneIndex: story.scenes.length, prestige: 80, morale: 45 } } };
  const ctx = vm.createContext({ data: { ...data, qinli: [story], qinliUI }, app, URLSearchParams, location: { search: '?story=' + story.id }, reducedMotion: { matches: true },
    loadProgress: () => progress, updateProgress: f => f(progress), markLastRead() {}, recordThreadEvidence() {},
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'), window: { addEventListener() {} },
  });
  vm.runInContext(CODEX_HELPERS + code + '\nrenderQinliPlay();', ctx);
  return app;
}
test('all six endings render the exact configured chat label and destination', () => {
  assert.equal(data.qinli.length, 6);
  for (const story of data.qinli) {
    assert.deepEqual(JSON.parse(JSON.stringify(story.chatLink || null)), storyChats[story.id], story.id);
    const app = renderEnding(story);
    const links = walk(app, 'ql-tochat');
    assert.equal(links.length, 1, story.id);
    assert.equal(links[0].textContent, storyChats[story.id].label);
    assert.equal(links[0].href, storyChats[story.id].href);
    assert.equal(walk(app, 'ql-again')[0].textContent, data.qinliUI.restart);
  }
});
test('ending without a configured chat uses qinliUI.toChat and Yu Qian', () => {
  const story = { ...data.qinli[0], chatLink: undefined };
  const link = walk(renderEnding(story, { ...data.qinliUI, toChat: '缺省聊天文案' }), 'ql-tochat')[0];
  assert.ok(link, 'missing default chat link');
  assert.equal(link.textContent, '缺省聊天文案');
  assert.equal(link.href, 'chat.html?figure=yuqian');
});
const cbdbUrls = {
  '于谦': 'https://newarchive.ihp.sinica.edu.tw/sncaccgi/sncacFtp?ACTION=TQ%2CsncacFtpqf%2CSN%3D011187%2C2nd%2Csearch_simple',
  '海瑞': 'https://newarchive.ihp.sinica.edu.tw/sncaccgi/sncacFtp?ACTION=TQ,sncacFtpqf,SN=015737,2nd,search_simple',
  '卢象升': 'https://newarchive.ihp.sinica.edu.tw/sncaccgi/sncacFtp?ACTION=TQ,sncacFtpqf,SN=006306,2nd,search_simple',
};
test('only the three requested people have verbatim CBDB URLs', () => {
  const people = [...data.cards, ...data.relations.emperors, ...data.relations.chiefs, ...data.relations.guests];
  const linked = people.filter(p => p.cbdbUrl);
  assert.deepEqual(linked.map(p => [p.name, p.cbdbUrl]), Object.entries(cbdbUrls));
});
test('CBDB links render beside person details with safe new-window attributes', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const app = new Node('main');
  const body = new Node('body');
  const ctx = vm.createContext({ data, app, currentModule: { title: '人物' }, URLSearchParams, location: { search: '' }, reducedMotion: { matches: true },
    loadProgress: () => ({}), updateProgress: f => f({}), markLastRead() {}, recordThreadEvidence() {}, requestAnimationFrame: f => f(),
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'),
    document: { body, createElementNS: (ns, tag) => new Node(tag), addEventListener() {} }, window: { addEventListener() {} },
  });
  vm.runInContext(source.slice(source.indexOf('  function renderCards()'), source.indexOf('  function quizState()')) + '\nrenderCards();', ctx);
  const cards = walk(app, 'cw-card');
  for (const [id, name] of [['p3', '于谦'], ['p4', '海瑞']]) {
    const card = cards.find(n => n.dataset.card === id);
    const link = walk(card, 'cbdb-link')[0];
    assert.ok(link, name + ' missing CBDB link');
    assert.equal(link.href, cbdbUrls[name]);
    assert.equal(link.textContent, 'CBDB 人物条目 ↗');
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener');
  }
  assert.equal(walk(app, 'cbdb-link').length, 2);
  app.replaceChildren();
  vm.runInContext(source.slice(source.indexOf('  function renderRelations()'), source.indexOf('  function renderSearch()')) + '\nrenderRelations();', ctx);
  const bar = walk(app, 'rl-bar').find(n => n['aria-label'].startsWith('卢象升 '));
  bar.listeners.click();
  const link = walk(body, 'cbdb-link')[0];
  assert.ok(link, '卢象升 missing CBDB link');
  assert.equal(link.href, cbdbUrls['卢象升']);
  assert.equal(link.textContent, 'CBDB 人物条目 ↗');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener');
  const other = walk(app, 'rl-bar').find(n => n['aria-label'].startsWith('于谦 '));
  other.listeners.click();
  assert.equal(walk(body, 'cbdb-link').length, 0, 'do not add an extra relation-card CBDB link');
});
test('static export matches the backend canonical material fields', () => {
  const exported = JSON.parse(fs.readFileSync(path.join(root, 'materials.json'), 'utf8')).sources;
  assert.equal(new Set(exported.map(s => s.id)).size, exported.length);
  assert.equal(exported.length, sources.size);
  for (const figure of figures) {
    const chunks = JSON.parse(fs.readFileSync(path.join(root, '../backend/data', figure + '.json'), 'utf8')).chunks;
    for (const c of chunks) {
      const s = exported.find(s => s.id === figure + '/' + c.id);
      assert.ok(s);
      for (const key of ['title', 'text', 'source', 'kind', 'locator', 'edition', 'verification', 'url']) if (c[key]) assert.equal(s[key], c[key]);
    }
  }
});
test('every story ships a cover image matching its id', () => {
  assert.equal(data.qinli.length, 6);
  for (const s of data.qinli) {
    assert.equal(s.cover, 'images/qinli/' + s.id + '.jpg', s.id);
    assert.ok(fs.existsSync(path.join(root, s.cover)), s.cover + ' missing from repo');
  }
});
test('every figure carries two deep questions and a personal story link', () => {
  assert.equal(data.chatFigures.length, 6);
  for (const f of data.chatFigures) {
    assert.ok(Array.isArray(f.deepQuestions) && f.deepQuestions.length === 2, f.id + ' deep questions');
    f.deepQuestions.forEach(q => assert.ok(typeof q === 'string' && q.trim()));
    assert.ok(data.qinli.some(s => s.id === f.qinliStory), f.id + ' story mapping');
  }
  assert.deepEqual(Array.from(data.chatFigures, f => f.qinliStory), ['q1380', 'q1402', 'q1449', 'q1548', 'q1581', 'q1644']);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /shimais-daming:chatmem:v1/, 'chat memory key missing');
});
test('topic c4 has explicit kind, location, edition and verification limits', () => {
  const c4 = JSON.parse(fs.readFileSync(path.join(root, '../backend/data/zhangjuzheng.json'), 'utf8')).chunks.find(c => c.id === 'c4');
  for (const key of ['kind', 'locator', 'edition', 'verification']) assert.ok(c4[key], key + ' missing');
  assert.equal(data.cards.find(c => c.id === 'i3').sourceId, 'zhangjuzheng/c4');
  assert.equal(data.timeline.events.find(e => e.id === 'e1581').sourceId, 'zhangjuzheng/c4');
});
const territoryExpected = [
  { id: '1368', year: 1368, label: '立国', range: [1368, 1406], show: ['liaodong-full', 'north-early', 'jimi', 'nuergan', 'yunnan-contested'] },
  { id: '1420', year: 1420, label: '交趾在版图', range: [1407, 1448], show: ['jiaozhi', 'liaodong-full', 'north-early', 'jimi', 'nuergan'] },
  { id: '1450', year: 1450, label: '土木堡之后', range: [1449, 1580], show: ['liaodong-full', 'north-late', 'jimi', 'nuergan'] },
  { id: '1581', year: 1581, label: '晚明格局', range: [1581, 1618], show: ['liaodong-full', 'north-late', 'jimi', 'nuergan'] },
  { id: '1620', year: 1620, label: '萨尔浒之后', range: [1619, 1643], show: ['liaodong-shrunk', 'north-late', 'jimi'] },
  { id: '1644', year: 1644, label: '落幕', range: [1644, 1644], show: ['north-late'] },
];
test('territory states cover every year exactly once with the specified overlays', () => {
  assert.ok(data.territory, 'territory data missing');
  assert.equal(data.territory.states.length, 6);
  assert.deepEqual(JSON.parse(JSON.stringify(data.territory.states.map(({ id, year, label, range, show }) => ({ id, year, label, range, show })))), territoryExpected);
  data.territory.states.forEach(s => assert.ok(typeof s.note === 'string' && s.note.trim()));
  for (let year = 1368; year <= 1644; year++) {
    assert.equal(data.territory.states.filter(s => s.range[0] <= year && year <= s.range[1]).length, 1, String(year));
  }
  assert.equal(data.territory.disclaimer, '本图为疆域大势示意，非精确疆界；具体疆界以《中国历史地图集》为准。');
  assert.equal(data.territory.legend, '实色为布政司实控，斜线为羁縻名义统辖。');
});
test('research threads define three canonical IDs, exact questions, three slots and valid destinations', () => {
  assert.deepEqual(Array.from(data.researchThreads, t => t.id), ['yitiaobian', 'tumubao', 'chongzhen']);
  assert.deepEqual(Array.from(data.researchThreads, t => t.title), ['一条鞭法：从赋役合并到农户成本', '土木堡与北京保卫战', '崇祯']);
  assert.deepEqual(Array.from(data.researchThreads, t => t.question), [
    '一条鞭法把赋役并成白银，为什么农户的实际负担反而可能更重？',
    '大军在土木堡覆没之后，北京凭什么守住了？',
    '崇祯勤政十七年，为什么还是没能挽回大明的颓势？',
  ]);
  for (const thread of data.researchThreads) {
    assert.equal(thread.slots.length, 3);
    for (const slot of thread.slots) {
      assert.ok(slot.title && slot.keys.length && slot.href);
      checkHref(slot.href);
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(data.researchThreads[0].slots.map(s => s.keys))), [
    ['event:e1581'],
    ['card:i3', 'review:zhangjuzheng/c4', 'topic:yitiaobian'],
    ['story:q1581'],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(data.researchThreads[1].slots.map(s => s.keys))), [
    ['event:e1449'],
    ['decision:d1449', 'card:p3', 'chapter:tumubao'],
    ['story:q1449'],
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(data.researchThreads[2].slots.map(s => s.keys))), [
    ['event:e1644'],
    ['story:q1644'],
    ['chat:chongzhen', 'card:p6', 'chapter:chongzhen'],
  ]);
  assert.deepEqual(Array.from(data.researchThreads.flatMap(t => t.slots.map(s => s.title))), [
    '一条鞭法推行全国', '一条鞭法与白银财政', '万历九年 · 清丈',
    '土木之变', '守不守北京', '正统十四年 · 京师',
    '甲申之变，煤山', '崇祯十七年 · 煤山前夜', '崇祯',
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(data.researchUI)), {
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

test('territory addition leaves all existing site data and the 107 search entries unchanged', () => {
  const { territory, researchThreads, researchUI, ...existing } = data;
  assert.equal(createHash('sha256').update(JSON.stringify(existing)).digest('hex'), 'ffcf4ef985fe51175b035bc24ef8467812392509cacf229591ddb50f52fecc59');
  assert.equal(createHash('sha256').update(JSON.stringify(context.index.slice(0, 99))).digest('hex'), 'e04a192923861f187ae95708feda6ee369a39d579018df6c43c941ff2c79311c');
  assert.equal(createHash('sha256').update(JSON.stringify(context.index)).digest('hex'), '6ea9a537b23c5c3207f8959aad15d00181d6ee827f524cfdb25ade9dcc047db5');
});
function territoryFixture(siteData = data) {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'territory-map.js'), 'utf8') + '\nthis.geometry = TERRITORY_GEOMETRY;', ctx);
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderTerritory()'), source.indexOf('  function renderTimeline()'));
  const runtime = vm.createContext({ data: siteData, TERRITORY_GEOMETRY: ctx.geometry,
    el: (tag, cls, text) => new Node(tag, cls, text), document: { createElementNS: (ns, tag) => new Node(tag) },
    updateProgress: () => assert.fail('territory must not write progress'),
    localStorage: { setItem: () => assert.fail('territory must not write localStorage') },
  });
  vm.runInContext(code + '\nthis.section = renderTerritory();', runtime);
  return { section: runtime.section, geometry: ctx.geometry };
}
test('territory switches one SVG by layers and filters exact timeline deep links without writes', () => {
  const { section } = territoryFixture();
  const buttons = walk(section, 'tm-state');
  assert.equal(buttons.length, 6);
  assert.equal(walk(section, 'tm-map').length, 1);
  assert.equal(walk(section, 'tm-base').length, 1);
  data.territory.states.forEach((s, i) => {
    buttons[i].listeners.click();
    assert.deepEqual(walk(section, 'tm-layer').filter(n => n['aria-hidden'] === 'false').map(n => n['data-overlay']).sort(), Array.from(s.show).sort());
    assert.equal(buttons.filter(b => b['aria-pressed'] === 'true').length, 1);
    assert.equal(walk(section, 'tm-year')[0].textContent, String(s.year));
    assert.equal(walk(section, 'tm-note')[0].textContent, s.note);
    const expectedEvents = data.timeline.events.filter(e => s.range[0] <= Number(e.year) && Number(e.year) <= s.range[1]);
    assert.deepEqual(walk(section, 'tm-event-link').map(a => a.href), Array.from(expectedEvents, e => 'timeline.html?event=' + e.id));
    assert.deepEqual(walk(section, 'tm-event-link').map(a => textOf(a)), Array.from(expectedEvents, e => e.year + ' · ' + e.title));
    if (s.id === '1450') assert.ok(walk(section, 'tm-event-link').some(a => a.href.endsWith('e1449')) && walk(section, 'tm-event-link').some(a => a.href.endsWith('e1457')));
    if (s.id === '1620') assert.ok(walk(section, 'tm-event-link').some(a => a.href.endsWith('e1619')));
    assert.equal(walk(section, 'tm-map')[0].className.split(' ').includes('is-fallen'), s.id === '1644');
  });
});
test('timeline still opens deep links and preserves era context, while plain entry does not write progress', () => {
  const geo = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'territory-map.js'), 'utf8') + '\nthis.geometry = TERRITORY_GEOMETRY;', geo);
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderTerritory()'), source.indexOf('  function decisionState()'));
  for (const deepId of ['', 'e1457', 'e1619']) {
    const app = new Node('main');
    const writes = [];
    const nav = new Node('header');
    nav.offsetHeight = 58;
    const ctx = vm.createContext({ data, TERRITORY_GEOMETRY: geo.geometry, app, currentModule: { title: '时间线' }, URLSearchParams,
      location: { search: deepId ? '?event=' + deepId : '' }, readIds: () => writes, markRead: id => writes.push(id),
      el: (tag, cls, text) => { const node = new Node(tag, cls, text); node.offsetHeight = 50; return node; },
      renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'),
      document: { body: { scrollHeight: 2000 }, createElementNS: (ns, tag) => new Node(tag), querySelector: () => nav, documentElement: { style: { setProperty() {} } } },
      window: { addEventListener() {}, innerHeight: 800, scrollY: 0, scrollTo() {} }, requestAnimationFrame: f => f(), setTimeout: f => f(),
    });
    vm.runInContext(code + '\nrenderTimeline();', ctx);
    assert.equal(walk(app, 'tl-event').length, 23);
    assert.deepEqual(writes, deepId ? [deepId] : []);
    if (deepId) {
      const row = walk(app, 'tl-event').find(n => n.dataset.id === deepId);
      assert.equal(walk(row, 'tl-detail')[0].hidden, false);
      assert.equal(walk(row, 'tl-row')[0]['aria-expanded'], 'true');
      if (deepId === 'e1457') assert.match(textOf(walk(app, 'tl-context-line')[0]), /英宗/);
    }
  }
});
test('BD linkage: event expand silently switches territory; manual state highlights matching events; no loop, no scroll', () => {
  const geo = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'territory-map.js'), 'utf8') + '\nthis.geometry = TERRITORY_GEOMETRY;', geo);
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderTerritory()'), source.indexOf('  function decisionState()'));
  const app = new Node('main');
  const writes = []; const scrolls = [];
  const nav = new Node('header'); nav.offsetHeight = 58;
  const ctx = vm.createContext({ data, TERRITORY_GEOMETRY: geo.geometry, app, currentModule: { title: '时间线' }, URLSearchParams,
    location: { search: '' }, readIds: () => writes, markRead: id => writes.push(id),
    el: (tag, cls, text) => { const n = new Node(tag, cls, text); n.offsetHeight = 50; return n; },
    renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'),
    document: { body: { scrollHeight: 2000 }, createElementNS: (ns, tag) => new Node(tag), querySelector: () => nav, documentElement: { style: { setProperty() {} } } },
    window: { addEventListener() {}, innerHeight: 800, scrollY: 0, scrollTo: () => scrolls.push(1) }, requestAnimationFrame: f => f(), setTimeout: f => f(),
  });
  vm.runInContext(code + '\nrenderTimeline();', ctx);
  const section = walk(app, 'tm-section')[0];
  const link = section.territoryLink;
  assert.ok(link && typeof link.followEvent === 'function', 'territory must expose linkage bridge');
  const buttons = walk(section, 'tm-state');
  const note = walk(section, 'tm-link-note')[0];
  const rows = walk(app, 'tl-event');
  const inRange = (y, s) => s.range[0] <= y && y <= s.range[1];
  const clean = () => rows.forEach(r => assert.ok(!r.className.includes('tl-linked') && !r.className.includes('tl-dimmed'), r.dataset.id));
  buttons[1].listeners.click();
  const s1420 = data.territory.states[1];
  rows.forEach(r => { const ev = data.timeline.events.find(e => e.id === r.dataset.id); const hit = inRange(Number(ev.year), s1420);
    assert.equal(r.className.includes('tl-linked'), hit, ev.id); assert.equal(r.className.includes('tl-dimmed'), !hit, ev.id); });
  assert.equal(note.textContent, '正显示 交趾在版图 时段的事件'); assert.equal(note.hidden, false);
  assert.equal(scrolls.length, 0, 'manual switch must not scroll');
  buttons[1].listeners.click(); clean(); assert.equal(note.hidden, true);
  buttons[1].listeners.click();
  walk(section, 'tm-state-all')[0].listeners.click(); clean(); assert.equal(note.hidden, true);
  rows.find(r => r.dataset.id === 'e1449').querySelector('.tl-row').listeners.click();
  assert.equal(walk(section, 'tm-year')[0].textContent, '1450');
  assert.equal(note.textContent, '已随事件年份切换至 土木堡之后');
  clean();
  assert.equal(scrolls.length, 0, 'event follow must not scroll');
  rows.find(r => r.dataset.id === 'e1619').querySelector('.tl-row').listeners.click();
  rows.find(r => r.dataset.id === 'e1644').querySelector('.tl-row').listeners.click();
  assert.equal(walk(section, 'tm-year')[0].textContent, '1644');
  assert.equal(note.textContent, '已随事件年份切换至 落幕');
});
test('BD keeps timeline alive and clickable when territory data is missing', () => {
  const geo = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'territory-map.js'), 'utf8') + '\nthis.geometry = TERRITORY_GEOMETRY;', geo);
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderTerritory()'), source.indexOf('  function decisionState()'));
  const app = new Node('main');
  const warns = [];
  const nav = new Node('header'); nav.offsetHeight = 58;
  const ctx = vm.createContext({ data: { ...data, territory: undefined }, TERRITORY_GEOMETRY: geo.geometry, app, currentModule: { title: '时间线' }, URLSearchParams,
    location: { search: '' }, readIds: () => [], markRead: () => {},
    console: { warn: (...a) => warns.push(a.join(' ')) },
    el: (tag, cls, text) => { const n = new Node(tag, cls, text); n.offsetHeight = 50; return n; },
    renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'),
    document: { body: { scrollHeight: 2000 }, createElementNS: (ns, tag) => new Node(tag), querySelector: () => nav, documentElement: { style: { setProperty() {} } } },
    window: { addEventListener() {}, innerHeight: 800, scrollY: 0, scrollTo() {} }, requestAnimationFrame: f => f(), setTimeout: f => f(),
  });
  vm.runInContext(code + '\nrenderTimeline();', ctx);
  assert.equal(walk(app, 'tl-event').length, 23);
  assert.equal(walk(app, 'tm-section').length, 0, 'territory must not render when data missing');
  assert.ok(warns.some(w => w.includes('版图数据缺失或结构不合法')), 'expected isolation warning');
  const row = walk(app, 'tl-event').find(n => n.dataset.id === 'e1449');
  row.querySelector('.tl-row').listeners.click();
  assert.equal(walk(row, 'tl-detail')[0].hidden, false, 'event still expands without territory');
});
test('BE endings codex storage: reach records dedup under single progress key, totals 20', () => {
  assert.equal(data.qinli.reduce((n, s) => n + (s.endings || []).length, 0), 20);
  assert.deepEqual(Array.from(data.qinli, s => (s.endings || []).length), [3, 3, 3, 3, 4, 4]);
  const store = { v: null, k: null };
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const progSrc = src.slice(src.indexOf('  function loadProgress()'), src.indexOf('  /* ---------- 结局图鉴'));
  const ctx = vm.createContext({ data, PROGRESS_KEY: 'shimais-daming:progress:v1',
    localStorage: { getItem: () => store.v, setItem: (k, val) => { store.k = k; store.v = val; } },
  });
  vm.runInContext(progSrc + CODEX_HELPERS + '\nthis.api = { recordEnding, collectedEndingCount, totalEndingCount, qinliEndingsMap };', ctx);
  const api = ctx.api;
  assert.equal(api.totalEndingCount(), 20);
  assert.equal(api.collectedEndingCount(), 0);
  api.recordEnding('q1581', 'minren');
  api.recordEnding('q1581', 'minren');
  api.recordEnding('q1581', 'qingtian');
  assert.deepEqual(Array.from(api.qinliEndingsMap().q1581), ['minren', 'qingtian']);
  assert.equal(api.collectedEndingCount(), 2);
  assert.equal(store.k, 'shimais-daming:progress:v1', 'must reuse the single progress key');
  api.recordEnding('q1581', 'bogus');
  assert.equal(api.collectedEndingCount(), 2, 'unknown ending id not counted');
  store.v = JSON.stringify({ qinli: { done: ['q1380'] } });
  assert.equal(api.collectedEndingCount(), 0, 'old save without field collects nothing');
  assert.deepEqual(Array.from(Object.keys(api.qinliEndingsMap())), []);
});
test('BE list codex row lit/unknown/old-save and top total; profile collected line matches', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const listCode = source.slice(source.indexOf('  function renderQinli()'), source.indexOf('  function renderQinliPlay()'));
  const renderList = (progress) => {
    const app = new Node('main');
    const ctx = vm.createContext({ data, app, URLSearchParams, location: { search: '' }, loadProgress: () => progress, updateProgress: () => assert.fail('list read-only'),
      el: (t, c, x) => new Node(t, c, x), renderPageHead: () => new Node('header'), window: { addEventListener() {} }, setTimeout: () => {}, PROGRESS_KEY: 'k' });
    vm.runInContext(CODEX_HELPERS + listCode + '\nrenderQinli();', ctx);
    return app;
  };
  let app = renderList({});
  assert.equal(textOf(walk(app, 'ql-codex-count')[0]), '结局图鉴 0 / 20');
  assert.equal(walk(app, 'ql-codex-guide')[0].hidden, false);
  walk(app, 'ql-card').forEach((c, i) => {
    const cells = walk(c, 'ql-end-cell');
    assert.equal(cells.length, (data.qinli[i].endings || []).length);
    cells.forEach(x => { assert.equal(x.textContent, '？？？'); assert.ok(!x.className.includes('is-lit')); });
    assert.equal(walk(c, 'ql-codex-old')[0].hidden, true);
  });
  const e0 = data.qinli.find(s => s.id === 'q1581').endings[0];
  app = renderList({ qinliEndings: { q1581: [e0.id] }, qinli: { done: ['q1380', 'q1581'] } });
  assert.equal(textOf(walk(app, 'ql-codex-count')[0]), '结局图鉴 1 / 20');
  assert.equal(walk(app, 'ql-codex-guide')[0].hidden, true);
  const c581 = walk(app, 'ql-card').find(c => c.href.includes('q1581'));
  assert.equal(textOf(walk(c581, 'ql-codex-label')[0]), '结局 1/4');
  const lit = walk(c581, 'ql-end-cell').filter(x => x.className.includes('is-lit'));
  assert.equal(lit.length, 1);
  assert.equal(lit[0].textContent, e0.title);
  assert.equal(walk(c581, 'ql-codex-old')[0].hidden, true);
  const c380 = walk(app, 'ql-card').find(c => c.href.includes('q1380'));
  assert.equal(textOf(walk(c380, 'ql-codex-label')[0]), '结局 0/3');
  assert.equal(walk(c380, 'ql-codex-old')[0].hidden, false);
  assert.equal(textOf(walk(c380, 'ql-codex-old')[0]), '已通关 · 结局待收集');
  const un = walk(c581, 'ql-end-cell').find(x => !x.className.includes('is-lit'));
  const evt = { preventDefault() { this.pd = true; }, stopPropagation() {} };
  un.listeners.click(evt);
  assert.equal(evt.pd, true, 'unlit cell must block card navigation');
  assert.equal(un.textContent, '尚未抵达');
  const litEvt = { preventDefault() { this.pd = true; }, stopPropagation() {} };
  lit[0].listeners.click(litEvt);
  assert.equal(litEvt.pd, undefined, 'lit cell rides the card link to replay');
  const pcode = source.slice(source.indexOf('  function renderProfile()'), source.indexOf('  /* ---------- 人物对话'));
  const papp = new Node('main');
  const pctx = vm.createContext({ data, app: papp, currentModule: { title: '画像' }, loadProgress: () => ({ qinliEndings: { q1581: [e0.id] }, qinli: { done: ['q1581'] } }), readIds: () => [], resolveLastRead: () => null, loadChatMem: () => ({}), chatTier, activeResearch: () => null, researchFootprintCount: () => 0,
    el: (t, c, x) => new Node(t, c, x), renderPageHead: () => new Node('header'), requestAnimationFrame: f => f(), window: { addEventListener() {} } });
  vm.runInContext(CODEX_HELPERS + pcode + '\nrenderProfile();', pctx);
  assert.equal(textOf(walk(papp, 'pf-endings-line')[0]), '已收集结局 1/20');
});
test('BH right scrollbar injected site-wide, layered under nav/popup, hidden when short', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(source.includes('function initSideScroll()'), 'init function missing');
  assert.ok(source.includes('if (!/browser-tests\\.html$/.test(location.pathname)) initSideScroll();'), 'must init on formal pages but not the test page');
  assert.ok(source.includes('requestAnimationFrame(update)'), 'scroll updates must be rAF-throttled');
  assert.ok(source.includes('setPointerCapture'), 'thumb drag must use pointer capture');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  ['.side-scroll {', '.side-scroll-thumb', '.side-scroll[hidden]', '.side-scroll.is-dragging'].forEach(sel => assert.ok(css.includes(sel), 'missing css ' + sel));
  assert.ok(!css.includes('.left-scroll'), 'old left naming must be gone');
  assert.ok(/\.side-scroll \{[\s\S]*?position: fixed;[\s\S]*?right: 0;[\s\S]*?height: 100dvh;[\s\S]*?width: 5px;[\s\S]*?z-index: 50;[\s\S]*?touch-action: none;/.test(css), 'bar pinned right with geometry/layering/touch-action');
  assert.ok(/\.side-scroll-thumb \{[\s\S]*?min-height: 40px;[\s\S]*?background: var\(--gold\);/.test(css), 'gold thumb with min height');
  assert.ok(/@media \(max-width: 480px\) \{[\s\S]*?\.side-scroll \{\s*width: 4px;/.test(css), 'narrow screens 4px');
  assert.ok(css.includes('scrollbar-width: none'), 'AZ native hiding must stay');
});
test('territory empty event state is explicit', () => {
  const { section } = territoryFixture({ ...data, timeline: { ...data.timeline, events: [] } });
  assert.match(textOf(section), /本站时间线暂无此段事件/);
});
test('territory geometry has independent geographic paths, labels and source attribution', () => {
  const { section, geometry } = territoryFixture();
  assert.equal(geometry.viewBox, '0 0 1000 820');
  assert.ok(geometry.base.length > 500, 'coastline must retain detail');
  assert.deepEqual(Array.from(geometry.overlays, o => o.id).sort(), ['jiaozhi', 'jimi', 'liaodong-full', 'liaodong-shrunk', 'north-early', 'north-late', 'nuergan', 'yunnan-contested'].sort());
  assert.ok(geometry.sources.length > 0);
  geometry.overlays.forEach(o => { assert.match(o.d, /^M/); assert.ok(o.d.length > 40); });
  for (const name of ['北京', '南京', '辽东', '山海关', '嘉峪关', '交趾', '乌斯藏', '奴儿干', '云南']) assert.ok(geometry.labels.some(l => l.text === name), name);
  geometry.labels.forEach(l => assert.ok(l.x >= 0 && l.x <= 1000 && l.y >= 0 && l.y <= 820));
  assert.equal(walk(section, 'tm-hatch-pattern').length, 1);
  const html = fs.readFileSync(path.join(root, 'timeline.html'), 'utf8');
  assert.ok(html.indexOf('territory-map.js') < html.indexOf('src="app.js"'));
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const timeline = source.slice(source.indexOf('  function renderTimeline()'), source.indexOf('  function decisionState()'));
  assert.ok(timeline.indexOf('renderTerritory()') < timeline.indexOf('const strip'));
  assert.match(timeline, /try\s*{[\s\S]*?renderTerritory\(\)[\s\S]*?}\s*catch/);
});
test('chapters array carries eight chapters with complete sections and nextSteps', () => {
  assert.ok(Array.isArray(data.chapters) && data.chapters.length === 8);
  assert.equal(data.chapter, undefined, 'old chapter field removed');
  assert.equal(data.chapterUI.next, undefined, 'old next field removed');
  assert.equal(data.chapterUI.series, '白话明史');
  assert.deepEqual(Array.from(data.chapters, c => c.id), ['hongwu', 'jingnan', 'tumubao', 'jiajing', 'zhangjuzheng', 'wanli', 'chongzhen', 'xuxiake']);
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  // AU 起 nextSteps 的亲历 href 改向播放页；正文红线钉 id/title/intro/sections，标签另有逐字断言
  const proseDigest = ({ id, title, intro, sections }) => digest({ id, title, intro, sections });
  assert.equal(proseDigest(data.chapters[0]), '61547ab13609376ca496d429ed139213439639c89dcc9398ef979a485de39c74', 'chapter one prose must stay verbatim');
  assert.equal(proseDigest(data.chapters[1]), 'eba8bff4d20db09787ff47ab43c8b2ecec48e0ba86ea40f207fece9b04ccbb19', 'chapter two prose must stay verbatim');
  assert.equal(proseDigest(data.chapters[2]), 'e0f9934d38d8871a0cc0de39d57b5aa9151f8eabe558ddc630ab311cf09d69f4', 'chapter three prose must stay verbatim');
  assert.equal(proseDigest(data.chapters[3]), 'f69e58d1517ba5977d6cfe28e5aecfedb8d354eaaa8820d1f69622c4572c62bd', 'chapter four prose must stay verbatim');
  assert.equal(proseDigest(data.chapters[4]), '6b24bad586e4da2ad302d23ca7cc201edf274f004e2bc77b7347195e323ab0a7', 'chapter five prose must stay verbatim');
  assert.equal(proseDigest(data.chapters[5]), 'd8212ca11024940842916080cac8c4f6f8cdb8d5775a555a3924625e63fbbac2', 'chapter six prose must stay verbatim');
  assert.equal(proseDigest(data.chapters[6]), 'a94e7ebe7796800c629a10d6b81d5d4907de4f8e8aeca90570138483de5ae396', 'chapter seven prose must stay verbatim');
  assert.equal(proseDigest(data.chapters[7]), '5f3b4114e4f4090d6693f9d974401e9b1c5cccfbbd552ebc4cb9ad7bcfed5361', 'finale prose must stay verbatim');
  const [c1, c2, c3, c4, c5, c6, c7, c8] = data.chapters;
  assert.equal(c1.title, '洪武朝');
  assert.equal(c2.title, '建文与靖难');
  assert.equal(c3.title, '土木堡与北京保卫战');
  assert.equal(c4.title, '嘉靖与海瑞');
  assert.equal(c5.title, '张居正');
  assert.equal(c6.title, '万历怠政');
  assert.equal(c7.title, '崇祯');
  assert.equal(c8.title, '徐霞客');
  const secCounts = [5, 5, 5, 5, 6, 6, 6, 5];
  [c1, c2, c3, c4, c5, c6, c7, c8].forEach((ch, ci) => {
    assert.ok(ch.intro && ch.intro.trim());
    assert.equal(ch.sections.length, secCounts[ci]);
    ch.sections.forEach(s => {
      assert.ok(s.title && s.title.trim());
      assert.ok(Array.isArray(s.paragraphs) && s.paragraphs.length > 0);
      s.paragraphs.forEach(p => assert.ok(typeof p === 'string' && p.trim().length > 0));
      assert.ok(s.sourceNote && s.sourceNote.trim());
    });
    assert.equal(ch.nextSteps.length, 3);
    ch.nextSteps.forEach(l => assert.ok(l.label && l.href));
  });
  assert.deepEqual(Array.from(c1.nextSteps, l => l.href), ['qinli-play.html?story=q1380', 'chat.html?figure=zhuyuanzhang', 'timeline.html?event=e1380']);
  assert.deepEqual(Array.from(c2.nextSteps, l => l.href), ['qinli-play.html?story=q1402', 'chat.html?figure=zhudi', 'timeline.html?event=e1402']);
  assert.deepEqual(Array.from(c3.nextSteps, l => l.href), ['qinli-play.html?story=q1449', 'chat.html?figure=yuqian', 'timeline.html?event=e1449']);
  assert.deepEqual(Array.from(c3.nextSteps, l => l.label), ['亲历《京师》', '跟于谦聊聊', '回看时间线 1449']);
  assert.deepEqual(Array.from(c4.nextSteps, l => l.href), ['qinli-play.html?story=q1548', 'chat.html?figure=hairui', 'timeline.html?event=e1566']);
  assert.deepEqual(Array.from(c4.nextSteps, l => l.label), ['亲历《首辅之局》', '跟海瑞聊聊', '回看时间线 1566']);
  assert.deepEqual(Array.from(c5.nextSteps, l => l.href), ['qinli-play.html?story=q1581', 'chat.html?figure=zhangjuzheng', 'timeline.html?event=e1582']);
  assert.deepEqual(Array.from(c5.nextSteps, l => l.label), ['亲历《清丈》', '跟张居正聊聊', '回看时间线 1582']);
  assert.deepEqual(Array.from(c6.nextSteps, l => l.href), ['qinli-play.html?story=q1644', 'timeline.html?event=e1619', 'timeline.html?event=e1627']);
  assert.deepEqual(Array.from(c6.nextSteps, l => l.label), ['亲历《煤山前夜》', '回看时间线 1619', '回看时间线 1627']);
  assert.deepEqual(Array.from(c7.nextSteps, l => l.href), ['qinli-play.html?story=q1644', 'chat.html?figure=chongzhen', 'timeline.html?event=e1644']);
  assert.deepEqual(Array.from(c7.nextSteps, l => l.label), ['亲历《煤山前夜》', '跟崇祯聊聊', '回看时间线 1644']);
  assert.equal(c7.sections.reduce((n, s) => n + s.paragraphs.length, 0), 25, 'chapter seven has 25 paragraphs');
  const text7 = c7.sections.map(s => s.title + s.paragraphs.join('')).join('');
  ['五十人次', '二十万两', '七千万两', '276 年', '五年复辽', '1641–1642 年松锦之战', '1628 年', '1630 年', '1643 年'].forEach(k => assert.ok(text7.includes(k), 'key figure missing: ' + k));
  ['遗诏', '东林党', '天灾'].forEach(w => assert.ok(!text7.includes(w), 'forbidden topic: ' + w));
  assert.equal(c6.sections.reduce((n, s) => n + s.paragraphs.length, 0), 12, 'chapter six has 12 paragraphs');
  assert.equal(c2.sections.some(s => s.sources), false, 'chapter two has no AJ slips this batch');
  assert.equal(c3.sections.some(s => s.sources), false, 'chapter three has no AJ slips this batch');
  assert.equal(c4.sections.some(s => s.sources), false, 'chapter four has no AJ slips this batch');
  assert.equal(c5.sections.some(s => s.sources), false, 'chapter five has no AJ slips this batch');
  assert.equal(c6.sections.some(s => s.sources), false, 'chapter six has no AJ slips this batch');
  assert.equal(c7.sections.some(s => s.sources), false, 'chapter seven has no AJ slips this batch');
  assert.equal(c8.sections.some(s => s.sources), false, 'chapter eight has no AJ slips this batch');
  assert.equal(c8.sections.reduce((n, s) => n + s.paragraphs.length, 0), 18, 'finale has 18 paragraphs');
  assert.deepEqual(Array.from(c8.nextSteps, l => l.href), ['relations.html', 'timeline.html?event=e1644', 'qinli-play.html?story=q1644']);
  const text8 = c8.sections.map(s => s.title + s.paragraphs.join('')).join('');
  ['十余省', '《明史》里没有他的传', '原稿有两百多万字', '现存约四十万字', '以耳目所亲见闻较确', '以性灵游，以躯命游，亘古以来，一人而已'].forEach(k => assert.ok(text8.includes(k), 'missing: ' + k));
  ['大丈夫当朝游碧海而暮宿苍梧', '五岳归来不看山，黄山归来不看岳'].forEach(w => assert.ok(!text8.includes(w), 'forbidden quote: ' + w));
  assert.ok(!/十[一二三四五六七八九]省/.test(text8), 'no specific province count');
  const text6 = c6.sections.map(s => s.title + s.paragraphs.join('')).join('');
  ['帝不能自由', '靠个人权威推进的改革，其寿命往往与改革者本人同步', '凭尔几路来，我只一路去', '民变与边患从此互为因果', '支撑了明朝最后六十年的财政——哪怕这数字从一开始就带着水分'].forEach(q => assert.ok(text6.includes(q), 'quote missing: ' + q));
  ['国本之争', '东林党争', '矿税监'].forEach(w => assert.ok(!text6.includes(w), 'forbidden topic: ' + w));
  const text2 = c2.sections.map(s => s.paragraphs.join('')).join('');
  ['1370', '1380', '1392', '1399', '1402', '1420', '1457', '五十五年', '洪武三十五年', '三百年'].forEach(n => assert.ok(text2.includes(n), 'key figure missing: ' + n));
  const text3 = c3.sections.map(s => s.paragraphs.join('')).join('');
  ['1421', '1435', '1449', '二十二万', '十九年', '1450', '1457'].forEach(n => assert.ok(text3.includes(n), 'key figure missing: ' + n));
  assert.ok(!JSON.stringify(c3).includes('石灰吟'), 'chapter three must not quote 石灰吟');
  const text4 = c4.sections.map(s => s.title + s.paragraphs.join('')).join('');
  ['1521', '三年', '百余', '二十余年', '1550', '八日', '1553', '1555', '1562', '1565', '1566', '二斤', '十九年'].forEach(n => assert.ok(text4.includes(n), 'key figure missing: ' + n));
  assert.ok(!JSON.stringify(c4).includes('盖天下之人不直陛下久矣'), 'chapter four must not quote the unverified line');
  const text5 = c5.sections.map(s => s.title + s.paragraphs.join('')).join('');
  ['1567', '1568', '十六年', '1573', '1578', '1581', '四百多万顷', '七百多万顷', '1577', '三十二人', '1582', '1588'].forEach(n => assert.ok(text5.includes(n), 'key figure missing: ' + n));
  assert.ok(!JSON.stringify(c5).includes('天下之事，不难于立法'), 'chapter five must not quote the unverified line');
  assert.equal(data.chapterUI.entryBtn, '开始试读');
  assert.equal(data.chapterUI.secondLink, '第二章 · 建文与靖难 →');
  assert.equal(data.chapterUI.thirdLink, '第三章 · 土木堡与北京保卫战 →');
  assert.equal(data.chapterUI.fourthLink, '第四章 · 嘉靖与海瑞 →');
  assert.equal(data.chapterUI.fifthLink, '第五章 · 张居正 →');
  assert.equal(data.chapterUI.sixthLink, '第六章 · 万历怠政 →');
  assert.equal(data.chapterUI.seventhLink, '第七章 · 崇祯 →');
  assert.equal(data.chapterUI.finaleLink, '终章 · 徐霞客 →');
});
test('chapter sections carry verbatim backend sources and render collapsed slips', () => {
  const chunks = JSON.parse(fs.readFileSync(path.join(root, '../backend/data/zhuyuanzhang.json'), 'utf8')).chunks;
  const byId = Object.fromEntries(chunks.map(c => [c.id, c]));
  assert.deepEqual(Array.from(data.chapters[0].sections, s => s.sources.length), [3, 1, 2, 2, 0]);
  assert.deepEqual(Array.from(data.chapters[0].sections, s => Array.from(s.sources, x => x.id)), [['c1', 'c2', 'c6'], ['c3'], ['c4', 'c5'], ['c7', 'c8'], []]);
  data.chapters[0].sections.forEach(s => s.sources.forEach(x => {
    assert.match(x.id, /^c[1-8]$/);
    assert.ok(typeof x.text === 'string' && x.text.trim());
    const orig = byId[x.id];
    assert.equal(x.title, orig.title);
    assert.equal(x.text, orig.text);
    assert.equal(x.source, orig.source);
  }));
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('  function renderChapter()');
  const code = source.slice(start, source.indexOf('  /* ----------', start + 10));
  const app = new Node('main');
  const ctx = vm.createContext({ data, app, currentModule: { title: '白话明史 · 洪武朝' },
    loadProgress: () => ({}), updateProgress: () => assert.fail('chapter sources must not write progress'), markLastRead() {}, recordThreadEvidence() {},
    location: { search: '' }, URLSearchParams, selectedChapter: () => data.chapters[0], chapterNum,
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    window: { addEventListener() {} },
  });
  vm.runInContext(code + '\nrenderChapter();', ctx);
  const slips = walk(app, 'ch-sources');
  assert.equal(slips.length, 4);
  assert.deepEqual(slips.map(n => n.tag), ['details', 'details', 'details', 'details']);
  assert.deepEqual(walk(app, 'ch-sources-summary').map(n => textOf(n)), ['本节史料（3 条）', '本节史料（1 条）', '本节史料（2 条）', '本节史料（2 条）']);
  assert.equal(walk(app, 'ch-slip').length, 8);
  const flat = data.chapters[0].sections.flatMap(s => s.sources);
  assert.deepEqual(walk(app, 'ch-slip-title').map(n => textOf(n)), Array.from(flat, x => x.title));
  assert.deepEqual(walk(app, 'ch-slip-text').map(n => textOf(n)), Array.from(flat, x => x.text));
  assert.deepEqual(walk(app, 'ch-slip-from').map(n => textOf(n)), Array.from(flat, x => '—— ' + x.source));
  walk(app, 'ch-section').forEach((sec, i) => {
    const tags = sec.children.map(n => n.className.split(' ')[0]);
    const at = tags.indexOf('ch-sources');
    if (i < 4) {
      assert.ok(at > tags.lastIndexOf('ch-p'));
      assert.equal(tags[at + 1], 'ch-source');
    } else {
      assert.equal(at, -1);
    }
  });
});
test('qinli content-area anchors open in a new tab; nav and in-page anchors do not', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const slice = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    assert.ok(start >= 0, startMarker + ' missing');
    return source.slice(start, endMarker ? source.indexOf(endMarker, start + 10) : undefined);
  };
  // 专题步骤与「下一步」：仅 qinli 一步带 target/rel
  const topicCode = slice('  function buildTopicPath(', '  function chatState()');
  const mkCtx = () => vm.createContext({ data, el: (tag, cls, text) => new Node(tag, cls, text) });
  const ctxA = mkCtx();
  vm.runInContext(topicCode + '\nthis.sec = buildTopicPath("cards.html?card=i3");', ctxA);
  const linksA = walk(ctxA.sec, 'topic-link');
  assert.equal(linksA.length, data.topic.steps.length);
  linksA.forEach((a, i) => {
    const isQinli = /^qinli(-play)?\.html/.test(data.topic.steps[i].href);
    assert.equal(a.target, isQinli ? '_blank' : undefined);
    assert.equal(a.rel, isQinli ? 'noopener' : undefined);
  });
  const nextA = walk(ctxA.sec, 'topic-next');
  assert.equal(nextA.length, 1);
  assert.ok(/^qinli(-play)?\.html/.test(nextA[0].href));
  assert.equal(nextA[0].target, '_blank');
  assert.equal(nextA[0].rel, 'noopener');
  const ctxB = mkCtx();
  vm.runInContext(topicCode + '\nthis.sec = buildTopicPath("qinli-play.html?story=q1581");', ctxB);
  const nextB = walk(ctxB.sec, 'topic-next');
  assert.equal(nextB.length, 1);
  assert.ok(!nextB[0].href.startsWith('qinli.html'));
  assert.equal(nextB[0].target, undefined);
  // 章末下一步：亲历链接带 target/rel，另两条不带
  const chCode = slice('  function renderChapter()', '  /* ----------');
  const app = new Node('main');
  const chCtx = vm.createContext({ data, app, currentModule: { title: '白话明史 · 洪武朝' },
    location: { search: '' }, URLSearchParams, selectedChapter: () => data.chapters[0], chapterNum,
    loadProgress: () => ({}), updateProgress: () => assert.fail('no writes'), markLastRead() {}, recordThreadEvidence() {},
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    window: { addEventListener() {} },
  });
  vm.runInContext(chCode + '\nrenderChapter();', chCtx);
  const chNext = walk(app, 'ch-next-link');
  assert.equal(chNext.length, 3);
  assert.equal(chNext[0].target, '_blank');
  assert.equal(chNext[0].rel, 'noopener');
  assert.equal(chNext[1].target, undefined);
  assert.equal(chNext[2].target, undefined);
  // 其余调用点：href 赋值后必须紧跟 target/rel（无条件或按 qinli 前缀条件）
  const lines = source.split(/\r?\n/);
  const guarded = [
    ['resume.href = last.href;', 'resume.target = "_blank"'],
    ['begin.href = data.topic.steps[0].href;', 'begin.target = "_blank"'],
    ['const a = el("a", "entry-block");', 'a.target = "_blank"'],
    ['entryLink.href = "qinli.html";', 'entryLink.target = "_blank"'],
    ['link.href = last.href;', 'link.target = "_blank"'],
    ['qlLink.href = currentStory ? currentStory.href : "qinli.html";', 'qlLink.target = "_blank"'],
    ['qinliLink.href = "qinli-play.html?story=" + storyId;', 'qinliLink.target = "_blank"'],
  ];
  guarded.forEach(([marker, targetLine]) => {
    const hits = lines.map((l, i) => l.includes(marker) ? i : -1).filter(i => i >= 0);
    assert.ok(hits.length >= 1, marker + ' missing');
    hits.forEach(i => {
      const window = lines.slice(i + 1, i + 3).join('\n');
      assert.ok(window.includes(targetLine), marker + ' not followed by target');
      assert.ok(window.includes('rel = "noopener"'), marker + ' not followed by rel');
    });
  });
  // 导航与亲历页内不新开标签
  const navCode = slice('  function renderNav()', '  /* ----------');
  assert.ok(!navCode.includes('.target = "_blank"'), 'nav must stay same-tab');
  assert.ok(navCode.includes('page: "qinli.html"'), 'qinli nav item missing');
  const qlCode = slice('  function renderQinli()', '  /* ----------');
  assert.ok(!qlCode.includes('.target = "_blank"'), 'qinli in-page must stay same-tab');
});
test('formal quiz allows re-picks before submit, locks after, and retakes', () => {
  assert.equal(data.quizUI.retakeLabel, '重新作答');
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderQuiz()'), source.indexOf('  /* ---------- 研读画像'));
  const progress = {};
  const app = new Node('main');
  const ctx = vm.createContext({ data, app, currentModule: { title: '小测' },
    loadProgress: () => progress, updateProgress: f => f(progress), recordThreadEvidence() {},
    quizState: () => { const q = progress.quiz && typeof progress.quiz === 'object' ? progress.quiz : {}; return { picks: Array.isArray(q.picks) ? q.picks : [], submitted: typeof q.score === 'number' }; },
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    buildTopicPath: () => new Node('section'), CHAT_API_BASE: null,
    location: { search: '' }, URLSearchParams, reducedMotion: { matches: true },
    requestAnimationFrame: f => f(), window: { addEventListener() {} },
  });
  vm.runInContext(code + '\nrenderQuiz();', ctx);
  const formalRoot = walk(app, 'qz-formal-root')[0];
  const items = walk(formalRoot, 'qz-item');
  assert.equal(items.length, 10);
  const choicesOf = (item) => walk(item, 'qz-choice');
  const c0 = choicesOf(items[0]);
  c0[0].click(); c0[1].click(); c0[2].click();
  assert.equal(progress.quiz.picks[0], 2, 're-picks must replace');
  assert.ok(c0[2].className.includes('is-picked'));
  assert.ok(c0.every(b => !b.disabled), 'choices stay enabled before submit');
  assert.equal(walk(items[0], 'qz-explain')[0].hidden, true, 'no reveal before submit');
  items.forEach((item, i) => choicesOf(item)[data.quiz[i].answer].click());
  walk(formalRoot, 'qz-submit-btn')[0].click();
  assert.equal(progress.quiz.score, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(progress.quizWrong)), [], 'all-correct clears wrong list');
  assert.equal(walk(formalRoot, 'qz-wrong-empty').length, 1);
  assert.equal(textOf(walk(formalRoot, 'qz-wrong-empty')[0]), '全对，无待补史料。');
  assert.equal(walk(formalRoot, 'qz-wrong-item').length, 0);
  const picked = choicesOf(items[0])[data.quiz[0].answer];
  assert.ok(picked.disabled && picked.className.includes('is-correct'), 'locked + judged after submit');
  assert.equal(walk(items[0], 'qz-explain')[0].hidden, false);
  choicesOf(items[0])[0].click();
  assert.equal(progress.quiz.picks[0], data.quiz[0].answer, 'no re-pick after submit');
  const retake = walk(app, 'qz-retake')[0];
  assert.equal(textOf(retake), '重新作答');
  retake.click();
  assert.deepEqual(JSON.parse(JSON.stringify(progress.quiz)), { picks: [] }, 'retake clears picks and score');
  assert.equal(walk(app, 'qz-result').length, 0);
  assert.ok(choicesOf(items[0]).every(b => !b.disabled && !b.className.includes('is-picked')));
  items.forEach((item, i) => choicesOf(item)[(data.quiz[i].answer + 1) % 4].click());
  walk(formalRoot, 'qz-submit-btn')[0].click();
  assert.equal(progress.quiz.score, 0, 'latest submission wins');
  assert.deepEqual(JSON.parse(JSON.stringify(progress.quizWrong)), Array.from(data.quiz, q => q.id), 'all-wrong records every id');
  const wrongItems = walk(formalRoot, 'qz-wrong-item');
  assert.equal(wrongItems.length, 10);
  wrongItems.forEach((item, k) => {
    const q = data.quiz[k];
    const pick = (q.answer + 1) % 4;
    assert.equal(textOf(walk(item, 'qz-wrong-stem')[0]), q.stem);
    const lines = walk(item, 'qz-wrong-line');
    assert.equal(textOf(walk(lines[0], 'qz-wrong-value')[0]), 'ABCD'[pick] + '　' + q.options[pick]);
    assert.equal(textOf(walk(lines[1], 'qz-wrong-value')[0]), 'ABCD'[q.answer] + '　' + q.options[q.answer]);
    assert.equal(textOf(walk(item, 'qz-wrong-explain')[0]), q.explain);
    const review = walk(item, 'qz-wrong-review')[0];
    assert.equal(review.href, q.reviewHref);
    assert.equal(review.target, '_blank');
    assert.equal(review.rel, 'noopener');
  });
  walk(formalRoot, 'qz-retake')[0].click();
  items.forEach((item, i) => choicesOf(item)[i < 3 ? (data.quiz[i].answer + 1) % 4 : data.quiz[i].answer].click());
  walk(formalRoot, 'qz-submit-btn')[0].click();
  assert.deepEqual(JSON.parse(JSON.stringify(progress.quizWrong)), Array.from(data.quiz.slice(0, 3), q => q.id), 'three wrong recorded');
  assert.equal(walk(formalRoot, 'qz-wrong-item').length, 3);
});
test('decisions allow changing picks; seal, hint and completion follow current pick', () => {
  assert.equal(data.decisionLabels.lockedHint, '已记录，可点选其他选项更改');
  assert.equal(data.decisionLabels.lockHint, '三选一 · 选定即锁定，不可更改');
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderDecisions()'), source.indexOf('  /* ---------- 亲历'));
  const progress = {};
  const render = (app) => {
    const ctx = vm.createContext({ data, app, currentModule: { title: '决策模式' },
      loadProgress: () => progress, updateProgress: f => f(progress), recordThreadEvidence() {},
      decisionState: () => { const d = progress.decisions && typeof progress.decisions === 'object' ? progress.decisions : {}; return { done: Array.isArray(d.done) ? d.done : [], picks: d.picks && typeof d.picks === 'object' ? d.picks : {} }; },
      el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
      reducedMotion: { matches: true }, window: { addEventListener() {} },
    });
    vm.runInContext(code + '\nrenderDecisions();', ctx);
  };
  const app = new Node('main');
  render(app);
  const scenarios = walk(app, 'dc-scenario');
  assert.equal(scenarios.length, 3);
  const sc = data.decisions[0];
  const choices = walk(scenarios[0], 'dc-choice');
  choices[0].click();
  assert.equal(progress.decisions.picks[sc.id], sc.choices[0].key);
  assert.deepEqual(Array.from(progress.decisions.done), [sc.id]);
  const result = walk(scenarios[0], 'dc-result')[0];
  assert.equal(result.hidden, false);
  assert.equal(walk(result, 'dc-consequence-p')[0].textContent, sc.choices[0].consequence);
  choices[1].click();
  assert.equal(progress.decisions.picks[sc.id], sc.choices[1].key, 'pick replaced');
  assert.deepEqual(Array.from(progress.decisions.done), [sc.id], 'completion not doubled');
  assert.equal(walk(result, 'dc-consequence-p')[0].textContent, sc.choices[1].consequence);
  assert.equal(walk(result, 'dc-history-p')[0].textContent, sc.choices[1].history);
  assert.ok(choices.every(b => !b.disabled), 'choices never disabled');
  assert.ok(choices[1].className.includes('is-picked') && choices[0].className.includes('is-dim'));
  assert.equal(walk(scenarios[0], 'dc-seal')[0].hidden, false);
  assert.equal(walk(app, 'dc-count')[0].textContent, '1 / 3');
  assert.equal(walk(scenarios[0], 'dc-lock-hint')[0].textContent, '已记录，可点选其他选项更改');
  const app2 = new Node('main');
  render(app2);
  const choices2 = walk(walk(app2, 'dc-scenario')[0], 'dc-choice');
  assert.ok(choices2[1].className.includes('is-picked'), 'refresh keeps latest pick');
  assert.equal(walk(walk(app2, 'dc-scenario')[0], 'dc-consequence-p')[0].textContent, sc.choices[1].consequence);
});
test('BT-3 decision state filters saved picks by each scenario choice whitelist', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function decisionState()'), source.indexOf('  function renderDecisions()'));
  const first = data.decisions[0];
  const progress = { decisions: { done: [first.id], picks: {
    [first.id]: 'not-a-choice', unknownScene: first.choices[0].key,
  } } };
  const ctx = vm.createContext({ data, loadProgress: () => progress });
  vm.runInContext(code, ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.decisionState().picks)), {});
  progress.decisions.picks[first.id] = first.choices[1].key;
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.decisionState().picks)), { [first.id]: first.choices[1].key });
});

test('BT-3 invalid saved decision picks render every scenario as unselected', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function decisionState()'), source.indexOf('  /* ---------- 亲历'));
  const progress = { decisions: { done: [], picks: {} } };
  data.decisions.forEach(sc => { progress.decisions.picks[sc.id] = 'invalid-key'; });
  const app = new Node('main');
  const ctx = vm.createContext({ data, app, currentModule: { title: '决策模式' },
    loadProgress: () => progress, updateProgress: f => f(progress), recordThreadEvidence() {},
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    reducedMotion: { matches: true }, window: { addEventListener() {} },
  });
  vm.runInContext(code + '\nrenderDecisions();', ctx);
  const scenarios = walk(app, 'dc-scenario');
  assert.equal(scenarios.length, 3);
  scenarios.forEach(node => {
    assert.ok(!node.classList.contains('is-done'));
    assert.ok(walk(node, 'dc-result')[0].hidden);
    assert.ok(walk(node, 'dc-choice').every(btn => !btn.classList.contains('is-picked')));
  });
  assert.equal(walk(app, 'dc-count')[0].textContent, '0 / 3');
});

test('emperor entries carry exact fullNames; era label added; other relations data untouched', () => {
  const FULL = { 太祖: '朱元璋', 惠宗: '朱允炆', 成祖: '朱棣', 仁宗: '朱高炽', 宣宗: '朱瞻基', 英宗: '朱祁镇', 代宗: '朱祁钰', 宪宗: '朱见深', 孝宗: '朱祐樘', 武宗: '朱厚照', 世宗: '朱厚熜', 穆宗: '朱载坖', 神宗: '朱翊钧', 光宗: '朱常洛', 熹宗: '朱由校', 思宗: '朱由检' };
  const emperors = data.relations.emperors;
  assert.equal(emperors.length, 17);
  emperors.forEach(e => assert.equal(e.fullName, FULL[e.name], e.name));
  assert.equal(emperors.filter(e => e.name === '英宗').length, 2);
  assert.ok(emperors.filter(e => e.name === '英宗').every(e => e.fullName === '朱祁镇'));
  assert.equal(data.relationsUI.cardLabels.era, '年号');
  assert.equal(data.relationsUI.cardLabels.identity, '身份');
  const newGuestNames = ['徐达', '常遇春', '李文忠', '冯胜', '傅友德', '蓝玉', '李成梁', '徐霞客'];
  const stripEnd = ({ endType, ...rest }) => rest;
  const stripped = { ...data.relations, emperors: emperors.map(({ fullName, endType, ...rest }) => rest), chiefs: data.relations.chiefs.map(stripEnd), guests: data.relations.guests.filter(g => !newGuestNames.includes(g.name)).map(stripEnd) };
  assert.equal(createHash('sha256').update(JSON.stringify(stripped)).digest('hex'), 'b8b60fa9e112b7f22bc6b625bb9fc79a9ca3aa102d0a6585612179b24eb6be56', 'original 28 relations entries must stay verbatim');
});
test('guest lane expands to 16 with eight verbatim new entries and a civilian outlier', () => {
  const guests = data.relations.guests;
  assert.equal(guests.length, 16);
  const table = [
    ['徐达', '大将军', [[1368, 1385]], '太祖', '开国第一名将', '病逝（1385）', '北伐灭元、镇守北边；功臣宿将中得善终者。'],
    ['常遇春', '鄂国公', [[1368, 1369]], '太祖', '勇冠三军', '暴卒于军中（1369）', '「常十万」横行天下；北伐凯旋途中病逝，年四十。'],
    ['李文忠', '曹国公', [[1368, 1384]], '太祖', '太祖外甥', '病逝（1384）', '北伐镇边皆能战；功臣中以谨慎闻名。'],
    ['冯胜', '宋国公', [[1368, 1395]], '太祖', '平辽名将', '暴卒（1395）', '招降纳哈出、平定辽东；晚年屡遭谴让。'],
    ['傅友德', '颍国公', [[1368, 1394]], '太祖', '平滇猛将', '赐死（1394）', '平云南、征漠北；功高终遭赐死。'],
    ['蓝玉', '凉国公', [[1379, 1393]], '太祖', '捕鱼儿海', '蓝玉案被诛（1393）', '大破北元于捕鱼儿海；恃功骄横，终以谋反罪族诛。'],
    ['李成梁', '辽东总兵', [[1570, 1591], [1601, 1608]], '穆宗–神宗', '镇辽三十年', '罢职后病逝（1615）', '辽东柱石，努尔哈赤早年曾在其麾下；其子李如松亦在本表。'],
    ['徐霞客', '布衣 · 旅行家', [[1587, 1641]], '神宗–思宗', '布衣', '病逝（1641）', '一生未仕，三十余年游遍大半个中国，著《徐霞客游记》——在帝王将相之间，他走了自己的路。'],
  ];
  table.forEach(([name, office, segments, lord, tag, end, note]) => {
    const g = guests.find(x => x.name === name);
    assert.ok(g, name + ' missing');
    assert.deepEqual(JSON.parse(JSON.stringify([g.office, g.segments, g.lord, g.tag, g.end, g.note])), [office, segments, lord, tag, end, note], name);
  });
  assert.deepEqual(Array.from(guests.slice(0, 6), g => g.name), ['徐达', '常遇春', '李文忠', '冯胜', '傅友德', '蓝玉']);
  assert.equal(guests[15].name, '徐霞客');
  assert.equal(guests.filter(g => g.office.startsWith('布衣')).length, 1);
  assert.equal(data.relationsUI.legendNote, '特邀：不走内阁线的统兵重臣，及一位布衣旅行家。官职以小卡为准。');
  const added = context.index.slice(99);
  assert.equal(added.length, 8);
  added.forEach((e, i) => {
    assert.equal(e.kind, 'relation');
    assert.equal(e.id, table[i][0]);
    assert.equal(e.title, table[i][0]);
    assert.equal(e.target, 'relations.html?person=' + table[i][0] + '&kind=guest');
    assert.ok(e.text.includes(table[i][1]) && e.text.includes(table[i][6]));
    assert.ok(Array.isArray(e.keywords) && e.keywords.includes(table[i][0]));
  });
});
test('relations endType covers all 53 segments with the specified 23/8/10/5/7 split', () => {
  const EMP = { 太祖: 'shan', 惠宗: 'teshu', 成祖: 'shan', 仁宗: 'shan', 宣宗: 'shan', 英宗: 'teshu', 代宗: 'teshu', 宪宗: 'shan', 孝宗: 'shan', 武宗: 'shan', 世宗: 'shan', 穆宗: 'shan', 神宗: 'shan', 光宗: 'teshu', 熹宗: 'shan', 思宗: 'zhanshang' };
  const CHIEF = { 解缙: 'feiming', 杨士奇: 'shan', 陈循: 'bazhu', 商辂: 'shan', 徐溥: 'shan', 刘健: 'shan', 李东阳: 'shan', 杨廷和: 'bazhu', 夏言: 'feiming', 严嵩: 'feiming', 徐阶: 'shan', 高拱: 'bazhu', 张居正: 'shan', 申时行: 'shan', 方从哲: 'bazhu', 叶向高: 'bazhu', 周延儒: 'feiming', 温体仁: 'bazhu', 薛国观: 'feiming', 魏藻德: 'feiming' };
  const GUEST = { 徐达: 'shan', 常遇春: 'zhanshang', 李文忠: 'shan', 冯胜: 'teshu', 傅友德: 'feiming', 蓝玉: 'feiming', 于谦: 'feiming', 王守仁: 'shan', 戚继光: 'bazhu', 李成梁: 'bazhu', 李如松: 'zhanshang', 卢象升: 'zhanshang', 孙传庭: 'zhanshang', 袁崇焕: 'feiming', 杨嗣昌: 'teshu', 徐霞客: 'shan' };
  const valid = ['shan', 'bazhu', 'feiming', 'zhanshang', 'teshu'];
  const { emperors, chiefs, guests } = data.relations;
  emperors.forEach(e => assert.equal(e.endType, EMP[e.name], e.name + ' ' + e.era));
  chiefs.forEach(c => assert.equal(c.endType, CHIEF[c.name], c.name));
  guests.forEach(g => assert.equal(g.endType, GUEST[g.name], g.name));
  const all = [...emperors, ...chiefs, ...guests];
  assert.equal(all.length, 53);
  all.forEach(p => assert.ok(valid.includes(p.endType), p.name));
  const tally = {};
  all.forEach(p => (tally[p.endType] = (tally[p.endType] || 0) + 1));
  assert.deepEqual(tally, { shan: 23, bazhu: 8, feiming: 10, zhanshang: 5, teshu: 7 });
  assert.equal(emperors.filter(e => e.name === '英宗').every(e => e.endType === 'teshu'), true);
  assert.equal(chiefs.find(c => c.name === '张居正').endType, 'shan', '张居正任上病逝计善终');
  assert.equal(guests.find(g => g.name === '徐霞客').endType, 'shan');
  const ui = data.relationsUI;
  assert.deepEqual(JSON.parse(JSON.stringify(ui.modeLabels)), { tenure: '按任期看', end: '按结局看' });
  assert.deepEqual(Array.from(ui.endCategories, c => [c.kind, c.label]), [['shan', '善终'], ['bazhu', '罢黜'], ['feiming', '非命'], ['zhanshang', '战殁殉国'], ['teshu', '特殊存疑']]);
  assert.equal(ui.cardLabels.endType, '结局类别');
  assert.equal(ui.endLegendNote, '结局按本人离世或最终处境归类，不计身后事。徐霞客保留布衣虚线标识，按善终染色。');
});
test('relations render: mode toggle defaults to tenure, end mode colors bars and legend, popup carries category', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('  function renderRelations()');
  const code = source.slice(start, source.indexOf('  /* ----------', start + 10));
  assert.ok(code.includes('let endMode = false;'), 'default must be tenure mode');
  assert.ok(!code.includes('localStorage'), 'mode choice must not be persisted');
  assert.ok(code.includes('bar.dataset.end = p.endType;'), 'bars must carry endType');
  assert.ok(code.includes('ui.cardLabels.endType'), 'popup must show category label');
  assert.ok(code.includes('rl-end-swatch-'), 'end legend swatches');
  assert.ok(code.includes('tally[p.endType]'), 'legend counts derived from data');
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  ['.rl-bar.rl-end-shan', '.rl-bar.rl-end-bazhu', '.rl-bar.rl-end-feiming', '.rl-bar.rl-end-zhanshang', '.rl-bar.rl-end-teshu', '.rl-mode.is-on', '.rl-end-swatch-teshu'].forEach(sel => assert.ok(css.includes(sel), 'missing css ' + sel));
  assert.ok(css.indexOf('.rl-bar.rl-end-shan') > css.indexOf('.rl-bar-guest.is-civilian'), 'end fills must override civilian fill');
});
test('qinli splits into a pure list and a nav-free play page', () => {
  const html = fs.readFileSync(path.join(root, 'qinli-play.html'), 'utf8');
  assert.match(html, /data-page="qinli-play"/);
  assert.match(html, /src="data\.js"/);
  assert.match(html, /src="app\.js"/);
  assert.match(html, /href="styles\.css"/);
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(source.includes('if (page !== "qinli-play") renderNav();'), 'play page must skip the site nav');
  assert.ok(source.includes('else if (page === "qinli-play") renderQinliPlay();'), 'play route missing');
  const listStart = source.indexOf('  function renderQinli()');
  const listCode = source.slice(listStart, source.indexOf('  /* ----------', listStart + 10));
  assert.ok(!listCode.includes('ql-choice'), 'list must not embed the player');
  assert.ok(listCode.includes('location.replace("qinli-play.html?story="'), 'old deep links must redirect');
  assert.ok(listCode.includes('el("a", "ql-card"'), 'cards must be whole-card links');
  const playStart = source.indexOf('  function renderQinliPlay()');
  const playCode = source.slice(playStart, source.indexOf('  /* ----------', playStart + 10));
  assert.ok(playCode.includes('location.replace("qinli.html")'), 'invalid story must fall back to the list');
  assert.ok(playCode.includes('qp-bar') && playCode.includes('← 亲历'), 'thin top bar missing');
  assert.ok(playCode.includes('enter(story, false)'), 'player must start without scroll');
  assert.ok(!playCode.includes('renderNav('), 'play page must not render nav');
  const app = new Node('main');
  const replaced = [];
  const ctx = vm.createContext({ data, app, URLSearchParams, location: { search: '', replace: (u) => replaced.push(u) },
    loadProgress: () => ({}), updateProgress: () => assert.fail('list must not write progress'),
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    window: { addEventListener() {} }, PROGRESS_KEY: 'shimais-daming:progress:v1',
  });
  vm.runInContext(CODEX_HELPERS + listCode + '\nrenderQinli();', ctx);
  const cards = walk(app, 'ql-card');
  assert.equal(cards.length, 6);
  cards.forEach((c, i) => {
    assert.equal(c.tag, 'a');
    assert.equal(c.href, 'qinli-play.html?story=' + data.qinli[i].id);
    assert.equal(c.target, undefined);
  });
  assert.equal(walk(app, 'ql-play').length, 0);
  assert.deepEqual(replaced, []);
  const app2 = new Node('main');
  const replaced2 = [];
  const ctx2 = vm.createContext({ data, app: app2, URLSearchParams, location: { search: '?story=q1449', replace: (u) => replaced2.push(u) },
    loadProgress: () => ({}), updateProgress: () => {},
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    window: { addEventListener() {} },
  });
  vm.runInContext(CODEX_HELPERS + listCode + '\nrenderQinli();', ctx2);
  assert.deepEqual(replaced2, ['qinli-play.html?story=q1449']);
  assert.equal(app2.children.length, 0);
});
test('chapter renders intro, sections, source prefixes and next links without writing progress', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('  function renderChapter()');
  const code = source.slice(start, source.indexOf('  /* ----------', start + 10));
  const app = new Node('main');
  let writes = 0;
  const ctx = vm.createContext({ data, app, currentModule: { title: '白话明史 · 洪武朝' },
    loadProgress: () => ({}), updateProgress: () => { writes += 1; }, markLastRead() {}, recordThreadEvidence() {},
    location: { search: '' }, URLSearchParams, selectedChapter: () => data.chapters[0], chapterNum,
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    window: { addEventListener() {} },
  });
  vm.runInContext(code + '\nrenderChapter();', ctx);
  assert.equal(writes, 0);
  assert.equal(walk(app, 'ch-intro').length, 1);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[0].intro);
  assert.equal(walk(app, 'ch-section').length, 5);
  assert.equal(walk(app, 'ch-p').length, data.chapters[0].sections.reduce((n, s) => n + s.paragraphs.length, 0));
  const sources = walk(app, 'ch-source');
  assert.equal(sources.length, 5);
  sources.forEach((n, i) => assert.equal(textOf(n), data.chapterUI.sourcePrefix + data.chapters[0].sections[i].sourceNote));
  const titles = walk(app, 'ch-sec-title').map(n => textOf(n));
  assert.deepEqual(titles.slice(0, 5), Array.from(data.chapters[0].sections, s => s.title));
  const next = walk(app, 'ch-next-link');
  assert.deepEqual(Array.from(next, a => a.href), Array.from(data.chapters[0].nextSteps, l => l.href));
  assert.deepEqual(Array.from(next, a => textOf(a)), Array.from(data.chapters[0].nextSteps, l => l.label));
});
test('chapter page selects by ?ch= with tabs, chapter nav and unknown fallback', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('  function renderChapter()');
  const code = source.slice(start, source.indexOf('  /* ----------', start + 10));
  const render = (search) => {
    const app = new Node('main');
    const chapterById = (id) => data.chapters.find(c => c.id === id) || data.chapters[0];
    const ctx = vm.createContext({ data, app, currentModule: { title: '白话明史' },
      location: { search }, URLSearchParams,
      selectedChapter: () => chapterById(new URLSearchParams(search).get('ch')), chapterNum,
      loadProgress: () => ({}), updateProgress: () => assert.fail('chapter must not write progress'), markLastRead() {}, recordThreadEvidence() {},
      el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
      window: { addEventListener() {} },
    });
    vm.runInContext(code + '\nrenderChapter();', ctx);
    return app;
  };
  const tabsOf = (app) => walk(app, 'ch-tab').map(t => ({ text: textOf(t), href: t.href, current: t['aria-current'] === 'page', target: t.target }));
  const navOf = (app) => walk(app, 'ch-chapter-link').map(a => ({ text: textOf(a), href: a.href, target: a.target }));
  // 无参数 → 第一章
  let app = render('');
  assert.deepEqual(tabsOf(app), [
    { text: '第一章 · 洪武朝', href: 'chapter.html?ch=hongwu', current: true, target: undefined },
    { text: '第二章 · 建文与靖难', href: 'chapter.html?ch=jingnan', current: false, target: undefined },
    { text: '第三章 · 土木堡与北京保卫战', href: 'chapter.html?ch=tumubao', current: false, target: undefined },
    { text: '第四章 · 嘉靖与海瑞', href: 'chapter.html?ch=jiajing', current: false, target: undefined },
    { text: '第五章 · 张居正', href: 'chapter.html?ch=zhangjuzheng', current: false, target: undefined },
    { text: '第六章 · 万历怠政', href: 'chapter.html?ch=wanli', current: false, target: undefined },
    { text: '第七章 · 崇祯', href: 'chapter.html?ch=chongzhen', current: false, target: undefined },
    { text: '终章 · 徐霞客', href: 'chapter.html?ch=xuxiake', current: false, target: undefined },
  ]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[0].intro);
  assert.equal(walk(app, 'ch-sources').length, 4);
  assert.deepEqual(navOf(app), [{ text: '下一章：建文与靖难 →', href: 'chapter.html?ch=jingnan', target: undefined }]);
  assert.deepEqual(walk(app, 'ch-next-link').map(a => a.href), Array.from(data.chapters[0].nextSteps, l => l.href));
  // ?ch=jingnan → 第二章
  app = render('?ch=jingnan');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, true, false, false, false, false, false, false]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[1].intro);
  assert.equal(walk(app, 'ch-section').length, 5);
  assert.equal(walk(app, 'ch-sources').length, 0);
  assert.deepEqual(walk(app, 'ch-sec-title').slice(0, 5).map(n => textOf(n)), Array.from(data.chapters[1].sections, s => s.title));
  assert.deepEqual(navOf(app), [
    { text: '← 上一章：洪武朝', href: 'chapter.html?ch=hongwu', target: undefined },
    { text: '下一章：土木堡与北京保卫战 →', href: 'chapter.html?ch=tumubao', target: undefined },
  ]);
  const steps = walk(app, 'ch-next-link');
  assert.deepEqual(steps.map(a => a.href), Array.from(data.chapters[1].nextSteps, l => l.href));
  assert.equal(steps[0].target, '_blank');
  assert.equal(steps[0].rel, 'noopener');
  assert.equal(steps[1].target, undefined);
  assert.equal(steps[2].target, undefined);
  // ?ch=tumubao → 第三章
  app = render('?ch=tumubao');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, false, true, false, false, false, false, false]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[2].intro);
  assert.equal(walk(app, 'ch-section').length, 5);
  assert.equal(walk(app, 'ch-sources').length, 0);
  assert.deepEqual(walk(app, 'ch-sec-title').slice(0, 5).map(n => textOf(n)), Array.from(data.chapters[2].sections, s => s.title));
  assert.deepEqual(navOf(app), [
    { text: '← 上一章：建文与靖难', href: 'chapter.html?ch=jingnan', target: undefined },
    { text: '下一章：嘉靖与海瑞 →', href: 'chapter.html?ch=jiajing', target: undefined },
  ]);
  const steps3 = walk(app, 'ch-next-link');
  assert.deepEqual(steps3.map(a => a.href), Array.from(data.chapters[2].nextSteps, l => l.href));
  assert.equal(steps3[0].target, '_blank');
  assert.equal(steps3[0].rel, 'noopener');
  assert.equal(steps3[1].target, undefined);
  assert.equal(steps3[2].target, undefined);
  // ?ch=jiajing → 第四章
  app = render('?ch=jiajing');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, false, false, true, false, false, false, false]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[3].intro);
  assert.equal(walk(app, 'ch-section').length, 5);
  assert.equal(walk(app, 'ch-sources').length, 0);
  assert.deepEqual(walk(app, 'ch-sec-title').slice(0, 5).map(n => textOf(n)), Array.from(data.chapters[3].sections, s => s.title));
  assert.deepEqual(navOf(app), [
    { text: '← 上一章：土木堡与北京保卫战', href: 'chapter.html?ch=tumubao', target: undefined },
    { text: '下一章：张居正 →', href: 'chapter.html?ch=zhangjuzheng', target: undefined },
  ]);
  const steps4 = walk(app, 'ch-next-link');
  assert.deepEqual(steps4.map(a => a.href), Array.from(data.chapters[3].nextSteps, l => l.href));
  assert.equal(steps4[0].target, '_blank');
  assert.equal(steps4[0].rel, 'noopener');
  assert.equal(steps4[1].target, undefined);
  assert.equal(steps4[2].target, undefined);
  // ?ch=zhangjuzheng → 第五章（六节）
  app = render('?ch=zhangjuzheng');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, false, false, false, true, false, false, false]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[4].intro);
  assert.equal(walk(app, 'ch-section').length, 6);
  assert.equal(walk(app, 'ch-sources').length, 0);
  assert.deepEqual(walk(app, 'ch-sec-title').slice(0, 6).map(n => textOf(n)), Array.from(data.chapters[4].sections, s => s.title));
  assert.deepEqual(navOf(app), [
    { text: '← 上一章：嘉靖与海瑞', href: 'chapter.html?ch=jiajing', target: undefined },
    { text: '下一章：万历怠政 →', href: 'chapter.html?ch=wanli', target: undefined },
  ]);
  const steps5 = walk(app, 'ch-next-link');
  assert.deepEqual(steps5.map(a => a.href), Array.from(data.chapters[4].nextSteps, l => l.href));
  assert.equal(steps5[0].target, '_blank');
  assert.equal(steps5[0].rel, 'noopener');
  assert.equal(steps5[1].target, undefined);
  assert.equal(steps5[2].target, undefined);
  // ?ch=wanli → 第六章（六节十二段）
  app = render('?ch=wanli');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, false, false, false, false, true, false, false]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[5].intro);
  assert.equal(walk(app, 'ch-section').length, 6);
  assert.equal(walk(app, 'ch-p').length, 12);
  assert.equal(walk(app, 'ch-sources').length, 0);
  assert.deepEqual(walk(app, 'ch-sec-title').slice(0, 6).map(n => textOf(n)), Array.from(data.chapters[5].sections, s => s.title));
  assert.deepEqual(navOf(app), [
    { text: '← 上一章：张居正', href: 'chapter.html?ch=zhangjuzheng', target: undefined },
    { text: '下一章：崇祯 →', href: 'chapter.html?ch=chongzhen', target: undefined },
  ]);
  const steps6 = walk(app, 'ch-next-link');
  assert.deepEqual(steps6.map(a => a.href), Array.from(data.chapters[5].nextSteps, l => l.href));
  assert.equal(steps6[0].target, '_blank');
  assert.equal(steps6[0].rel, 'noopener');
  assert.equal(steps6[1].target, undefined);
  assert.equal(steps6[2].target, undefined);
  // ?ch=chongzhen → 第七章（六节二十五段）
  app = render('?ch=chongzhen');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, false, false, false, false, false, true, false]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[6].intro);
  assert.equal(walk(app, 'ch-section').length, 6);
  assert.equal(walk(app, 'ch-p').length, 25);
  assert.equal(walk(app, 'ch-sources').length, 0);
  assert.deepEqual(walk(app, 'ch-sec-title').slice(0, 6).map(n => textOf(n)), Array.from(data.chapters[6].sections, s => s.title));
  assert.deepEqual(navOf(app), [
    { text: '← 上一章：万历怠政', href: 'chapter.html?ch=wanli', target: undefined },
    { text: '下一章：徐霞客 →', href: 'chapter.html?ch=xuxiake', target: undefined },
  ]);
  const steps7 = walk(app, 'ch-next-link');
  assert.deepEqual(steps7.map(a => a.href), Array.from(data.chapters[6].nextSteps, l => l.href));
  assert.equal(steps7[0].target, '_blank');
  assert.equal(steps7[0].rel, 'noopener');
  assert.equal(steps7[1].target, undefined);
  assert.equal(steps7[2].target, undefined);
  // ?ch=xuxiake → 终章（五节十八段，引文段走纸面引文框）
  app = render('?ch=xuxiake');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, false, false, false, false, false, false, true]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[7].intro);
  assert.equal(walk(app, 'ch-section').length, 5);
  assert.equal(walk(app, 'ch-p').length, 17);
  const quotes8 = walk(app, 'cw-paper-quote');
  assert.equal(quotes8.length, 1, 'finale quote paragraph uses the paper quote block');
  assert.equal(textOf(quotes8[0]), data.chapters[7].sections[4].paragraphs[3]);
  assert.equal(walk(app, 'ch-quote').length, 1);
  assert.deepEqual(navOf(app), [{ text: '← 上一章：崇祯', href: 'chapter.html?ch=chongzhen', target: undefined }]);
  const steps8 = walk(app, 'ch-next-link');
  assert.deepEqual(steps8.map(a => a.href), Array.from(data.chapters[7].nextSteps, l => l.href));
  assert.equal(steps8[2].target, '_blank');
  assert.equal(steps8[2].rel, 'noopener');
  assert.equal(steps8[0].target, undefined);
  // 未知值回落第一章
  app = render('?ch=xxx');
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[0].intro);
  assert.deepEqual(tabsOf(app).map(t => t.current), [true, false, false, false, false, false, false, false]);
});
test('chapter banner has the specified copy and no obsolete in-card styling', () => {
  assert.equal(data.chapterUI.bannerEyebrow, '白话明史 · 试点章');
  assert.equal(data.chapterUI.bannerTitle, '洪武朝');
  assert.equal(data.chapterUI.bannerDesc, '用白话把洪武朝从头讲一遍：建国、废相、锦衣卫与晚年大狱，全文依据本站已核材料。');
  assert.equal(data.chapterUI.bannerBtn, '开始读 →');
  assert.equal(/\.cw-chapter-link\b/.test(fs.readFileSync(path.join(root, 'styles.css'), 'utf8')), false, 'obsolete in-card link styling removed');
});
test('index entry and full-width cards banner open the chapter in a new tab', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const indexCode = source.slice(source.indexOf('  function renderIndex()'), source.indexOf('  /* ---------- 时间线'));
  const app = new Node('main');
  const ctx = vm.createContext({ data, app, currentModule: { title: '首页' },
    loadProgress: () => ({}), updateProgress() {}, markLastRead() {}, recordThreadEvidence() {}, resolveLastRead: () => null, activeResearch: () => null,
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildCarousel: () => new Node('section'), buildTopicPath: () => new Node('section'),
    window: { addEventListener() {} },
  });
  vm.runInContext(indexCode + '\nrenderIndex();', ctx);
  const entry = walk(app, 'ch-entry')[0];
  assert.ok(entry, 'index chapter entry missing');
  assert.equal(textOf(walk(entry, 'ch-entry-title')[0]), data.chapterUI.entryTitle);
  assert.equal(textOf(walk(entry, 'ch-entry-desc')[0]), data.chapterUI.entryDesc);
  const btn = walk(entry, 'cta-button').find(a => textOf(a) === data.chapterUI.entryBtn);
  assert.ok(btn && btn.href === 'chapter.html');
  assert.equal(btn.target, '_blank');
  assert.equal(btn.rel, 'noopener');
  const second = walk(entry, 'ch-entry-second')[0];
  assert.ok(second && second.href === 'chapter.html?ch=jingnan', 'index second-chapter link missing');
  assert.equal(textOf(second), data.chapterUI.secondLink);
  assert.equal(second.target, '_blank');
  assert.equal(second.rel, 'noopener');
  const third = walk(entry, 'ch-entry-second')[1];
  assert.ok(third && third.href === 'chapter.html?ch=tumubao', 'index third-chapter link missing');
  assert.equal(textOf(third), data.chapterUI.thirdLink);
  assert.equal(third.target, '_blank');
  assert.equal(third.rel, 'noopener');
  const fourth = walk(entry, 'ch-entry-second')[2];
  assert.ok(fourth && fourth.href === 'chapter.html?ch=jiajing', 'index fourth-chapter link missing');
  assert.equal(textOf(fourth), data.chapterUI.fourthLink);
  assert.equal(fourth.target, '_blank');
  assert.equal(fourth.rel, 'noopener');
  const fifth = walk(entry, 'ch-entry-second')[3];
  assert.ok(fifth && fifth.href === 'chapter.html?ch=zhangjuzheng', 'index fifth-chapter link missing');
  assert.equal(textOf(fifth), data.chapterUI.fifthLink);
  assert.equal(fifth.target, '_blank');
  assert.equal(fifth.rel, 'noopener');
  const sixth = walk(entry, 'ch-entry-second')[4];
  assert.ok(sixth && sixth.href === 'chapter.html?ch=wanli', 'index sixth-chapter link missing');
  assert.equal(textOf(sixth), data.chapterUI.sixthLink);
  assert.equal(sixth.target, '_blank');
  assert.equal(sixth.rel, 'noopener');
  const seventh = walk(entry, 'ch-entry-second')[5];
  assert.ok(seventh && seventh.href === 'chapter.html?ch=chongzhen', 'index seventh-chapter link missing');
  assert.equal(textOf(seventh), data.chapterUI.seventhLink);
  assert.equal(seventh.target, '_blank');
  assert.equal(seventh.rel, 'noopener');
  const eighth = walk(entry, 'ch-entry-second')[6];
  assert.ok(eighth && eighth.href === 'chapter.html?ch=xuxiake', 'index finale link missing');
  assert.equal(textOf(eighth), data.chapterUI.finaleLink);
  assert.equal(eighth.target, '_blank');
  assert.equal(eighth.rel, 'noopener');
  assert.equal(walk(app, 'entry-block').length, 6, 'module entries unchanged');
  const cardsCode = source.slice(source.indexOf('  function renderCards()'), source.indexOf('  function quizState()'));
  const capp = new Node('main');
  const cctx = vm.createContext({ data, app: capp, currentModule: { title: '人物' }, URLSearchParams, location: { search: '' }, reducedMotion: { matches: true },
    loadProgress: () => ({}), updateProgress() {}, markLastRead() {}, recordThreadEvidence() {}, requestAnimationFrame: f => f(),
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'),
    document: { body: new Node('body'), createElementNS: (ns, tag) => new Node(tag), addEventListener() {} }, window: { addEventListener() {} },
  });
  vm.runInContext(cardsCode + '\nrenderCards();', cctx);
  const banner = walk(capp, 'cw-chapter-banner')[0];
  assert.ok(banner, 'cards chapter banner missing');
  assert.equal(walk(capp, 'cw-chapter-banner').length, 1);
  assert.equal(banner.tag, 'section', 'banner is a paper section with links inside');
  const main = walk(banner, 'cw-banner-main')[0];
  assert.ok(main && main.tag === 'a' && main.href === 'chapter.html', 'main entry link missing');
  assert.equal(main.target, '_blank');
  assert.equal(main.rel, 'noopener');
  assert.equal(textOf(walk(banner, 'cw-banner-eyebrow')[0]), data.chapterUI.bannerEyebrow);
  assert.equal(textOf(walk(banner, 'cw-banner-title')[0]), data.chapterUI.bannerTitle);
  assert.equal(textOf(walk(banner, 'cw-banner-desc')[0]), data.chapterUI.bannerDesc);
  assert.equal(textOf(walk(banner, 'cw-banner-btn')[0]), data.chapterUI.bannerBtn);
  const bannerLinks = walk(banner, 'cw-banner-second');
  assert.equal(bannerLinks.length, 7, 'chapter links collected inside the banner');
  assert.deepEqual(bannerLinks.map(a => a.href), Array.from(data.chapters.slice(1), c => 'chapter.html?ch=' + c.id));
  assert.deepEqual(bannerLinks.map(a => textOf(a)), [data.chapterUI.secondLink, data.chapterUI.thirdLink, data.chapterUI.fourthLink, data.chapterUI.fifthLink, data.chapterUI.sixthLink, data.chapterUI.seventhLink, data.chapterUI.finaleLink]);
  bannerLinks.forEach(a => { assert.equal(a.target, '_blank'); assert.equal(a.rel, 'noopener'); });
  const bsecond = walk(capp, 'cw-banner-second')[0];
  assert.ok(bsecond && bsecond.href === 'chapter.html?ch=jingnan', 'cards second-chapter link missing');
  assert.equal(textOf(bsecond), data.chapterUI.secondLink);
  assert.equal(bsecond.target, '_blank');
  assert.equal(bsecond.rel, 'noopener');
  const bthird = walk(capp, 'cw-banner-second')[1];
  assert.ok(bthird && bthird.href === 'chapter.html?ch=tumubao', 'cards third-chapter link missing');
  assert.equal(textOf(bthird), data.chapterUI.thirdLink);
  assert.equal(bthird.target, '_blank');
  assert.equal(bthird.rel, 'noopener');
  const bfourth = walk(capp, 'cw-banner-second')[2];
  assert.ok(bfourth && bfourth.href === 'chapter.html?ch=jiajing', 'cards fourth-chapter link missing');
  assert.equal(textOf(bfourth), data.chapterUI.fourthLink);
  assert.equal(bfourth.target, '_blank');
  assert.equal(bfourth.rel, 'noopener');
  const bfifth = walk(capp, 'cw-banner-second')[3];
  assert.ok(bfifth && bfifth.href === 'chapter.html?ch=zhangjuzheng', 'cards fifth-chapter link missing');
  assert.equal(textOf(bfifth), data.chapterUI.fifthLink);
  assert.equal(bfifth.target, '_blank');
  assert.equal(bfifth.rel, 'noopener');
  const cwWrap = walk(capp, 'cw-wrap')[0];
  assert.ok(cwWrap.children.indexOf(banner) < cwWrap.children.findIndex(n => n.className.includes('cw-group')), 'banner sits above the person grid');
  assert.equal(walk(capp, 'cw-chapter-link').length, 0, 'old in-card link removed');
  assert.equal(data.chapterUI.cardLink, undefined, 'cardLink field removed');
});
