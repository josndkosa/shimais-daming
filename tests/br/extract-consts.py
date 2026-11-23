"""从 backend/main.py 与 retriever.py 提取逐字常量，供 JS 移植生成用。"""
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
with patch("dotenv.load_dotenv"), patch.dict(os.environ, {}, clear=True):
    import main as api
import retriever

out = {
    "GENERAL_RULES": api.GENERAL_RULES,
    "CHECK_RULES": api.CHECK_RULES,
    "PRACTICE_RULES": api.PRACTICE_RULES,
    "REVIEW_RULES": api.REVIEW_RULES,
    "MEMORY_TIERS": list(api.MEMORY_TIERS),
    "FIGURES": list(api.FIGURES),
    "SYNONYMS": retriever._SYNONYMS,
    "FOLLOWUPS": ["后来", "然后", "之后", "为什么", "为何", "那", "这", "继续", "再说", "详细", "他呢", "结果呢"],
}
dest = Path(__file__).resolve().parent / "consts.json"
dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("written", dest)