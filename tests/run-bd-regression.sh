#!/bin/bash
cd "$(dirname "$0")"
for n in 12 17 19 26 27 28 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48; do
  out=$(node verify$n.js 2>/dev/null | grep -E "passed|== verify|HARNESS ERROR" | tail -1)
  echo "verify$n: $out"
done
echo "browser-tests: $(node dbg-bt.js 2>/dev/null | grep -E '"total"|"pass"' | tr '\n' ' ')"
echo "backend: $(cd D:/shimais-daming/backend && python test_api.py 2>&1 | grep -E "^Ran |^OK|^FAILED" | tr '\n' ' ')"
echo "BD_REGRESSION_DONE"
