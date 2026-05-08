import { expect, test } from '@playwright/test'

const APP_URL = 'http://localhost:5173/'

test.describe('Wizard happy path', () => {
  test('5단계 모두 통과 → result 화면 진입', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.locator('text=DEV TWEAKS').waitFor({ state: 'visible', timeout: 10_000 })

    // 화면 전환: welcome → wizard
    await page.locator('select').selectOption('wizard')

    // step 1~5 = 5번 '다음', 마지막은 '결과 보기'
    for (let i = 0; i < 4; i++) {
      await page.locator('.cta-bar button').click()
      await page.waitForTimeout(150)
    }
    // 마지막 step 의 cta-bar button 텍스트는 '결과 보기'
    await page.locator('.cta-bar button').click()

    await expect(page.locator('body')).toContainText(/결과 요약|남았어요|진입/, {
      timeout: 5_000,
    })
  })

  test('실거래 / 참고 배지: snapshot 있으면 실거래 라벨 노출', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.locator('text=DEV TWEAKS').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('select').selectOption('wizard')

    for (let i = 0; i < 2; i++) {
      await page.locator('.cta-bar button').click()
      await page.waitForTimeout(150)
    }

    const suggestionBtn = page.getByRole('button', { name: /실거래|참고/ })
    await expect(suggestionBtn).toBeVisible({ timeout: 5_000 })
  })

  test('입력 propagate: step3 에서 자치구 변경 → result 헤더에 반영', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.locator('text=DEV TWEAKS').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('select').selectOption('wizard')

    // step1, step2 그대로 통과
    for (let i = 0; i < 2; i++) {
      await page.locator('.cta-bar button').click()
      await page.waitForTimeout(150)
    }

    // step3 진입 — 기본 페르소나 mid 의 goalDistrict='마포구'.
    // '관악구' chip (district 선택용) 을 눌러 변경.
    await page.getByRole('button', { name: '관악구', exact: true }).click()
    await page.waitForTimeout(150)

    // 자동 적용 버튼은 '약 X억 적용' 형식 — 매칭은 그 패턴으로.
    const applyBtn = page.getByRole('button', { name: /관악구.*약.*억 적용/ })
    await expect(applyBtn).toBeVisible({ timeout: 3_000 })

    // 끝까지 진행 — step3→4→5→result 까지 3번 cta 클릭이면 충분
    for (let i = 0; i < 3; i++) {
      await page.locator('.cta-bar button').click()
      await page.waitForTimeout(150)
    }

    // result 헤더 eyebrow: '서울 · 관악구 ...'
    await expect(page.locator('text=/서울 · 관악구/')).toBeVisible({ timeout: 5_000 })
  })

  test('입력 propagate: step1 에서 현금 자산 변경 → step5 가정 화면 통과 후 result 까지 진입', async ({
    page,
  }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.locator('text=DEV TWEAKS').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('select').selectOption('wizard')

    // step1 의 첫 input (cash) 에 임의 숫자 입력해 변경 검증.
    const firstInput = page.locator('.input input').first()
    await firstInput.fill('20000')
    await firstInput.blur()

    // 끝까지 진행 — 입력값이 데이터에 반영되어 throw 없이 result 까지 도달해야 함.
    // step1→2→3→4→5→result = 5번 cta 클릭
    for (let i = 0; i < 5; i++) {
      await page.locator('.cta-bar button').click()
      await page.waitForTimeout(150)
    }
    await expect(page.locator('body')).toContainText(/남았어요|진입|결과 요약/, {
      timeout: 5_000,
    })
  })
})

test.describe('AI 시트 (구조적 selector)', () => {
  test('Result 에서 AI 시트 열기 → 힌트 클릭 → 응답 버블 비어있지 않음', async ({ page }) => {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.locator('text=DEV TWEAKS').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('select').selectOption('result')

    // FAB 클릭 → 시트 마운트
    await page.locator('.ai-fab').click()
    await page.locator('.sheet').waitFor({ state: 'visible', timeout: 3_000 })
    await expect(page.locator('.sheet-handle')).toBeVisible()

    // 힌트 클릭 → input 에 텍스트 채워짐 (구조 검증)
    const hintBtn = page.getByRole('button', { name: 'LTV가 뭐예요?' })
    await hintBtn.click()
    const inputBox = page.locator('input[placeholder*="궁금한"]')
    await expect(inputBox).toHaveValue(/LTV/, { timeout: 2_000 })

    // 시트 내 메시지 갯수 측정 (전송 전: context+greeting=2)
    const beforeCount = await page
      .locator('.sheet div[style*="border-radius"][style*="margin"]')
      .count()
      .catch(() => 0)

    // 전송
    await inputBox.press('Enter')

    // 사용자 메시지 + AI 스트리밍 응답 추가됨 — body 텍스트 길이 증가 확인 (LLM/템플릿 무관)
    await page.waitForFunction(
      (prevText) => {
        const sheet = document.querySelector('.sheet')
        return sheet !== null && (sheet.textContent?.length ?? 0) > prevText
      },
      (await page.locator('.sheet').textContent())?.length ?? 0,
      { timeout: 8_000 },
    )

    // 입력 필드는 전송 후 비워짐
    await expect(inputBox).toHaveValue('', { timeout: 3_000 })

    void beforeCount
  })
})
