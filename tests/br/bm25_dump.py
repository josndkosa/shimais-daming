"""导出 Python 版 BM25 检索基准：固定查询集 × 六人物，全量分数与 top3 顺序。"""
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
with patch("dotenv.load_dotenv"), patch.dict(os.environ, {}, clear=True):
    import main as api  # noqa: F401  确保数据可加载
import retriever
from export_materials import FIGURES, load_figure

QUERIES = [
    "买棺上疏", "一条鞭法", "骂皇帝", "", "Python Kubernetes API", "咖啡披萨薯条",
    "后来呢？", "清丈土地", "海瑞买棺上疏入狱", "为何要骂皇帝", "贪官怎么处置",
    "杀贪官", "皇帝不理朝政", "太祖废相", "土木堡之变", "北京保卫战", "嘉靖大礼议",
    "张居正考成法", "崇祯煤山", "徐霞客游记", "海瑞 骂 皇帝", "为何 杀 贪官",
    "a", "1566", "c4", "后来", "然后呢", "这", "继续", "详细说说", "他呢", "结果呢",
]
chunks_by_figure = {f: load_figure(f) for f in FIGURES}
for f in FIGURES:
    for c in chunks_by_figure[f]:
        QUERIES.append(c["title"])
        QUERIES.append(c["text"][:12])
titles = [c["title"] for f in FIGURES for c in chunks_by_figure[f]]
texts = [c["text"] for f in FIGURES for c in chunks_by_figure[f]]
for i in range(len(titles)):
    QUERIES.append(titles[i] + " " + texts[(i + 7) % len(texts)][:8])
QUERIES = list(dict.fromkeys(QUERIES))

out = {"queries": QUERIES, "figures": {}}
for f in FIGURES:
    retriever._cache.clear()
    chunks, bm25 = retriever._corpus(f)
    per_query = {}
    for q in QUERIES:
        scores = bm25.get_scores(retriever._query_tokens(q))
        order = sorted((i for i in range(len(chunks)) if scores[i] > 0),
                       key=lambda i: scores[i], reverse=True)[:3]
        per_query[q] = {"scores": [float(s) for s in scores], "top": [chunks[i]["id"] for i in order]}
    out["figures"][f] = per_query

dest = HERE / "bm25-baseline.json"
dest.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
print("queries:", len(QUERIES), "figures:", len(FIGURES), "->", dest)