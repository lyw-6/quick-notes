#!/bin/bash
# 同步真源 → 打包为免安装绿色目录
set -e
cd "$(dirname "$0")"

SRC="C:/Users/Administrator/Downloads/快速记录pro.html"
if [ ! -f "$SRC" ]; then echo "真源不存在: $SRC"; exit 1; fi

cp "$SRC" assets/index.html
echo "真源已同步 -> assets/index.html"

npx electron-builder --win --dir 2>&1 | tail -20

echo "完成，产物在 dist/win-unpacked/"
