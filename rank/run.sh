#!/usr/bin/env bash
# 一条龙生成田鸡榜等级数据 rank/data.js 并合入 dist。
# 用法：在 portal 根目录 `npm run rank`（或 bash rank/run.sh）。
#
# 管线：
#   1. npm run build                         先生成 dist/data.js（拍组属性真值，匹配要读它）
#   2. extract_features.py（系统 python3+PIL）从榜单 xlsx 抽头像 + 框色/属性特征
#   3. match_pairs.py（需 torch/numpy<2）     ResNet50 深度特征把头像匹配到 ★6ex 图库
#   4. generate_rank_js.py（系统 python3+PIL）按列 B 等级徽章 + 匹配结果产出 rank/data.js
#   5. npm run build                         再 build 一次，把等级合进 dist/data.js
#
# 解释器：第 2、4 步只需 PIL，用系统 python3；第 3 步要 torch，portal 不带 venv，
# 自动探测 match 项目的 .venv（也可用环境变量 TORCH_PY 显式指定）。
set -euo pipefail

RANK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTAL_DIR="$(cd "$RANK_DIR/.." && pwd)"
cd "$PORTAL_DIR"

SYS_PYTHON="${PYTHON:-python3}"
XLSX="$RANK_DIR/榜单.xlsx"

if [ ! -f "$XLSX" ]; then
  echo "✗ 缺少源榜单：$XLSX" >&2
  echo "  请把最新的榜单 xlsx 放到该路径（文件名固定为 榜单.xlsx）后重试。" >&2
  exit 1
fi

# 带 torch 的 python：优先 TORCH_PY 环境变量，否则按常见位置自动探测。
TORCH_PYTHON="${TORCH_PY:-}"
if [ -z "$TORCH_PYTHON" ]; then
  for cand in \
    "$RANK_DIR/.venv/bin/python" \
    "$PORTAL_DIR/.venv/bin/python" \
    "$PORTAL_DIR/../../match/.venv/bin/python" \
    "$HOME/project/match/.venv/bin/python"; do
    if [ -x "$cand" ]; then TORCH_PYTHON="$cand"; break; fi
  done
fi
if [ -z "$TORCH_PYTHON" ] || [ ! -x "$TORCH_PYTHON" ]; then
  echo "✗ 找不到带 torch 的 python（match_pairs.py 需要 torch 2.x + numpy<2）。" >&2
  echo "  请用 TORCH_PY=/path/to/venv/bin/python npm run rank 指定。" >&2
  exit 1
fi
echo "使用解释器：系统 ${SYS_PYTHON}（提取/出表）；torch ${TORCH_PYTHON}（匹配）"

echo "==> [1/5] npm run build：生成 dist/data.js 属性真值"
npm run build

echo "==> [2/5] extract_features.py：从榜单 xlsx 提取头像与特征"
"$SYS_PYTHON" "$RANK_DIR/extract_features.py"

echo "==> [3/5] match_pairs.py：ResNet50 深度特征匹配（CPU，约数分钟）"
"$TORCH_PYTHON" "$RANK_DIR/match_pairs.py"

echo "==> [4/5] generate_rank_js.py：按等级徽章生成 rank/data.js"
"$SYS_PYTHON" "$RANK_DIR/generate_rank_js.py"

echo "==> [5/5] npm run build：把等级合入 dist"
npm run build

echo "✓ 完成：rank/data.js 已生成并合入 dist/data.js（刷新页面即可看到等级）。"
