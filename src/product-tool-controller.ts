import { z } from 'zod'

import type { PersistedProductState } from './conversation-types'
import {
  productDisplayInputSchema,
  productSearchInputSchema,
  saveListingsInputSchema,
} from './product-agent'
import { productValidationInputSchema, type ValidationContext } from './product-analysis'
import { DEFAULT_PRODUCT_DISPLAY } from './product-panel-state'
import {
  createProductSession,
  isDisplayEligible,
  productSnapshot,
  sortProducts,
} from './product-session'
import type { ProductAnalysis, ProductCardData } from './product-types'
import type { SavedListing } from './saved-listing-types'

export type AgentToolCall = { name: string; call_id: string; arguments?: string }
export type ProductToolPorts = {
  send: (event: object) => void
  isConnected: () => boolean
  waitForReady: (call: AgentToolCall) => Promise<void>
  search: (
    input: z.infer<typeof productSearchInputSchema>,
  ) => Promise<{ products: ProductCardData[] }>
  validate: (
    products: ProductCardData[],
    context: ValidationContext,
    onResult: (url: string, analysis: ProductAnalysis) => void,
  ) => Promise<ProductAnalysis[]>
  save: (products: ProductCardData[]) => Promise<SavedListing[] | null>
  persist: (state: PersistedProductState) => Promise<void>
  complete: (callId: string, output: unknown) => void
}

class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export class ProductToolController {
  private state
  private restored: boolean
  private queue = Promise.resolve()
  private handled = new Set<string>()

  constructor(
    private ports: ProductToolPorts,
    saved?: PersistedProductState | null,
  ) {
    this.state = createProductSession(saved)
    this.restored = Boolean(saved?.display)
  }

  restore() {
    this.ports.send({
      ...productSnapshot(this.state, this.state.display ? 'show' : 'close'),
      restored: this.restored,
    })
  }

  enqueue(call: AgentToolCall): Promise<void> {
    if (this.handled.has(call.call_id)) return this.queue
    this.handled.add(call.call_id)
    const run = this.queue.then(async () => {
      if (!this.ports.isConnected()) return
      await this.ports.waitForReady(call)
      if (!this.ports.isConnected()) return
      this.ports.send({
        type: 'markit.tool',
        phase: 'started',
        tool: call.name,
        call_id: call.call_id,
      })
      let output: unknown
      try {
        output = await this.execute(call)
      } catch (error) {
        output = {
          error:
            error instanceof ToolError
              ? error.message
              : 'The requested ecommerce action could not be completed. Do not claim it succeeded.',
          code: error instanceof ToolError ? error.code : 'tool_failed',
        }
        if (call.name === 'search_products') {
          this.clearResearch()
          this.state.stage = 'search-error'
          this.status('search-error')
        } else if (call.name === 'validate_product_results') {
          this.state.validatedProductUrls = []
          this.state.visibleProductUrls = []
          this.state.stage = 'validation-error'
          this.status('validation-error')
        } else if (call.name === 'control_product_display') {
          this.state.notice =
            'The requested display change could not be applied. Your current selection is unchanged.'
          this.status('display-error')
        }
        this.publish()
      }
      // Serialize persistence with tool execution: an older write must not win over close/show.
      await this.ports.persist(structuredClone(this.state)).catch(() => undefined)
      this.ports.send({
        type: 'markit.tool',
        phase: 'completed',
        tool: call.name,
        call_id: call.call_id,
      })
      this.ports.complete(call.call_id, output)
    })
    this.queue = run.catch(() => undefined)
    return run
  }

  private publish(action: 'show' | 'close' | 'update' = 'update') {
    this.ports.send({ ...productSnapshot(this.state, action), restored: this.restored })
  }

  private status(status: string) {
    this.ports.send({ type: 'markit.status', status })
  }

  private clearResearch() {
    this.restored = false
    this.state.validationGeneration++
    this.state.latestProducts = []
    this.state.visibleProductUrls = []
    this.state.selectedProductUrls = []
    this.state.validatedProductUrls = []
    this.state.analyses = {}
    this.state.latestValidationContext = null
    this.state.notice = undefined
  }

  private async execute(call: AgentToolCall): Promise<unknown> {
    const args: unknown = JSON.parse(call.arguments || '{}')
    if (call.name === 'search_products') {
      const input = productSearchInputSchema.parse(args)
      this.clearResearch()
      this.state.researchId++
      this.state.stage = 'searching'
      this.state.displayPreferences.heading = DEFAULT_PRODUCT_DISPLAY.heading
      this.publish()
      this.status('searching')
      const result = await this.ports.search(input)
      this.state.latestProducts = result.products
      this.state.latestValidationContext = {
        requirements: input.query,
        maxPrice: input.maxPrice,
        currency: input.currency,
      }
      this.state.stage = result.products.length ? 'awaiting-validation' : 'no-matches'
      this.publish()
      this.status('thinking')
      return result
    }
    if (call.name === 'validate_product_results') {
      const input = productValidationInputSchema.parse(args)
      if (!this.state.latestValidationContext)
        throw new ToolError('research_required', 'Search for products before validating them.')
      const requested = new Set(input.productUrls)
      const products = this.state.latestProducts.filter((product) => requested.has(product.url))
      if (products.length !== requested.size || requested.size !== input.productUrls.length)
        throw new ToolError(
          'invalid_selection',
          'Validate unique URLs from the latest search only.',
        )
      const generation = ++this.state.validationGeneration
      this.state.validatedProductUrls = []
      this.state.visibleProductUrls = []
      this.state.analyses = {}
      this.state.notice = undefined
      this.state.stage = 'validating'
      this.publish()
      this.status('validating')
      const analyses = await this.ports.validate(
        products,
        { ...input, ...this.state.latestValidationContext },
        (url, analysis) => {
          if (this.state.validationGeneration !== generation || !requested.has(url)) return
          this.state.analyses[url] = analysis
          this.ports.send({
            type: 'markit.analysis',
            revision: ++this.state.revision,
            researchId: this.state.researchId,
            url,
            analysis,
          })
        },
      )
      this.state.validatedProductUrls = products.flatMap((product, index) => {
        const analysis = analyses[index] ?? {
          status: 'failed' as const,
          model: 'validation',
          checks: [],
        }
        this.state.analyses[product.url] = analysis
        return isDisplayEligible(analysis) ? [product.url] : []
      })
      this.state.stage = this.state.validatedProductUrls.length
        ? 'ready'
        : analyses.some(
              (analysis) =>
                analysis.decision === 'ask_user' || analysis.decision === 'wait_and_monitor',
            )
          ? 'needs-input'
          : analyses.some((analysis) => analysis.status === 'complete')
            ? 'no-matches'
            : 'validation-error'
      this.publish()
      this.status(this.state.stage === 'validation-error' ? 'validation-error' : 'thinking')
      return {
        validationCompleted: analyses.some((analysis) => analysis.status === 'complete'),
        validatedCount: analyses.filter((analysis) => analysis.status === 'complete').length,
        failedCount:
          products.length - analyses.filter((analysis) => analysis.status === 'complete').length,
        findings: products.map((product) => ({
          url: product.url,
          ...this.state.analyses[product.url],
        })),
      }
    }
    if (call.name === 'control_product_display') {
      const input = productDisplayInputSchema.parse({
        productUrls: null,
        heading: null,
        view: null,
        sort: null,
        ...(typeof args === 'object' && args !== null ? args : {}),
      })
      this.state.notice = undefined
      if (input.action === 'close') {
        this.state.visibleProductUrls = []
        this.state.display = null
        this.publish('close')
        return { displayed: false, productCount: 0 }
      }
      if (this.state.stage !== 'ready' || !this.state.validatedProductUrls.length)
        throw new ToolError(
          'validation_required',
          'Eligible completed validation is required before showing products. Close the panel if there are no eligible results.',
        )
      const eligible = new Set(this.state.validatedProductUrls)
      const requested =
        input.productUrls ??
        (this.state.selectedProductUrls.length
          ? this.state.selectedProductUrls
          : this.state.validatedProductUrls)
      if (
        new Set(requested).size !== requested.length ||
        requested.some((url) => !eligible.has(url) || !isDisplayEligible(this.state.analyses[url]))
      )
        throw new ToolError(
          'invalid_selection',
          'Only unique eligible validated URLs can be displayed. Choose eligible results explicitly.',
        )
      const byUrl = new Map(this.state.latestProducts.map((product) => [product.url, product]))
      const selection = requested.flatMap((url) => (byUrl.get(url) ? [byUrl.get(url)!] : []))
      if (!selection.length || selection.length !== requested.length)
        throw new ToolError(
          'invalid_selection',
          'No eligible researched products are available for this selection.',
        )
      const previous = this.state.displayPreferences
      const preferences = {
        heading: input.heading ?? previous.heading,
        view: input.view ?? previous.view,
        sort: input.sort ?? previous.sort,
      }
      const products = sortProducts(selection, preferences.sort).slice(0, 6)
      this.state.selectedProductUrls = [...requested]
      this.state.visibleProductUrls = products.map((product) => product.url)
      this.state.displayPreferences = preferences
      this.state.display = preferences
      this.publish('show')
      return { displayed: true, productCount: products.length, ...preferences }
    }
    if (call.name === 'save_product_listings') {
      const input = saveListingsInputSchema.parse(args)
      const requested = new Set(input.productUrls)
      const products = this.state.latestProducts.filter((product) => requested.has(product.url))
      if (products.length !== requested.size)
        throw new ToolError(
          'invalid_selection',
          'Only products from the latest research can be saved.',
        )
      const listings = await this.ports.save(products)
      if (!listings) return { saved: false, error: 'Login is required to save product listings.' }
      this.ports.send({ type: 'markit.listings', listings })
      return { saved: true, savedCount: listings.length, location: 'Account → Saved listings' }
    }
    throw new ToolError('unknown_tool', 'Unknown ecommerce action.')
  }
}
