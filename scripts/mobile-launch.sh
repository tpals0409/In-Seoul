#!/usr/bin/env bash
#
# mobile-launch.sh — boot simulator/emulator, sync Capacitor, build, install, launch.
#
# Usage:
#   scripts/mobile-launch.sh ios|android [--device <name>] [--dry-run] [--help]
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
  ios       Boot iOS Simulator, build, install, launch.
  android   Boot Android Emulator, build, install, launch.

Options:
  --device <name>   Specific simulator/AVD name (default: first available).
  --dry-run         Echo commands; do not boot devices or run builds.
  --help            Show this help.

Examples:
  scripts/mobile-launch.sh ios
  scripts/mobile-launch.sh android --device Pixel_6_API_34
  scripts/mobile-launch.sh ios --dry-run
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
  echo "error: platform (ios|android) required" >&2
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

APP_ID="$(extract_app_id)"

# ---------- iOS path -------------------------------------------------------
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

  run npm run build
  run npx cap sync ios
  run xcodebuild \
    -workspace ios/App/App.xcworkspace \
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

# ---------- Android path ---------------------------------------------------
launch_android() {
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
  export PATH="$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

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

# ---------- dispatch -------------------------------------------------------
case "$PLATFORM" in
  ios)     launch_ios ;;
  android) launch_android ;;
  *)
    echo "error: unsupported platform '$PLATFORM'" >&2
    exit 2
    ;;
esac
