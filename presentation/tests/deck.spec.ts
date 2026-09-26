import { expect, test } from '@playwright/test'

const sizes = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 900, height: 700 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]

for (const size of sizes) {
  test(`all 13 slides remain readable at ${size.width}×${size.height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(size)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto('/')
    await expect(page.locator('.slide')).toHaveCount(13)
    await expect(page.locator('#previous-slide')).toBeDisabled()
    for (let number = 1; number <= 13; number++) {
      const slide = page.locator('.slide:not([hidden])')
      await expect(slide).toHaveCount(1)
      await expect(page.locator('#current-slide')).toHaveText(String(number).padStart(2, '0'))
      await expect(page.locator('#deck-progress')).toHaveAttribute('value', String(number))
      const problems = await slide.evaluate((element) => {
        const viewport = document.querySelector('#slides')
        if (!(viewport instanceof HTMLElement)) return ['Missing slide viewport']
        const bounds = viewport.getBoundingClientRect()
        const errors = []
        for (const item of element.querySelectorAll(
          'h1, h2, h3, p, li, img, a, blockquote, figcaption',
        )) {
          const box = item.getBoundingClientRect()
          if (!box.width || !box.height) continue
          if (box.left < bounds.left - 1 || box.right > bounds.right + 1) {
            errors.push(`Horizontal clipping: ${item.tagName}.${item.className}`)
          }
          if (box.bottom > bounds.top + viewport.scrollHeight + 1) {
            errors.push(`Unreachable content: ${item.tagName}.${item.className}`)
          }
        }
        if (viewport.scrollWidth > viewport.clientWidth + 1) errors.push('Horizontal scrolling')
        return errors
      })
      expect(problems, `Slide ${number}`).toEqual([])
      await expect(page.locator('#next-slide')).toBeInViewport()
      const viewport = await page.locator('#slides').boundingBox()
      const footer = await page.locator('.deck-footer').boundingBox()
      expect(viewport && footer && viewport.y + viewport.height <= footer.y + 1).toBeTruthy()
      if (number === 1 && size.width < 900) {
        const copy = await slide.locator('.cover-copy').boundingBox()
        const portrait = await slide.locator('.hero-visual').boundingBox()
        expect(copy && portrait && portrait.y >= copy.y + copy.height).toBeTruthy()
      }
      await slide.locator(':scope > :last-child').scrollIntoViewIfNeeded()
      await expect
        .poll(async () =>
          slide
            .locator('img')
            .evaluateAll((images) =>
              images.every(
                (image) =>
                  image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
              ),
            ),
        )
        .toBe(true)
      if (process.env.PRESENTATION_SCREENSHOTS && [1, 4, 9, 12, 13].includes(number)) {
        await page.locator('#slides').evaluate((element) => {
          element.scrollTop = 0
        })
        await page.screenshot({ path: testInfo.outputPath(`slide-${number}.png`) })
      }
      if (number < 13) await page.locator('#next-slide').click()
    }
    await expect(page.locator('#next-slide')).toBeDisabled()
    expect(errors).toEqual([])
  })
}

test('deep links, keyboard, focus, and endpoint controls', async ({ page }) => {
  await page.goto('/#9')
  await expect(page.locator('#current-slide')).toHaveText('09')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#current-slide')).toHaveText('10')
  await page.keyboard.press('Home')
  await expect(page.locator('#current-slide')).toHaveText('01')
  await page.locator('.cover-copy .button').click()
  await expect(page.locator('#slide-2-title')).toBeFocused()
  await page.keyboard.press('PageDown')
  await expect(page.locator('#current-slide')).toHaveText('03')
  await page.keyboard.press('End')
  await expect(page.locator('#current-slide')).toHaveText('13')
  await page.locator('#previous-slide').focus()
  await page.keyboard.press('Space')
  await expect(page.locator('#current-slide')).toHaveText('12')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#current-slide')).toHaveText('11')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#current-slide')).toHaveText('12')
  await page.locator('.wordmark').click()
  await expect(page.locator('#current-slide')).toHaveText('01')
  await page.locator('.text-link').click()
  await expect(page.locator('#current-slide')).toHaveText('13')
  await expect(page.getByRole('link', { name: /Open the live Markit.ai demo/ })).toHaveAttribute(
    'href',
    'https://markit-ai.dalist.workers.dev/',
  )
  await expect(page.locator('.slide[hidden]:not([inert])')).toHaveCount(0)
  await page.goto('/#999')
  await expect(page.locator('#current-slide')).toHaveText('13')
  await page.goto('/#invalid')
  await expect(page.locator('#current-slide')).toHaveText('01')
})

test('horizontal swipes navigate, vertical and cancelled gestures do not', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const viewport = page.locator('#slides')
  await viewport.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: 280, clientY: 200 }],
    changedTouches: [{ identifier: 1, clientX: 280, clientY: 200 }],
  })
  await viewport.dispatchEvent('touchend', {
    changedTouches: [{ identifier: 1, clientX: 80, clientY: 210 }],
  })
  await expect(page.locator('#current-slide')).toHaveText('02')
  await viewport.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: 200, clientY: 300 }],
    changedTouches: [{ identifier: 1, clientX: 200, clientY: 300 }],
  })
  await viewport.dispatchEvent('touchend', {
    changedTouches: [{ identifier: 1, clientX: 190, clientY: 100 }],
  })
  await expect(page.locator('#current-slide')).toHaveText('02')
  await viewport.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: 200, clientY: 300 }],
    changedTouches: [{ identifier: 1, clientX: 200, clientY: 300 }],
  })
  await viewport.dispatchEvent('touchcancel')
  await viewport.dispatchEvent('touchend', {
    changedTouches: [{ identifier: 1, clientX: 40, clientY: 300 }],
  })
  await expect(page.locator('#current-slide')).toHaveText('02')
})

test('reduced motion and mobile team links stay usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/#12')
  await expect(page.locator('.team-link')).toHaveCount(4)
  for (const link of await page.locator('.team-link').all()) {
    await link.scrollIntoViewIfNeeded()
    await expect(link).toBeInViewport()
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  }
  expect(
    await page.locator('.team-grid').evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
})
