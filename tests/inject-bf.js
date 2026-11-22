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
const ch7 = JSON.parse(fs.readFileSync(__dirname + "/chapter7.json", "utf8"));

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
const body = ["      id: " + q(ch7.id) + ",", "      title: " + q(ch7.title) + ",", "      intro: " + q(ch7.intro) + ",",
  "      sections: " + fmt(ch7.sections, "      ") + ",",
  "      nextSteps: [",
  ...ch7.nextSteps.map((s) => "        { label: " + q(s.label) + ", href: " + q(s.href) + " },"),
  "      ],"];
lines.splice(close, 0, "    {", ...body, "    },");

const sixth = lines.findIndex((l) => l.startsWith("    sixthLink:"));
if (sixth < 0) throw new Error("sixthLink not found");
lines.splice(sixth + 1, 0, '    seventhLink: "第七章 · 崇祯 →",');

fs.writeFileSync(FILE, lines.join(eol));

const after = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", vm.createContext({ window: {} }));
assert.equal(after.chapters.length, 7);
priorDigests.forEach((d, i) => assert.equal(h(after.chapters[i]), d, "chapter " + (i + 1) + " changed"));
assert.deepEqual(JSON.parse(JSON.stringify(after.chapters[6])), JSON.parse(JSON.stringify(ch7)));
assert.equal(after.chapterUI.seventhLink, "第七章 · 崇祯 →");
["遗诏", "东林党", "天灾"].forEach((w) => assert.ok(!JSON.stringify(after.chapters[6]).includes(w), "forbidden topic: " + w));
console.log("OK: chapter seven appended verbatim; chapters 1-6 digests unchanged:", priorDigests.map((d) => d.slice(0, 12)).join(" "));