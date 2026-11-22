const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const DIR = __dirname;
const files = fs.readdirSync(DIR)
  .filter((f) => /^verify\d+\.js$/.test(f))
  .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));

function serveUp() {
  const r = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "http://127.0.0.1:4173/index.html"], { encoding: "utf8" });
  return (r.stdout || "").trim() === "200";
}
let serveProc = null;
if (!serveUp()) {
  serveProc = spawn(process.execPath, [path.join(DIR, "serve.js")], { stdio: "ignore" });
  for (let i = 0; i < 30 && !serveUp(); i++) spawnSync("sleep", ["0.3"]);
}

const results = [];
function run(file) {
  const r = spawnSync(process.execPath, [path.join(DIR, file)], { encoding: "utf8", timeout: 240000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/(\d+)\/(\d+) passed/) || out.match(/== \w+ (\d+)\/(\d+) ==/) || out.match(/"total": (\d+),\s*"pass": (\d+)/);
  const pass = m ? +m[1] : 0;
  const tot = m ? +m[2] : 0;
  const ok = r.status === 0 && !!m && pass === tot;
  results.push({ file, pass, tot, ok, code: r.status });
  console.log((ok ? "PASS " : "FAIL ") + file + " " + pass + "/" + tot + (ok ? "" : " (exit " + r.status + ")"));
  return ok;
}
for (const f of files) run(f);
run("dbg-bt.js");

const passed = results.filter((r) => r.ok).length;
const sumPass = results.reduce((n, r) => n + r.pass, 0);
const sumTot = results.reduce((n, r) => n + r.tot, 0);
console.log("\nSUITES " + passed + "/" + results.length + " green; assertions " + sumPass + "/" + sumTot);
console.log("FAILED: " + (results.filter((r) => !r.ok).map((r) => r.file).join(", ") || "none"));
if (serveProc) serveProc.kill();
process.exit(passed === results.length ? 0 : 1);