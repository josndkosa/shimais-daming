/* 只暂存本轮（对话记忆/信任进度/亲历互链/后端 memory）改动；外部疆域改动留在工作区。 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = "D:/shimais-daming";

const PLAN = [
  { file: "frontend/data.js", test: (l) => /^\+.*(memoryHintPrefix|tierLabelPrefix|forgetBtn|forgetConfirm|deepBadge|qinliLink|qinliDoneBadge|tiers:|deepQuestions|qinliStory|oldFriendsTitle|oldFriendsLine)/.test(l) },
  { file: "frontend/app.js", test: (l) => /^\+.*(CHATMEM_KEY|loadChatMem|saveChatMem|chatTier|ct-tier|ct-person-bar|ct-memory-note|ct-forget|ct-chip-deep|ct-deep-badge|pf-old|qinliLink|qinliBadge|paintMem|saveMem|deepQuestions|memory:|对话记忆存储|baseUsers|counted|tierNodes|personBar|memNote)/.test(l) },
  { file: "frontend/styles.css", test: (l) => /^\+.*(\.ct-tier|\.ct-person-bar|\.ct-qinli|\.ct-forget|\.ct-memory-note|\.ct-chip-deep|\.ct-deep-badge|\.pf-old)/.test(l) },
  { file: "frontend/content.test.cjs", test: (l) => /^\+.*(deep questions and a personal story link|site data digest reflects|chatTier|loadChatMem)/.test(l) },
  { file: "backend/main.py", test: (l) => /^\+.*(MEMORY_TIERS|_memory_note|memory: Optional|memory_note|Optional)/.test(l) },
  { file: "backend/test_api.py", test: (l) => /^\+.*(test_memory_|test_chat_without_memory|memory=)/.test(l) },
];

function splitHunks(diff) {
  const lines = diff.split("\n");
  const header = [];
  const hunks = [];
  let cur = null;
  for (const line of lines) {
    if (line.startsWith("@@")) { cur = [line]; hunks.push(cur); }
    else if (cur) cur.push(line);
    else header.push(line);
  }
  return { header, hunks };
}

for (const { file, test } of PLAN) {
  const diff = execSync(`git diff HEAD -- "${file}"`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  if (!diff.trim()) { console.log("no diff:", file); continue; }
  const { header, hunks } = splitHunks(diff);
  const keep = hunks.filter((h) => h.some((l) => test(l)));
  if (!keep.length) { console.log("!! no matching hunk:", file); continue; }
  const patch = [...header, ...keep.flat()].join("\n");
  const tmp = path.join(ROOT, ".git", "stage-" + file.replace(/[\/\\]/g, "_") + ".patch");
  fs.writeFileSync(tmp, patch);
  execSync(`git apply --cached --whitespace=nowarn "${tmp}"`, { cwd: ROOT });
  fs.unlinkSync(tmp);
  console.log(file, "staged:", keep.length, "dropped:", hunks.length - keep.length);
}
console.log(execSync("git diff --cached --stat", { cwd: ROOT }).toString());
