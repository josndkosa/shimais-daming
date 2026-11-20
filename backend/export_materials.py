"""从唯一资料源导出静态材料；python backend/export_materials.py [--check]。"""

import argparse
import json
from pathlib import Path
import re

DATA_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_PATH = DATA_DIR.parent.parent / "frontend" / "materials.json"
FIGURES = ("zhuyuanzhang", "zhudi", "yuqian", "hairui", "zhangjuzheng", "chongzhen")


class MaterialsUnavailableError(Exception):
    """资料缺失、不可读取或结构损坏；对外不暴露路径及内容。"""


def load_figure(figure, data_dir=DATA_DIR):
    """检索、练习与导出共用校验，保留原始条目元数据。"""
    try:
        if figure not in FIGURES:
            raise ValueError("unknown figure")
        payload = json.loads((data_dir / (figure + ".json")).read_text(encoding="utf-8"))
        chunks = payload.get("chunks") if isinstance(payload, dict) else None
        if not isinstance(chunks, list) or not chunks:
            raise ValueError("empty or invalid chunks")
        ids = set()
        for chunk in chunks:
            if not isinstance(chunk, dict):
                raise ValueError("invalid chunk")
            for field in ("id", "title", "text", "source"):
                if not isinstance(chunk.get(field), str) or not chunk[field].strip():
                    raise ValueError("missing material field")
            if not re.fullmatch(r"c[1-9]\d*", chunk["id"]) or chunk["id"] in ids:
                raise ValueError("invalid or duplicate id")
            ids.add(chunk["id"])
            for field in ("kind", "locator", "edition", "verification", "url"):
                if field in chunk and (not isinstance(chunk[field], str) or not chunk[field].strip()):
                    raise ValueError("invalid material metadata")
        return chunks
    except (OSError, ValueError, UnicodeError) as exc:
        raise MaterialsUnavailableError("史料库暂不可用，请稍后再试。") from exc


def canonical_materials(data_dir=DATA_DIR):
    sources = []
    for figure in FIGURES:
        for chunk in load_figure(figure, data_dir):
            source = {
                "id": figure + "/" + chunk["id"],
                "figure": figure,
                "title": chunk["title"],
                "text": chunk["text"],
                "source": chunk["source"],
                "kind": chunk.get("kind", "现代转述"),
                "locator": chunk.get("locator", chunk["source"]),
                "edition": chunk.get("edition", "尚未登记所据版本"),
                "verification": chunk.get("verification", "本站转述，原文及版本待核对"),
            }
            if "url" in chunk:
                source["url"] = chunk["url"]
            sources.append(source)
    return {"sources": sources}


def main(argv=None):
    parser = argparse.ArgumentParser(description="同步六个人物资料到 frontend/materials.json")
    parser.add_argument("--check", action="store_true", help="只检查是否同步，不写文件")
    args = parser.parse_args(argv)
    try:
        canonical = canonical_materials()
        if args.check:
            if json.loads(OUTPUT_PATH.read_text(encoding="utf-8")) != canonical:
                print("materials.json 已过期，请运行 backend/export_materials.py 同步。")
                return 1
            print("materials.json 与资料源一致。")
        else:
            OUTPUT_PATH.write_text(json.dumps(canonical, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"已导出 {len(canonical['sources'])} 条资料到 {OUTPUT_PATH}")
    except (MaterialsUnavailableError, OSError, ValueError, UnicodeError):
        print("资料或导出文件不可用，请检查资料结构并重新导出。")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
