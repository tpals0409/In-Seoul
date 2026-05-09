# ADR-S5-001: Review diff base — moving main 금지, branch fork point 고정

**상태**: 채택 (Sprint 5)
**날짜**: 2026-05-09
**대체**: 없음
**관련**: ADR-S2-001 (lint baseline + 워커 분담), Sprint 4 운영 인사이트 (`feedback_codex_review_autonomy.md`)

## 컨텍스트

Sprint 5 task-4 (lint refs/impure/unused-disable 정리) 검증에서 Codex review 가 **false reject** 를 발생시켰다. impl 워커는 정확히 scope (`ScenarioEdit.tsx`, `GoldenSpark.tsx`, `useAdvisor.ts`) 만 수정했음에도, review 가 "task-2 영역인 `Icons.tsx`/`IconsImpl.tsx` 변경이 포함됐다" 며 reject 를 결정.

근본 원인:
- review 프롬프트가 `git diff main..s5-task-4-impl --name-only` 로 변경 범위를 검증하라고 지시
- 그러나 task-4 가 review 받기 전에 task-2 가 이미 main 에 머지됨 (병렬 디스패치)
- 결과: `main..s5-task-4-impl` 양방향 diff 에 main 에만 있는 `IconsImpl.tsx` (task-2 신규) 와 main 의 변경된 `Icons.tsx` (task-2 분리) 가 "task-4 가 안 가지고 있는" 차이로 잡힘
- Codex 는 이를 "task-4 가 task-2 파일을 변경/삭제했다" 고 오판

병렬 워커가 main 에 순차 머지되는 패턴에서 main HEAD 는 **moving target** 이다. main 기준 diff 는 첫 머지 직후부터 모든 후속 task 검증을 오염시킨다.

## 옵션 비교

| 옵션 | 비교 base | 장점 | 단점 |
|---|---|---|---|
| A. main..task | 직관적, 명령 단순 | "지금 main 과 다른 모든 것" 한눈에 확인 | **moving target → false reject 유발** (S5 task-4 사례) |
| B. fork-point..task | 분기 시점 고정, 다른 task 머지 영향 0 | 정확한 task 변경 범위만 평가 | impl 워커가 fork point sha 기록 필요 |
| C. merge-base 자동 계산 | git 이 알아서 도출 | 명령 한 줄 (`git merge-base main task`) | 중간 머지 후 merge-base 가 이동할 수 있음 (rebase 시) — fragile |
| D. fork point + post-merge integration test | B + 머지 후 별도 통합 검증 | 정확성 + 누적 회귀 검증 분리 | 검증 단계 1개 증가 |

## 결정

**옵션 D 채택** — review 단계는 fork point 고정 base, 통합 회귀는 머지 직후 오케스트레이터가 별도 실행.

### 1. 워커 디스패치 메타에 fork_point 명시

`.planning/sprint/{N}/dispatch.json` 의 각 task 객체에 `fork_point` 필드 추가:
```json
{
  "n": 4,
  "branch": "s5-task-4-impl",
  "fork_point": "299b962",
  ...
}
```

### 2. impl 프롬프트에 fork point sha 박제

```
워크트리 분기 base = <SHA>. 본 task 의 변경은 이 base 기준으로만 평가된다.
```

### 3. review 프롬프트의 diff 명령 변경

기존 (오류):
```bash
git diff main..s5-task-4-impl --name-only
```

수정 후:
```bash
git diff <FORK_POINT>..s5-task-4-impl --name-only
```

`<FORK_POINT>` 는 dispatch.json 또는 프롬프트에 박제된 sha. 변수 치환은 프롬프트 작성 시점.

### 4. lint baseline 비교도 fork point 기준

기존: "main lint baseline 과 동일/감소" → main 이 이동하면 의미 변질.
수정: "fork point lint baseline (예: 15e/2w) 에서 task scope reduce 만 차감" 비교.

### 5. 머지 후 통합 회귀 (오케스트레이터 책임)

각 task 머지 직후 오케스트레이터가:
- `npm install` (의존성 변동 흡수)
- `npm run lint && npm test && npx playwright test --project=chromium && npm run build`

이 실행. baseline reduce 가 누적되는지 (S5 의 경우: 15e/2w → 7e/2w → 3e/1w → 0e/0w) 확인. fail 시 직전 task 머지 revert + 사후 분석.

## 결과

Sprint 5 에서 옵션 D 의 일부 (수동 정정) 로 실증:
- task-4 R1 false reject → 오케스트레이터가 정정 메시지 송신 (`git diff 299b962..s5-task-4-impl`) → R2 PASS
- 머지 후 누적 lint 검증 (오케스트레이터 직접 npm run lint) 으로 통합 회귀 0 확인

다음 스프린트부터 옵션 D 의 1~5 모두 review prompt 템플릿에 박제. 본 ADR 가 SSOT.

## 영향

- review prompt 작성 비용: +1 줄 (fork_point 변수)
- false reject: 0 으로 회귀 (검증 정확성 ↑)
- impl 워커 책임: 변경 0 (분기 base sha 는 워크트리 생성 시점에 git 이 안다)
- review 워커 책임: 명령 1 변수 치환만

## 관련 메모리 (다음 스프린트 시작 전 반드시 적용)

`feedback_codex_review_autonomy.md` 에 본 결정 cross-reference 1줄 추가 권장. dispatch.json `fork_point` 필드는 향후 `/start` 워크플로우 7-E 단계 매니페스트 템플릿에 포함.
