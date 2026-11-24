// BS-2 真验：已发布版本同域 API 实测（真实 LLM，非剧本兜底）。
// 运行：node tests/br/bs-live.mjs　红线：不记 key；只记状态/耗时/回复证据。
const BASE = "https://shimais-daming-n7yxxgeg8rh.qoder.zone/functions/v1/app";
const HEADERS = { "content-type": "application/json", origin: "https://shimais-daming-n7yxxgeg8rh.qoder.zone" };

async function chat(figure, message, history) {
  const t0 = Date.now();
  const resp = await fetch(BASE + "/api/chat", { method: "POST", headers: HEADERS, body: JSON.stringify({ figure, message, history }) });
  const body = await resp.json().catch(() => null);
  return { status: resp.status, ms: Date.now() - t0, body };
}

const log = (...a) => console.log(...a);

// 1) 真实对话（开放问题）
const q1 = "你出身布衣，为何对贪官下手这么狠？";
const r1 = await chat("zhuyuanzhang", q1, []);
log("== 1 真实对话 ==", r1.status, r1.ms + "ms");
log("reply:", r1.body && r1.body.reply);
log("note:", r1.body && r1.body.note);
if (r1.status !== 200 || !r1.body.reply) { log("HARD FAIL 真实对话"); process.exit(1); }

// 2) 十轮上限：同一人物续问至第 10 轮，第 11 轮触发契约
const history = [{ role: "user", content: q1 }, { role: "assistant", content: r1.body.reply }];
const followups = ["后来呢？", "然后呢？", "为何如此？", "再详细说说", "结果呢？", "他呢？", "这之后呢？", "继续", "为何？"];
let roundsOk = 1;
for (let i = 0; i < followups.length; i++) {
  const r = await chat("zhuyuanzhang", followups[i], history);
  if (r.status !== 200) { log("HARD FAIL 第" + (i + 2) + "轮", r.status, JSON.stringify(r.body)); process.exit(1); }
  history.push({ role: "user", content: followups[i] }, { role: "assistant", content: r.body.reply });
  roundsOk += 1;
  log("round", roundsOk, r.status, r.ms + "ms", "reply_len", r.body.reply.length);
}
const r11 = await chat("zhuyuanzhang", "再问一句", history);
log("== 2 十轮上限 == 完成轮数", roundsOk, "第11轮:", r11.status, JSON.stringify(r11.body));
if (r11.status !== 400 || r11.body.code !== "invalid_input") { log("HARD FAIL 十轮契约"); process.exit(1); }

// 3) 崇祯陷阱题（1644 之后之事）
const trap = "你殉国之后，大清如何处置你的家人？后来天下是谁的？";
const rt = await chat("chongzhen", trap, []);
log("== 3 崇祯陷阱 ==", rt.status, rt.ms + "ms");
log("reply:", rt.body && rt.body.reply);
log("note:", rt.body && rt.body.note);
if (rt.status !== 200) { log("HARD FAIL 陷阱题请求"); process.exit(1); }

// 4) AI 练习真生成
const t0 = Date.now();
const rp = await fetch(BASE + "/api/quiz/practice", { method: "POST", headers: HEADERS });
const pb = await rp.json().catch(() => null);
log("== 4 AI 练习 ==", rp.status, (Date.now() - t0) + "ms");
if (rp.status === 200 && pb.questions) {
  const dims = {};
  for (const q of pb.questions) dims[q.dim] = (dims[q.dim] || 0) + 1;
  log("题数", pb.questions.length, "dims", JSON.stringify(dims));
  log("sample:", JSON.stringify(pb.questions[0]));
  log("sourceIds:", pb.questions.map((q) => q.sourceId).join(","));
} else {
  log("body:", JSON.stringify(pb));
  log("HARD FAIL AI 练习");
  process.exit(1);
}

log("== BS live DONE ==");