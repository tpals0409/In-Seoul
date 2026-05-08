// 서울 25개 자치구 → 법정동 코드 5자리 매핑.
// 국토교통부 공공데이터 API 의 LAWD_CD 파라미터에 사용된다.
// 출처: 행정표준코드관리시스템 (법정동코드, 자치구 단위 prefix).

export const SEOUL_LAWD_CODES: Readonly<Record<string, string>> = Object.freeze({
  종로구: '11110',
  중구: '11140',
  용산구: '11170',
  성동구: '11200',
  광진구: '11215',
  동대문구: '11230',
  중랑구: '11260',
  성북구: '11290',
  강북구: '11305',
  도봉구: '11320',
  노원구: '11350',
  은평구: '11380',
  서대문구: '11410',
  마포구: '11440',
  양천구: '11470',
  강서구: '11500',
  구로구: '11530',
  금천구: '11545',
  영등포구: '11560',
  동작구: '11590',
  관악구: '11620',
  서초구: '11650',
  강남구: '11680',
  송파구: '11710',
  강동구: '11740',
})

export function lawdCodeFor(district: string): string | null {
  return SEOUL_LAWD_CODES[district] ?? null
}

export function districtForLawdCode(code: string): string | null {
  for (const [name, c] of Object.entries(SEOUL_LAWD_CODES)) {
    if (c === code) return name
  }
  return null
}
