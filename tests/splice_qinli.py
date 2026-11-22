import io

p = "D:/shimais-daming/frontend/app.js"
s = io.open(p, encoding="utf-8").read()
start = s.index("    /* ---------- 亲历 · 长剧本（决策模式内部，不计入画像六模块） ---------- */")
end = s.index("  /* ---------- 卡片墙 ---------- */")
new_tail = io.open("D:/shimais-daming/frontend/_qinli_tail.js", encoding="utf-8").read()
s = s[:start] + new_tail + s[end:]
io.open(p, "w", encoding="utf-8").write(s)
print("spliced ok")