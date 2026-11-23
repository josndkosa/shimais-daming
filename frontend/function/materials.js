// backend/export_materials.py 的逐字契约移植：校验、canonical 导出、错误口径一致。
import { DATA_TEXT } from "./data_bundle.js";
import { FIGURES } from "./consts.js";

export class MaterialsUnavailableError extends Error {}

// provider(name) 返回文件原文；缺失/不可读须抛错（对应 Python Path.read_text 失败）。
export function defaultProvider(name) {
  if (!Object.hasOwn(DATA_TEXT, name)) throw new Error("file not found: " + name);
  return DATA_TEXT[name];
}

export function loadFigure(figure, provider = defaultProvider) {
  try {
    if (!FIGURES.includes(figure)) throw new Error("unknown figure");
    const payload = JSON.parse(provider(figure + ".json"));
    const chunks = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.chunks : null;
    if (!Array.isArray(chunks) || chunks.length === 0) throw new Error("empty or invalid chunks");
    const ids = new Set();
    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) throw new Error("invalid chunk");
      for (const field of ["id", "title", "text", "source"]) {
        if (typeof chunk[field] !== "string" || !chunk[field].trim()) throw new Error("missing material field");
      }
      if (!/^c[1-9]\d*$/.test(chunk.id) || ids.has(chunk.id)) throw new Error("invalid or duplicate id");
      ids.add(chunk.id);
      for (const field of ["kind", "locator", "edition", "verification", "url"]) {
        if (field in chunk && (typeof chunk[field] !== "string" || !chunk[field].trim())) {
          throw new Error("invalid material metadata");
        }
      }
    }
    return chunks;
  } catch (exc) {
    if (exc instanceof MaterialsUnavailableError) throw exc;
    throw new MaterialsUnavailableError("史料库暂不可用，请稍后再试。");
  }
}

export function canonicalMaterials(provider = defaultProvider) {
  const sources = [];
  for (const figure of FIGURES) {
    for (const chunk of loadFigure(figure, provider)) {
      const source = {
        id: figure + "/" + chunk.id,
        figure,
        title: chunk.title,
        text: chunk.text,
        source: chunk.source,
        kind: chunk.kind ?? "现代转述",
        locator: chunk.locator ?? chunk.source,
        edition: chunk.edition ?? "尚未登记所据版本",
        verification: chunk.verification ?? "本站转述，原文及版本待核对",
      };
      if ("url" in chunk) source.url = chunk.url;
      sources.push(source);
    }
  }
  return { sources };
}

export function loadPersonas(provider = defaultProvider) {
  return JSON.parse(provider("personas.json"));
}