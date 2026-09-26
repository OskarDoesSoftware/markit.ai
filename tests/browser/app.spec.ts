import { expect, test } from '@playwright/test'

import { analysis, mockApp, product, waitForAccount } from './fixtures'

const sizes = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 900, height: 700 },
  { width: 1440, height: 900 },
]

for (const theme of ['light', 'dark'] as const) {
  for (const size of sizes) {
    test(`${theme} assistant and results at ${size.width}×${size.height}`, async ({
      page,
    }, info) => {
      await page.setViewportSize(size)
      const app = await mockApp(page, theme)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await page.goto('/')
      await waitForAccount(page)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Less browsing.')
      const orb = page.getByRole('button', { name: 'Start voice conversation' })
      await expect(orb).toBeVisible()
      await expect(page.locator('.brand-orb-orbit')).toHaveCount(3)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      const header = await page.locator('.account-bar').boundingBox()
      const intro = await page.locator('.voice-intro').boundingBox()
      expect(header && intro && intro.y >= header.y + header.height).toBeTruthy()
      if (process.env.APP_SCREENSHOTS)
        await page.screenshot({ path: info.outputPath('assistant.png') })
      await orb.click()
      await expect(page.locator('.agent-status')).toHaveText('Listening')
      app.send({ type: 'markit.status', status: 'validating' })
      await expect(page.locator('.agent-status')).toContainText('Validating')
      await expect(page.getByRole('button', { name: 'Mute microphone' })).toBeVisible()
      app.send({
        type: 'markit.products',
        action: 'show',
        heading: 'Coffee within your budget',
        products: [
          product,
          {
            ...product,
            title: 'Another coffee · test fixture',
            url: 'https://example.com/another-test',
          },
        ],
        view: 'list',
        sort: 'relevance',
      })
      app.send({ type: 'markit.analysis', url: product.url, analysis })
      const surface =
        size.width < 900 ? page.getByRole('dialog') : page.locator('.desktop-product-panel')
      await expect(surface).toBeVisible()
      await expect(surface.locator('.product-card')).toHaveCount(2)
      expect(
        await surface.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true)
      await surface.getByRole('button', { name: 'View details' }).first().click()
      await expect(surface.getByText('Destination is required to confirm delivery.')).toBeVisible()
      const productLink = surface.getByRole('link', { name: /View Whole-bean coffee/ })
      await productLink.scrollIntoViewIfNeeded()
      await expect(productLink).toBeInViewport()
      if (process.env.APP_SCREENSHOTS)
        await page.screenshot({ path: info.outputPath('results.png') })
      app.send({ type: 'markit.products', action: 'close' })
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.locator('.commerce-agent')).not.toHaveClass(/has-products/)
      await page.getByRole('button', { name: 'End voice conversation' }).click()
      await expect(page.getByRole('button', { name: 'Start voice conversation' })).toBeVisible()
      expect(errors).toEqual([])
    })
  }
}

test('mobile workspace retains the selected thread, with an explicit new-thread action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const app = await mockApp(page, 'light')
  await page.goto('/')
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Open workspace navigation' }).click()
  await page.getByRole('button', { name: 'Headphones for work' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open workspace navigation' }).click()
  await expect(page.getByRole('button', { name: 'Headphones for work' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await page.getByRole('button', { name: 'Saved listings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Saved listings', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Back to assistant', exact: true }).click()
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Start voice conversation' }).click()
  await expect(page.locator('.agent-status')).toHaveText('Listening')
  expect(app.socketUrl()).toContain('conversationId=test-headphones')
  await page.getByRole('button', { name: 'End voice conversation' }).click()
  await page.getByRole('button', { name: 'Open workspace navigation' }).click()
  await page.getByRole('button', { name: 'Reset and start a new thread' }).click()
  expect(app.created()).toBe(1)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('login uses the brand palette without mobile clipping', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await mockApp(page, 'light', false)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Log in to Markit' })).toBeVisible()
  const input = page.getByRole('textbox', { name: 'Email address' })
  expect(
    await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16)
  await page.getByRole('button', { name: 'Log in', exact: true }).last().scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.APP_SCREENSHOTS) await page.screenshot({ path: info.outputPath('login.png') })
})

for (const width of [390, 1440]) {
  test(`model-controlled grid and table layouts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const app = await mockApp(page, 'light')
    await page.goto('/')
    await waitForAccount(page)
    await page.getByRole('button', { name: 'Start voice conversation' }).click()
    await expect(page.locator('.agent-status')).toHaveText('Listening')
    for (const view of ['grid', 'table']) {
      app.send({
        type: 'markit.products',
        action: 'show',
        products: [product],
        view,
        sort: 'price_asc',
      })
      const surface =
        width < 900 ? page.getByRole('dialog') : page.locator('.desktop-product-panel')
      if (view === 'grid') await expect(surface.locator('[data-view="grid"]')).toBeVisible()
      else {
        await expect(surface.getByRole('table')).toBeVisible()
        expect(
          await surface
            .locator('.product-table-wrap')
            .evaluate((element) => element.scrollWidth >= element.clientWidth),
        ).toBe(true)
      }
      expect(
        await surface.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true)
    }
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} profile and brand text stay readable`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApp(page, theme)
    await page.goto('/profile')
    await expect(page.getByRole('heading', { name: 'Profile & preferences' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const contrast = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement)
      function luminance(token: string) {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        context.fillStyle = styles.getPropertyValue(token).trim()
        context.fillRect(0, 0, 1, 1)
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data)
          .slice(0, 3)
          .map((v) => {
            const channel = v / 255
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
          })
        return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
      }
      const foreground = luminance('--muted'),
        background = luminance('--background')
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    })
    expect(contrast).toBeGreaterThan(4.5)
    if (process.env.APP_SCREENSHOTS) await page.screenshot({ path: info.outputPath('profile.png') })
  })
}

test('microphone errors leave a readable recovery action', async ({ page }) => {
  await mockApp(page, 'light')
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Test denial', 'NotAllowedError'))
  })
  await page.goto('/')
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Start voice conversation' }).click()
  await expect(page.getByRole('button', { name: 'Voice unavailable. Try again' })).toBeVisible()
  await expect(page.locator('.voice-guidance')).toContainText('Check microphone access')
})

test('social metadata is server-rendered, with a real 1200×630 image', async ({ request }) => {
  const response = await request.get('/')
  expect(response.ok()).toBe(true)
  const html = await response.text()
  expect(html).toContain('property="og:image"')
  expect(html).toContain('summary_large_image')
  const imagePath = html.match(/\/brand\/markit-social-[a-f0-9]+\.png/)?.[0]
  expect(imagePath).toBeTruthy()
  const image = await request.get(imagePath!)
  expect(image.headers()['content-type']).toContain('image/png')
  const bytes = await image.body()
  expect(bytes.readUInt32BE(16)).toBe(1200)
  expect(bytes.readUInt32BE(20)).toBe(630)
})

test('reduced motion freezes the weave, including during research', async ({ page }) => {
  const app = await mockApp(page, 'light')
  await page.goto('/')
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Start voice conversation' }).click()
  await expect(page.locator('.agent-status')).toHaveText('Listening')
  const rings = page.locator('.brand-orb-orbit')
  const before = await rings.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).transform),
  )
  app.send({ type: 'markit.status', status: 'searching' })
  await expect(page.locator('.agent-status')).toHaveText('Researching products')
  await page.waitForTimeout(300)
  expect(
    await rings.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).transform),
    ),
  ).toEqual(before)
  await expect(page.locator('.brand-orb')).toHaveAttribute('data-motion', 'still')
})

test('desktop orb moves aside and responds to playback amplitude', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const app = await mockApp(page, 'light')
  await page.goto('/')
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Start voice conversation' }).click()
  await expect(page.locator('.agent-status')).toHaveText('Listening')
  const frame = page.locator('.voice-orb-frame')
  const before = await frame.boundingBox()
  app.send({ type: 'markit.products', action: 'show', products: [product], view: 'list' })
  await expect(page.locator('.desktop-product-panel')).toBeVisible()
  await expect
    .poll(() => frame.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe('none')
  await page.getByRole('button', { name: 'Mute microphone' }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Unmute microphone' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect
    .poll(() => frame.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none')
  expect((await frame.boundingBox())!.x).toBeLessThan(before!.x - 100)
  const samples = new Int16Array(48_000)
  samples.fill(12_000)
  app.send({ type: 'response.created', response: { id: 'motion-test' } })
  app.send({
    type: 'response.output_audio.delta',
    response_id: 'motion-test',
    item_id: 'test-audio',
    content_index: 0,
    delta: Buffer.from(samples.buffer).toString('base64'),
  })
  await expect(page.locator('.agent-status')).toHaveText('Speaking')
  await expect
    .poll(() =>
      page
        .locator('.brand-orb-sphere')
        .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m11),
    )
    .toBeGreaterThan(1.01)
})

test('signal weave animates only when visible and reacts to live state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const app = await mockApp(page, 'light')
  await page.goto('/')
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Start voice conversation' }).click()
  await expect(page.locator('.agent-status')).toHaveText('Listening')
  app.send({ type: 'markit.status', status: 'searching' })
  const rings = page.locator('.brand-orb-orbit')
  const before = await rings.first().getAttribute('style')
  await expect.poll(() => rings.first().getAttribute('style')).not.toBe(before)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('.brand-orb')).toHaveAttribute('data-motion', 'still')
  await page.waitForTimeout(700)
  const resting = await rings.first().getAttribute('style')
  await page.waitForTimeout(250)
  expect(await rings.first().getAttribute('style')).toBe(resting)
})
