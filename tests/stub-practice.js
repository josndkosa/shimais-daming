/* 练习接口 stub：按 stub-mode.txt 切换 ok / fail503 / rate429，供前端端到端验收。 */
const http = require("http");
const fs = require("fs");
const MODE_FILE = __dirname + "/stub-mode.txt";
const DIMS = ["timeline", "timeline", "timeline", "timeline", "person", "person", "person", "institution", "institution", "institution"];
const questions = DIMS.map((d, i) => ({
  dim: d,
  stem: " stub 练习题 " + (i + 1) + "：选项哪个正确？",
  options: ["甲选项", "乙选项", "丙选项", "丁选项"],
  answer: i % 4,
  explain: "stub 解析：与制度主线相关。",
  source: "《明史· stub 本纪》",
}));
let count = 0;
const path = require("path");
const FRONT = path.resolve("D:/shimais-daming/frontend");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
function serveStatic(req, res, cors) {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(FRONT, rel === "/" ? "/index.html" : rel);
  if (!file.startsWith(FRONT)) { res.writeHead(403, cors); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, cors); return res.end("{}"); }
    let body = buf;
    if (file.endsWith(".html")) {
      body = Buffer.from(buf.toString("utf8").replace("<head>", '<head><meta name="api-base" content="same-origin">'), "utf8");
    }
    res.writeHead(200, Object.assign({}, cors, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" }));
    res.end(body);
  });
}
http
  .createServer((req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json",
    };
    if (req.method === "GET" && !req.url.startsWith("/api/")) return serveStatic(req, res, cors);
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (req.url === "/api/health") {
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ status: "ok", figures: ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"] }));
    }
    if (req.url === "/api/quiz/practice" && req.method === "POST") {
      count += 1;
      fs.writeFileSync(__dirname + "/stub-count.txt", String(count));
      let mode = "ok";
      try {
        mode = fs.readFileSync(MODE_FILE, "utf8").trim();
      } catch {}
      if (mode === "fail503") {
        res.writeHead(503, cors);
        return res.end(JSON.stringify({ detail: "generation_failed" }));
      }
      if (mode === "rate429") {
        res.writeHead(429, cors);
        return res.end(JSON.stringify({ detail: "出题过频：同一地址每小时最多 6 次，请稍后再试。" }));
      }
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ questions }));
    }
    if (req.url === "/api/chat" && req.method === "POST") {
      res.writeHead(200, cors);
      return res.end(JSON.stringify({ reply: "stub 回复。", note: null }));
    }
    res.writeHead(404, cors);
    res.end(JSON.stringify({ detail: "not found" }));
  })
  .listen(Number(process.argv[2]) || 8000, "127.0.0.1", () => console.log("stub on 8000"));