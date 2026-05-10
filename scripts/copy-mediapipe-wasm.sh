#!/usr/bin/env bash
# Sprint 11 task-1: MediaPipe wasm 자체 호스팅.
#
# `@mediapipe/tasks-genai` 패키지의 6 개 wasm/loader 파일을 `public/wasm/` 으로
# 복사한다. Vite 가 `public/` 을 dist root 로 그대로 inline 하므로, 런타임에
# `/wasm/...` 절대 경로로 접근하면 jsdelivr CDN 의존 없이 동작한다.
#
# 멱등: 이미 존재해도 덮어쓴다 (소스 패키지 버전이 바뀌면 자동 갱신).
# package.json `prebuild` 에서 호출된다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="${ROOT}/node_modules/@mediapipe/tasks-genai/wasm"
DEST_DIR="${ROOT}/public/wasm"

FILES=(
  "genai_wasm_internal.js"
  "genai_wasm_internal.wasm"
  "genai_wasm_module_internal.js"
  "genai_wasm_module_internal.wasm"
  "genai_wasm_nosimd_internal.js"
  "genai_wasm_nosimd_internal.wasm"
)

if [ ! -d "${SRC_DIR}" ]; then
  echo "[copy-mediapipe-wasm] FAIL — ${SRC_DIR} 가 없음. 먼저 'npm install' 실행." >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

for f in "${FILES[@]}"; do
  src="${SRC_DIR}/${f}"
  dest="${DEST_DIR}/${f}"
  if [ ! -f "${src}" ]; then
    echo "[copy-mediapipe-wasm] FAIL — 소스 파일 없음: ${src}" >&2
    exit 1
  fi
  cp -f "${src}" "${dest}"
done

echo "[copy-mediapipe-wasm] OK — ${#FILES[@]} 파일 복사 완료 → ${DEST_DIR}"
