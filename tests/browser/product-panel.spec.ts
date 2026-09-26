import { expect, test } from '@playwright/test'

import { analysis, mockApp, product, waitForAccount } from './fixtures'

for (const width of [390, 900, 1440]) {
  test(`AI-controlled panel lifecycle keeps controls and evidence at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 700 })
    const app = await mockApp(page, 'light')
    await page.goto('/')
    await waitForAccount(page)
    await page.getByRole('button', { name: 'Start voice conversation' }).click()
    await expect(page.locator('.agent-status').first()).toHaveText('Listening')
    const surface = width < 900 ? page.getByRole('dialog') : page.locator('.desktop-product-panel')
    let revision = 0
    const send = (action: 'show' | 'update' | 'close', state: object = {}) =>
      app.send({
        type: 'markit.products',
        action,
        revision: ++revision,
        researchId: 1,
        stage: 'ready',
        ...state,
      })
    send('show', {
      heading: 'Jan’s checked coffee',
      view: 'list',
      sort: 'relevance',
      products: [product],
      analyses: { [product.url]: { ...analysis, decision: 'present_match' } },
    })
    await expect(surface).toBeVisible()
    await expect(surface.locator('.product-decision')).toContainText('Eligible match')
    await surface.getByRole('button', { name: 'View details' }).click()
    await expect(surface.getByText('Test source')).toBeVisible()
    send('show', { view: 'grid', products: [product] })
    await expect(surface.locator('.product-card-list')).toHaveAttribute('data-view', 'grid')
    await expect(surface.getByText('Test source')).toBeVisible()
    send('show', { view: 'table', products: [product] })
    await expect(surface.getByRole('table')).toBeVisible()
    await expect(surface.getByText('Test source')).toBeVisible()
    send('show', { view: 'list', products: [product] })
    await expect(surface.getByText('Test source')).toBeVisible()
    app.send({
      type: 'markit.products',
      action: 'show',
      revision: revision - 2,
      researchId: 1,
      heading: 'Stale title',
      products: [],
    })
    await expect(surface.getByText('Jan’s checked coffee')).toBeVisible()

    send('update', { researchId: 2, stage: 'searching', products: [], analyses: {} })
    await expect(surface.getByText('Researching new options')).toBeVisible()
    await expect(surface.locator('.product-card')).toHaveCount(0)
    app.send({
      type: 'markit.analysis',
      revision: ++revision,
      researchId: 1,
      url: product.url,
      analysis,
    })
    app.send({
      type: 'markit.products',
      action: 'show',
      revision: revision + 100,
      researchId: 1,
      heading: 'Older research',
      products: [product],
    })
    send('update', { researchId: 2, stage: 'awaiting-validation' })
    await expect(surface.getByText('Research gathered')).toBeVisible()
    send('update', { researchId: 2, stage: 'validating' })
    await expect(surface.getByText('Checking the details')).toBeVisible()
    send('update', { researchId: 2, stage: 'needs-input' })
    await expect(surface.getByText('A detail needs your input')).toBeVisible()
    send('update', { researchId: 2, stage: 'validation-error' })
    await expect(surface.getByText('Checks could not be completed')).toBeVisible()

    if (width < 900) {
      const endVoice = surface.getByRole('button', { name: 'End voice' })
      await expect(endVoice).toBeVisible()
      await surface.getByRole('button', { name: 'Mute microphone' }).click()
      await expect(surface.getByRole('button', { name: 'Unmute microphone' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await endVoice.click()
      await expect(surface.getByRole('button', { name: 'Resume voice' })).toBeVisible()
      await surface.getByRole('button', { name: 'Resume voice' }).click()
      await expect(surface.getByRole('button', { name: 'End voice' })).toBeVisible()
    }
    send('close', { researchId: 2, stage: 'validation-error', products: [] })
    await expect(surface).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('controlled panel remains reachable on the shortest supported phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  const app = await mockApp(page, 'dark')
  await page.goto('/')
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Start voice conversation' }).click()
  await expect(page.locator('.agent-status')).toHaveText('Listening')
  app.send({
    type: 'markit.products',
    action: 'show',
    revision: 1,
    researchId: 1,
    stage: 'ready',
    heading: 'Accessible shortlist',
    view: 'list',
    products: [product],
    analyses: { [product.url]: { ...analysis, decision: 'present_match' } },
  })
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  const header = await drawer.locator('.product-drawer-header').boundingBox()
  const voiceButton = await drawer.getByRole('button', { name: 'End voice' }).boundingBox()
  expect(
    header && voiceButton && voiceButton.y + voiceButton.height <= header.y + header.height,
  ).toBeTruthy()
  await drawer.getByRole('button', { name: 'View details' }).click()
  await drawer.getByRole('link', { name: /View Whole-bean coffee/ }).scrollIntoViewIfNeeded()
  await expect(drawer.getByRole('link', { name: /View Whole-bean coffee/ })).toBeInViewport()
})

test('reconnected shortlist warns that cached offers are not current evidence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const app = await mockApp(page, 'light')
  await page.goto('/')
  await waitForAccount(page)
  await page.getByRole('button', { name: 'Start voice conversation' }).click()
  await expect(page.locator('.agent-status')).toHaveText('Listening')
  app.send({
    type: 'markit.products',
    action: 'show',
    revision: 1,
    researchId: 0,
    stage: 'ready',
    restored: true,
    products: [product],
    analyses: { [product.url]: { ...analysis, decision: 'present_match' } },
  })
  const rail = page.locator('.desktop-product-panel')
  await expect(
    rail.getByText(/Previous research.*prices and availability may have changed/),
  ).toBeVisible()
  app.send({
    type: 'markit.products',
    action: 'update',
    revision: 2,
    researchId: 1,
    stage: 'searching',
    restored: false,
    products: [],
    analyses: {},
  })
  await expect(rail.getByText('Researching new options')).toBeVisible()
  await expect(rail.getByText(/Previous research/)).toHaveCount(0)
  await expect(rail.locator('.product-card')).toHaveCount(0)
})
