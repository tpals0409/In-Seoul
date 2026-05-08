// 국토교통부 아파트 실거래가 / 전월세 API 서비스 레이어.
//
// ⚠️ 보안 — 이 모듈은 *번들에 API 키를 노출하지 않는다*.
//   Vite 의 `VITE_` prefix 환경변수는 클라이언트 빌드 산출물에 inline 되므로
//   민감한 키는 절대 VITE_ prefix 로 두면 안 된다. 따라서 `SERVICE_KEY` 초기값은
//   빈 문자열 — runtime fetch 함수들은 호출 시 throw 하고, 실제 fetching 은 build-time
//   Node 스크립트(scripts/refresh-market.ts, env: DATA_GO_KR_KEY)에서만 수행한다.
//   런타임 화면은 정적 스냅샷(public/data/seoul-prices.json) 만 본다(marketSnapshot.ts).
//
// 검증된 엔드포인트(공개 정보, URL 자체에는 비밀 없음):
//   매매:  https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade
//   전월세: https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent
//
// 호출 규약:
//   - serviceKey 는 URL-Encoded 형태 그대로 (재인코딩 금지)
//   - DEAL_YMD: YYYYMM (6자리)
//   - LAWD_CD: 법정동코드 앞 5자리 (예: 강남구 11680)
//
// 응답: XML 단일 포맷.
// 캐시: localStorage TTL 24h (인메모리 상수).

const TRADE_API_BASE =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade'

const RENT_API_BASE =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'

/** 런타임에서는 항상 빈 문자열 — fetch 시 throw. 실제 호출은 Node 스크립트 전용. */
const SERVICE_KEY = ''

const CACHE_TTL_MS = 86_400_000
const REQUEST_DELAY_MS = 200

const STORAGE_PREFIX = 'inseoul-market_'

// ─── 타입 ─────────────────────────────────────────────────────────────────

export interface AptTrade {
  aptName: string
  dong: string
  floor: number
  area: number
  buildYear: number
  dealYear: number
  dealMonth: number
  dealDay: number
  /** 거래금액 (만원). XML 의 콤마 제거 후 정수. */
  dealAmount: number
  sggCd: string
}

export interface AptRent {
  aptName: string
  dong: string
  floor: number
  area: number
  buildYear: number
  dealYear: number
  dealMonth: number
  dealDay: number
  /** 보증금 (만원). 전세는 monthlyRent=0, deposit>0. */
  deposit: number
  /** 월세 (만원). 0이면 전세. */
  monthlyRent: number
  sggCd: string
}

// ─── XML 파서 ────────────────────────────────────────────────────────────

function readText(item: Element, tag: string): string {
  // XML 환경에서 querySelector 가 불안정한 경우가 있어 getElementsByTagName 사용.
  return item.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ''
}

function readInt(item: Element, tag: string): number {
  const v = readText(item, tag)
  if (v === '') return 0
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function readFloat(item: Element, tag: string): number {
  const v = readText(item, tag)
  if (v === '') return 0
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function checkParseError(doc: Document): void {
  const err = doc.getElementsByTagName('parsererror')[0]
  if (err) {
    throw new Error(`MOLIT XML 파싱 실패: ${err.textContent?.trim() ?? ''}`)
  }
}

function ensureSuccess(doc: Document): void {
  checkParseError(doc)
  const code = doc.getElementsByTagName('resultCode')[0]?.textContent?.trim()
  if (code !== undefined && code !== '' && code !== '000') {
    const msg =
      doc.getElementsByTagName('resultMsg')[0]?.textContent?.trim() ?? '알 수 없는 오류'
    throw new Error(`MOLIT API 오류 [${code}]: ${msg}`)
  }
}

export function parseAptTradeXml(xmlText: string): AptTrade[] {
  const parser = new DOMParser()
  // XML 선언(<?xml ?>) 앞에 공백/BOM 이 있으면 strict parser 가 실패하므로 trimStart.
  const doc = parser.parseFromString(xmlText.trimStart(), 'application/xml')
  ensureSuccess(doc)

  const items = doc.getElementsByTagName('item')
  const out: AptTrade[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    out.push({
      aptName: readText(item, 'aptNm'),
      dong: readText(item, 'umdNm'),
      floor: readInt(item, 'floor'),
      area: readFloat(item, 'excluUseAr'),
      buildYear: readInt(item, 'buildYear'),
      dealYear: readInt(item, 'dealYear'),
      dealMonth: readInt(item, 'dealMonth'),
      dealDay: readInt(item, 'dealDay'),
      dealAmount: readInt(item, 'dealAmount'),
      sggCd: readText(item, 'sggCd'),
    })
  }
  return out
}

export function parseAptRentXml(xmlText: string): AptRent[] {
  const parser = new DOMParser()
  // XML 선언(<?xml ?>) 앞에 공백/BOM 이 있으면 strict parser 가 실패하므로 trimStart.
  const doc = parser.parseFromString(xmlText.trimStart(), 'application/xml')
  ensureSuccess(doc)

  const items = doc.getElementsByTagName('item')
  const out: AptRent[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item) continue
    out.push({
      aptName: readText(item, 'aptNm'),
      dong: readText(item, 'umdNm'),
      floor: readInt(item, 'floor'),
      area: readFloat(item, 'excluUseAr'),
      buildYear: readInt(item, 'buildYear'),
      dealYear: readInt(item, 'dealYear'),
      dealMonth: readInt(item, 'dealMonth'),
      dealDay: readInt(item, 'dealDay'),
      deposit: readInt(item, 'deposit'),
      monthlyRent: readInt(item, 'monthlyRent'),
      sggCd: readText(item, 'sggCd'),
    })
  }
  return out
}

// ─── 캐시 ─────────────────────────────────────────────────────────────────

interface CacheEnvelope<T> {
  ts: number
  data: T
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'ts' in parsed &&
      'data' in parsed &&
      typeof (parsed as { ts: unknown }).ts === 'number'
    ) {
      const env = parsed as CacheEnvelope<T>
      if (Date.now() - env.ts > CACHE_TTL_MS) {
        localStorage.removeItem(STORAGE_PREFIX + key)
        return null
      }
      return env.data
    }
    return null
  } catch {
    return null
  }
}

function cacheSet<T>(key: string, data: T): void {
  try {
    const env: CacheEnvelope<T> = { ts: Date.now(), data }
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(env))
  } catch {
    /* localStorage 용량 초과 무시 */
  }
}

// ─── HTTP ────────────────────────────────────────────────────────────────

function buildUrl(
  base: string,
  params: { lawdCd: string; dealYmd: string; numOfRows: number; pageNo: number },
): string {
  // serviceKey 는 URL-Encoded 그대로 — 다른 파라미터만 안전 인코딩.
  const qs = [
    `serviceKey=${SERVICE_KEY}`,
    `LAWD_CD=${encodeURIComponent(params.lawdCd)}`,
    `DEAL_YMD=${encodeURIComponent(params.dealYmd)}`,
    `numOfRows=${String(params.numOfRows)}`,
    `pageNo=${String(params.pageNo)}`,
  ].join('&')
  return `${base}?${qs}`
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}: ${url}`)
  return await res.text()
}

// ─── 공개 API ─────────────────────────────────────────────────────────────

export async function fetchAptTrade(
  lawdCd: string,
  dealYmd: string,
  numOfRows = 100,
): Promise<AptTrade[]> {
  if (SERVICE_KEY === '') {
    throw new Error('VITE_MOLIT_API_KEY 가 설정되지 않았습니다.')
  }
  const cacheKey = `trade_${lawdCd}_${dealYmd}_${String(numOfRows)}`
  const cached = cacheGet<AptTrade[]>(cacheKey)
  if (cached) return cached

  const url = buildUrl(TRADE_API_BASE, { lawdCd, dealYmd, numOfRows, pageNo: 1 })
  const xml = await fetchXml(url)
  const data = parseAptTradeXml(xml)
  cacheSet(cacheKey, data)
  return data
}

export async function fetchAptRent(
  lawdCd: string,
  dealYmd: string,
  numOfRows = 100,
): Promise<AptRent[]> {
  if (SERVICE_KEY === '') {
    throw new Error('VITE_MOLIT_API_KEY 가 설정되지 않았습니다.')
  }
  const cacheKey = `rent_${lawdCd}_${dealYmd}_${String(numOfRows)}`
  const cached = cacheGet<AptRent[]>(cacheKey)
  if (cached) return cached

  const url = buildUrl(RENT_API_BASE, { lawdCd, dealYmd, numOfRows, pageNo: 1 })
  const xml = await fetchXml(url)
  const data = parseAptRentXml(xml)
  cacheSet(cacheKey, data)
  return data
}

// ─── 통계 ─────────────────────────────────────────────────────────────────

interface AreaPriced {
  area: number
  dealAmount: number
}

/** 면적 필터(기본 60~85㎡ ≈ 25~32평) 후 거래금액 중앙값(만원). 거래 없으면 0. */
export function calcMedianPrice<T extends AreaPriced>(
  items: T[],
  minArea = 60,
  maxArea = 85,
): number {
  const filtered = items
    .filter((t) => t.area >= minArea && t.area <= maxArea && t.dealAmount > 0)
    .map((t) => t.dealAmount)
    .sort((a, b) => a - b)
  if (filtered.length === 0) return 0
  const mid = Math.floor(filtered.length / 2)
  if (filtered.length % 2 === 0) {
    const a = filtered[mid - 1]
    const b = filtered[mid]
    if (a === undefined || b === undefined) return 0
    return Math.round((a + b) / 2)
  }
  return filtered[mid] ?? 0
}

function ymdString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${String(y)}${m}`
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

export async function fetchDistrictMedianPrice(
  lawdCd: string,
  months = 3,
): Promise<number> {
  const now = new Date()
  const all: AptTrade[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ymd = ymdString(d)
    try {
      const trades = await fetchAptTrade(lawdCd, ymd, 100)
      all.push(...trades)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[molit] ${lawdCd} ${ymd} 매매 조회 실패: ${msg}`)
    }
    if (i < months - 1) await delay(REQUEST_DELAY_MS)
  }
  return calcMedianPrice(all)
}

export async function fetchDistrictMedianJeonse(
  lawdCd: string,
  months = 3,
): Promise<number> {
  const now = new Date()
  const jeonseRecords: AreaPriced[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ymd = ymdString(d)
    try {
      const rents = await fetchAptRent(lawdCd, ymd, 100)
      for (const r of rents) {
        // 전세만: 월세 0, 보증금 > 0
        if (r.monthlyRent === 0 && r.deposit > 0) {
          jeonseRecords.push({ area: r.area, dealAmount: r.deposit })
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[molit] ${lawdCd} ${ymd} 전월세 조회 실패: ${msg}`)
    }
    if (i < months - 1) await delay(REQUEST_DELAY_MS)
  }
  return calcMedianPrice(jeonseRecords)
}

// ─── 25개 구 일괄 갱신 ────────────────────────────────────────────────────

export interface DistrictPriceSnapshot {
  district: string
  lawdCd: string
  /** 매매 중앙값 (만원). 거래 없으면 fallback 으로 prevPrice 유지. */
  price: number
  /** 전세 중앙값 (만원). 거래 없으면 매매 × 0.6 fallback. */
  jeonsePrice: number
}

/**
 * 25개 구 시세를 순차 호출 — rate limit 대응 위해 병렬 X.
 *
 * ⚠️ 호출량 경고:
 *   1회 호출 = 25 구 × 3개월(매매) + 25 구 × 3개월(전월세) = 150 호출.
 *   data.go.kr 개발계정 한도는 10,000 호출/일. 사용자 트리거 1회 = 한도의 1.5%.
 *   따라서 다음을 지킬 것:
 *   - UI 에서 사용자가 직접 트리거할 수 없게 한다 (예: 관리자 도구 / build script 만).
 *   - 자동 재시도/폴링 금지. 실패 시 fallback 사용.
 *   - 한 번 갱신한 결과는 정적 JSON 으로 저장해 다음 호출에서 재활용 (scripts/refresh-market.ts 참고).
 *   - 개별 자치구 조회는 fetchDistrictMedianPrice/Jeonse 를 직접 호출 (몇 콜만 발생).
 */
export async function fetchAllDistrictPrices(
  districts: ReadonlyArray<{ district: string; lawdCd: string; fallbackPrice: number }>,
): Promise<DistrictPriceSnapshot[]> {
  const out: DistrictPriceSnapshot[] = []
  for (let idx = 0; idx < districts.length; idx++) {
    const d = districts[idx]
    if (d === undefined) continue
    if (idx > 0) await delay(REQUEST_DELAY_MS)
    try {
      const [price, jeonse] = await Promise.all([
        fetchDistrictMedianPrice(d.lawdCd, 3),
        fetchDistrictMedianJeonse(d.lawdCd, 3),
      ])
      out.push({
        district: d.district,
        lawdCd: d.lawdCd,
        price: price > 0 ? price : d.fallbackPrice,
        jeonsePrice: jeonse > 0 ? jeonse : Math.round(d.fallbackPrice * 0.6),
      })
    } catch {
      out.push({
        district: d.district,
        lawdCd: d.lawdCd,
        price: d.fallbackPrice,
        jeonsePrice: Math.round(d.fallbackPrice * 0.6),
      })
    }
  }
  return out
}
