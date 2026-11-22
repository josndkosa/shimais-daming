const fs = require("fs");
const vm = require("vm");
const FILE = "D:/shimais-daming/frontend/data.js";
const raw = fs.readFileSync(FILE, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const old = vm.runInContext(raw + "\nSITE_DATA;", vm.createContext({ window: {} }));
const ch2 = JSON.parse(fs.readFileSync(__dirname + "/chapter2.json", "utf8"));

const start = lines.findIndex((l) => l === "  chapter: {");
const uiStart = lines.findIndex((l) => l === "  chapterUI: {");
if (start < 0 || uiStart < 0) throw new Error("blocks not found");
let end = -1;
for (let i = uiStart - 1; i > start; i--) { if (lines[i] === "  },") { end = i; break; } }
if (end < 0) throw new Error("chapter close not found");

const inner = lines.slice(start + 1, end).filter((l) => l.trim() !== 'series: "白话明史",');
const moved = inner.map((l) => (l.trim() ? "  " + l : l));

const q = (s) => JSON.stringify(s);
const nextStepsBlock = (steps, ind) => [
  ind + "nextSteps: [",
  ...steps.map((s) => ind + "  { label: " + q(s.label) + ", href: " + q(s.href) + " },"),
  ind + "],",
];

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
const ch2Body = ["      id: " + q(ch2.id) + ",", "      title: " + q(ch2.title) + ",", "      intro: " + q(ch2.intro) + ",",
  "      sections: " + fmt(ch2.sections, "      ") + ",", ...nextStepsBlock(ch2.nextSteps, "      ")];

const chaptersBlock = [
  "  chapters: [",
  "    {",
  '      id: "hongwu",',
  ...moved,
  ...nextStepsBlock(old.chapterUI.next, "      "),
  "    },",
  "    {",
  ...ch2Body,
  "    },",
  "  ],",
];

lines.splice(start, end - start + 1, ...chaptersBlock);

const uiStart2 = lines.findIndex((l) => l === "  chapterUI: {");
const nextStart = lines.findIndex((l, i) => i > uiStart2 && l === "    next: [");
let nextEnd = -1;
for (let i = nextStart + 1; i < lines.length; i++) { if (lines[i] === "    ],") { nextEnd = i; break; } }
if (nextStart < 0 || nextEnd < 0) throw new Error("chapterUI.next not found");
lines.splice(nextStart, nextEnd - nextStart + 1);
const uiStart3 = lines.findIndex((l) => l === "  chapterUI: {");
lines.splice(uiStart3 + 1, 0, '    series: "白话明史",');
const bannerBtn = lines.findIndex((l, i) => i > uiStart3 && l.startsWith("    bannerBtn:"));
lines.splice(bannerBtn + 1, 0, '    secondLink: "第二章 · 建文与靖难 →",');

fs.writeFileSync(FILE, lines.join(eol));

const check = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", vm.createContext({ window: {} }));
const assert = require("assert");
assert.equal(check.chapter, undefined, "old chapter field remains");
assert.equal(check.chapterUI.next, undefined, "old next field remains");
assert.equal(check.chapters.length, 2);
const { series, ...oldCh1 } = old.chapter;
assert.deepEqual(JSON.parse(JSON.stringify(check.chapters[0])), JSON.parse(JSON.stringify({ id: "hongwu", ...oldCh1, nextSteps: old.chapterUI.next })));
assert.deepEqual(JSON.parse(JSON.stringify(check.chapters[1])), JSON.parse(JSON.stringify(ch2)));
assert.equal(check.chapterUI.series, "白话明史");
assert.equal(check.chapterUI.secondLink, "第二章 · 建文与靖难 →");
console.log("OK: chapters[0] verbatim moved, chapters[1] verbatim injected, chapterUI updated");