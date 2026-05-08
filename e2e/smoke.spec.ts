import { expect, test } from '@playwright/test'

const APP_URL = 'http://localhost:5173/'

test.describe('InSeoul smoke', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('initial page loads with welcome screen', async ({ page }) => {
    await page.goto(APP_URL)
    // welcome screen has the iOS device frame visible on desktop
    await expect(page).toHaveTitle(/InSeoul/)
    // 어떤 한국어 텍스트라도 존재하는지 확인 (welcome 콘텐츠)
    const body = page.locator('body')
    await expect(body).toContainText(/InSeoul|시뮬|시작|서울/)
  })

  test('dev tweaks panel can switch screens', async ({ page }) => {
    await page.goto(APP_URL)
    // dev panel shows in DEV mode (npm run dev)
    const panel = page.locator('text=DEV TWEAKS')
    await expect(panel).toBeVisible()

    // result 화면으로 전환 — 시뮬 결과가 렌더되는지
    await page.locator('select').selectOption('result')
    // 결과 화면 어딘가에 "월" 또는 "년" 또는 "DSR" 같은 키워드가 있어야 함
    await expect(page.locator('body')).toContainText(/년|개월|DSR|결과/)
  })

  test('persona switch updates result data', async ({ page }) => {
    await page.goto(APP_URL)
    await page.locator('select').selectOption('result')

    // dev panel persona buttons (early/mid/senior)
    const earlyBtn = page.locator('button', { hasText: /^early$/ })
    const seniorBtn = page.locator('button', { hasText: /^senior$/ })

    await expect(earlyBtn).toBeVisible()
    await earlyBtn.click()
    const earlyText = await page.locator('.app-scroll').textContent()

    await seniorBtn.click()
    const seniorText = await page.locator('.app-scroll').textContent()

    // 페르소나가 바뀌면 결과 텍스트도 달라야 한다 (월 수치, 가격 등)
    expect(earlyText).not.toEqual(seniorText)
  })

  test('scenario switch updates result data', async ({ page }) => {
    await page.goto(APP_URL)
    await page.locator('select').selectOption('result')

    const safeBtn = page.locator('button', { hasText: /^safe$/ })
    const boldBtn = page.locator('button', { hasText: /^bold$/ })

    await safeBtn.click()
    const safeText = await page.locator('.app-scroll').textContent()

    await boldBtn.click()
    const boldText = await page.locator('.app-scroll').textContent()

    expect(safeText).not.toEqual(boldText)
  })

  test('PRIVACY: page makes no third-party network calls on load', async ({ page }) => {
    const externalRequests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      // 허용: 같은 origin (localhost:5173), data: URLs, blob: URLs, ws/wss (Vite HMR)
      if (
        url.startsWith('http://localhost:5173/') ||
        url.startsWith('ws://localhost:5173/') ||
        url.startsWith('wss://localhost:5173/') ||
        url.startsWith('data:') ||
        url.startsWith('blob:')
      ) {
        return
      }
      externalRequests.push(url)
    })

    // domcontentloaded: HMR WS keep-alive 가 networkidle 을 막으므로 명시적 wait.
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.locator('text=DEV TWEAKS').waitFor({ state: 'visible', timeout: 10_000 })

    // wizard / result 까지 가도 외부 호출 없어야 함 (AI 시트 안 열기 → 모델/RAG 미발동)
    await page.locator('select').selectOption('wizard')
    await page.waitForTimeout(500)
    await page.locator('select').selectOption('result')
    await page.waitForTimeout(800)

    expect(externalRequests).toEqual([])
  })
})
