// scripts/smoke-molit.ts — 키 유효성 1콜 검증 (강남구 직전월 매매 1건만 호출).
// 사용: DATA_GO_KR_KEY="..." npx tsx scripts/smoke-molit.ts

const SERVICE_KEY = process.env['DATA_GO_KR_KEY'] ?? ''
if (SERVICE_KEY === '') {
  console.error('[smoke] DATA_GO_KR_KEY 가 필요합니다.')
  process.exit(1)
}

const TRADE_BASE =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade'

const now = new Date()
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
const ymd = `${String(prev.getFullYear())}${String(prev.getMonth() + 1).padStart(2, '0')}`

const url = `${TRADE_BASE}?serviceKey=${SERVICE_KEY}&LAWD_CD=11680&DEAL_YMD=${ymd}&numOfRows=5&pageNo=1`

console.log(`[smoke] GET ${TRADE_BASE.split('/').slice(-1)[0] ?? ''}?LAWD_CD=11680&DEAL_YMD=${ymd}&numOfRows=5`)

const res = await fetch(url)
console.log(`[smoke] HTTP ${String(res.status)}`)
const xml = await res.text()
const head = xml.slice(0, 600).replace(/\n+/g, ' ')
console.log(`[smoke] body head: ${head}`)

// resultCode 추출 (간이 regex)
const codeMatch = xml.match(/<resultCode>(\d+)<\/resultCode>/)
const msgMatch = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)
const itemCount = (xml.match(/<item>/g) ?? []).length

console.log(`[smoke] resultCode: ${codeMatch?.[1] ?? '(none)'}`)
console.log(`[smoke] resultMsg : ${msgMatch?.[1] ?? '(none)'}`)
console.log(`[smoke] items     : ${String(itemCount)}`)

if (codeMatch?.[1] === '000' && itemCount > 0) {
  console.log('[smoke] ✅ 키 정상, 응답 정상.')
  process.exit(0)
} else {
  console.log('[smoke] ⚠️ 응답에 문제 있음 — 위 body head 로 원인 확인.')
  process.exit(2)
}
