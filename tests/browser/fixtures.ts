import type { Page, WebSocketRoute } from '@playwright/test'

import type { ProductAnalysis, ProductCardData } from '../../src/product-types'

export const product: ProductCardData = {
  title: 'Whole-bean coffee · browser-test fixture',
  url: 'https://example.com/test-coffee',
  source: 'Example retailer',
  price: '€18.00',
  priceValue: 18,
  priceCurrency: 'EUR',
  shipping: '€3.00 delivery · test data',
  highlights: [
    'Smooth medium roast with clear product details. Illustrative browser-test data, not a live offer.',
  ],
  sellerReliability: {
    score: 65,
    label: 'moderate',
    basis: ['Test evidence only; not a certification.'],
  },
}

export const analysis: ProductAnalysis = {
  status: 'complete',
  model: 'test-fixture',
  decision: 'ask_user',
  summary: 'Illustrative checks for browser layout tests.',
  decisionReason: 'Destination is required to confirm delivery.',
  checks: [
    { id: 'price', label: 'Price', verdict: 'clear', note: 'Test price provided.' },
    { id: 'offer', label: 'Offer', verdict: 'caution', note: 'Confirm delivery destination.' },
    { id: 'seller', label: 'Seller', verdict: 'unverified', note: 'Not a real seller assessment.' },
  ],
  sources: [{ title: 'Test source', url: 'https://example.com/test-source' }],
}

export async function waitForAccount(page: Page) {
  await page.waitForFunction(() => localStorage.getItem('markit-conversation-browser-test'))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

export async function mockApp(page: Page, theme: 'light' | 'dark', signedIn = true) {
  let socket: WebSocketRoute | undefined
  let created = 0
  const conversations = [
    { id: 'test-coffee', title: 'Coffee under €25' },
    { id: 'test-headphones', title: 'Headphones for work' },
  ]
  const user = {
    id: 'browser-test',
    name: 'Demo Shopper',
    email: 'demo@example.com',
    theme,
    offersEnabled: false,
  }
  await page.addInitScript((value) => localStorage.setItem('markit-theme', value), theme)
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    let json: unknown
    if (path === '/api/auth/get-session') json = { user: signedIn ? user : null }
    else if (path === '/api/conversations') {
      if (route.request().method() === 'POST') {
        created++
        const conversation = { id: `new-${created}`, title: 'New conversation' }
        conversations.unshift(conversation)
        json = { conversation }
      } else json = { conversations }
    } else if (path === '/api/listings') json = { listings: [] }
    else if (path === '/api/auth/update-user') json = { user }
    else throw new Error(`Unexpected API request (blocked): ${path}`)
    await route.fulfill({ json })
  })
  await page.routeWebSocket('**/api/realtime**', (route) => {
    socket = route
    route.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as { type?: string }
      if (parsed.type === 'session.update') route.send(JSON.stringify({ type: 'session.updated' }))
    })
  })
  return {
    send: (event: object) => {
      if (!socket) throw new Error('No mocked realtime connection')
      socket.send(JSON.stringify(event))
    },
    created: () => created,
    socketUrl: () => socket?.url(),
  }
}
