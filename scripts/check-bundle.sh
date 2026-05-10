#!/usr/bin/env bash
# Sprint 8 task-2: production bundle 회귀 가드.
#
# `import.meta.env.DEV && <TweaksPanel />` 가드가 vite 정적 치환 + tree-shaking 으로
# production 번들에서 dev 인스펙터를 제거한다는 계약을 검증한다.
# `dist/assets/*.js` 어디에서도 "DEV TWEAKS" 토큰이 발견되면 leak 으로 간주하고 fail.
#
# 사용:
#   npm run build && npm run check:bundle
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="${ROOT}/dist"
TOKEN="DEV TWEAKS"

if [ ! -d "${DIST_DIR}" ]; then
  echo "[check:bundle] FAIL — dist/ 가 없음. 먼저 'npm run build' 실행." >&2
  exit 1
fi

# dist/assets 우선, 없으면 dist 전체 .js 스캔.
if [ -d "${DIST_DIR}/assets" ]; then
  SCAN_DIR="${DIST_DIR}/assets"
else
  SCAN_DIR="${DIST_DIR}"
fi

JS_FILES=$(find "${SCAN_DIR}" -type f -name '*.js' 2>/dev/null || true)

if [ -z "${JS_FILES}" ]; then
  echo "[check:bundle] FAIL — ${SCAN_DIR} 에서 .js 파일을 찾지 못함." >&2
  exit 1
fi

# grep -l: 매칭 파일 경로만, -F: 고정 문자열, -r 안 씀 (find 결과 직접 인입).
HITS=$(echo "${JS_FILES}" | xargs grep -l -F "${TOKEN}" 2>/dev/null || true)

if [ -n "${HITS}" ]; then
  echo "[check:bundle] FAIL — production bundle 에 \"${TOKEN}\" leak 감지:" >&2
  echo "${HITS}" >&2
  echo "" >&2
  echo "원인: TweaksPanel (또는 동일 토큰 dev 컴포넌트) 가 import.meta.env.DEV 가드 없이" >&2
  echo "마운트되어 vite tree-shaking 이 제거하지 못함. src/App.tsx 의 가드를 확인하세요." >&2
  exit 1
fi

COUNT=$(echo "${JS_FILES}" | tr ' ' '\n' | grep -c '\.js$' || true)
echo "[check:bundle] OK — ${COUNT}개 .js 파일에서 \"${TOKEN}\" 토큰 0건."

# Sprint 12 task-1: dist/wasm/ MediaPipe wasm 자체 호스팅 검증.
#
# `prebuild` 가 우회되거나 `public/wasm/` 가 비어 있으면 dist 번들에 wasm 0개로 떨어져
# 런타임이 jsdelivr CDN fallback 시도 → "ModuleFactory not set" 회귀 가능.
# 6 파일 모두 존재하지 않으면 즉시 실패하고 진단 메시지 출력.
WASM_DIR="${DIST_DIR}/wasm"
WASM_FILES=(
  "genai_wasm_internal.js"
  "genai_wasm_internal.wasm"
  "genai_wasm_module_internal.js"
  "genai_wasm_module_internal.wasm"
  "genai_wasm_nosimd_internal.js"
  "genai_wasm_nosimd_internal.wasm"
)

MISSING_WASM=()
for f in "${WASM_FILES[@]}"; do
  if [ ! -f "${WASM_DIR}/${f}" ]; then
    MISSING_WASM+=("${f}")
  fi
done

if [ "${#MISSING_WASM[@]}" -gt 0 ]; then
  echo "[check:bundle] FAIL — \`/wasm\` 자체 호스팅 누락 (${#MISSING_WASM[@]}/${#WASM_FILES[@]}):" >&2
  for f in "${MISSING_WASM[@]}"; do
    echo "  - ${WASM_DIR}/${f}" >&2
  done
  echo "" >&2
  echo "해결: \`npm run build\` 또는 \`bash scripts/copy-mediapipe-wasm.sh\` 재실행." >&2
  exit 1
fi

echo "[check:bundle] OK — dist/wasm/ 6 파일 모두 존재 (MediaPipe 자체 호스팅 무결)."
