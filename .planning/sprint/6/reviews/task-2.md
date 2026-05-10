---
status: pass
rounds: 2
last_updated: 2026-05-10T04:03:25Z
diff_base: c139be3
commit: e859635
---

# Sprint 6 Task 2 Review

## Verdict

Reject.

## Findings

1. `scripts/mobile-mem-measure.sh:422` ignores the selected Android target when checking MediaPipe logs. `android_pid_for` and `android_sample` use `adb "${ADB_S[@]}"`, and dry-run advertises `adb -s <serial> logcat`, but `android_mediapipe_loaded` still runs plain `adb logcat`. With multiple devices, or when `--device` selects a physical phone while an emulator is also attached, the memory sample and `mediapipe_loaded` guard can come from different devices. This breaks the `--device` contract and the on-device LLM guard.

2. `scripts/mobile-mem-measure.sh:360` makes the iOS real-device path emit `rss_mb=null`, `dirty_mb=null`, and therefore `peak_rss_mb=0` for every sample. The limitation is documented, but the task is real-device memory measurement; this branch only verifies process reachability and cannot produce usable iOS physical-device memory data.

## Six-Dimension Check

- correctness: Partial. Simulator path is preserved and Android `adb -s` is used for pid/meminfo, but Android MediaPipe log target is not pinned and iOS real-device memory fields are null.
- regression: Passed local smoke/regression commands listed below.
- privacy: No external data transmission introduced; script remains local CLI tooling.
- on-device LLM guard: Failed for Android `--device` because logcat is not scoped to `ADB_S`; iOS real-device guard is hardcoded `false`.
- readability: Bash structure is generally clear, but dry-run output diverges from runtime Android log behavior.
- test coverage: Dry-run evidence exists, but it did not catch the runtime logcat target mismatch.

## Verification

- `git log s6-task-2-impl --oneline | head -5` -> latest `178778f feat(s6-task-2): real-device mem measurement — iOS devicectl + Android adb -s`
- `git diff c139be3..s6-task-2-impl -- scripts/mobile-mem-measure.sh` reviewed.
- `bash -n scripts/mobile-mem-measure.sh` passed.
- `scripts/mobile-mem-measure.sh --help` passed.
- `npm test` passed: 14 files, 128 tests.
- `npx playwright test --project=chromium` passed: 10 tests.
- `npm run mobile:mem:ios -- --help` passed.
- `npm run mobile:mem:android -- --help` passed.
- Temp-copy dry-run passed:
  - `bash scripts/mobile-mem-measure.sh android --device emulator-5554 --dry-run`
  - `bash scripts/mobile-mem-measure.sh ios --device 00008110-001E001E001E001E --dry-run`

# Round 2

## Verdict

Pass.

## Findings

No blocking findings in R2. The two R1 reject causes were addressed in `e859635`:

- Android `android_mediapipe_loaded` now runs `adb "${ADB_S[@]}" logcat`, so `--device <serial>` and auto-resolved `adb -s <serial>` use the same target for PID lookup, meminfo, and MediaPipe log detection.
- iOS real-device sampling no longer always emits null by design; it now attempts a short `xctrace record --template Allocations` attach/export path and falls back to probing `xcrun devicectl device info processes` memory-shaped fields before emitting null with a warning.

Residual risk: this review environment had no paired/running physical iOS or Android app process, so actual on-device numeric samples remain UAT-only. Dry-run confirms intended command dispatch, and local syntax/regression coverage passed.

## Six-Dimension Check

- correctness: Pass with UAT caveat. iOS simulator path is preserved, Android `--device` is consistently applied to pid/meminfo/logcat, and iOS device path now attempts real numeric sampling before fallback.
- regression: Passed local Vitest 128 tests, Playwright 10 tests, and existing `mobile:mem:* --help` smoke paths.
- privacy: Pass. Script remains local host tooling and adds no external network or telemetry.
- on-device LLM guard: Pass for Android target pinning and simulator log paths; iOS real-device MediaPipe detection remains documented as manual/UAT because live console capture is not synchronous in this script.
- readability: Pass. Dispatch variables (`SIMCTL_TARGET`, `IOS_TARGET_TYPE`, `ADB_S`, `MODE`) make the simulator/device branches clear enough for a Bash utility.
- test coverage: Pass for CI-safe paths (`bash -n`, help, dry-run, regressions). Physical-device sampling requires manual UAT.

## Verification

- `git log s6-task-2-impl --oneline | head -8` -> latest `e859635 fix(s6-task-2): R2 — pin android logcat to ADB_S + xctrace iOS sampler`
- `git diff c139be3..s6-task-2-impl -- scripts/mobile-mem-measure.sh` reviewed.
- `git rev-parse --short HEAD` -> `e859635`.
- `bash -n scripts/mobile-mem-measure.sh` passed.
- `scripts/mobile-mem-measure.sh --help` passed.
- `npm test` passed: 14 files, 128 tests.
- `npx playwright test --project=chromium` passed: 10 tests.
- `npm run mobile:mem:ios -- --help` passed.
- `npm run mobile:mem:android -- --help` passed.
- Temp-copy dry-run passed:
  - `bash scripts/mobile-mem-measure.sh android --device emulator-5554 --dry-run`
  - `bash scripts/mobile-mem-measure.sh ios --device 00008110-001E001E001E001E --dry-run`
- `command -v xctrace` -> `/usr/bin/xctrace`.
