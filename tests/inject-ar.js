const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { createHash } = require("crypto");
const FILE = "D:/shimais-daming/frontend/data.js";
const raw = fs.readFileSync(FILE, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const before = vm.runInContext(raw + "\nSITE_DATA;", vm.createContext({ window: {} }));
const h = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const ch1Digest = h(before.chapters[0]);
const ch2Digest = h(before.chapters[1]);
const ch3 = JSON.parse(fs.readFileSync(__dirname + "/chapter3.json", "utf8"));

const uiStart = lines.findIndex((l) => l === "  chapterUI: {");
let close = -1;
for (let i = uiStart - 1; i >= 0; i--) { if (lines[i] === "  ],") { close = i; break; } }
if (close < 0) throw new Error("chapters close not found");

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
const body = ["      id: " + q(ch3.id) + ",", "      title: " + q(ch3.title) + ",", "      intro: " + q(ch3.intro) + ",",
  "      sections: " + fmt(ch3.sections, "      ") + ",",
  "      nextSteps: [",
  ...ch3.nextSteps.map((s) => "        { label: " + q(s.label) + ", href: " + q(s.href) + " },"),
  "      ],"];
lines.splice(close, 0, "    {", ...body, "    },");

const second = lines.findIndex((l) => l.startsWith("    secondLink:"));
if (second < 0) throw new Error("secondLink not found");
lines.splice(second + 1, 0, '    thirdLink: "第三章 · 土木堡与北京保卫战 →",');

fs.writeFileSync(FILE, lines.join(eol));

const after = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", vm.createContext({ window: {} }));
assert.equal(after.chapters.length, 3);
assert.equal(h(after.chapters[0]), ch1Digest, "chapter one changed");
assert.equal(h(after.chapters[1]), ch2Digest, "chapter two changed");
assert.deepEqual(JSON.parse(JSON.stringify(after.chapters[2])), JSON.parse(JSON.stringify(ch3)));
assert.equal(after.chapterUI.thirdLink, "第三章 · 土木堡与北京保卫战 →");
assert.ok(!JSON.stringify(after.chapters[2]).includes("石灰吟"), "石灰吟 must not appear");
console.log("OK: chapter three appended verbatim; chapters 1/2 digests unchanged:", ch1Digest.slice(0, 12), ch2Digest.slice(0, 12));