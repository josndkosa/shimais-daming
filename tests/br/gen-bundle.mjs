// 从 backend/data 逐字原文与提取常量生成函数侧数据/常量模块；生成物勿手改。
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const dataDir = resolve(root, "backend/data");
const funcDir = resolve(root, "frontend/function");
const figures = ["zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen"];

const bundle = {};
for (const name of ["personas.json", ...figures.map((f) => f + ".json")]) {
  const raw = readFileSync(resolve(dataDir, name), "utf-8");
  JSON.parse(raw);
  bundle[name] = raw;
}
writeFileSync(
  resolve(funcDir, "data_bundle.js"),
  "// 生成自 backend/data 逐字原文（tests/br/gen-bundle.mjs）；勿手改。\nexport const DATA_TEXT = " +
    JSON.stringify(bundle, null, 0) + ";\n",
  "utf-8"
);

const consts = JSON.parse(readFileSync(resolve(here, "consts.json"), "utf-8"));
writeFileSync(
  resolve(funcDir, "consts.js"),
  "// 生成自 backend 逐字常量（tests/br/gen-bundle.mjs）；勿手改。\n" +
    Object.entries(consts)
      .map(([k, v]) => "export const " + k + " = " + JSON.stringify(v) + ";")
      .join("\n") + "\n",
  "utf-8"
);
console.log("generated data_bundle.js + consts.js");