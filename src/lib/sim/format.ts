/** 개월수 → "1년 2개월" / "1년" / "8개월" */
export function fmtYearMonth(months: number): string {
  const y = Math.floor(months / 12)
  const mo = months % 12
  if (y === 0) return `${mo}개월`
  if (mo === 0) return `${y}년`
  return `${y}년 ${mo}개월`
}

/** 만원 단위 → "1억 8,000만" / "9,500만" / "—"(NaN/Infinity). */
export function fmtKRW(man: number): string {
  if (!Number.isFinite(man)) return '—'
  const eok = Math.floor(man / 10000)
  const rem = Math.round(man - eok * 10000)
  if (eok > 0 && rem > 0) return `${eok}억 ${rem.toLocaleString()}만`
  if (eok > 0) return `${eok}억`
  return `${Math.round(man).toLocaleString()}만`
}

/** fmtKRW + " 원" 접미사 */
export function fmtKRWLong(man: number): string {
  return fmtKRW(man) + ' 원'
}

/** Date → "2030년 5월쯤" */
export function fmtDateK(d: Date): string {
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월쯤`
}
