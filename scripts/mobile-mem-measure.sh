#!/usr/bin/env bash
#
# mobile-mem-measure.sh — sample on-device LLM memory usage from a booted
# iOS Simulator or Android Emulator and emit a JSON summary, including
# whether the MediaPipe (tasks-genai) backend showed up in recent logs.
#
# Usage:
#   scripts/mobile-mem-measure.sh ios|android [--samples N] [--interval S] [--label TAG] [--help]
#
# Defaults: samples=12, interval=5  (≈60s window).
#
# Output:
#   .planning/sprint/4/measurements/{platform}-{label or YYYYMMDDhhmmss}.json
#
# Prereqs: app already running on the booted simulator/emulator
# (e.g. via `npm run mobile:ios` or `npm run mobile:android`). The script
# does NOT boot devices — it only samples a live process.
#
# Real-device numbers are UAT (host-only). CI validates only `bash -n`
# and `--help` paths.

set -euo pipefail

# ---------- repo root ------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ---------- arg parsing ----------------------------------------------------
PLATFORM=""
SAMPLES=12
INTERVAL=5
LABEL=""

usage() {
  cat <<'EOF'
Usage: scripts/mobile-mem-measure.sh <platform> [options]

Platforms:
  ios       Sample memory of booted iOS Simulator app (xcrun simctl + vmmap).
  android   Sample memory of running Android Emulator app (adb dumpsys meminfo).

Options:
  --samples N      Number of samples to collect   (default: 12).
  --interval S     Seconds between samples         (default: 5).
  --label TAG      Tag inserted into output filename + JSON.
                   Must match [A-Za-z0-9._-]+.
  --help           Show this help.

Output:
  .planning/sprint/4/measurements/{platform}-{label or timestamp}.json

JSON schema:
  {
    "platform": "ios|android",
    "app_id": "com.inseoul.app",
    "label": "...",
    "started_at": "ISO-8601 UTC",
    "samples": [
      iOS:     { "ts": "...", "rss_mb": 234.5, "dirty_mb": 45.2 },
      Android: { "ts": "...", "pss_mb": 234.5, "native_heap_mb": 45.2 }
    ],
    "peak_rss_mb": 312.4,         # peak of rss_mb (iOS) or pss_mb (Android)
    "mediapipe_loaded": true,     # MediaPipe / tasks-genai seen in recent log
    "host": "darwin kernel | xcode/sdk fingerprint"
  }

Notes:
  Run *during* MediaPipe LLM inference for a peak measurement; cold
  load + first inference is usually the high-water mark.
  iOS Simulator and Android Emulator share host RAM, so values diverge
  from physical-device numbers — compare against real-device runs
  before relying on absolute figures.

Examples:
  scripts/mobile-mem-measure.sh ios
  scripts/mobile-mem-measure.sh android --samples 24 --interval 5 --label gemma2b
  scripts/mobile-mem-measure.sh ios --samples 1 --interval 1 --label sanity
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    ios|android)
      if [[ -n "$PLATFORM" ]]; then
        echo "error: platform already set to '$PLATFORM'" >&2
        exit 2
      fi
      PLATFORM="$1"
      shift
      ;;
    --samples)
      if [[ $# -lt 2 ]]; then
        echo "error: --samples requires an argument" >&2
        exit 2
      fi
      SAMPLES="$2"
      if ! [[ "$SAMPLES" =~ ^[0-9]+$ ]] || [[ "$SAMPLES" -lt 1 ]]; then
        echo "error: --samples must be a positive integer" >&2
        exit 2
      fi
      shift 2
      ;;
    --interval)
      if [[ $# -lt 2 ]]; then
        echo "error: --interval requires an argument" >&2
        exit 2
      fi
      INTERVAL="$2"
      if ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [[ "$INTERVAL" -lt 1 ]]; then
        echo "error: --interval must be a positive integer (seconds)" >&2
        exit 2
      fi
      shift 2
      ;;
    --label)
      if [[ $# -lt 2 ]]; then
        echo "error: --label requires an argument" >&2
        exit 2
      fi
      LABEL="$2"
      if ! [[ "$LABEL" =~ ^[A-Za-z0-9._-]+$ ]]; then
        echo "error: --label must match [A-Za-z0-9._-]+ (got '$LABEL')" >&2
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$PLATFORM" ]]; then
  echo "error: platform (ios|android) required" >&2
  usage >&2
  exit 2
fi

# ---------- helpers --------------------------------------------------------
require_tool() {
  local tool="$1"; local hint="$2"
  if ! command -v "$tool" >/dev/null 2>&1; then
    cat >&2 <<EOF
error: required tool '$tool' not found in PATH.
       $hint
EOF
    exit 3
  fi
}

extract_app_id() {
  # Mirror mobile-launch.sh extract_app_id() — single source via capacitor.config.ts.
  local fallback="com.inseoul.app"
  if [[ -f capacitor.config.ts ]]; then
    local id
    id=$(grep -E "appId[[:space:]]*:" capacitor.config.ts | head -n1 \
         | sed -E "s/.*appId[[:space:]]*:[[:space:]]*['\"]([^'\"]+)['\"].*/\1/")
    if [[ -n "$id" && "$id" != *"appId"* ]]; then
      printf '%s\n' "$id"
      return
    fi
  fi
  printf '%s\n' "$fallback"
}

json_escape() {
  # Escape backslashes, double quotes, and collapse control chars.
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/ }"
  s="${s//$'\r'/ }"
  s="${s//$'\t'/ }"
  printf '%s' "$s"
}

max_float() {
  # max_float A B → max(A, B) as a numeric string (treats non-numeric as 0).
  awk -v a="$1" -v b="$2" 'BEGIN { na=a+0; nb=b+0; print (nb > na ? nb : na) }'
}

host_info() {
  local kernel="" tail=""
  kernel="$(uname -sr 2>/dev/null || echo unknown)"
  case "$PLATFORM" in
    ios)
      if command -v xcodebuild >/dev/null 2>&1; then
        tail="$(xcodebuild -version 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true)"
      fi
      [[ -n "$tail" ]] || tail="xcode-unknown"
      ;;
    android)
      if command -v adb >/dev/null 2>&1; then
        tail="$(adb --version 2>/dev/null | head -n1 || true)"
      fi
      [[ -n "$tail" ]] || tail="adb-unknown"
      ;;
  esac
  printf '%s | %s' "$kernel" "$tail"
}

# ---------- iOS sampling ---------------------------------------------------
ios_pid_for() {
  local bundle="$1"
  local pid=""
  pid=$(xcrun simctl spawn booted launchctl list 2>/dev/null \
        | awk -v b="$bundle" 'index($0, b) { print $1; exit }' || true)
  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    pid=$(xcrun simctl spawn booted ps -A -o pid,comm 2>/dev/null \
          | awk -v b="$bundle" 'index($0, b) { print $1; exit }' || true)
  fi
  [[ "$pid" =~ ^[0-9]+$ ]] || pid=""
  printf '%s' "$pid"
}

ios_sample() {
  # echoes "<rss_mb> <dirty_mb>" — values are bare numbers or "null".
  local pid="$1"
  local out=""
  out=$(xcrun simctl spawn booted vmmap "$pid" --summary 2>/dev/null || true)
  if [[ -z "$out" ]]; then
    printf 'null null\n'
    return 0
  fi
  awk '
    function tomb(s,    n, u) {
      n = s + 0
      u = s
      sub(/^[0-9.]+/, "", u)
      if (u ~ /^G/) return n * 1024
      if (u ~ /^K/) return n / 1024
      if (u ~ /^B/) return n / (1024*1024)
      return n      # default: M
    }
    /PHYSICAL FOOTPRINT:/ {
      line=$0
      sub(/.*PHYSICAL FOOTPRINT:[[:space:]]*/, "", line)
      split(line, parts, /[[:space:]]+/)
      rss = tomb(parts[1])
    }
    /Writable regions:/ {
      for (i=1; i<=NF; i++) {
        if ($i ~ /^dirty=/)    { v=$i; sub(/^dirty=/, "", v);    dirty=tomb(v) }
        if ($i ~ /^written=/)  { if (dirty == "") { v=$i; sub(/^written=/, "", v);  dirty=tomb(v) } }
        if ($i ~ /^resident=/) { if (rss   == "") { v=$i; sub(/^resident=/, "", v); rss=tomb(v) } }
      }
    }
    END {
      printf "%s %s\n", (rss == "" ? "null" : sprintf("%.2f", rss)),
                       (dirty == "" ? "null" : sprintf("%.2f", dirty))
    }
  ' <<<"$out"
}

ios_mediapipe_loaded() {
  local logs=""
  logs=$(xcrun simctl spawn booted log show --last 5m --style compact 2>/dev/null \
         | grep -E -i "MediaPipe|tasks-genai" | head -n1 || true)
  [[ -n "$logs" ]] && echo true || echo false
}

# ---------- Android sampling -----------------------------------------------
android_pid_for() {
  local pkg="$1"
  local pid=""
  pid=$(adb shell pidof "$pkg" 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)
  [[ "$pid" =~ ^[0-9]+$ ]] || pid=""
  printf '%s' "$pid"
}

android_sample() {
  # echoes "<pss_mb> <native_heap_mb>" — values are numbers or "null".
  local pkg="$1"
  local out=""
  out=$(adb shell dumpsys meminfo "$pkg" 2>/dev/null | tr -d '\r' || true)
  if [[ -z "$out" ]]; then
    printf 'null null\n'
    return 0
  fi
  awk '
    function kb_to_mb(k) { return (k+0) / 1024 }
    # "TOTAL PSS:  12345  TOTAL RSS: ..."  or  legacy "TOTAL  12345  ..."
    /TOTAL PSS:/ && pss == "" {
      for (i=1; i<=NF; i++) {
        if ($i == "PSS:" && (i+1) <= NF && $(i+1) ~ /^[0-9]+$/) { pss=$(i+1); break }
      }
    }
    /^[[:space:]]+TOTAL[[:space:]]+[0-9]/ && pss == "" {
      pss=$2
    }
    # "  Native Heap     12345  ..."  — first numeric column is PSS Total.
    /Native Heap/ && native == "" {
      for (i=1; i<=NF; i++) if ($i ~ /^[0-9]+$/) { native=$i; break }
    }
    END {
      printf "%s %s\n", (pss   == "" ? "null" : sprintf("%.2f", kb_to_mb(pss))),
                       (native == "" ? "null" : sprintf("%.2f", kb_to_mb(native)))
    }
  ' <<<"$out"
}

android_mediapipe_loaded() {
  local logs=""
  logs=$(adb logcat -d -t 2000 2>/dev/null \
         | grep -E -i "MediaPipe|tasks-genai" | head -n1 || true)
  [[ -n "$logs" ]] && echo true || echo false
}

# ---------- main -----------------------------------------------------------
APP_ID="$(extract_app_id)"
TS_FILE="$(date +%Y%m%d%H%M%S)"
TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

OUT_DIR=".planning/sprint/4/measurements"
mkdir -p "$OUT_DIR"
TAG="${LABEL:-$TS_FILE}"
OUT_FILE="$OUT_DIR/${PLATFORM}-${TAG}.json"

case "$PLATFORM" in
  ios)
    require_tool xcrun "Install Xcode + command line tools (xcode-select --install)."
    PID="$(ios_pid_for "$APP_ID")"
    if [[ -z "$PID" ]]; then
      echo "error: no iOS process matching '$APP_ID' on the booted simulator. Launch the app first (npm run mobile:ios)." >&2
      exit 4
    fi
    SAMPLE_FN=ios_sample
    MEDIAPIPE_FN=ios_mediapipe_loaded
    SAMPLE_TARGET="$PID"
    KEY_PRIMARY="rss_mb"
    KEY_SECONDARY="dirty_mb"
    ;;
  android)
    require_tool adb "Install Android SDK Platform-Tools."
    PID="$(android_pid_for "$APP_ID")"
    if [[ -z "$PID" ]]; then
      echo "error: no Android process for package '$APP_ID'. Launch the app first (npm run mobile:android)." >&2
      exit 4
    fi
    SAMPLE_FN=android_sample
    MEDIAPIPE_FN=android_mediapipe_loaded
    SAMPLE_TARGET="$APP_ID"
    KEY_PRIMARY="pss_mb"
    KEY_SECONDARY="native_heap_mb"
    ;;
  *)
    echo "error: unsupported platform '$PLATFORM'" >&2
    exit 2
    ;;
esac

echo "==> mem measure: platform=$PLATFORM appId=$APP_ID pid=$PID samples=$SAMPLES interval=${INTERVAL}s"
echo "    output: $OUT_FILE"

SAMPLES_JSON=""
PEAK="0"
for i in $(seq 1 "$SAMPLES"); do
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  primary="null"
  secondary="null"
  read -r primary secondary < <("$SAMPLE_FN" "$SAMPLE_TARGET" || true) || true
  primary="${primary:-null}"
  secondary="${secondary:-null}"
  if [[ "$primary" != "null" ]]; then
    PEAK="$(max_float "$PEAK" "$primary")"
  fi
  ENTRY="{\"ts\":\"$ts\",\"$KEY_PRIMARY\":$primary,\"$KEY_SECONDARY\":$secondary}"
  if [[ -z "$SAMPLES_JSON" ]]; then
    SAMPLES_JSON="$ENTRY"
  else
    SAMPLES_JSON="$SAMPLES_JSON,$ENTRY"
  fi
  printf '  [%2d/%2d] %s  %s=%s  %s=%s\n' \
    "$i" "$SAMPLES" "$ts" "$KEY_PRIMARY" "$primary" "$KEY_SECONDARY" "$secondary"
  if [[ "$i" -lt "$SAMPLES" ]]; then
    sleep "$INTERVAL"
  fi
done

MP="$("$MEDIAPIPE_FN")"
HOST_ESC="$(json_escape "$(host_info)")"
LABEL_ESC="$(json_escape "$TAG")"
APP_ID_ESC="$(json_escape "$APP_ID")"

cat >"$OUT_FILE" <<EOF
{
  "platform": "$PLATFORM",
  "app_id": "$APP_ID_ESC",
  "label": "$LABEL_ESC",
  "started_at": "$TS_ISO",
  "samples": [$SAMPLES_JSON],
  "peak_rss_mb": $PEAK,
  "mediapipe_loaded": $MP,
  "host": "$HOST_ESC"
}
EOF

echo "==> wrote $OUT_FILE  (peak_rss_mb=$PEAK, mediapipe_loaded=$MP)"
