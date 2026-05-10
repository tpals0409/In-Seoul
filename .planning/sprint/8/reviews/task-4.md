---
task: 4
sprint: 8
status: pass
rounds: 2
last_updated: 2026-05-10T06:42:46Z
diff_base: 02863ddc0c82cd34009d75be9b7b70de5f3ee9ca
---

# Sprint 8 Task 4 Review

## Round 1

Verdict: reject

Implementation commit: `02863ddc0c82cd34009d75be9b7b70de5f3ee9ca`

### Evidence

- `git log task-4-impl --oneline -12` shows `02863dd fix(mobile): launch_ios 의 xcodebuild 가 SwiftPM 구조 따르도록` at `task-4-impl`.
- `git diff $(git merge-base main task-4-impl)..task-4-impl -- scripts/mobile-launch.sh` is empty because `main` already contains `02863dd`; commit inspection was done with `git show 02863dd -- scripts/mobile-launch.sh`.
- `git show 02863dd -- scripts/mobile-launch.sh` shows only the simulator build path changed:
  - `launch_ios`: `xcodebuild -workspace ios/App/App.xcworkspace` -> `xcodebuild -project ios/App/App.xcodeproj`.
  - `pick_ios_device_udid`: still uses `xcodebuild -workspace ios/App/App.xcworkspace -scheme App -showdestinations 2>/dev/null`.
- Filesystem check: `ios/App/App.xcodeproj` exists, `ios/App/App.xcworkspace` does not.
- `scripts/mobile-launch.sh ios --dry-run` passes and prints the expected simulator build command:
  - `[dry-run] xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -derivedDataPath /tmp/inseoul-ios-dd build`
- `scripts/mobile-launch.sh ios-device --dry-run` passes dispatch, but dry-run sets `udid=<first-connected-iphone-udid>` and does not exercise `pick_ios_device_udid`.
- `shellcheck scripts/mobile-launch.sh` could not be run: `shellcheck` is not installed in this sandbox (`command -v shellcheck` returned no path).

### 6-Dimension Review

- correctness: fail. Sprint 8 task-4 explicitly requires line 157 `pick_ios_device_udid` to match the SwiftPM `.xcodeproj` structure. It still calls `xcodebuild -workspace ios/App/App.xcworkspace`, which points at a missing directory in this repo. In a non-dry-run `ios-device` path without `--device`, stderr is silenced by `2>/dev/null`, so this would collapse to an empty UDID and the generic "no USB-connected iOS device detected" error instead of finding destinations through the existing project.
- regression: pass. The Sprint 7 simulator fix at line 234 is preserved as `-project ios/App/App.xcodeproj`, and the simulator dry-run prints the expected project-based `xcodebuild` command.
- infra both branches: partial/fail. `ios --dry-run` passes. `ios-device --dry-run` passes only the explicit dry-run placeholder branch, but the real auto-detection branch still targets the missing workspace and is the branch this task needed to fix.
- privacy / LLM: not applicable.
- readability: fail. The comment above `pick_ios_device_udid` still describes `xcodebuild -showdestinations`, but the command does not follow the same project/workspace convention as the simulator build. The stderr suppression pattern is consistent, but here it hides the wrong project container.
- shellcheck: not available locally; no shellcheck result attached.

### Required Fix

Update `pick_ios_device_udid` to call `xcodebuild` with the existing SwiftPM project container, for example:

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -showdestinations 2>/dev/null
```

Then rerun at least:

```bash
scripts/mobile-launch.sh ios --dry-run
scripts/mobile-launch.sh ios-device --dry-run
```

If possible, also run a non-dry-run or traced function-level check for `pick_ios_device_udid` so the UDID discovery command is proven to use `.xcodeproj`.

## Round 2

Verdict: pass

Implementation commit: `ac801e5`

Diff base: `02863ddc0c82cd34009d75be9b7b70de5f3ee9ca`

R1 note: the Round 1 rejection was valid for the then-current `task-4-impl` HEAD (`02863dd`) but is stale for Round 2. `task-4-impl` now points at `ac801e5`.

### Evidence

- `git log task-4-impl --oneline -3`:
  - `ac801e5 fix(sprint-8/task-4): mobile-launch SwiftPM coverage in pick_ios_device_udid`
  - `02863dd fix(mobile): launch_ios 의 xcodebuild 가 SwiftPM 구조 따르도록`
  - `72e2ce4 docs(sprint-6): finalize — ADR sprint-6 + dispatch.json + 4 review files`
- `git diff $(git merge-base main task-4-impl)..task-4-impl -- scripts/mobile-launch.sh` shows `pick_ios_device_udid` changed from `xcodebuild -workspace ios/App/App.xcworkspace -scheme App -showdestinations 2>/dev/null` to a captured `xcodebuild -project ios/App/App.xcodeproj -scheme App -showdestinations 2>&1`.
- `git show ac801e5 -- scripts/mobile-launch.sh` confirms the same single-file change: 11 insertions, 2 deletions.
- `task-4-impl:scripts/mobile-launch.sh` line 162 now calls:
  - `xcodebuild -project ios/App/App.xcodeproj -scheme App -showdestinations 2>&1`
- Archive-based verification copy from `task-4-impl` confirms `ios/App/App.xcodeproj` exists and `ios/App/App.xcworkspace` does not.
- `bash -n` on `task-4-impl:scripts/mobile-launch.sh` passed.
- `scripts/mobile-launch.sh ios --dry-run` in an archive of `task-4-impl` passed and printed:
  - `[dry-run] xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -derivedDataPath /tmp/inseoul-ios-dd build`
- `scripts/mobile-launch.sh ios-device --dry-run` in the same archive passed dispatch and printed:
  - `[dry-run] npx cap run ios --target \<first-connected-iphone-udid\>`
- Function-level test for `pick_ios_device_udid` with mocked `xcodebuild` success output returned:
  - `00008110-001C35D00C01801E`
- Function-level test for mocked `xcodebuild` failure printed:
  - `warn: xcodebuild -showdestinations failed:`
  - `xcodebuild failed for test`
  - `exit=0`
- Function-level argument trace for mocked `xcodebuild` failure printed:
  - `args: <-project> <ios/App/App.xcodeproj> <-scheme> <App> <-showdestinations>`
- `shellcheck scripts/mobile-launch.sh` could not be run because `shellcheck` is not installed in this sandbox (`zsh:1: command not found: shellcheck`).

### 6-Dimension Review

- correctness: pass. `pick_ios_device_udid` now matches the SwiftPM `.xcodeproj` structure. Capturing `2>&1` and warning on `xcodebuild` failure prevents a silent empty-UDID collapse from being indistinguishable from "no device".
- regression: pass. The Sprint 7 simulator fix is preserved: `launch_ios` still uses `-project ios/App/App.xcodeproj` for the simulator build path.
- infra both branches: pass. `ios --dry-run` passes and prints the project-based simulator `xcodebuild`; `ios-device --dry-run` passes dispatch. The auto-detection sub-branch was additionally checked by function-level mocked success/failure tests.
- privacy / LLM: not applicable.
- readability: pass. The new comment explains why `.xcodeproj` is required and why stderr is captured. The failure path remains concise and returns no UDID while surfacing the underlying `xcodebuild` error.
- shellcheck: not available locally; syntax validation with `bash -n` passed.
