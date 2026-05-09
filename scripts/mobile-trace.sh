#!/usr/bin/env bash
#
# mobile-trace.sh — capture iOS unified log / Android logcat to .planning/sprint/4/runs/
#
# Usage:
#   scripts/mobile-trace.sh ios|android [--duration <sec>] [--filter <regex>] [--help]
#
# Without --duration, runs until Ctrl+C.

set -euo pipefail

# ---------- repo root ------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ---------- arg parsing ----------------------------------------------------
PLATFORM=""
DURATION=""
FILTER=""

usage() {
  cat <<'EOF'
Usage: scripts/mobile-trace.sh <platform> [options]

Platforms:
  ios       Stream iOS Simulator unified log (xcrun simctl spawn booted log).
  android   Stream Android adb logcat (filtered to Capacitor/Console/MediaPipe).

Options:
  --duration <sec>   Stop after N seconds (default: until Ctrl+C).
  --filter <regex>   Additional grep -E regex applied to every line.
  --help             Show this help.

Output:
  .planning/sprint/4/runs/{platform}-{YYYYMMDDhhmmss}.log
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
    --duration)
      if [[ $# -lt 2 ]]; then
        echo "error: --duration requires an argument" >&2
        exit 2
      fi
      DURATION="$2"
      if ! [[ "$DURATION" =~ ^[0-9]+$ ]]; then
        echo "error: --duration must be a positive integer (seconds)" >&2
        exit 2
      fi
      shift 2
      ;;
    --filter)
      if [[ $# -lt 2 ]]; then
        echo "error: --filter requires an argument" >&2
        exit 2
      fi
      FILTER="$2"
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

# ---------- output path ----------------------------------------------------
OUT_DIR=".planning/sprint/4/runs"
mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d%H%M%S)"
OUT_FILE="$OUT_DIR/${PLATFORM}-${TS}.log"

# ---------- cleanup --------------------------------------------------------
on_exit() {
  local rc=$?
  if [[ -f "$OUT_FILE" ]]; then
    local size
    size=$(wc -c < "$OUT_FILE" | tr -d ' ')
    echo
    echo "==> trace saved: $OUT_FILE (${size} bytes)"
  fi
  exit "$rc"
}
trap on_exit EXIT INT TERM

# ---------- platform commands ---------------------------------------------
require_tool() {
  local tool="$1"
  local hint="$2"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: required tool '$tool' not found in PATH. $hint" >&2
    exit 3
  fi
}

# Build the streaming pipeline as a single shell expression so we can
# optionally wrap it with `timeout` / pipe through extra grep.
case "$PLATFORM" in
  ios)
    require_tool xcrun "Install Xcode command line tools (xcode-select --install)."
    STREAM_CMD='xcrun simctl spawn booted log stream --level=info --style=compact --predicate '"'"'process CONTAINS[c] "App"'"'"
    ;;
  android)
    require_tool adb "Install Android SDK Platform-Tools."
    STREAM_CMD='adb logcat -v time | grep --line-buffered -E "(Capacitor|Console|chromium|MediaPipe)"'
    ;;
  *)
    echo "error: unsupported platform '$PLATFORM'" >&2
    exit 2
    ;;
esac

if [[ -n "$FILTER" ]]; then
  STREAM_CMD="$STREAM_CMD | grep --line-buffered -E $(printf '%q' "$FILTER")"
fi

# Always tee to the log file
STREAM_CMD="$STREAM_CMD | tee \"$OUT_FILE\""

echo "==> tracing $PLATFORM → $OUT_FILE"
[[ -n "$FILTER"   ]] && echo "    extra filter: $FILTER"
[[ -n "$DURATION" ]] && echo "    duration: ${DURATION}s" || echo "    duration: until Ctrl+C"

if [[ -n "$DURATION" ]]; then
  # GNU/BSD-portable timeout wrapper. macOS: `gtimeout` if coreutils; else background+kill.
  if command -v timeout >/dev/null 2>&1; then
    timeout "$DURATION" bash -c "$STREAM_CMD" || true
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$DURATION" bash -c "$STREAM_CMD" || true
  else
    bash -c "$STREAM_CMD" &
    pid=$!
    ( sleep "$DURATION" && kill -INT "$pid" 2>/dev/null || true ) &
    wait "$pid" 2>/dev/null || true
  fi
else
  bash -c "$STREAM_CMD"
fi
