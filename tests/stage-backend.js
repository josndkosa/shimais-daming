const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = "D:/shimais-daming";
const PLAN = [
  { file: "backend/main.py", test: (l) => /^\+.*(MEMORY_TIERS|_memory_note|memory: Optional|memory_note|Optional)/.test(l) },
  { file: "backend/test_api.py", test: (l) => /^\+.*(test_memory_|test_chat_without_memory|memory=)/.test(l) },
];
for (const { file, test } of PLAN) {
  const diff = execSync(`git diff HEAD -- "${file}"`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  if (!diff.trim()) { console.log("no diff:", file); continue; }
  const lines = diff.split("\n");
  const header = []; const hunks = []; let cur = null;
  for (const line of lines) {
    if (line.startsWith("@@")) { cur = [line]; hunks.push(cur); }
    else if (cur) cur.push(line);
    else header.push(line);
  }
  const keep = hunks.filter((h) => h.some((l) => test(l)));
  if (!keep.length) { console.log("!! no matching hunk:", file); continue; }
  const tmp = path.join(ROOT, ".git", "stage-" + file.replace(/[^a-zA-Z0-9]/g, "_") + ".patch");
  fs.writeFileSync(tmp, [...header, ...keep.flat()].join("\n"));
  execSync(`git apply --cached --whitespace=nowarn "${tmp}"`, { cwd: ROOT });
  fs.unlinkSync(tmp);
  console.log(file, "staged:", keep.length, "dropped:", hunks.length - keep.length);
}
console.log(execSync("git diff --cached --stat", { cwd: ROOT }).toString());
