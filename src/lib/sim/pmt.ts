/**
 * 원리금 균등상환 월 납입액 계산.
 * @param r 월 이자율 (예: 연 4.2% → 0.042/12)
 * @param n 총 개월수
 * @param pv 대출 원금 (만원 등 단위 무관 — 입력 단위 그대로 출력)
 */
export function pmt(r: number, n: number, pv: number): number {
  if (n <= 0) return 0
  if (r === 0) return pv / n
  return (pv * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1)
}
