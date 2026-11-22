const fs = require("fs");
const ROOT = "D:/shimais-daming/frontend/";
const DESC = {
  "index.html": "一个把权力抓得最紧的王朝，为什么最后失控了？",
  "timeline.html": "1368 — 1644，十六帝",
  "decisions.html": "三个关口，亲手做三次选择",
  "cards.html": "人与制度，互相塑造",
  "chat.html": "六个人物，各十回合",
  "quiz.html": "检验你读懂了多少",
  "profile.html": "你的阅读轨迹",
  "relations.html": "三条线，看清 276 年的权力结构",
  "search.html": "站内材料 · 时间线 · 帝王首辅表；内容身份与核验范围见材料详情，不等于全部原典已校勘。",
  "chapter.html": "用白话把洪武朝从头讲一遍——建国、废相、锦衣卫与晚年大狱，全文依据本站已核材料。",
  "qinli.html": "记住历史最好的方式，是亲身经历一遍历史——选一个身份，活过一段大明。",
  "qinli-play.html": "亲历 · 长剧本——选一个身份，活过一段大明。",
};
const FAV = '  <link rel="icon" type="image/svg+xml" href="favicon.svg" />';
const OG = [
  '  <meta property="og:title" content="史脉·大明" />',
  '  <meta property="og:description" content="一个把权力抓得最紧的王朝，为什么最后失控了？" />',
  '  <meta property="og:type" content="website" />',
  '  <meta property="og:image" content="/images/carousel/01-taihedian.jpg" />',
];
for (const [file, desc] of Object.entries(DESC)) {
  const raw = fs.readFileSync(ROOT + file, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes('<meta name="description" content="" />'));
  if (i < 0) throw new Error("no empty description in " + file);
  lines[i] = '  <meta name="description" content="' + desc + '" />';
  const add = file === "index.html" ? [...OG, FAV] : [FAV];
  lines.splice(i + 1, 0, ...add);
  fs.writeFileSync(ROOT + file, lines.join(eol));
  console.log("updated", file);
}
