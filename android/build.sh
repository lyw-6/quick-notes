#!/usr/bin/env bash
# 快速记录 Pro — Android APK 构建脚本
#
# 依赖：Android SDK（build-tools / platform）、JDK 17+
# 用法：bash build.sh
#
# 首次构建前必须配置签名，二选一：
#   1) cp sign.properties.example sign.properties  然后填写 KS_PASS
#   2) export KS_PASS=你的密码
# 密钥文件 keystore.jks 与 sign.properties 均不入库（见 .gitignore）。
set -e
cd "$(dirname "$0")"

# ── Android SDK 路径（可用环境变量覆盖）───────────────────
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-D:/Program/Android/Sdk}}"
if [ ! -d "$SDK" ]; then
  echo "✗ 未找到 Android SDK：$SDK"
  echo "  请安装 SDK 后重试，或用环境变量指定：export ANDROID_SDK_ROOT=/path/to/sdk"
  exit 1
fi

# 自动探测 build-tools / platform，避免写死版本
BT="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)"
PLAT="$(ls -d "$SDK"/platforms/android-* 2>/dev/null | sort -V | tail -1)"
ANDROID_JAR="$PLAT/android.jar"
if [ -z "$BT" ] || [ ! -f "$ANDROID_JAR" ]; then
  echo "✗ SDK 不完整：需要 build-tools 与 platforms"
  exit 1
fi
echo "SDK: $SDK"
echo "build-tools: $(basename "$BT")   platform: $(basename "$PLAT")"

# ── 签名配置 ────────────────────────────────────────────
if [ -f sign.properties ]; then . ./sign.properties; fi
KS_FILE="${KS_FILE:-keystore.jks}"
KS_ALIAS="${KS_ALIAS:-key0}"
KS_PASS="${KS_PASS:-$KEY_PASS}"

if [ -z "$KS_PASS" ]; then
  echo "✗ 未配置签名密码"
  echo "  方式一：cp sign.properties.example sign.properties  并填写 KS_PASS"
  echo "  方式二：export KS_PASS=你的密码"
  exit 1
fi

# ── 每次构建用时间戳唯一名，避免覆盖/删除旧产物 ──────────────
TS=$(date +%Y%m%d_%H%M%S)
UNSIGNED="app-unsigned-$TS.apk"
ALIGNED="app-aligned-$TS.apk"
RELEASE="app-release-$TS.apk"

mkdir -p gen out dexout

echo "== 0. 签名密钥 =="
if [ ! -f "$KS_FILE" ]; then
  echo "未找到 $KS_FILE，正在生成新密钥（$KS_ALIAS）…"
  keytool -genkeypair -v -keystore "$KS_FILE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias "$KS_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=QuickNote, OU=Dev, O=QuickNote, L=CN, S=CN, C=CN"
fi

echo "== 1. aapt2 编译资源 =="
"$BT/aapt2.exe" compile --dir res -o "compiled-$TS.zip"

echo "== 2. aapt2 链接（资源 + 清单 + assets + R.java）=="
"$BT/aapt2.exe" link -o "$UNSIGNED" -I "$ANDROID_JAR" \
  --manifest AndroidManifest.xml -R "compiled-$TS.zip" --auto-add-overlay \
  -A assets --java gen

echo "== 3. javac 编译 Java =="
javac -encoding UTF-8 -cp "$ANDROID_JAR" -d out \
  src/com/quicknote/pro/MainActivity.java \
  gen/com/quicknote/pro/R.java

echo "== 4. d8 生成 classes.dex =="
jar cf "classes-$TS.jar" -C out .
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --lib "$ANDROID_JAR" --output dexout "classes-$TS.jar"

echo "== 5. 将 dex 写入 apk（不压缩，置于根目录）=="
jar u0f "$UNSIGNED" -C dexout classes.dex

echo "== 6. zipalign 对齐 =="
"$BT/zipalign.exe" -p 4 "$UNSIGNED" "$ALIGNED"

echo "== 7. apksigner 签名 =="
java -jar "$BT/lib/apksigner.jar" sign \
  --ks "$KS_FILE" --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:${KEY_PASS:-$KS_PASS}" \
  --out "$RELEASE" "$ALIGNED"

# 清理中间产物，只保留最终 apk
rm -f "$UNSIGNED" "$ALIGNED" "compiled-$TS.zip" "classes-$TS.jar"
rm -rf gen out dexout

echo "== 完成 =="
ls -la "$RELEASE"
echo "RELEASE_PATH=$RELEASE"
