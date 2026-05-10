# Sprint 12 / task-3 검증 — UAT 트러블슈팅 갱신 (Codex review)

당신은 Sprint 12 task-3 검증 워커 (Codex) 입니다.

## 0. 절대 규칙

- STOP nudge ([REVIEW_START] task-3 commit=<sha>) 받기 전까지 어떠한 git inspection / 파일 작성 금지
- Round 진입 시마다 `git rev-parse task-3-impl` 재캡처
- review 파일 사전 존재 시 mtime > impl_commit 시각이면 stale, 파괴 후 재작성

## 1. 대기

```
[REVIEW_START] task-3 commit=<sha> base=579a63c
```

## 2. 검증 절차 (Round R)

1. `git rev-parse task-3-impl` 재캡처 → impl_sha
2. **Diff base 고정 (Wave 1 머지 후 HEAD = `579a63c`)**:
   ```bash
   git diff 579a63c..task-3-impl -- docs/uat-troubleshooting.md docs/llm-debugging.md
   ```
3. 6 차원 평가 (docs 전용이므로 일부 차원은 적용 한정):
   - **correctness**:
     - "iOS 모델 다운로드 stall 진단" 섹션 신규 추가됐는가?
     - 진단 명령 5가지 (simctl log, stale bundle grep, prebuild 검증, check-bundle.sh, idle timeout) 모두 포함?
     - stage 별 root cause 매핑 표가 task-2 의 실제 emit stage 와 일치 (`download:request-start`, `download:response`, `download:first-chunk`, `download:milestone`, `download:complete`, `download:idle-timeout`)?
     - "시뮬레이터 vs 실기기 매트릭스" 섹션 추가? WebGPU / 메모리 / 네트워크 / 콘솔 항목 포함?
     - 빌드 체인 검증 명령 추가 (npm run build, ls dist/wasm, npx cap sync ios, check-bundle.sh)?
   - **regression** (docs 영역): 기존 섹션 손상 없음? 표 구문 깨짐 없음? heading 계층 일관성?
   - **privacy**: 명령 예시에 시크릿 노출 없음 (DATA_GO_KR_KEY 등). modelUrl 같이 공개 정보만.
   - **on-device LLM 가드**: 권장 워크플로우가 mediapipe 분기 보존 / ollama 무관성 강조?
   - **readability**: 진단 표가 명료? 명령어 syntax 정확 (macOS bash + xcrun)?
   - **test coverage**: docs 만 변경이므로 N/A. 단, 명령 예시 자체가 *manual test plan* 역할 — 실행 가능해야 함.
4. **명령 검증** (직접 실행):
   ```bash
   git worktree add -B task-3-review-tmp ../inseoul-worktrees/task-3-review-tmp task-3-impl
   cd ../inseoul-worktrees/task-3-review-tmp
   # 명령 한 두개 직접 실행 — 진단 명령이 실제 동작 검증
   ls public/wasm/ | grep '^genai_' | wc -l
   bash scripts/check-bundle.sh   # task-1 가 추가한 검증
   grep -oE "/wasm|jsdelivr" ios/App/App/public/assets/mediapipe-*.js 2>/dev/null | sort -u || echo "(ios bundle not yet synced)"
   cd /Users/leokim/Desktop/leo.kim/InSeoul
   git worktree remove ../inseoul-worktrees/task-3-review-tmp --force
   ```
   주의: 위 명령은 worktree 내부에서 실행해야 함 (impl 파일 결과 보장). 결과가 prompt 의 기대값과 일치하지 않더라도 *문서가 명령 syntax 자체는 맞으면* 통과.
5. `.planning/sprint/12/reviews/task-3.md` 작성:
   ```
   ---
   task: 3
   sprint: 12
   status: pass | reject | revising
   rounds: R
   last_updated: <ISO>
   impl_commit: <sha>
   ---
   ```
6. verdict:
   - pass: `cmux display-message -p "[REVIEW_PASS] task-3 round=R"`
   - reject: 핵심 지적 3줄 이내 cmux send → impl ws

## 3. 중단 조건

Round 3 escalation: `cmux display-message -p "[REVIEW_ESCALATE] task-3"` 후 idle.
