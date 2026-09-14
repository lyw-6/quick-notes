#!/usr/bin/env bash
# 推送到 GitHub
#
# 前置条件：
#   1. 已在 https://github.com/new 创建空仓库 quick-notes（公开，不要勾选任何初始化选项）
#   2. 已配置认证，二选一：
#      SSH  ：把 ~/.ssh/id_ed25519.pub 内容添加到 https://github.com/settings/keys
#      HTTPS：准备 Personal Access Token（勾选 repo 权限）
#
# 用法：
#   bash publish.sh <你的GitHub用户名>            # 默认 SSH
#   bash publish.sh <你的GitHub用户名> https      # 走 HTTPS（会提示输 Token）
set -e
cd "$(dirname "$0")"

USER="${1:-}"
MODE="${2:-ssh}"

if [ -z "$USER" ]; then
  echo "用法: bash publish.sh <GitHub用户名> [ssh|https]"
  echo "示例: bash publish.sh lyw-6"
  exit 1
fi

if [ "$MODE" = "https" ]; then
  URL="https://github.com/$USER/quick-notes.git"
else
  URL="git@github.com:$USER/quick-notes.git"
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$URL"
git branch -M main

echo "────────────────────────────────────────"
echo "  仓库: https://github.com/$USER/quick-notes"
echo "  地址: $URL"
echo "────────────────────────────────────────"

if [ "$MODE" != "ssh" ]; then
  echo "提示: 密码处粘贴 Personal Access Token（不是登录密码）"
fi

git push -u origin main

echo
echo "✓ 推送完成"
echo
echo "接下来创建 Release（上传 Windows / Android 安装包）:"
echo "  1. 打开 https://github.com/$USER/quick-notes/releases/new"
echo "  2. Tag: v1.0.0   标题: 快速记录 Pro v1.0.0"
echo "  3. 拖入以下三个文件:"
echo "       C:\\Users\\Administrator\\quick-notes-release\\快速记录pro.html"
echo "       C:\\Users\\Administrator\\quick-notes-release\\快速记录pro-android-v1.0.0.apk"
echo "       C:\\Users\\Administrator\\quick-notes-release\\快速记录pro-win-x64.zip"
echo "  4. 点 Publish release"
