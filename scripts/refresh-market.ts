// scripts/refresh-market.ts — 25개 자치구 시장 시세 정적 스냅샷 갱신.
//
// 호출량: 25 구 × 3개월(매매) + 25 구 × 3개월(전월세) = 150 호출.
// data.go.kr 개발계정 한도 10,000/일 의 1.5%. 일 1~2회 실행이면 안전.
//
// 사용법:
//   DATA_GO_KR_KEY="발급받은_URL_Encoded_키" npm run refresh:market
//
// 출력:
//   public/data/seoul-prices.json
//
// 산출 파일은 .gitignore 에서 제외(빌드 산출물처럼 취급). 런타임에서는 fetch('/data/seoul-prices.json')
// 같은 same-origin 정적 호출만 사용해 외부 API 호출을 피한다.

import { JSDOM } from 'jsdom'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEOUL_LAWD_CODES } from '../src/data/lawd.js'
import { DISTRICT_PRICE_25 } from '../src/data/districts.js'

const SERVICE_KEY = process.env['DATA_GO_KR_KEY'] ?? ''
if (SERVICE_KEY === '') {
  console.error('[refresh-market] DATA_GO_KR_KEY 환경변수가 필요합니다.')
  process.exit(1)
}

const TRADE_BASE = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade'
const RENT_BASE = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'
const REQUEST_DELAY_MS = 250

interface AreaPriced {
  area: number
  amount: number
}

const dom = new JSDOM('', { contentType: 'text/html' })
const DOMParser = dom.window.DOMParser

function parseItems(xml: string, fields: { amountTag: string; alt?: string }): AreaPriced[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml.trimStart(), 'application/xml')
  const errs = doc.getElementsByTagName('parsererror')
  if (errs[0]) throw new Error(`parse error: ${errs[0].textContent ?? ''}`)
  const code = doc.getElementsByTagName('resultCode')[0]?.textContent?.trim()
  if (code && code !== '000') {
    const msg = doc.getElementsByTagName('resultMsg')[0]?.textContent?.trim() ?? ''
    throw new Error(`API ${code}: ${msg}`)
  }
  const items = doc.getElementsByTagName('item')
  const out: AreaPriced[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it) continue
    const area = Number.parseFloat(it.getElementsByTagName('excluUseAr')[0]?.textContent?.trim() ?? '0')
    const amtRaw = it.getElementsByTagName(fields.amountTag)[0]?.textContent?.trim() ?? '0'
    let amount = Number(amtRaw.replace(/,/g, ''))
    if (!Number.isFinite(amount)) amount = 0
    if (fields.alt) {
      const monthly = Number(
        (it.getElementsByTagName(fields.alt)[0]?.textContent?.trim() ?? '0').replace(/,/g, ''),
      )
      // 전월세: 전세만 (월세=0)
      if (monthly !== 0) continue
    }
    if (Number.isFinite(area) && area > 0 && amount > 0) {
      out.push({ area, amount })
    }
  }
  return out
}

function median(items: AreaPriced[], minArea = 60, maxArea = 85): number {
  const xs = items
    .filter((t) => t.area >= minArea && t.area <= maxArea)
    .map((t) => t.amount)
    .sort((a, b) => a - b)
  if (xs.length === 0) return 0
  const mid = Math.floor(xs.length / 2)
  if (xs.length % 2 === 0) {
    const a = xs[mid - 1]
    const b = xs[mid]
    if (a === undefined || b === undefined) return 0
    return Math.round((a + b) / 2)
  }
  return xs[mid] ?? 0
}

function ymd(d: Date): string {
  return `${String(d.getFullYear())}${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function fetchXml(base: string, lawdCd: string, ymdStr: string): Promise<string> {
  const url = `${base}?serviceKey=${SERVICE_KEY}&LAWD_CD=${lawdCd}&DEAL_YMD=${ymdStr}&numOfRows=200&pageNo=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
  return await res.text()
}

async function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

interface Snapshot {
  district: string
  lawdCd: string
  price: number
  jeonsePrice: number
  asOf: string
}

async function main(): Promise<void> {
  const now = new Date()
  const months = [0, 1, 2].map((i) => ymd(new Date(now.getFullYear(), now.getMonth() - i, 1)))

  const snapshots: Snapshot[] = []
  const districts = Object.keys(SEOUL_LAWD_CODES)

  for (let idx = 0; idx < districts.length; idx++) {
    const district = districts[idx]
    if (!district) continue
    const lawdCd = SEOUL_LAWD_CODES[district]
    if (!lawdCd) continue
    if (idx > 0) await delay(REQUEST_DELAY_MS)

    const trades: AreaPriced[] = []
    const jeonses: AreaPriced[] = []

    for (const m of months) {
      try {
        const xml = await fetchXml(TRADE_BASE, lawdCd, m)
        trades.push(...parseItems(xml, { amountTag: 'dealAmount' }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`  ${district} 매매 ${m} 실패: ${msg}`)
      }
      await delay(REQUEST_DELAY_MS)
      try {
        const xml = await fetchXml(RENT_BASE, lawdCd, m)
        jeonses.push(...parseItems(xml, { amountTag: 'deposit', alt: 'monthlyRent' }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.warn(`  ${district} 전월세 ${m} 실패: ${msg}`)
      }
    }

    const price = median(trades)
    const jeonse = median(jeonses)
    const fallback = DISTRICT_PRICE_25[district] ?? 100_000
    const snap: Snapshot = {
      district,
      lawdCd,
      price: price > 0 ? price : fallback,
      jeonsePrice: jeonse > 0 ? jeonse : Math.round(fallback * 0.6),
      asOf: now.toISOString(),
    }
    snapshots.push(snap)
    console.log(
      `  ${district}: 매매 ${String(snap.price)}만 / 전세 ${String(snap.jeonsePrice)}만`,
    )
  }

  const here = dirname(fileURLToPath(import.meta.url))
  const outPath = resolve(here, '..', 'public', 'data', 'seoul-prices.json')
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(
    outPath,
    JSON.stringify(
      {
        version: 1,
        builtAt: now.toISOString(),
        source: 'data.go.kr/15126474 (국토부 아파트 실거래가)',
        snapshots,
      },
      null,
      2,
    ),
  )
  console.log(`\n[refresh-market] ${String(snapshots.length)}개 구 → ${outPath}`)
}

await main()
