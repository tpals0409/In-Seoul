// 서울시 25개 자치구 — 25평 평균 가격 (만원). 참고용 추정치.
// 프로토타입(InSeoul_UI/data.js)과 동일한 값.

export const SEOUL_DISTRICTS = [
  '강남구', '서초구', '용산구', '송파구',
  '성동구', '마포구', '광진구', '강동구',
  '양천구', '영등포구', '동작구', '종로구',
  '중구', '서대문구', '동대문구', '성북구',
  '강서구', '관악구', '구로구', '은평구',
  '노원구', '중랑구', '도봉구', '강북구',
  '금천구',
] as const satisfies readonly string[]

export const DISTRICT_PRICE_25_TUPLE = SEOUL_DISTRICTS

export const DISTRICT_PRICE_25: Record<string, number> = {
  '강남구': 220000, '서초구': 200000, '용산구': 180000, '송파구': 170000,
  '성동구': 140000, '마포구': 135000, '광진구': 130000, '강동구': 125000,
  '양천구': 120000, '영등포구': 115000, '동작구': 115000, '종로구': 130000,
  '중구': 120000, '서대문구': 105000, '동대문구': 100000, '성북구': 100000,
  '강서구': 95000, '관악구': 90000, '구로구': 85000, '은평구': 90000,
  '노원구': 80000, '중랑구': 78000, '도봉구': 75000, '강북구': 75000,
  '금천구': 78000,
}

/**
 * 자치구·평수로 추정 가격(만원) 반환.
 * 미등록 자치구는 100,000만원(10억) 기준으로 폴백.
 * 1,000만원 단위로 반올림.
 */
export function suggestPrice(district: string, area: number): number {
  const base = DISTRICT_PRICE_25[district] ?? 100000
  return Math.round(base * (area / 25) / 1000) * 1000
}

/**
 * 실거래 스냅샷이 있으면 그 중앙값을 25평 기준으로 환산해 평수 비례 적용.
 * 없으면 (또는 해당 자치구가 스냅샷에 없으면) suggestPrice 와 동일 결과.
 */
export function suggestPriceWithSnapshot(
  district: string,
  area: number,
  snapshotPrice: number | null,
): number {
  const base = snapshotPrice ?? DISTRICT_PRICE_25[district] ?? 100000
  return Math.round(base * (area / 25) / 1000) * 1000
}
