#!/bin/bash
# 手工组装免安装绿色目录（不依赖 electron-builder 联网下载）
set -e
cd "$(dirname "$0")"

NAME="快速记录pro"
OUT="dist/$NAME"
ELEC="node_modules/electron/dist"
RCEDIT="/c/Users/Administrator/AppData/Local/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe"

SRC="C:/Users/Administrator/Downloads/快速记录pro.html"
[ -f "$SRC" ] || { echo "真源不存在: $SRC"; exit 1; }

echo "[1/6] 清理旧产物"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "[2/6] 复制 Electron 运行时"
cp -r "$ELEC"/* "$OUT"/

echo "[3/6] 重命名主程序"
mv "$OUT/electron.exe" "$OUT/$NAME.exe"

echo "[4/6] 写入应用与页面"
mkdir -p "$OUT/resources/app" "$OUT/resources/assets"
cp main.js package.json "$OUT/resources/app/"
cp assets/icon.ico assets/index.html "$OUT/resources/assets/"
cp "$SRC" "$OUT/resources/assets/index.html"

echo "[5/6] 写 EXE 图标与版本信息"
if [ -f "$RCEDIT" ]; then
  "$RCEDIT" "$OUT/$NAME.exe" \
    --set-icon "assets/icon.ico" \
    --set-version-string "ProductName" "$NAME" \
    --set-version-string "FileDescription" "$NAME" \
    --set-version-string "CompanyName" "quicknote" \
    --set-version-string "LegalCopyright" "Copyright 2026" \
    --set-file-version "1.0.0" \
    --set-product-version "1.0.0" && echo "  图标已写入"
else
  echo "  !! 未找到 rcedit，跳过图标"
fi

echo "[6/6] 清理无用文件"
rm -f "$OUT/LICENSES.chromium.html" "$OUT/resources/default_app.asar" 2>/dev/null || true

SIZE=$(du -sm "$OUT" | cut -f1)
echo "完成: $OUT  (${SIZE} MB)"
