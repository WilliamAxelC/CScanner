#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="cscanner-android-builder"

echo "Building Docker Android toolchain image (${IMAGE_NAME})..."
docker build -t "${IMAGE_NAME}" -f "${ROOT_DIR}/docker/Dockerfile.android" "${ROOT_DIR}"

mkdir -p "${ROOT_DIR}/build-output"

echo "Building CScanner APK inside container..."
docker run --rm \
  -v "${ROOT_DIR}:/workspace" \
  -w /workspace \
  "${IMAGE_NAME}" \
  bash -lc '
    set -euo pipefail
    pnpm install
    npx expo prebuild --platform android --clean
    cd android
    ./gradlew assembleRelease --no-daemon
    cd ..
    UNSIGNED="android/app/build/outputs/apk/release/app-release-unsigned.apk"
    SIGNED="android/app/build/outputs/apk/release/app-release.apk"
    if [ -f "$SIGNED" ]; then
      cp "$SIGNED" build-output/CScanner-release.apk
    elif [ -f "$UNSIGNED" ]; then
      if [ ! -f /tmp/cscanner-dev.keystore ]; then
        keytool -genkey -v -keystore /tmp/cscanner-dev.keystore -alias cscanner -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=CScanner,O=CScanner,C=US"
      fi
      BUILD_TOOLS=$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -n 1)
      "$ANDROID_HOME/build-tools/$BUILD_TOOLS/apksigner" sign --ks /tmp/cscanner-dev.keystore --ks-pass pass:android --key-pass pass:android --out build-output/CScanner-release.apk "$UNSIGNED"
    fi
    ls -lh build-output/CScanner-release.apk
  '

echo "Done! APK saved to ${ROOT_DIR}/build-output/CScanner-release.apk"
