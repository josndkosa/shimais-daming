const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { createHash } = require("crypto");
const FILE = "D:/shimais-daming/frontend/data.js";
const NEW = JSON.parse(fs.readFileSync(__dirname + "/guests8.json", "utf8"));
const KEYWORDS = {
  徐达: ["徐达", "大将军", "开国第一名将", "北伐", "善终"],
  常遇春: ["常遇春", "鄂国公", "常十万", "勇冠三军", "暴卒"],
  李文忠: ["李文忠", "曹国公", "太祖外甥", "谨慎", "北伐"],
  冯胜: ["冯胜", "宋国公", "平辽", "纳哈出", "辽东"],
  傅友德: ["傅友德", "颍国公", "平滇", "赐死", "漠北"],
  蓝玉: ["蓝玉", "凉国公", "捕鱼儿海", "蓝玉案", "谋反"],
  李成梁: ["李成梁", "辽东总兵", "镇辽三十年", "努尔哈赤", "李如松"],
  徐霞客: ["徐霞客", "布衣", "旅行家", "徐霞客游记", "游历"],
};
const raw = fs.readFileSync(FILE, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const before = vm.runInContext(raw + "\nSITE_DATA;", vm.createContext({ window: {} }));
const h = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const origRelationsDigest = h({ ...before.relations, emperors: before.relations.emperors.map(({ fullName, ...rest }) => rest) });
const origIndexDigest = h(before.searchIndex || []);
const idxBefore = vm.runInContext(raw + "\nSEARCH_INDEX;", vm.createContext({ window: {} }));
const origIndex99 = h(idxBefore);

const q = (s) => JSON.stringify(s);
const guestLine = (g) => "      { name: " + q(g.name) + ", office: " + q(g.office) + ", segments: " + JSON.stringify(g.segments) + ", lord: " + q(g.lord) + ", tag: " + q(g.tag) + ", end: " + q(g.end) + ", note: " + q(g.note) + " },";

const gStart = lines.findIndex((l) => l === "    guests: [");
let gEnd = -1;
for (let i = gStart + 1; i < lines.length; i++) { if (lines[i] === "    ],") { gEnd = i; break; } }
assert.ok(gStart >= 0 && gEnd > gStart, "guests block");
const liIdx = lines.findIndex((l, i) => i > gStart && i < gEnd && l.includes('{ name: "李如松"'));
assert.ok(liIdx > gStart, "李如松 anchor");
lines.splice(liIdx, 0, guestLine(NEW[6]));
lines.splice(gEnd + 1, 0, guestLine(NEW[7]));
lines.splice(gStart + 1, 0, ...NEW.slice(0, 6).map(guestLine));

const legend = lines.findIndex((l) => l.startsWith('    legendNote: "特邀为非首辅的统兵重臣'));
assert.ok(legend >= 0);
lines[legend] = '    legendNote: "特邀：不走内阁线的统兵重臣，及一位布衣旅行家。官职以小卡为准。",';

const idxStart = lines.findIndex((l) => l.startsWith("const SEARCH_INDEX = ["));
let idxEnd = -1;
for (let i = idxStart + 1; i < lines.length; i++) { if (lines[i] === "];") { idxEnd = i; break; } }
assert.ok(idxEnd > idxStart, "index end");
const idxLines = NEW.map((g) => "  {\"kind\":\"relation\",\"id\":" + q(g.name) + ",\"title\":" + q(g.name) + ",\"lord\":" + q(g.lord) + ",\"text\":" + q(g.office + "；" + g.note) + ",\"source\":\"本站帝王首辅表\",\"keywords\":" + JSON.stringify(KEYWORDS[g.name]) + ",\"target\":\"relations.html?person=" + g.name + "&kind=guest\"},");
lines.splice(idxEnd, 0, ...idxLines);
const comment = lines.findIndex((l) => l.includes("史料检索索引：99 条"));
assert.ok(comment >= 0);
lines[comment] = lines[comment].replace("99 条（史料 48＋时间线 23＋关系表 28）", "107 条（史料 48＋时间线 23＋关系表 36）");

fs.writeFileSync(FILE, lines.join(eol));

const after = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", vm.createContext({ window: {} }));
const idxAfter = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSEARCH_INDEX;", vm.createContext({ window: {} }));
assert.equal(after.relations.guests.length, 16);
NEW.forEach((g) => {
  const got = after.relations.guests.find((x) => x.name === g.name);
  assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(g)), g.name);
});
const newNames = NEW.map((g) => g.name);
const origGuests = after.relations.guests.filter((g) => !newNames.includes(g.name));
assert.equal(h({ ...after.relations, emperors: after.relations.emperors.map(({ fullName, ...rest }) => rest), guests: origGuests }), origRelationsDigest, "original 28 relations entries changed");
assert.equal(idxAfter.length, 107);
assert.equal(h(idxAfter.slice(0, 99)), origIndex99, "first 99 index entries changed");
assert.equal(after.relationsUI.legendNote, "特邀：不走内阁线的统兵重臣，及一位布衣旅行家。官职以小卡为准。");
assert.equal(after.relations.guests[0].name, "徐达");
assert.equal(after.relations.guests[15].name, "徐霞客");
console.log("OK: 16 guests, index 107, original 28 + first 99 verbatim; origRelations", origRelationsDigest.slice(0, 12), "index99", origIndex99.slice(0, 12));
console.log("new full index digest:", h(idxAfter));
console.log("new data digest:", h((({ territory, ...rest }) => rest)(after)));