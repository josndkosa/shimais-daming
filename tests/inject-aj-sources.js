const fs = require("fs");
const FILE = "D:/shimais-daming/frontend/data.js";
const chunks = JSON.parse(fs.readFileSync("D:/shimais-daming/backend/data/zhuyuanzhang.json", "utf8")).chunks;
const byId = Object.fromEntries(chunks.map((c) => [c.id, c]));
const plan = [["c1", "c2", "c6"], ["c3"], ["c4", "c5"], ["c7", "c8"], []];
const raw = fs.readFileSync(FILE, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const start = lines.findIndex((l) => /^  chapter: \{/.test(l));
const end = lines.findIndex((l) => /^  chapterUI:/.test(l));
if (start < 0 || end < 0) throw new Error("chapter block not found");
const noteIdx = [];
for (let i = start; i < end; i++) if (/^        sourceNote:/.test(lines[i])) noteIdx.push(i);
if (noteIdx.length !== 5) throw new Error("expected 5 sourceNote lines, got " + noteIdx.length);
const block = (ids) => {
  if (!ids.length) return ["        sources: [],"];
  const out = ["        sources: ["];
  ids.forEach((id) => {
    const c = byId[id];
    if (!c) throw new Error("missing chunk " + id);
    out.push("          { id: " + JSON.stringify(c.id) + ", title: " + JSON.stringify(c.title) + ", text: " + JSON.stringify(c.text) + ", source: " + JSON.stringify(c.source) + " },");
  });
  out.push("        ],");
  return out;
};
for (let k = noteIdx.length - 1; k >= 0; k--) {
  lines.splice(noteIdx[k] + 1, 0, ...block(plan[k]));
}
fs.writeFileSync(FILE, lines.join(eol));
console.log("inserted sources for 5 sections; EOL=" + JSON.stringify(eol));