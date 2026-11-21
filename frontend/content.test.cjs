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
const figures = ['zhuyuanzhang', 'zhudi', 'yuqian', 'hairui', 'zhangjuzheng', 'chongzhen'];
const sources = new Set(figures.flatMap(figure => JSON.parse(fs.readFileSync(path.join(root, '../backend/data', figure + '.json'), 'utf8')).chunks.map(c => figure + '/' + c.id)));
function checkHref(href) {
  const url = new URL(href, 'https://local.test/');
  assert.equal(url.origin, 'https://local.test');
  const id = url.searchParams;
  if (url.pathname === '/timeline.html') assert.ok(data.timeline.events.some(e => e.id === id.get('event')));
  else if (url.pathname === '/cards.html') assert.ok(data.cards.some(c => c.id === id.get('card')));
  else if (url.pathname === '/qinli.html') assert.ok(data.qinli.some(s => s.id === id.get('story')));
  else if (url.pathname === '/quiz.html') assert.equal(id.get('topic'), 'yitiaobian');
  else if (url.pathname === '/search.html') assert.ok(sources.has(id.get('source')), href);
  else assert.fail('Unexpected destination: ' + href);
}
test('formal quiz preserves ten IDs, indexes and answer meanings', () => {
  assert.deepEqual(Array.from(data.quiz, q => q.id), Array.from({ length: 10 }, (_, i) => 'q' + (i + 1)));
  assert.deepEqual(Array.from(data.quiz, q => q.answer), [1, 1, 2, 1, 0, 1, 2, 0, 2, 1]);
  assert.deepEqual(Array.from(data.quiz, q => q.options[q.answer]), ['1380', '1405', '福建月港', '1619', '英宗', '于谦', '张居正', '内阁票拟＋司礼监批红', '皇帝本人', '赋役合并、按亩折银征收']);
});
test('formal quiz fields and all 99 search entries remain unchanged', () => {
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(data.quiz.length, 10);
  assert.equal(digest(data.quiz.map(({ stem, options, answer, dim }) => ({ stem, options, answer, dim }))), '4cbac0f4167d64021084d9d54282f5e1d0075a8ee84512563366c3d3a1e98fbf');
  assert.equal(context.index.length, 99);
  assert.equal(digest(context.index), 'e04a192923861f187ae95708feda6ee369a39d579018df6c43c941ff2c79311c');
});
test('topic connects five exact destinations and two sourced questions', () => {
  assert.ok(data.topic, 'topic path is missing');
  assert.equal(data.topic.id, 'yitiaobian');
  assert.deepEqual(Array.from(data.topic.steps, s => s.href), ['timeline.html?event=e1581', 'cards.html?card=i3', 'qinli.html?story=q1581', 'quiz.html?topic=yitiaobian', 'search.html?source=zhangjuzheng%2Fc4']);
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
  const ctx = vm.createContext({ data, updateProgress: mutate => mutate(progress) });
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
  assert.equal(ctx.resolveLastRead(progress.lastRead).href, 'qinli.html?story=q1581');
  assert.equal(progress.quiz.score, 9);
  assert.equal(progress.qinli.current.prestige, 75);
  assert.equal(progress.qinli.current.morale, 40);
});
class Node {
  constructor(tag, className = '', text = '') {
    this.tag = tag; this.className = className; this.children = []; this.listeners = {}; this.textContent = text; this.hidden = false; this.value = ''; this.style = { setProperty(name, value) { this[name] = value; } }; this.dataset = {};
    this.classList = {
      add: (...names) => { this.className += ' ' + names.join(' '); },
      toggle: (name, enabled) => { this.className = this.className.split(' ').filter(n => n !== name).concat(enabled ? [name] : []).join(' '); },
    };
  }
  querySelector(selector) { return walk(this, selector.slice(1))[0]; }
  querySelectorAll(selector) { return walk(this, selector.slice(1)); }
  scrollIntoView() {}
  focus() {}
  click() { this.listeners.click?.({ target: this }); }
  getBoundingClientRect() { return { top: 200, bottom: 258, left: 0, right: 100, width: 100, height: 58 }; }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
  setAttribute(name, value) { this[name] = value; if (name === 'class') this.className = value; }
  getAttribute(name) { return name in this ? String(this[name]) : null; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  set innerHTML(value) { throw new Error('Do not render materials as HTML: ' + value); }
}
function walk(node, className) { return [node, ...node.children.flatMap(n => walk(n, className))].filter(n => n.className.split(' ').includes(className)); }
function textOf(node) { return node.textContent + node.children.map(textOf).join(''); }
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
    const ctx = vm.createContext({ data, app, currentModule: { title: '画像' }, loadProgress: () => progress, readIds: () => [], resolveLastRead: () => null, loadChatMem: () => ({}), chatTier,
      el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), requestAnimationFrame: f => f(), window: { addEventListener() {} },
    });
    vm.runInContext(code + '\nrenderProfile();', ctx);
    const links = walk(app, 'topic-next').concat(walk(app, 'cta-button'));
    if (perfect) assert.ok(links.some(a => a.href === 'quiz.html?topic=yitiaobian'));
    else assert.ok(links.some(a => a.href === data.quiz[9].reviewHref));
    assert.doesNotMatch(textOf(app), /最弱/);
    assert.match(textOf(app), /亲历完成1 \/ 6/);
  }
});
test('all story final-scene resumes preserve numbers and finish without applying effects again', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function renderQinli()'), source.indexOf('  function renderCards()'));
  for (const story of data.qinli) {
    const app = new Node('main');
    const progress = { qinli: { done: [], current: { storyId: story.id, sceneIndex: story.scenes.length, prestige: 80, morale: 45 } }, quiz: { score: 9 } };
    const ctx = vm.createContext({ data, app, URLSearchParams, location: { search: '?story=' + story.id }, reducedMotion: { matches: true },
      loadProgress: () => progress, updateProgress: f => f(progress), markLastRead() {},
      el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'), window: { addEventListener() {} },
    });
    vm.runInContext(code + '\nrenderQinli();', ctx);
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
    loadProgress: () => progress, updateProgress: f => f(progress), markLastRead() {},
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'), window: { addEventListener() {} },
  });
  vm.runInContext(code + '\nrenderQinli();', ctx);
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
    loadProgress: () => ({}), updateProgress: f => f({}), markLastRead() {}, requestAnimationFrame: f => f(),
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
test('territory addition leaves all existing site data and the 99 search entries unchanged', () => {
  const { territory, ...existing } = data;
  assert.equal(createHash('sha256').update(JSON.stringify(existing)).digest('hex'), '1f450cf532d51516546186125e88ab5026e300531ea7d968db40ba38b80c18a0');
  assert.equal(createHash('sha256').update(JSON.stringify(context.index)).digest('hex'), 'e04a192923861f187ae95708feda6ee369a39d579018df6c43c941ff2c79311c');
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
test('chapters array carries two chapters with complete sections and nextSteps', () => {
  assert.ok(Array.isArray(data.chapters) && data.chapters.length === 2);
  assert.equal(data.chapter, undefined, 'old chapter field removed');
  assert.equal(data.chapterUI.next, undefined, 'old next field removed');
  assert.equal(data.chapterUI.series, '白话明史');
  assert.deepEqual(Array.from(data.chapters, c => c.id), ['hongwu', 'jingnan']);
  const [c1, c2] = data.chapters;
  assert.equal(c1.title, '洪武朝');
  assert.equal(c2.title, '建文与靖难');
  [c1, c2].forEach(ch => {
    assert.ok(ch.intro && ch.intro.trim());
    assert.equal(ch.sections.length, 5);
    ch.sections.forEach(s => {
      assert.ok(s.title && s.title.trim());
      assert.ok(Array.isArray(s.paragraphs) && s.paragraphs.length > 0);
      s.paragraphs.forEach(p => assert.ok(typeof p === 'string' && p.trim().length > 0));
      assert.ok(s.sourceNote && s.sourceNote.trim());
    });
    assert.equal(ch.nextSteps.length, 3);
    ch.nextSteps.forEach(l => assert.ok(l.label && l.href));
  });
  assert.deepEqual(Array.from(c1.nextSteps, l => l.href), ['qinli.html?story=q1380', 'chat.html?figure=zhuyuanzhang', 'timeline.html?event=e1380']);
  assert.deepEqual(Array.from(c2.nextSteps, l => l.href), ['qinli.html?story=q1402', 'chat.html?figure=zhudi', 'timeline.html?event=e1402']);
  assert.deepEqual(Array.from(c2.nextSteps, l => l.label), ['亲历《金陵》', '跟朱棣聊聊', '回看时间线 1402']);
  assert.equal(c2.sections.some(s => s.sources), false, 'chapter two has no AJ slips this batch');
  const text = c2.sections.map(s => s.paragraphs.join('')).join('');
  ['1370', '1380', '1392', '1399', '1402', '1420', '1457', '五十五年', '洪武三十五年', '三百年'].forEach(n => assert.ok(text.includes(n), 'key figure missing: ' + n));
  assert.equal(data.chapterUI.entryBtn, '开始试读');
  assert.equal(data.chapterUI.secondLink, '第二章 · 建文与靖难 →');
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
    loadProgress: () => ({}), updateProgress: () => assert.fail('chapter sources must not write progress'), markLastRead() {},
    location: { search: '' }, URLSearchParams, selectedChapter: () => data.chapters[0],
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
    const isQinli = data.topic.steps[i].href.startsWith('qinli.html');
    assert.equal(a.target, isQinli ? '_blank' : undefined);
    assert.equal(a.rel, isQinli ? 'noopener' : undefined);
  });
  const nextA = walk(ctxA.sec, 'topic-next');
  assert.equal(nextA.length, 1);
  assert.ok(nextA[0].href.startsWith('qinli.html'));
  assert.equal(nextA[0].target, '_blank');
  assert.equal(nextA[0].rel, 'noopener');
  const ctxB = mkCtx();
  vm.runInContext(topicCode + '\nthis.sec = buildTopicPath("qinli.html?story=q1581");', ctxB);
  const nextB = walk(ctxB.sec, 'topic-next');
  assert.equal(nextB.length, 1);
  assert.ok(!nextB[0].href.startsWith('qinli.html'));
  assert.equal(nextB[0].target, undefined);
  // 章末下一步：亲历链接带 target/rel，另两条不带
  const chCode = slice('  function renderChapter()', '  /* ----------');
  const app = new Node('main');
  const chCtx = vm.createContext({ data, app, currentModule: { title: '白话明史 · 洪武朝' },
    location: { search: '' }, URLSearchParams, selectedChapter: () => data.chapters[0],
    loadProgress: () => ({}), updateProgress: () => assert.fail('no writes'), markLastRead() {},
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
    ['qinliLink.href = "qinli.html?story=" + storyId;', 'qinliLink.target = "_blank"'],
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
test('chapter renders intro, sections, source prefixes and next links without writing progress', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('  function renderChapter()');
  const code = source.slice(start, source.indexOf('  /* ----------', start + 10));
  const app = new Node('main');
  let writes = 0;
  const ctx = vm.createContext({ data, app, currentModule: { title: '白话明史 · 洪武朝' },
    loadProgress: () => ({}), updateProgress: () => { writes += 1; }, markLastRead() {},
    location: { search: '' }, URLSearchParams, selectedChapter: () => data.chapters[0],
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
      selectedChapter: () => chapterById(new URLSearchParams(search).get('ch')),
      loadProgress: () => ({}), updateProgress: () => assert.fail('chapter must not write progress'), markLastRead() {},
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
  ]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[0].intro);
  assert.equal(walk(app, 'ch-sources').length, 4);
  assert.deepEqual(navOf(app), [{ text: '下一章：建文与靖难 →', href: 'chapter.html?ch=jingnan', target: undefined }]);
  assert.deepEqual(walk(app, 'ch-next-link').map(a => a.href), Array.from(data.chapters[0].nextSteps, l => l.href));
  // ?ch=jingnan → 第二章
  app = render('?ch=jingnan');
  assert.deepEqual(tabsOf(app).map(t => t.current), [false, true]);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[1].intro);
  assert.equal(walk(app, 'ch-section').length, 5);
  assert.equal(walk(app, 'ch-sources').length, 0);
  assert.deepEqual(walk(app, 'ch-sec-title').slice(0, 5).map(n => textOf(n)), Array.from(data.chapters[1].sections, s => s.title));
  assert.deepEqual(navOf(app), [{ text: '← 上一章：洪武朝', href: 'chapter.html?ch=hongwu', target: undefined }]);
  const steps = walk(app, 'ch-next-link');
  assert.deepEqual(steps.map(a => a.href), Array.from(data.chapters[1].nextSteps, l => l.href));
  assert.equal(steps[0].target, '_blank');
  assert.equal(steps[0].rel, 'noopener');
  assert.equal(steps[1].target, undefined);
  assert.equal(steps[2].target, undefined);
  // 未知值回落第一章
  app = render('?ch=xxx');
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapters[0].intro);
  assert.deepEqual(tabsOf(app).map(t => t.current), [true, false]);
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
    loadProgress: () => ({}), updateProgress() {}, markLastRead() {}, resolveLastRead: () => null,
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
  assert.equal(walk(app, 'entry-block').length, 6, 'module entries unchanged');
  const cardsCode = source.slice(source.indexOf('  function renderCards()'), source.indexOf('  function quizState()'));
  const capp = new Node('main');
  const cctx = vm.createContext({ data, app: capp, currentModule: { title: '人物' }, URLSearchParams, location: { search: '' }, reducedMotion: { matches: true },
    loadProgress: () => ({}), updateProgress() {}, markLastRead() {}, requestAnimationFrame: f => f(),
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'), buildTopicPath: () => new Node('section'),
    document: { body: new Node('body'), createElementNS: (ns, tag) => new Node(tag), addEventListener() {} }, window: { addEventListener() {} },
  });
  vm.runInContext(cardsCode + '\nrenderCards();', cctx);
  const banner = walk(capp, 'cw-chapter-banner')[0];
  assert.ok(banner, 'cards chapter banner missing');
  assert.equal(walk(capp, 'cw-chapter-banner').length, 1);
  assert.equal(banner.tag, 'a', 'the entire banner is one link');
  assert.equal(banner.href, 'chapter.html');
  assert.equal(banner.target, '_blank');
  assert.equal(banner.rel, 'noopener');
  assert.equal(textOf(walk(banner, 'cw-banner-eyebrow')[0]), data.chapterUI.bannerEyebrow);
  assert.equal(textOf(walk(banner, 'cw-banner-title')[0]), data.chapterUI.bannerTitle);
  assert.equal(textOf(walk(banner, 'cw-banner-desc')[0]), data.chapterUI.bannerDesc);
  assert.equal(textOf(walk(banner, 'cw-banner-btn')[0]), data.chapterUI.bannerBtn);
  const bsecond = walk(capp, 'cw-banner-second')[0];
  assert.ok(bsecond && bsecond.href === 'chapter.html?ch=jingnan', 'cards second-chapter link missing');
  assert.equal(textOf(bsecond), data.chapterUI.secondLink);
  assert.equal(bsecond.target, '_blank');
  assert.equal(bsecond.rel, 'noopener');
  const cwWrap = walk(capp, 'cw-wrap')[0];
  assert.ok(cwWrap.children.indexOf(banner) < cwWrap.children.findIndex(n => n.className.includes('cw-group')), 'banner sits above the person grid');
  assert.equal(walk(capp, 'cw-chapter-link').length, 0, 'old in-card link removed');
  assert.equal(data.chapterUI.cardLink, undefined, 'cardLink field removed');
});
