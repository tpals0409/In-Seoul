#!/usr/bin/env bash
#
# mobile-launch.sh — boot simulator/emulator (or target USB device), sync
# Capacitor, build, install, launch.
#
# Usage:
#   scripts/mobile-launch.sh <platform> [--device <id>] [--dry-run] [--help]
#
# --dry-run echoes every command instead of executing it; nothing is booted.

set -euo pipefail

# ---------- repo root ------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ---------- arg parsing ----------------------------------------------------
PLATFORM=""
DEVICE=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: scripts/mobile-launch.sh <platform> [options]

Platforms:
  ios              Boot iOS Simulator, build, install, launch.
  android          Boot Android Emulator, build, install, launch.
  ios-device       Build, install, launch on USB-connected iPhone (real device).
  android-device   Build, install, launch on USB-connected Android (real device).

Options:
  --device <id>    Simulator/AVD name (sim mode) or UDID/serial (device mode).
                   Defaults to first available.
  --dry-run        Echo commands; do not boot devices or run builds.
  --help           Show this help.

Examples:
  scripts/mobile-launch.sh ios
  scripts/mobile-launch.sh android --device Pixel_6_API_34
  scripts/mobile-launch.sh ios-device
  scripts/mobile-launch.sh android-device --device R5CT123ABCD
  scripts/mobile-launch.sh ios-device --dry-run
EOF
}

if [[ $# -eq 0 ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    ios|android|ios-device|android-device)
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
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
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
  echo "error: platform (ios|android|ios-device|android-device) required" >&2
  usage >&2
  exit 2
fi

# ---------- helpers --------------------------------------------------------
run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'
    for arg in "$@"; do
      printf ' %q' "$arg"
    done
    printf '\n'
  else
    "$@"
  fi
}

run_sh() {
  # Run a shell snippet (supports pipes/redirects). Pass as a single string.
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] sh -c %q\n' "$1"
  else
    bash -c "$1"
  fi
}

require_tool() {
  local tool="$1"
  local hint="$2"
  if ! command -v "$tool" >/dev/null 2>&1; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] warn: '$tool' not found in PATH ($hint) — would fail on real run." >&2
      return 0
    fi
    cat >&2 <<EOF
error: required tool '$tool' not found in PATH.
       $hint
EOF
    exit 3
  fi
}

extract_app_id() {
  # Extract appId from capacitor.config.ts. Falls back if unreadable.
  local fallback="kr.go.seoul.foreigner"
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

setup_android_env() {
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
  export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"
}

# Pick first USB-connected iPhone UDID via xcodebuild -showdestinations.
# Real-device entries look like: { platform:iOS, id:<UDID>, name:... }
# Simulator entries are "platform:iOS Simulator," and are excluded by the
# trailing-comma match. Generic-device placeholders are excluded by UDID
# regex (must be 8+ hex chars, optionally one dash and more hex).
pick_ios_device_udid() {
  # iOS uses SwiftPM (no .xcworkspace), so -project. Capture stderr too:
  # silent xcodebuild failures (stale toolchain, missing scheme) would
  # otherwise emit an empty UDID indistinguishable from "no device" and
  # surface downstream as a misleading "no USB-connected device" error.
  local destinations
  if ! destinations=$(xcodebuild -project ios/App/App.xcodeproj -scheme App \
                      -showdestinations 2>&1); then
    printf 'warn: xcodebuild -showdestinations failed:\n%s\n' "$destinations" >&2
    return 0
  fi
  printf '%s\n' "$destinations" \
    | grep 'platform:iOS,' \
    | sed -E 's/.*id:([^,}]+).*/\1/' \
    | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' \
    | grep -E '^[0-9A-Fa-f]{8,}(-[0-9A-Fa-f]+)?$' \
    | head -n1
}

# Pick first USB-connected, authorized Android device serial.
# `adb devices` columns: <serial> <state>. We require state=="device"
# (excludes "unauthorized" and "offline") and exclude emulators
# (serial prefix "emulator-").
pick_android_device_serial() {
  adb devices 2>/dev/null \
    | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ { print $1; exit }'
}

APP_ID="$(extract_app_id)"

# ---------- iOS simulator path --------------------------------------------
launch_ios() {
  require_tool xcrun     "Install Xcode + command line tools (xcode-select --install)."
  require_tool xcodebuild "Install Xcode and ensure 'xcode-select -p' points at it."
  require_tool npm       "Install Node.js (https://nodejs.org)."
  require_tool npx       "Comes with Node.js."

  local sim_name="$DEVICE"
  if [[ -z "$sim_name" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      sim_name="<first-available-iPhone>"
    else
      sim_name=$(xcrun simctl list devices available \
                 | grep -E "iPhone" \
                 | head -n1 \
                 | sed -E 's/^ +([^(]+) \(.*$/\1/' \
                 | sed -E 's/[[:space:]]+$//')
      if [[ -z "$sim_name" ]]; then
        echo "error: no available iPhone simulator. Install one via Xcode > Settings > Platforms." >&2
        exit 4
      fi
    fi
  fi

  echo "==> iOS: simulator='$sim_name', appId='$APP_ID'"

  run xcrun simctl boot "$sim_name" || true
  run open -a Simulator

  # Bounded wait for simulator boot readiness (Springboard up).
  # `simctl bootstatus -b` boots if needed and blocks until fully booted.
  local boot_timeout=120
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] xcrun simctl bootstatus %q -b   # wait up to %ss\n' \
      "$sim_name" "$boot_timeout"
  else
    if command -v timeout >/dev/null 2>&1; then
      timeout "$boot_timeout" xcrun simctl bootstatus "$sim_name" -b
    elif command -v gtimeout >/dev/null 2>&1; then
      gtimeout "$boot_timeout" xcrun simctl bootstatus "$sim_name" -b
    else
      xcrun simctl bootstatus "$sim_name" -b &
      local bs_pid=$!
      ( sleep "$boot_timeout" && kill -TERM "$bs_pid" 2>/dev/null || true ) &
      local watcher=$!
      if ! wait "$bs_pid" 2>/dev/null; then
        echo "error: iOS simulator '$sim_name' did not finish booting in ${boot_timeout}s" >&2
        kill "$watcher" 2>/dev/null || true
        exit 5
      fi
      kill "$watcher" 2>/dev/null || true
    fi
  fi

  run npm run build
  run npx cap sync ios
  run xcodebuild \
    -project ios/App/App.xcodeproj \
    -scheme App \
    -configuration Debug \
    -sdk iphonesimulator \
    -derivedDataPath /tmp/inseoul-ios-dd \
    build

  run xcrun simctl install booted \
    /tmp/inseoul-ios-dd/Build/Products/Debug-iphonesimulator/App.app
  run xcrun simctl launch booted "$APP_ID"

  echo "==> iOS launch complete (appId=$APP_ID)"
}

# ---------- iOS real-device path -------------------------------------------
launch_ios_device() {
  require_tool xcrun     "Install Xcode + command line tools (xcode-select --install)."
  require_tool xcodebuild "Install Xcode and ensure 'xcode-select -p' points at it."
  require_tool npm       "Install Node.js (https://nodejs.org)."
  require_tool npx       "Comes with Node.js."

  local udid="$DEVICE"
  if [[ -z "$udid" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      udid="<first-connected-iphone-udid>"
    else
      udid="$(pick_ios_device_udid)"
      if [[ -z "$udid" ]]; then
        cat >&2 <<EOF
error: no USB-connected iOS device detected.
       Connect via USB, unlock the device, and tap "Trust This Computer".
       Verify with: xcrun devicectl list devices
EOF
        exit 4
      fi
    fi
  fi

  echo "==> iOS device: udid='$udid', appId='$APP_ID'"

  run npm run build
  # `cap run` syncs Capacitor, builds via xcodebuild with the device
  # destination, installs onto the device, and launches the app. Code
  # signing (Apple ID / provisioning profile) must already be configured
  # in the Xcode project — otherwise xcodebuild will fail with a clear
  # signing error.
  run npx cap run ios --target "$udid"

  echo "==> iOS device launch complete (appId=$APP_ID, udid=$udid)"
}

# ---------- Android emulator path -----------------------------------------
launch_android() {
  setup_android_env

  require_tool adb        "Install Android SDK Platform-Tools (sdkmanager 'platform-tools')."
  require_tool emulator   "Install Android SDK Emulator (sdkmanager 'emulator')."
  require_tool avdmanager "Install Android cmdline-tools (sdkmanager 'cmdline-tools;latest')."
  require_tool npm        "Install Node.js (https://nodejs.org)."
  require_tool npx        "Comes with Node.js."

  local avd_name="$DEVICE"
  if [[ -z "$avd_name" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      avd_name="<first-AVD>"
    else
      avd_name=$(avdmanager list avd 2>/dev/null \
                 | awk -F': ' '/^[[:space:]]*Name:/ {print $2; exit}')
      if [[ -z "$avd_name" ]]; then
        cat >&2 <<EOF
error: no Android AVD configured.
       Create one with:
         sdkmanager "system-images;android-34;google_apis;arm64-v8a"
         avdmanager create avd -n Pixel_API_34 -k "system-images;android-34;google_apis;arm64-v8a"
EOF
        exit 4
      fi
    fi
  fi

  echo "==> Android: avd='$avd_name', appId='$APP_ID'"

  # Boot emulator detached
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run] emulator -avd %q -no-snapshot-load &\n' "$avd_name"
    printf '[dry-run] adb wait-for-device\n'
    printf '[dry-run] adb shell getprop sys.boot_completed (poll until "1")\n'
  else
    nohup emulator -avd "$avd_name" -no-snapshot-load \
      >/tmp/inseoul-android-emulator.log 2>&1 &
    adb wait-for-device
    local boot=""
    local tries=0
    while [[ "$boot" != "1" ]]; do
      boot=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
      tries=$((tries + 1))
      if [[ "$tries" -gt 120 ]]; then
        echo "error: emulator did not finish booting in 120s" >&2
        exit 5
      fi
      [[ "$boot" == "1" ]] || sleep 1
    done
  fi

  run npm run build
  run npx cap sync android
  run_sh "cd android && ./gradlew assembleDebug && cd .."

  run adb install -r android/app/build/outputs/apk/debug/app-debug.apk
  run adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1

  echo "==> Android launch complete (package=$APP_ID)"
}

# ---------- Android real-device path --------------------------------------
launch_android_device() {
  setup_android_env

  require_tool adb "Install Android SDK Platform-Tools (sdkmanager 'platform-tools')."
  require_tool npm "Install Node.js (https://nodejs.org)."
  require_tool npx "Comes with Node.js."

  local serial="$DEVICE"
  if [[ -z "$serial" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      serial="<first-connected-android-serial>"
    else
      serial="$(pick_android_device_serial)"
      if [[ -z "$serial" ]]; then
        cat >&2 <<EOF
error: no USB-connected, authorized Android device detected.
       1. Enable Developer Options + USB debugging on the device.
       2. Connect via USB and accept the RSA fingerprint prompt.
       3. Verify with: adb devices  (status must be "device", not "unauthorized")
EOF
        exit 4
      fi
    fi
  fi

  echo "==> Android device: serial='$serial', appId='$APP_ID'"

  run npm run build
  run npx cap sync android
  run_sh "cd android && ./gradlew assembleDebug && cd .."

  run adb -s "$serial" install -r android/app/build/outputs/apk/debug/app-debug.apk
  run adb -s "$serial" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1

  echo "==> Android device launch complete (package=$APP_ID, serial=$serial)"
}

# ---------- dispatch -------------------------------------------------------
case "$PLATFORM" in
  ios)            launch_ios ;;
  android)        launch_android ;;
  ios-device)     launch_ios_device ;;
  android-device) launch_android_device ;;
  *)
    echo "error: unsupported platform '$PLATFORM'" >&2
    exit 2
    ;;
esac
