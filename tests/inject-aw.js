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
const priorDigests = before.chapters.map(h);
const ch6 = JSON.parse(fs.readFileSync(__dirname + "/chapter6.json", "utf8"));

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
const body = ["      id: " + q(ch6.id) + ",", "      title: " + q(ch6.title) + ",", "      intro: " + q(ch6.intro) + ",",
  "      sections: " + fmt(ch6.sections, "      ") + ",",
  "      nextSteps: [",
  ...ch6.nextSteps.map((s) => "        { label: " + q(s.label) + ", href: " + q(s.href) + " },"),
  "      ],"];
lines.splice(close, 0, "    {", ...body, "    },");

const fifth = lines.findIndex((l) => l.startsWith("    fifthLink:"));
if (fifth < 0) throw new Error("fifthLink not found");
lines.splice(fifth + 1, 0, '    sixthLink: "第六章 · 万历怠政 →",');

fs.writeFileSync(FILE, lines.join(eol));

const after = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", vm.createContext({ window: {} }));
assert.equal(after.chapters.length, 6);
priorDigests.forEach((d, i) => assert.equal(h(after.chapters[i]), d, "chapter " + (i + 1) + " changed"));
assert.deepEqual(JSON.parse(JSON.stringify(after.chapters[5])), JSON.parse(JSON.stringify(ch6)));
assert.equal(after.chapterUI.sixthLink, "第六章 · 万历怠政 →");
["国本之争", "东林党争", "矿税监"].forEach((w) => assert.ok(!JSON.stringify(after.chapters[5]).includes(w), "forbidden topic: " + w));
console.log("OK: chapter six appended verbatim; chapters 1-5 digests unchanged:", priorDigests.map((d) => d.slice(0, 12)).join(" "));