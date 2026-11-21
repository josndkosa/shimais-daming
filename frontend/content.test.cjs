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
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  replaceChildren(...nodes) { this.children = nodes; this.textContent = ''; }
  setAttribute(name, value) { this[name] = value; }
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
test('site data digest reflects the cover fields only', () => {
  const { territory, ...existing } = data;
  assert.equal(createHash('sha256').update(JSON.stringify(existing)).digest('hex'), 'c0f3586524bac1f4e6b56669ad853c1db1651ec1ce902d5a15a2c83dbdc9cfb7');
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
test('chapter pilot keeps five non-empty sourced sections', () => {
  const ch = data.chapter;
  assert.ok(ch && ch.series && ch.title && ch.intro && ch.intro.trim());
  assert.equal(ch.sections.length, 5);
  ch.sections.forEach(s => {
    assert.ok(s.title && s.title.trim());
    assert.ok(Array.isArray(s.paragraphs) && s.paragraphs.length > 0);
    s.paragraphs.forEach(p => assert.ok(typeof p === 'string' && p.trim().length > 0));
    assert.ok(s.sourceNote && s.sourceNote.trim());
  });
  assert.equal(data.chapterUI.entryBtn, '开始试读');
  assert.deepEqual(Array.from(data.chapterUI.next, l => l.href), ['qinli.html?story=q1380', 'chat.html?figure=zhuyuanzhang', 'timeline.html?event=e1380']);
});
test('chapter renders intro, sections, source prefixes and next links without writing progress', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('  function renderChapter()');
  const code = source.slice(start, source.indexOf('  /* ----------', start + 10));
  const app = new Node('main');
  let writes = 0;
  const ctx = vm.createContext({ data, app, currentModule: { title: '白话明史 · 洪武朝' },
    loadProgress: () => ({}), updateProgress: () => { writes += 1; }, markLastRead() {},
    el: (tag, cls, text) => new Node(tag, cls, text), renderPageHead: () => new Node('header'),
    window: { addEventListener() {} },
  });
  vm.runInContext(code + '\nrenderChapter();', ctx);
  assert.equal(writes, 0);
  assert.equal(walk(app, 'ch-intro').length, 1);
  assert.equal(textOf(walk(app, 'ch-intro')[0]), data.chapter.intro);
  assert.equal(walk(app, 'ch-section').length, 5);
  assert.equal(walk(app, 'ch-p').length, data.chapter.sections.reduce((n, s) => n + s.paragraphs.length, 0));
  const sources = walk(app, 'ch-source');
  assert.equal(sources.length, 5);
  sources.forEach((n, i) => assert.equal(textOf(n), data.chapterUI.sourcePrefix + data.chapter.sections[i].sourceNote));
  const titles = walk(app, 'ch-sec-title').map(n => textOf(n));
  assert.deepEqual(titles.slice(0, 5), Array.from(data.chapter.sections, s => s.title));
  const next = walk(app, 'ch-next-link');
  assert.deepEqual(Array.from(next, a => a.href), Array.from(data.chapterUI.next, l => l.href));
  assert.deepEqual(Array.from(next, a => textOf(a)), Array.from(data.chapterUI.next, l => l.label));
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
  const cwWrap = walk(capp, 'cw-wrap')[0];
  assert.ok(cwWrap.children.indexOf(banner) < cwWrap.children.findIndex(n => n.className.includes('cw-group')), 'banner sits above the person grid');
  assert.equal(walk(capp, 'cw-chapter-link').length, 0, 'old in-card link removed');
  assert.equal(data.chapterUI.cardLink, undefined, 'cardLink field removed');
});
