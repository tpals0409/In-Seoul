#!/usr/bin/env bash
#
# mobile-mem-measure.sh — sample on-device LLM memory usage from a booted
# iOS Simulator/device or Android Emulator/device and emit a JSON summary,
# including whether the MediaPipe (tasks-genai) backend showed up in recent
# logs.
#
# Usage:
#   scripts/mobile-mem-measure.sh ios|android \
#     [--device <udid|serial>] [--samples N] [--interval S] [--label TAG] \
#     [--dry-run] [--help]
#
# Defaults: samples=12, interval=5  (≈60s window).
#
# Output:
#   .planning/sprint/4/measurements/{platform}-{label or YYYYMMDDhhmmss}.json
#
# Prereqs: app already running on the booted simulator/emulator/device
# (e.g. via `npm run mobile:ios` or `npm run mobile:android`). The script
# does NOT boot devices — it only samples a live process.
#
# Device path:
#   iOS    real device → `xcrun devicectl device info processes --device <udid>`
#   Android real device → `adb -s <serial> shell dumpsys meminfo <pkg>`
# Simulator/emulator path is preserved when --device is empty or names a
# known simulator UDID.
#
# Real-device numbers are UAT (host-only). CI validates only `bash -n`,
# `--help`, and `--dry-run` paths.

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
DEVICE=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: scripts/mobile-mem-measure.sh <platform> [options]

Platforms:
  ios       Sample memory of booted iOS Simulator/device app
            (xcrun simctl + vmmap | xcrun devicectl).
  android   Sample memory of running Android Emulator/device app
            (adb dumpsys meminfo, optionally pinned via -s <serial>).

Options:
  --device <udid|serial>
                   iOS  : simulator UDID (preserves simctl path) OR
                          real-device UDID (uses xcrun devicectl).
                   Android: device/emulator serial; passed to adb -s.
                   When omitted, iOS uses the booted simulator and
                   Android auto-resolves the first connected device.
  --samples N      Number of samples to collect   (default: 12).
  --interval S     Seconds between samples         (default: 5).
  --label TAG      Tag inserted into output filename + JSON.
                   Must match [A-Za-z0-9._-]+.
  --dry-run        Echo the commands that would run for the configured
                   path, then exit 0 without booting/sampling.
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

  Real iOS device: `xcrun devicectl` exposes process IDs but no per-process
  RSS via CLI, so per-sample memory fields are emitted as null. Use
  Instruments.app / `instruments -t Allocations -w <udid> -D <out>` for
  authoritative numbers; this script verifies the process is reachable
  and records peak from any accompanying simulator runs side-by-side.

Examples:
  scripts/mobile-mem-measure.sh ios
  scripts/mobile-mem-measure.sh android --samples 24 --interval 5 --label gemma2b
  scripts/mobile-mem-measure.sh ios --samples 1 --interval 1 --label sanity
  scripts/mobile-mem-measure.sh android --device emulator-5554 --dry-run
  scripts/mobile-mem-measure.sh ios --device 00008110-001E... --dry-run
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
    --device)
      if [[ $# -lt 2 ]]; then
        echo "error: --device requires an argument" >&2
        exit 2
      fi
      DEVICE="$2"
      if ! [[ "$DEVICE" =~ ^[A-Za-z0-9._:-]+$ ]]; then
        echo "error: --device must match [A-Za-z0-9._:-]+ (got '$DEVICE')" >&2
        exit 2
      fi
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
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
# SIMCTL_TARGET is "booted" by default and overridden to a specific simulator
# UDID when --device names a known simulator. Real-device path uses
# DEVICE_UDID via xcrun devicectl (see ios_device_* helpers below).

ios_pid_for() {
  local bundle="$1"
  local pid=""
  pid=$(xcrun simctl spawn "$SIMCTL_TARGET" launchctl list 2>/dev/null \
        | awk -v b="$bundle" 'index($0, b) { print $1; exit }' || true)
  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    pid=$(xcrun simctl spawn "$SIMCTL_TARGET" ps -A -o pid,comm 2>/dev/null \
          | awk -v b="$bundle" 'index($0, b) { print $1; exit }' || true)
  fi
  [[ "$pid" =~ ^[0-9]+$ ]] || pid=""
  printf '%s' "$pid"
}

ios_sample() {
  # echoes "<rss_mb> <dirty_mb>" — values are bare numbers or "null".
  local pid="$1"
  local out=""
  out=$(xcrun simctl spawn "$SIMCTL_TARGET" vmmap "$pid" --summary 2>/dev/null || true)
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
  logs=$(xcrun simctl spawn "$SIMCTL_TARGET" log show --last 5m --style compact 2>/dev/null \
         | grep -E -i "MediaPipe|tasks-genai" | head -n1 || true)
  [[ -n "$logs" ]] && echo true || echo false
}

# ---------- iOS real-device sampling (xcrun devicectl) ---------------------
# devicectl exposes process IDs but not per-process RSS via CLI. We use it
# to locate the running app and verify reachability; memory fields stay
# null per sample (Instruments.app required for authoritative numbers).

IOS_DEVICE_SAMPLE_NOTED=0

ios_device_pid_for() {
  local bundle="$1"
  local raw=""
  raw=$(xcrun devicectl device info processes \
          --device "$DEVICE" --quiet --json-output - 2>/dev/null || true)
  [[ -z "$raw" ]] && { printf ''; return 0; }
  local pid=""
  pid=$(printf '%s' "$raw" | BUNDLE="$bundle" python3 -c '
import json, os, sys
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)
target = os.environ.get("BUNDLE", "")
if not target:
    sys.exit(0)
procs = (data.get("result") or {}).get("runningProcesses") or []
for p in procs:
    exe = p.get("executable") or ""
    bid = p.get("bundleIdentifier") or ""
    if target == bid or target in exe:
        pid_val = p.get("processIdentifier")
        if isinstance(pid_val, int):
            print(pid_val)
            break
' 2>/dev/null || true)
  [[ "$pid" =~ ^[0-9]+$ ]] || pid=""
  printf '%s' "$pid"
}

ios_device_sample() {
  # devicectl does not expose per-process RSS via CLI — emit null fields
  # and surface the limitation once on stderr.
  if [[ "$IOS_DEVICE_SAMPLE_NOTED" -eq 0 ]]; then
    echo "warn: real iOS device per-process RSS not exposed by xcrun devicectl;" >&2
    echo "      memory fields emitted as null. Use Instruments.app or" >&2
    echo "      'instruments -t Allocations -w $DEVICE -D <out>.trace' for numbers." >&2
    IOS_DEVICE_SAMPLE_NOTED=1
  fi
  printf 'null null\n'
}

ios_device_mediapipe_loaded() {
  # Real-device console streaming requires async tools (idevicesyslog,
  # Console.app filtered to device). Emit false and let UAT fill in.
  echo false
}

# ---------- Android sampling -----------------------------------------------
# ADB_S is an array splatted as `adb "${ADB_S[@]}" <subcmd>`. It is empty
# when no device is selected (preserves single-device default behaviour),
# and equals (-s "$DEVICE") when --device is given or auto-resolved.

android_pid_for() {
  local pkg="$1"
  local pid=""
  pid=$(adb "${ADB_S[@]}" shell pidof "$pkg" 2>/dev/null | tr -d '\r' | awk '{print $1}' || true)
  [[ "$pid" =~ ^[0-9]+$ ]] || pid=""
  printf '%s' "$pid"
}

android_sample() {
  # echoes "<pss_mb> <native_heap_mb>" — values are numbers or "null".
  local pkg="$1"
  local out=""
  out=$(adb "${ADB_S[@]}" shell dumpsys meminfo "$pkg" 2>/dev/null | tr -d '\r' || true)
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

# ---------- target dispatch ------------------------------------------------
# Decide simulator-vs-device path before any tool call.
SIMCTL_TARGET="booted"
IOS_TARGET_TYPE="simulator"
ADB_S=()
MODE=""

case "$PLATFORM" in
  ios)
    if [[ -n "$DEVICE" ]]; then
      if command -v xcrun >/dev/null 2>&1 \
         && xcrun simctl list devices 2>/dev/null | grep -q "$DEVICE"; then
        IOS_TARGET_TYPE="simulator"
        SIMCTL_TARGET="$DEVICE"
        MODE="simulator $DEVICE"
      else
        IOS_TARGET_TYPE="device"
        MODE="real device $DEVICE (devicectl)"
      fi
    else
      MODE="simulator booted"
    fi
    ;;
  android)
    if [[ -n "$DEVICE" ]]; then
      ADB_S=(-s "$DEVICE")
      MODE="adb -s $DEVICE"
    elif command -v adb >/dev/null 2>&1; then
      first_dev=$(adb devices 2>/dev/null \
                  | awk 'NR>1 && $2=="device" { print $1; exit }' || true)
      if [[ -n "$first_dev" ]]; then
        ADB_S=(-s "$first_dev")
        MODE="adb -s $first_dev (auto-resolved)"
      else
        MODE="adb default (no device detected)"
      fi
    else
      MODE="adb default"
    fi
    ;;
esac

# ---------- dry-run preview (commands only, no sampling) -------------------
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "==> dry-run: platform=$PLATFORM mode=$MODE samples=$SAMPLES interval=${INTERVAL}s"
  echo "    appId=$APP_ID"
  echo "    output: $OUT_FILE"
  case "$PLATFORM" in
    ios)
      if [[ "$IOS_TARGET_TYPE" == "simulator" ]]; then
        printf '[dry-run] pid_lookup:  xcrun simctl spawn %q launchctl list | grep %q\n' \
          "$SIMCTL_TARGET" "$APP_ID"
        printf '[dry-run] sampler:     xcrun simctl spawn %q vmmap <PID> --summary\n' \
          "$SIMCTL_TARGET"
        printf '[dry-run] mediapipe:   xcrun simctl spawn %q log show --last 5m | grep -E -i %q\n' \
          "$SIMCTL_TARGET" "MediaPipe|tasks-genai"
      else
        printf '[dry-run] pid_lookup:  xcrun devicectl device info processes --device %q --quiet --json-output -\n' \
          "$DEVICE"
        printf '[dry-run] sampler:     <devicectl exposes no per-process RSS — emit null fields>\n'
        printf '[dry-run] mediapipe:   <real-device console capture requires Instruments.app / idevicesyslog — emit false>\n'
      fi
      ;;
    android)
      if [[ ${#ADB_S[@]} -gt 0 ]]; then
        printf '[dry-run] pid_lookup:  adb %q %q shell pidof %q\n' \
          "${ADB_S[0]}" "${ADB_S[1]}" "$APP_ID"
        printf '[dry-run] sampler:     adb %q %q shell dumpsys meminfo %q\n' \
          "${ADB_S[0]}" "${ADB_S[1]}" "$APP_ID"
        printf '[dry-run] mediapipe:   adb %q %q logcat -d -t 2000 | grep -E -i %q\n' \
          "${ADB_S[0]}" "${ADB_S[1]}" "MediaPipe|tasks-genai"
      else
        printf '[dry-run] pid_lookup:  adb shell pidof %q\n' "$APP_ID"
        printf '[dry-run] sampler:     adb shell dumpsys meminfo %q\n' "$APP_ID"
        printf '[dry-run] mediapipe:   adb logcat -d -t 2000 | grep -E -i %q\n' \
          "MediaPipe|tasks-genai"
      fi
      ;;
  esac
  exit 0
fi

case "$PLATFORM" in
  ios)
    require_tool xcrun "Install Xcode + command line tools (xcode-select --install)."
    if [[ "$IOS_TARGET_TYPE" == "device" ]]; then
      PID="$(ios_device_pid_for "$APP_ID")"
      if [[ -z "$PID" ]]; then
        echo "error: no iOS process matching '$APP_ID' on device '$DEVICE'. Launch the app first and confirm the device is paired (xcrun devicectl list devices)." >&2
        exit 4
      fi
      SAMPLE_FN=ios_device_sample
      MEDIAPIPE_FN=ios_device_mediapipe_loaded
    else
      PID="$(ios_pid_for "$APP_ID")"
      if [[ -z "$PID" ]]; then
        echo "error: no iOS process matching '$APP_ID' on simulator '$SIMCTL_TARGET'. Launch the app first (npm run mobile:ios)." >&2
        exit 4
      fi
      SAMPLE_FN=ios_sample
      MEDIAPIPE_FN=ios_mediapipe_loaded
    fi
    SAMPLE_TARGET="$PID"
    KEY_PRIMARY="rss_mb"
    KEY_SECONDARY="dirty_mb"
    ;;
  android)
    require_tool adb "Install Android SDK Platform-Tools."
    PID="$(android_pid_for "$APP_ID")"
    if [[ -z "$PID" ]]; then
      echo "error: no Android process for package '$APP_ID' (mode: $MODE). Launch the app first (npm run mobile:android)." >&2
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

echo "==> mem measure: platform=$PLATFORM mode=$MODE appId=$APP_ID pid=$PID samples=$SAMPLES interval=${INTERVAL}s"
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
