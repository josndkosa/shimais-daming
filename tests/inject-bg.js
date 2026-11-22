const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { createHash } = require("crypto");
const FILE = "D:/shimais-daming/frontend/data.js";
const ch8 = JSON.parse(fs.readFileSync(__dirname + "/chapter8.json", "utf8"));
const raw = fs.readFileSync(FILE, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const before = vm.runInContext(raw + "\nSITE_DATA;", vm.createContext({ window: {} }));
const h = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const priorDigests = before.chapters.map(h);

const q = (s) => JSON.stringify(s);
function fmt(v, ind) {
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return "[\n" + v.map((x) => ind + "  " + fmt(x, ind + "  ")).join(",\n") + ",\n" + ind + "]";
  }
  if (v && typeof v === "object") {
    return "{\n" + Object.entries(v).map(([k, x]) => ind + "  " + k + ": " + fmt(x, ind + "  ")).join(",\n") + ",\n" + ind + "}";
  }
  return q(v);
}
const body = ["      id: " + q(ch8.id) + ",", "      title: " + q(ch8.title) + ",", "      intro: " + q(ch8.intro) + ",",
  "      sections: " + fmt(ch8.sections, "      ") + ",",
  "      nextSteps: [",
  ...ch8.nextSteps.map((s) => "        { label: " + q(s.label) + ", href: " + q(s.href) + " },"),
  "      ],"];
const uiStart = lines.findIndex((l) => l === "  chapterUI: {");
let close = -1;
for (let i = uiStart - 1; i >= 0; i--) { if (lines[i] === "  ],") { close = i; break; } }
assert.ok(close > 0, "chapters close");
lines.splice(close, 0, "    {", ...body, "    },");
const seventh = lines.findIndex((l) => l.startsWith("    seventhLink:"));
assert.ok(seventh >= 0);
lines.splice(seventh + 1, 0, '    finaleLink: "终章 · 徐霞客 →",');
fs.writeFileSync(FILE, lines.join(eol));

const after = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", vm.createContext({ window: {} }));
assert.equal(after.chapters.length, 8);
priorDigests.forEach((d, i) => assert.equal(h(after.chapters[i]), d, "chapter " + (i + 1) + " changed"));
assert.deepEqual(JSON.parse(JSON.stringify(after.chapters[7])), JSON.parse(JSON.stringify(ch8)));
assert.equal(after.chapterUI.finaleLink, "终章 · 徐霞客 →");
const finale = after.chapters[7];
assert.equal(finale.sections.reduce((n, s) => n + s.paragraphs.length, 0), 18, "finale has 18 paragraphs");
// 引文段唯一：全站仅终章第五节第四段为整段引文
const quotes = [];
after.chapters.forEach((c, ci) => c.sections.forEach((s, si) => s.paragraphs.forEach((p, pi) => {
  if (/^“[^”]*”$/.test(p.trim())) quotes.push([ci, si, pi]);
})));
assert.deepEqual(quotes, [[7, 4, 3]], "quote paragraph must be unique: " + JSON.stringify(quotes));
const finaleText = finale.sections.map((s) => s.paragraphs.join("")).join("");
assert.ok(finaleText.includes("十余省"), "province count must stay vague");
assert.ok(!/十[一二三四五六七八九]省/.test(finaleText), "no specific province count");
assert.ok(finaleText.includes("《明史》里没有他的传"), "must not claim a Ming History biography");
assert.ok(finaleText.includes("原稿有两百多万字") && finaleText.includes("现存约四十万字"), "two word-count sentences must stay separate");
["大丈夫当朝游碧海而暮宿苍梧", "五岳归来不看山，黄山归来不看岳"].forEach((w) => assert.ok(!finaleText.includes(w), "forbidden quote: " + w));
console.log("OK: finale appended verbatim; chapters 1-7 digests unchanged:", priorDigests.map((d) => d.slice(0, 12)).join(" "));
console.log("finale prose digest:", h({ id: finale.id, title: finale.title, intro: finale.intro, sections: finale.sections }));
console.log("data digest:", h((({ territory, ...rest }) => rest)(after)));