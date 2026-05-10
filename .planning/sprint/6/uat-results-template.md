---
host: <측정 머신 호스트명 또는 사용자>
run_at: <YYYY-MM-DD HH:MM TZ>
sprint: 6
---

# Sprint 6 — 실기기 UAT 결과

> Sprint 4 §기록양식을 그대로 반영한 빈 양식. iOS / Android 각 섹션을 채운 뒤
> `npm run uat:collate < .planning/sprint/6/uat-results.md` 로 표 생성.
>
> - 누락 필드는 비워두면 collate 출력에서 `—` 로 표기됩니다.
> - `key: value` 라인 정확히 유지 (스크립트 정규식 대상).

---

## iOS

```
host:           iPhone <model> / iOS <version>
xcode_version:  26.4.1
build_time:     <분>:<초>
install_size:   <MB>
model_download: <MB> in <초>
peak_rss_mb:    <숫자>
peak_dirty_mb:  <숫자>
rag_response_quality: pass|partial|fail (1줄 메모)
issues:         <발견된 문제, 또는 없음>
```

---

## Android

```
host:           <model> / Android <version>
android_sdk:    36
gradle_version: <확인>
build_time:     <분>:<초>
install_size:   <MB>
model_download: <MB> in <초>
peak_pss_mb:    <숫자>
native_heap_mb: <숫자>
egl_mtrack_mb:  <숫자>
rag_response_quality: pass|partial|fail (1줄 메모)
issues:         <발견된 문제, 또는 없음>
```
