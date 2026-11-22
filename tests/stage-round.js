/* 只把本轮改动（亲历封面）入暂存区，外部未完成的疆域改动留在工作区。 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = "D:/shimais-daming";

const PLAN = [
  { file: "frontend/data.js", test: (l) => /^\+.*cover: "images\/qinli\//.test(l) },
  { file: "frontend/app.js", test: (l) => /^\+.*(ql-cover|cover\.alt|cover\.loading|cover\.decoding|cover\.addEventListener|cover\.src)/.test(l) },
  { file: "frontend/styles.css", test: (l) => /^\+.*(\.ql-cover)/.test(l) },
  { file: "frontend/content.test.cjs", test: (l) => /^\+.*(cover image matching its id|site data digest reflects the cover fields only)/.test(l) },
];

function splitHunks(diff) {
  const lines = diff.split("\n");
  const header = [];
  const hunks = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith("@@")) {
      cur = [line];
      hunks.push(cur);
    } else if (cur) {
      cur.push(line);
    } else {
      header.push(line);
    }
  }
  return { header, hunks };
}

for (const { file, test } of PLAN) {
  const diff = execSync(`git diff HEAD -- "${file}"`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  if (!diff.trim()) { console.log("no diff for", file); continue; }
  const { header, hunks } = splitHunks(diff);
  const keep = hunks.filter((h) => h.some((l) => test(l)));
  const dropped = hunks.length - keep.length;
  if (!keep.length) { console.log("!! no matching hunk for", file); continue; }
  const patch = [...header, ...keep.flat()].join("\n");
  const tmp = path.join(ROOT, ".git", "stage-" + file.replace(/[\/\\]/g, "_") + ".patch");
  fs.writeFileSync(tmp, patch);
  execSync(`git apply --cached --whitespace=nowarn "${tmp}"`, { cwd: ROOT });
  fs.unlinkSync(tmp);
  console.log(file, "staged hunks:", keep.length, "dropped:", dropped);
}
execSync("git add frontend/images/qinli", { cwd: ROOT });
console.log("staged files:");
console.log(execSync("git diff --cached --stat", { cwd: ROOT }).toString());
