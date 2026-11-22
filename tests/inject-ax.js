const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const FILE = "D:/shimais-daming/frontend/data.js";
const FULL = {
  太祖: "朱元璋", 惠宗: "朱允炆", 成祖: "朱棣", 仁宗: "朱高炽", 宣宗: "朱瞻基",
  英宗: "朱祁镇", 代宗: "朱祁钰", 宪宗: "朱见深", 孝宗: "朱祐樘", 武宗: "朱厚照",
  世宗: "朱厚熜", 穆宗: "朱载坖", 神宗: "朱翊钧", 光宗: "朱常洛", 熹宗: "朱由校", 思宗: "朱由检",
};
const raw = fs.readFileSync(FILE, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const before = vm.runInContext(raw + "\nSITE_DATA;", vm.createContext({ window: {} }));
const start = lines.findIndex((l) => l === "    emperors: [");
let end = -1;
for (let i = start + 1; i < lines.length; i++) { if (lines[i] === "    ],") { end = i; break; } }
if (start < 0 || end < 0) throw new Error("emperors block not found");
let count = 0;
for (let i = start + 1; i < end; i++) {
  const m = lines[i].match(/^      \{ name: "([^"]+)",/);
  if (m) {
    assert.ok(FULL[m[1]], "unknown emperor " + m[1]);
    lines[i] = lines[i].replace('{ name: "' + m[1] + '",', '{ name: "' + m[1] + '", fullName: "' + FULL[m[1]] + '",');
    count++;
  }
}
assert.equal(count, 17);
const identity = lines.findIndex((l) => l === '      identity: "身份",');
assert.ok(identity >= 0);
lines.splice(identity + 1, 0, '      era: "年号",');
fs.writeFileSync(FILE, lines.join(eol));
const after = vm.runInContext(fs.readFileSync(FILE, "utf8") + "\nSITE_DATA;", vm.createContext({ window: {} }));
assert.equal(after.relations.emperors.length, 17);
after.relations.emperors.forEach((e) => {
  assert.equal(e.fullName, FULL[e.name]);
  const orig = before.relations.emperors.find((o) => o.name === e.name && o.from === e.from && o.to === e.to);
  assert.equal(e.era, orig.era); assert.equal(e.note, orig.note);
});
assert.equal(after.relations.emperors.filter((e) => e.name === "英宗").length, 2);
assert.ok(after.relations.emperors.filter((e) => e.name === "英宗").every((e) => e.fullName === "朱祁镇"));
assert.equal(after.relationsUI.cardLabels.era, "年号");
assert.equal(after.relationsUI.cardLabels.identity, "身份");
assert.deepEqual(JSON.parse(JSON.stringify(after.relations.chiefs)), JSON.parse(JSON.stringify(before.relations.chiefs)));
assert.deepEqual(JSON.parse(JSON.stringify(after.relations.guests)), JSON.parse(JSON.stringify(before.relations.guests)));
console.log("OK: 17 fullName added, cardLabels.era added, chiefs/guests untouched");