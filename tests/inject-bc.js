const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { createHash } = require("crypto");
const FILE = "D:/shimais-daming/frontend/data.js";
const raw = fs.readFileSync(FILE, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const ctx = () => vm.createContext({ window: {} });
const before = vm.runInContext(raw + "\nSITE_DATA;", ctx());
const h = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

const EMP = {
  太祖: "shan", 惠宗: "teshu", 成祖: "shan", 仁宗: "shan", 宣宗: "shan",
  英宗: "teshu", 代宗: "teshu", 宪宗: "shan", 孝宗: "shan", 武宗: "shan",
  世宗: "shan", 穆宗: "shan", 神宗: "shan", 光宗: "teshu", 熹宗: "shan", 思宗: "zhanshang",
};
const CHIEF = {
  解缙: "feiming", 杨士奇: "shan", 陈循: "bazhu", 商辂: "shan", 徐溥: "shan",
  刘健: "shan", 李东阳: "shan", 杨廷和: "bazhu", 夏言: "feiming", 严嵩: "feiming",
  徐阶: "shan", 高拱: "bazhu", 张居正: "shan", 申时行: "shan", 方从哲: "bazhu",
  叶向高: "bazhu", 周延儒: "feiming", 温体仁: "bazhu", 薛国观: "feiming", 魏藻德: "feiming",
};
const GUEST = {
  徐达: "shan", 常遇春: "zhanshang", 李文忠: "shan", 冯胜: "teshu", 傅友德: "feiming",
  蓝玉: "feiming", 于谦: "feiming", 王守仁: "shan", 戚继光: "bazhu", 李成梁: "bazhu",
  李如松: "zhanshang", 卢象升: "zhanshang", 孙传庭: "zhanshang", 袁崇焕: "feiming",
  杨嗣昌: "teshu", 徐霞客: "shan",
};

const relStart = lines.findIndex((l) => l === "  relations: {");
assert.ok(relStart > 0, "relations start");
let relEnd = -1;
for (let i = relStart + 1; i < lines.length; i++) { if (lines[i] === "  },") { relEnd = i; break; } }
assert.ok(relEnd > relStart, "relations end");

let lane = null;
const counts = {};
let touched = 0;
for (let i = relStart + 1; i < relEnd; i++) {
  const l = lines[i];
  if (l === "    emperors: [") { lane = EMP; continue; }
  if (l === "    chiefs: [") { lane = CHIEF; continue; }
  if (l === "    guests: [") { lane = GUEST; continue; }
  if (l === "    ],") { lane = null; continue; }
  const m = l.match(/^\s*\{ name: "([^"]+)"/);
  if (!m) continue;
  assert.ok(lane, "entry outside lane: " + l);
  const name = m[1];
  const et = lane[name];
  assert.ok(et, "no endType for " + name);
  assert.ok(!l.includes("endType"), "already has endType: " + name);
  const braces = l.match(/}/g) || [];
  assert.equal(braces.length, 1, "expected single closing brace: " + l);
  lines[i] = l.replace(/}(\s*,?)\s*$/, ', endType: "' + et + '"}$1');
  counts[et] = (counts[et] || 0) + 1;
  touched++;
}
assert.equal(touched, 53, "touched " + touched);
assert.deepEqual(counts, { shan: 23, bazhu: 8, feiming: 10, zhanshang: 5, teshu: 7 }, JSON.stringify(counts));

fs.writeFileSync(FILE, lines.join(eol));
const after = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", ctx());

// existing fields verbatim: strip endType everywhere, then reproduce the original-28 digest
const strip = (o) => { const { endType, ...rest } = o; return rest; };
const newGuestNames = ["徐达", "常遇春", "李文忠", "冯胜", "傅友德", "蓝玉", "李成梁", "徐霞客"];
const stripped = {
  ...after.relations,
  emperors: after.relations.emperors.map(({ fullName, endType, ...rest }) => rest),
  chiefs: after.relations.chiefs.map(strip),
  guests: after.relations.guests.filter((g) => !newGuestNames.includes(g.name)).map(strip),
};
assert.equal(h(stripped), "b8b60fa9e112b7f22bc6b625bb9fc79a9ca3aa102d0a6585612179b24eb6be56", "original-28 existing fields must stay verbatim");

// every entry now carries a valid endType; counts per lane
const all = [...after.relations.emperors, ...after.relations.chiefs, ...after.relations.guests];
assert.equal(all.length, 53);
all.forEach((p) => assert.ok(["shan", "bazhu", "feiming", "zhanshang", "teshu"].includes(p.endType), p.name));
const tally = {};
all.forEach((p) => (tally[p.endType] = (tally[p.endType] || 0) + 1));
assert.deepEqual(tally, { shan: 23, bazhu: 8, feiming: 10, zhanshang: 5, teshu: 7 });
// whole-data-minus-territory digest for test refresh
const { territory, ...existing } = after;
console.log("NEWDATA_DIGEST", h(existing));
console.log("OK: 53 endType injected; counts", JSON.stringify(tally), "; original-28 fields verbatim");