/* 生成 SEARCH_INDEX：标题/正文/出处逐字取自仓库，keywords 照抄规格表，target 按规格生成。 */
const fs = require("fs");
const vm = require("vm");
const ROOT = "D:/shimais-daming";
const D = vm.runInNewContext(fs.readFileSync(ROOT + "/frontend/data.js", "utf8") + "\n;SITE_DATA", {});

const FIGURES = ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"];
const KW_SOURCE = {
  zhuyuanzhang: {
    c1: "乞丐皇帝、和尚、皇觉寺、讨饭、红巾军、濠州",
    c2: "开国、南京即位、洪武、大都、吴王",
    c3: "废相、胡惟庸、丞相、中书省、皇权集中",
    c4: "锦衣卫、特务、诏狱、厂卫",
    c5: "反贪、大诰、剥皮实草、六十两、贪官",
    c6: "黄册、里甲、鱼鳞图册、户口、土地、赋税",
    c7: "藩王、分封、守边、蓝玉、北征",
    c8: "功臣、蓝玉案、胡惟庸案、株连、朱标、太子之死",
  },
  zhudi: {
    c1: "燕王、北平、藩王、出塞",
    c2: "靖难、清君侧、建文帝、夺位、南京",
    c3: "方孝孺、齐泰、黄子澄、诛十族、不草诏",
    c4: "迁都、北京、天子守国门、紫禁城、留都",
    c5: "郑和、下西洋、宝船、朝贡",
    c6: "永乐大典、类书、解缙、百科全书",
    c7: "亲征、漠北、鞑靼、瓦剌、斡难河",
    c8: "内阁、东厂、文渊阁、解缙、太监",
  },
  yuqian: {
    c1: "于谦生平、进士、巡抚、赈灾、河南山西",
    c2: "土木堡、英宗被俘、瓦剌、也先",
    c3: "南迁、言南迁者可斩、坚守京师、徐有贞",
    c4: "北京保卫战、德胜门、也先、守城",
    c5: "景泰帝、郕王、朱祁钰、太上皇、拥立",
    c6: "团营、三大营、整军、边防",
    c7: "迎回、太上皇、英宗归来、南宫",
    c8: "两袖清风、清廉、清风两袖、不受贿",
  },
  hairui: {
    c1: "海瑞生平、琼山、举人、淳安、二斤肉、母亲生日",
    c2: "淳安、清丈、均徭役、胡宗宪、断案",
    c3: "鄢懋卿、驿站、巡盐、权贵、祖制",
    c4: "买棺、治安疏、骂皇帝、嘉靖、道教、家家皆净",
    c5: "诏狱、下狱、黄锦、论死",
    c6: "获释、海青天、穆宗、复职、平反",
    c7: "清丈、均赋、隐占、豪强、赋役改革",
    c8: "青天、毁誉、断案如神、不近人情",
  },
  zhangjuzheng: {
    c1: "入阁、冯保、高拱、首辅、江陵",
    c2: "考成法、考核、吏治、六事、文簿",
    c3: "清丈、田亩、隐占、田额",
    c4: "一条鞭法、折银、赋役合并、太仓、国库",
    c5: "戚继光、李成梁、蓟镇、辽东、边防",
    c6: "权势、帝师、经筵、言官弹劾",
    c7: "夺情、守孝、廷杖、吴中行、赵用贤",
    c8: "大轿、三十二人抬、奢华、毁誉",
  },
  chongzhen: {
    c1: "除魏忠贤、阉党、即位、尧舜、熹宗",
    c2: "勤政、换首辅、五十人次、阁臣、批奏章",
    c3: "袁崇焕、磔杀、五年复辽、反间、议和",
    c4: "三饷、辽饷、剿饷、练饷、加派、赋税",
    c5: "杨嗣昌、四正六隅、督师、福王、襄王",
    c6: "松锦、洪承畴、锦州、降清、关外精锐",
    c7: "陈新甲、议和、弃市、密旨",
    c8: "孙传庭、潼关、传庭死而明亡、催战",
  },
};
const KW_TIMELINE = {
  e1368: "开国、建国、南京、应天、洪武、黄册、里甲、驱除胡虏",
  e1380: "废相、丞相、胡惟庸、中书省、六部、相权",
  e1382: "锦衣卫、诏狱、特务、厂卫",
  e1397: "科举、南北榜、会试、南北卷、考试",
  e1402: "靖难、朱棣、建文帝、削藩、藩王夺位、燕王",
  e1405: "郑和、下西洋、宝船、朝贡、出海",
  e1421: "迁都、北京、天子守国门、漕运、两京",
  e1425: "内阁、票拟、三杨、仁宣之治",
  e1435: "批红、司礼监、英宗、幼主、太监批红",
  e1449: "土木堡、土木之变、英宗被俘、瓦剌、也先、北京保卫战、亲征",
  e1457: "夺门、复辟、于谦被杀、英宗复辟",
  e1488: "弘治、孝宗、中兴、君臣共治、经筵",
  e1506: "刘瑾、太监、司礼监、阉党、矫旨、廷杖",
  e1521: "大礼议、嘉靖、继嗣、廷杖、杨廷和",
  e1566: "海瑞、治安疏、骂皇帝、买棺上疏、言官",
  e1567: "隆庆、开关、月港、海禁、白银、开海",
  e1572: "张居正、考成法、改革、冯保",
  e1581: "一条鞭法、折银、赋役、税制、清丈",
  e1582: "张居正之死、清算、人亡政息、抄家",
  e1592: "万历三大征、援朝、抗倭、战争、留中、缺官",
  e1619: "萨尔浒、辽东、努尔哈赤、后金、辽饷、加派",
  e1627: "崇祯、魏忠贤、阉党、除奸、中兴",
  e1644: "煤山、甲申、李自成、崇祯自缢、明亡、三饷",
};
const KW_CHIEF = {
  解缙: "解缙、永乐大典、成祖、下狱死、伴君如伴虎",
  杨士奇: "杨士奇、三杨、托孤、定海神针、三朝",
  陈循: "陈循、景泰、充军、铁岭、获释",
  商辂: "商辂、成化、稳臣",
  徐溥: "徐溥、弘治、中兴",
  刘健: "刘健、弘治三君子、刘瑾、托孤",
  李东阳: "李东阳、救火队长、刘瑾、熬",
  杨廷和: "杨廷和、大礼议、托孤、两朝",
  夏言: "夏言、严嵩、赐死、嘉靖",
  严嵩: "严嵩、权臣、抄家、饿死、专权",
  徐阶: "徐阶、扳倒严嵩、忍、隆庆新政",
  高拱: "高拱、冯保、罢官、张居正",
  张居正: "张居正、改革首辅、抄家、万历",
  申时行: "申时行、和事佬、张居正之后",
  方从哲: "方从哲、红丸案、1620、致仕",
  叶向高: "叶向高、东林、魏忠贤、两段首辅",
  周延儒: "周延儒、崇祯、赐自尽、两度拜相",
  温体仁: "温体仁、崇祯、长寿首辅、四年",
  薛国观: "薛国观、崇祯、受贿、赐自尽",
  魏藻德: "魏藻德、最后首辅、明亡、拷掠死",
};
const KW_GUEST = {
  于谦: "于谦、北京保卫战、兵部尚书、夺门被杀",
  王守仁: "王守仁、王阳明、心学、平宁王、三十五天",
  戚继光: "戚继光、蓟镇、抗倭、长城、总兵",
  李如松: "李如松、辽东总兵、万历三大征、阵亡、出塞",
  卢象升: "卢象升、巨鹿、战死、督师、主战",
  孙传庭: "孙传庭、潼关、传庭死而明亡、督师",
  袁崇焕: "袁崇焕、蓟辽督师、五年复辽、磔杀、平台召对",
  杨嗣昌: "杨嗣昌、四正六隅、督师、兵部尚书",
};
const split = (s) => s.split("、");

const index = [];
for (const fig of FIGURES) {
  const chunks = JSON.parse(fs.readFileSync(ROOT + "/backend/data/" + fig + ".json", "utf8")).chunks;
  if (chunks.length !== 8) throw new Error(fig + " chunks != 8");
  chunks.forEach((c) => {
    const kw = KW_SOURCE[fig][c.id];
    if (!kw) throw new Error("missing kw " + fig + " " + c.id);
    index.push({
      kind: "source",
      id: c.id,
      title: c.title,
      text: c.text,
      source: c.source,
      keywords: split(kw),
      target: "chat.html?figure=" + fig,
    });
  });
}
D.timeline.events.forEach((ev) => {
  const kw = KW_TIMELINE[ev.id];
  if (!kw) throw new Error("missing kw " + ev.id);
  index.push({
    kind: "timeline",
    id: ev.id,
    title: ev.title,
    year: ev.year,
    text: ev.summary + ev.detail[0],
    source: "本站时间线",
    keywords: split(kw),
    target: "timeline.html?event=" + ev.id,
  });
});
[["chief", D.relations.chiefs, KW_CHIEF], ["guest", D.relations.guests, KW_GUEST]].forEach(([kind, list, table]) => {
  list.forEach((p) => {
    const kw = table[p.name];
    if (!kw) throw new Error("missing kw " + p.name);
    index.push({
      kind: "relation",
      id: p.name,
      title: p.name,
      lord: p.lord,
      text: p.note + p.tag + "，" + p.end,
      source: "本站帝王首辅表",
      keywords: split(kw),
      target: "relations.html?person=" + p.name + "&kind=" + kind,
    });
  });
});

if (index.length !== 99) throw new Error("index length " + index.length);
const counts = index.reduce((o, e) => ((o[e.kind] = (o[e.kind] || 0) + 1), o), {});
console.log("counts", JSON.stringify(counts));

// 逐字回核：source 与后端原文、timeline 与 data.js 原文、relation 三段均在 text 内
for (const e of index) {
  if (e.kind === "source") {
    const fig = e.target.split("figure=")[1];
    const c = JSON.parse(fs.readFileSync(ROOT + "/backend/data/" + fig + ".json", "utf8")).chunks.find((x) => x.id === e.id);
    if (c.title !== e.title || c.text !== e.text || c.source !== e.source) throw new Error("source verbatim fail " + fig + e.id);
  } else if (e.kind === "timeline") {
    const ev = D.timeline.events.find((x) => x.id === e.id);
    if (ev.title !== e.title || ev.summary + ev.detail[0] !== e.text || ev.year !== e.year) throw new Error("timeline verbatim fail " + e.id);
  } else {
    const p = D.relations.chiefs.concat(D.relations.guests).find((x) => x.name === e.id);
    if (!e.text.includes(p.note) || !e.text.includes(p.tag) || !e.text.includes(p.end) || p.lord !== e.lord) throw new Error("relation verbatim fail " + e.id);
  }
}
console.log("verbatim re-check OK");
console.log("relation sample:", index.find((e) => e.id === "解缙").text);
console.log("relation sample2:", index.find((e) => e.id === "于谦" && e.kind === "relation").text);

const body = index.map((e) => "  " + JSON.stringify(e)).join(",\n");
fs.writeFileSync(__dirname + "/search-index.snippet.js", "\n/* 史料检索索引：99 条（史料 48＋时间线 23＋关系表 28），标题/正文/出处逐字取自仓库，仅新增 keywords 与 target。 */\nconst SEARCH_INDEX = [\n" + body + ",\n];\n");
console.log("snippet written");