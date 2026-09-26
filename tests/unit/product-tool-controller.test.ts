import { describe, expect, test } from 'bun:test'

import { getProductToolDefinitions } from '../../src/product-agent'
import {
  initialProductPanel,
  reduceProductPanel,
  type ProductPanelEvent,
} from '../../src/product-panel-state'
import {
  ProductToolController,
  type AgentToolCall,
  type ProductToolPorts,
} from '../../src/product-tool-controller'
import type { ProductAnalysis, ProductCardData } from '../../src/product-types'

const one: ProductCardData = {
  url: 'https://shop.example/one',
  title: 'One',
  source: 'Shop',
  price: '€18',
  priceValue: 18,
  priceCurrency: 'EUR',
  shipping: '€3',
  highlights: [],
  sellerReliability: { score: 65, label: 'moderate', basis: ['Source evidence'] },
}
const two: ProductCardData = {
  ...one,
  url: 'https://shop.example/two',
  title: 'Two',
  priceValue: 14,
  price: '€14',
}
const eligible: ProductAnalysis = {
  status: 'complete',
  model: 'offline',
  decision: 'present_match',
  checks: [{ id: 'price', label: 'Price', verdict: 'clear', note: 'Verified' }],
}
const rejected: ProductAnalysis = {
  status: 'complete',
  model: 'offline',
  decision: 'reject',
  checks: [],
  decisionReason: 'Out of budget',
}
const call = (name: string, args: object, call_id = crypto.randomUUID()): AgentToolCall => ({
  name,
  call_id,
  arguments: JSON.stringify(args),
})
const search = (args: object = {}) =>
  call('search_products', {
    query: 'whole bean coffee under €25',
    maxPrice: 25,
    currency: 'EUR',
    ...args,
  })
const validate = (urls: string[] = [one.url, two.url]) =>
  call('validate_product_results', {
    productUrls: urls,
    hardCriteria: ['whole bean', 'under €25'],
    exactMatchRequired: true,
    userCanWait: false,
    alternativesAllowed: false,
  })
const display = (action: 'show' | 'close', props: object = {}) =>
  call('control_product_display', {
    action,
    productUrls: null,
    heading: null,
    view: null,
    sort: null,
    ...props,
  })

function setup(options?: {
  products?: ProductCardData[]
  analyses?: Record<string, ProductAnalysis>
  save?: boolean
  failSearch?: boolean
  failValidation?: boolean
  onValidate?: () => Promise<void>
}) {
  const events: ProductPanelEvent[] = []
  const outputs: Array<{ id: string; value: unknown }> = []
  const persisted: object[] = []
  let connected = true
  let searches = 0
  let validations = 0
  const ports: ProductToolPorts = {
    send: (event) => events.push(event as ProductPanelEvent),
    isConnected: () => connected,
    waitForReady: async () => {},
    search: async () => {
      searches++
      if (options?.failSearch) throw new Error('upstream details must not leak')
      return { products: options?.products ?? [one, two] }
    },
    validate: async (products, _context, onResult) => {
      validations++
      if (options?.onValidate) await options.onValidate()
      if (options?.failValidation) throw new Error('upstream details must not leak')
      return products.map((product) => {
        const analysis = options?.analyses?.[product.url] ?? eligible
        onResult(product.url, analysis)
        return analysis
      })
    },
    save: async () => (options?.save ? [] : null),
    persist: async (state) => {
      persisted.push(structuredClone(state))
    },
    complete: (id, value) => outputs.push({ id, value }),
  }
  const controller = new ProductToolController(ports)
  let panel = initialProductPanel()
  const consume = () => {
    for (const event of events.splice(0)) {
      if (event.type === 'markit.products' || event.type === 'markit.analysis') {
        panel = reduceProductPanel(panel, event)
      }
    }
    return panel
  }
  return {
    controller,
    events,
    outputs,
    persisted,
    consume,
    counts: () => ({ searches, validations }),
    disconnect: () => {
      connected = false
    },
  }
}

describe('AI-controlled product display', () => {
  test('strict tool schema requires nullable display fields', async () => {
    const tools = await getProductToolDefinitions()
    const control = tools.find((tool) => tool.name === 'control_product_display')
    expect(control?.parameters).toMatchObject({
      required: ['action', 'productUrls', 'heading', 'view', 'sort'],
    })
  })

  test('search → validation → show → sort/view → close → reopen preserves subset, checks and heading', async () => {
    const run = setup()
    await run.controller.enqueue(search())
    expect(run.consume()).toMatchObject({
      stage: 'awaiting-validation',
      products: [],
      isOpen: false,
    })
    await run.controller.enqueue(validate())
    expect(run.consume()).toMatchObject({ stage: 'ready', products: [], isOpen: false })
    await run.controller.enqueue(
      display('show', { productUrls: [two.url], heading: 'Jan’s coffee', view: 'list' }),
    )
    expect(run.consume()).toMatchObject({
      isOpen: true,
      heading: 'Jan’s coffee',
      products: [{ url: two.url }],
      analyses: { [two.url]: eligible },
    })
    await run.controller.enqueue(display('show', { view: 'grid', sort: 'price_asc' }))
    expect(run.consume()).toMatchObject({
      isOpen: true,
      view: 'grid',
      sort: 'price_asc',
      heading: 'Jan’s coffee',
      products: [{ url: two.url }],
    })
    await run.controller.enqueue(call('control_product_display', { action: 'close' }))
    expect(run.consume()).toMatchObject({ isOpen: false, products: [], stage: 'ready' })
    await run.controller.enqueue(display('show', { view: 'table' }))
    expect(run.consume()).toMatchObject({
      isOpen: true,
      view: 'table',
      heading: 'Jan’s coffee',
      products: [{ url: two.url }],
      analyses: { [two.url]: eligible },
    })
    expect(run.counts()).toEqual({ searches: 1, validations: 1 })
    expect(run.persisted.length).toBe(6)
  })

  test('rejects invented, duplicate, or rejected URLs without changing displayed cards', async () => {
    const run = setup({ analyses: { [one.url]: eligible, [two.url]: rejected } })
    await run.controller.enqueue(search())
    await run.controller.enqueue(validate())
    await run.controller.enqueue(display('show', { productUrls: [one.url] }))
    const before = run.consume()
    for (const urls of [[two.url], [one.url, one.url], ['https://shop.example/invented']]) {
      await run.controller.enqueue(display('show', { productUrls: urls, heading: 'Invalid' }))
      const next = run.consume()
      expect(next.products).toEqual(before.products)
      expect(next.heading).toBe(before.heading)
      expect(next.notice).toContain('could not be applied')
      expect(JSON.stringify(run.outputs.at(-1)?.value)).not.toContain('upstream')
    }
  })

  test('new research makes prior matches unavailable at every stage, including failed and empty runs', async () => {
    const run = setup({ products: [one] })
    await run.controller.enqueue(search())
    await run.controller.enqueue(validate([one.url]))
    await run.controller.enqueue(display('show'))
    expect(run.consume().products).toHaveLength(1)
    await run.controller.enqueue(search({ query: 'headphones under €25' }))
    expect(run.consume()).toMatchObject({
      isOpen: true,
      products: [],
      analyses: {},
      stage: 'awaiting-validation',
    })
    expect(run.counts().searches).toBe(2)
    const empty = setup({ products: [] })
    await empty.controller.enqueue(search())
    expect(empty.consume()).toMatchObject({ stage: 'no-matches', products: [] })
    await empty.controller.enqueue(validate([one.url]))
    expect(empty.consume().stage).not.toBe('ready')
    const failed = setup({ failSearch: true })
    await failed.controller.enqueue(search())
    expect(failed.consume()).toMatchObject({ stage: 'search-error', products: [] })
    expect(JSON.stringify(failed.outputs)).not.toContain('upstream details')
  })

  test('validation failure and needs-input never grant display permission', async () => {
    const failed = setup({ failValidation: true })
    await failed.controller.enqueue(search())
    await failed.controller.enqueue(validate())
    expect(failed.consume()).toMatchObject({ stage: 'validation-error', products: [] })
    await failed.controller.enqueue(display('show'))
    expect(failed.consume().products).toHaveLength(0)
    const needsInput = setup({
      analyses: { [one.url]: { ...eligible, decision: 'ask_user' }, [two.url]: rejected },
    })
    await needsInput.controller.enqueue(search())
    await needsInput.controller.enqueue(validate())
    expect(needsInput.consume()).toMatchObject({ stage: 'needs-input', products: [] })
    await needsInput.controller.enqueue(display('show'))
    expect(needsInput.consume().products).toHaveLength(0)
  })

  test('serializes overlapping tool calls, de-duplicates IDs and persists final state in order', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const run = setup({ onValidate: () => pending })
    const initial = search()
    await Promise.all([run.controller.enqueue(initial), run.controller.enqueue(initial)])
    expect(run.counts().searches).toBe(1)
    const validation = run.controller.enqueue(validate())
    await new Promise((resolve) => setTimeout(resolve, 0))
    const show = run.controller.enqueue(display('show'))
    release()
    await Promise.all([validation, show])
    expect(run.consume().products).toHaveLength(2)
    expect(run.persisted.at(-1)).toMatchObject({
      display: { heading: 'Current picks' },
      visibleProductUrls: [one.url, two.url],
    })
  })

  test('restored snapshots expose only eligible URLs, and old revisions cannot undo a close', async () => {
    const run = setup({ analyses: { [one.url]: eligible, [two.url]: rejected } })
    await run.controller.enqueue(search())
    await run.controller.enqueue(validate())
    await run.controller.enqueue(display('show'))
    const last = run.persisted.at(-1)
    const events: ProductPanelEvent[] = []
    const restored = new ProductToolController(
      {
        send: (event) => events.push(event as ProductPanelEvent),
        isConnected: () => true,
        waitForReady: async () => {},
        search: async () => ({ products: [] }),
        validate: async () => [],
        save: async () => null,
        persist: async () => {},
        complete: () => {},
      },
      last as ConstructorParameters<typeof ProductToolController>[1],
    )
    restored.restore()
    const snapshot = events[0]!
    expect(snapshot.products?.map((item) => item.url)).toEqual([one.url])
    expect(snapshot.restored).toBe(true)
    let panel = reduceProductPanel(initialProductPanel(), snapshot)
    panel = reduceProductPanel(panel, {
      type: 'markit.products',
      action: 'close',
      revision: 10,
      researchId: 0,
      stage: 'ready',
    })
    expect(reduceProductPanel(panel, snapshot)).toEqual(panel)
  })
})
