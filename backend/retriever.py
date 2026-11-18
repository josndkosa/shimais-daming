"""史料检索模块：BM25 实现，接口 retrieve(figure, query) -> list[chunk]。

将来替换为向量检索时只需重写本模块的 retrieve，保持返回 chunk 字典列表即可。
"""

import json
import re
from pathlib import Path

from rank_bm25 import BM25Okapi

_DATA_DIR = Path(__file__).resolve().parent / "data"
_cache = {}

# 问句口语词与史书用语对齐（如「骂皇帝」→「直斥世宗/上疏」），仅扩展查询侧
_SYNONYMS = {
    "皇帝": ["世宗", "嘉靖", "皇上", "太祖", "成祖", "神宗", "思宗"],
    "骂": ["直斥", "斥", "上疏", "谏"],
    "杀": ["诛", "诛杀", "磔", "赐死", "处死"],
    "贪官": ["贪赃", "贪腐", "赃吏"],
}


def _tokens(text):
    # 无分词依赖：英文/数字按词，中文按单字 + 相邻双字，兼顾专名与短语匹配
    words = re.findall(r"[A-Za-z0-9]+", text.lower())
    chars = re.findall(r"[一-鿿]", text)
    bigrams = [a + b for a, b in zip(chars, chars[1:])]
    return words + chars + bigrams


def _query_tokens(query):
    tokens = _tokens(query)
    for word, synonyms in _SYNONYMS.items():
        if word in query:
            for synonym in synonyms:
                tokens += _tokens(synonym)
    return tokens


def _corpus(figure):
    if figure not in _cache:
        path = _DATA_DIR / (figure + ".json")
        chunks = json.loads(path.read_text(encoding="utf-8"))["chunks"]
        bm25 = BM25Okapi([_tokens(c["title"] + " " + c["text"]) for c in chunks])
        _cache[figure] = (chunks, bm25)
    return _cache[figure]


def retrieve(figure, query):
    chunks, bm25 = _corpus(figure)
    scores = bm25.get_scores(_query_tokens(query))
    order = sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)[:3]
    return [chunks[i] for i in order]