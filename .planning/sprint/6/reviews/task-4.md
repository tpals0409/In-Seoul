---
task: 4
title: README 실기기 가이드 + UAT troubleshooting 카탈로그
status: pass
rounds: 2
last_updated: 2026-05-10T12:55:39+09:00
diff_base: 67282a2
verdict_history:
  - round: 1
    verdict: reject
    sha: f0f1c89
  - round: 2
    verdict: pass
    sha: 62fa077
---

# Round 1
## Verdict: REJECT

## 주요 지적
- `README.md`의 실기기 빌드 단계가 `npm run mobile:ios:device` / `npm run mobile:android:device`를 정식 실행 명령으로 안내하지만, `s6-task-4-impl:package.json`에는 두 script가 없습니다. 현재 script 목록은 `mobile:ios`, `mobile:android`, `mobile:trace:*`, `mobile:mem:*`, `mobile:dry:*`뿐이므로 문서대로 실행하면 `npm ERR! Missing script`가 발생합니다.
- 같은 미존재 명령이 `docs/uat-troubleshooting.md`의 cert untrusted, USB unauthorized, 모델 다운로드 실패 항목에도 반복되어 UAT 복구 절차 역시 그대로 따라 할 수 없습니다.

## 변경 요약
- `README.md`에 Sprint 6 Phase B 실기기 빌드 섹션이 추가되었습니다.
- `docs/uat-troubleshooting.md`가 새로 추가되어 cert untrusted, USB unauthorized, mediapipe 모델 다운로드 실패, OOM 4개 카탈로그를 제공합니다.

## 6 차원 평가
- correctness: FAIL. 실기기 가이드 4단계성(iOS cert/trust/build, Android USB/adb/build)과 4건 카탈로그는 충족하지만, 핵심 `mobile:*:device` 명령이 구현 브랜치의 npm scripts에 존재하지 않습니다.
- regression: PASS for scope. 문서 2개만 변경되었고 런타임 코드 변경은 없습니다. 다만 명령 정확도 결함 때문에 사용자 실행 회귀가 있습니다.
- privacy: PASS. README의 Local-First 설명은 보존되었고, 새 문서는 원격 서버/클라우드 LLM 사용을 권유하지 않습니다.
- on-device LLM guard: PASS with note. mediapipe 모델 다운로드와 메모리 한계를 온디바이스 경로로 설명하며, ollama/mediapipe 분기 자체를 바꾸지는 않습니다.
- readability: PASS. 한국어 톤과 기존 README 모바일 섹션 스타일은 대체로 일관됩니다.
- test coverage: FAIL. 문서 task에서 가장 중요한 외부 링크/명령 정확도 검증 중 npm script 존재 여부가 실패했습니다.

## 재검증 요청
- `package.json`에 실제 `mobile:ios:device` / `mobile:android:device` scripts가 추가된 브랜치를 기준으로 문서를 유지하거나, 현재 존재하는 정확한 명령으로 README와 troubleshooting을 수정하세요.
- 수정 후 `npm run` 또는 `git show s6-task-4-impl:package.json` 기준으로 두 명령이 실제 존재함을 확인해 주세요.

# Round 2
## Verdict: PASS

## 기준 변경
- diff base를 `c139be3`에서 `67282a2`로 갱신했습니다. task-4 워크트리가 task-1 main merge commit을 포함하도록 rebase되어, 본 task 전용 diff는 `git diff 67282a2..s6-task-4-impl -- README.md docs/uat-troubleshooting.md`입니다.
- R2 검증 대상 commit은 `62fa077`입니다.

## 변경 요약
- `README.md`의 실기기 실행 안내가 미존재 npm script 가정에서 벗어나 `npm run build && npx cap sync <platform>`, `npx cap open <platform>`, `npx cap run <platform> --target <UDID|serial>` 형태로 수정되었습니다.
- `docs/uat-troubleshooting.md`의 cert untrusted, USB unauthorized, 모델 다운로드 실패 항목도 같은 실기기 실행 명령 체계로 정정되었습니다.

## 6 차원 평가
- correctness: PASS. 실기기 가이드는 iOS cert/trust/build-run, Android developer option/adb/build-run 흐름을 포함하고, troubleshooting은 cert untrusted / USB unauthorized / mediapipe model download failure / OOM 4건을 제공합니다. R1 blocker였던 `mobile:*:device` script 가정은 제거되었습니다.
- regression: PASS. task 전용 diff는 `README.md`와 `docs/uat-troubleshooting.md`에 한정됩니다. `npm run lint` exit 0, `npm test` 14 files / 128 tests passed.
- privacy: PASS. README의 Local-First 및 On-device AI 설명은 보존되었고, 새 문서는 사용자 재무 데이터 외부 전송이나 호스팅 LLM 사용을 권유하지 않습니다.
- on-device LLM guard: PASS. mediapipe 모델 다운로드는 읽기 전용 모델 fetch로 설명되고, OOM 항목은 온디바이스 mediapipe LLM의 메모리 한계를 안내합니다. ollama/mediapipe 분기 설명과 충돌하지 않습니다.
- readability: PASS. 기존 README 모바일 섹션의 한국어 문서 톤과 명령 블록 스타일을 유지합니다.
- test coverage: PASS. 문서 task에 필요한 명령명 검증을 수행했고, 기본 lint/test 회귀도 통과했습니다.

## 검증 명령
- `git diff 67282a2..s6-task-4-impl -- README.md docs/uat-troubleshooting.md`
- `git show s6-task-4-impl:package.json`
- `npm run lint`
- `npm test`
