# Task-3 impl 워커 (Claude) — AdvisorContext / AiSheet race 정적 재점검

## 정체
당신은 InSeoul Sprint 11 task-3 구현 워커입니다.

## 첫 단계 (필수, 한 번만)
```bash
cd /Users/leokim/Desktop/leo.kim/InSeoul
git worktree add ../inseoul-worktrees/task-3-impl sprint-10-llm-debug -b task-3-impl
cd ../inseoul-worktrees/task-3-impl
git status
```
이후 모든 Edit/Write/Bash 는 `../inseoul-worktrees/task-3-impl` 안에서 수행.

## 작업
**AdvisorContext mount eager init + AiSheet ensureReadyOnceRef 의 race window 를 정적 분석.** Sprint 10 시도 3-4 의 미흡 부분 (mount/unmount cycle 에서 ref guard 우회) 을 코드 읽기로 확정 + 필요 시 패치.

### 배경
- Sprint 10 시도 4 후에도 ref guard 가 strict-mode double-invoke / mount/unmount race 에 견디는지 확정 못 함.
- 핸드오프 (`/Users/leokim/Desktop/leo.kim/InSeoul/.planning/sprint/10/llm-debug-handoff.md`) 의 fix 후보 외, AdvisorContext 의 race window 를 정공으로 닫기.

### 구현 절차
1. **정적 분석**:
   - `src/ai/AdvisorContext.tsx` 의 useEffect deps + ensureReadyRef / ensureReadyOnceRef 패턴 정독.
   - `src/screens/sheets/AiSheet.tsx` 의 ensureReadyOnceRef 패턴 + advisor reference 변경 시 재트리거 가능성 점검.
   - React 18 strict mode double-invoke 시 ref guard 가 동작하는지 (ref 는 mount/unmount 사이에 보존됨).
   - mount → unmount → re-mount 시 ref 가 새로 생성되어 가드가 풀리는지 (이게 진짜 위험).
2. **`/Users/leokim/Desktop/leo.kim/InSeoul/.planning/sprint/11/static-review.md` 신규 작성**:
   - 함수별 race window 표:
     | 함수 | 트리거 | ref 생존 범위 | race 위험 | 결론 |
     | AdvisorProvider mount | useEffect [] | provider 인스턴스 한정 | provider unmount 시 ref 소실 | 변경 불필요 / 변경 필요 |
   - 결론: 코드 패치 필요한 항목 (있으면) 또는 변경 불필요 (정확한 이유)
3. **변경 필요 시만** `src/ai/AdvisorContext.tsx` / `src/screens/sheets/AiSheet.tsx` 패치. 변경 없으면 분석 보고서만 commit.
4. **단위 테스트** (변경 시):
   - React Testing Library 로 mount → unmount → remount 시 ensureReady 호출 횟수 검증.

### 수용 기준
- [ ] `.planning/sprint/11/static-review.md` 신규 — race window 표 + 결론
- [ ] 변경 필요한 경우만 src 수정, 그 외 분석 보고서만
- [ ] `npm run lint` pass
- [ ] `npm test` pass
- [ ] commit (브랜치: `task-3-impl`), 메시지 `analysis(sprint-11/task-3): static review of AdvisorContext / AiSheet ensureReady race window` 또는 `fix(sprint-11/task-3): close ensureReady race window in <component>`

### 완료 시그널
```
[IMPL_DONE] task-3 commit=<short_sha> ready_for_review
```
+ `cmux display-message -p "[IMPL_DONE] task-3"` 시도.

## 중요
- task-1 (mediapipe.ts) / task-2 (llm.worker.ts, useLLM.ts) 영역 침범 금지.
- 정적 분석 우선 — 변경 없이 결론 "변경 불필요" 도 합법적 결과 (단, 근거 명료).
- review 파일은 read-only.
