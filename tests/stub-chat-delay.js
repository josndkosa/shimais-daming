/* 延迟回复 stub：600ms 后按人物+消息回 echo，供串台验收。 */
const http = require("http");
const fs = require("fs");
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
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*", "Content-Type": "application/json" };
    if (req.method === "GET" && !req.url.startsWith("/api/")) return serveStatic(req, res, cors);
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (req.url === "/api/health") { res.writeHead(200, cors); return res.end(JSON.stringify({ status: "ok", figures: ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"] })); }
    if (req.url === "/api/chat" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const j = JSON.parse(body || "{}");
        fs.appendFileSync(__dirname + "/chat-requests.jsonl", JSON.stringify(j) + "\n");
        setTimeout(() => {
          res.writeHead(200, cors);
          res.end(JSON.stringify({ reply: "REP-" + j.figure + "-" + j.message, note: null }));
        }, 600);
      });
      return;
    }
    res.writeHead(404, cors);
    res.end("{}");
  })
  .listen(Number(process.argv[2]) || 8000, "127.0.0.1", () => console.log("delay stub on 8000"));
