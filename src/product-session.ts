import type { PersistedProductState } from './conversation-types'
import {
  DEFAULT_PRODUCT_DISPLAY,
  isResearchPending,
  type ProductDisplayPreferences,
  type ProductPanelEvent,
  type ProductPanelStage,
} from './product-panel-state'
import type { ProductAnalysis, ProductCardData, ProductSortMode } from './product-types'

export type ProductSessionState = PersistedProductState & {
  stage: ProductPanelStage
  selectedProductUrls: string[]
  displayPreferences: ProductDisplayPreferences
  validationGeneration: number
  researchId: number
  revision: number
  notice?: string
}

export function isDisplayEligible(analysis: ProductAnalysis | undefined) {
  return (
    analysis?.status === 'complete' &&
    (analysis.decision === 'present_match' || analysis.decision === 'propose_alternatives')
  )
}

export function createProductSession(saved?: PersistedProductState | null): ProductSessionState {
  const previous = saved ? structuredClone(saved) : null
  const stage = previous?.stage ?? (previous?.latestProducts.length ? 'ready' : 'idle')
  return {
    latestProducts: previous?.latestProducts ?? [],
    visibleProductUrls: previous?.visibleProductUrls ?? [],
    validatedProductUrls: previous?.validatedProductUrls ?? [],
    latestValidationContext: previous?.latestValidationContext ?? null,
    display: previous?.display ?? null,
    analyses: previous?.analyses ?? {},
    selectedProductUrls: previous?.selectedProductUrls ?? previous?.visibleProductUrls ?? [],
    displayPreferences: previous?.displayPreferences ??
      previous?.display ?? { ...DEFAULT_PRODUCT_DISPLAY },
    stage: isResearchPending(stage) ? 'interrupted' : stage,
    validationGeneration: 0,
    researchId: 0,
    revision: 0,
  }
}

export function productSnapshot(
  state: ProductSessionState,
  action: 'show' | 'close' | 'update',
): ProductPanelEvent {
  const byUrl = new Map(state.latestProducts.map((product) => [product.url, product]))
  const eligible = new Set(state.validatedProductUrls)
  const products =
    state.stage === 'ready'
      ? state.visibleProductUrls.flatMap((url) => {
          const product = byUrl.get(url)
          return product && eligible.has(url) && isDisplayEligible(state.analyses[url])
            ? [product]
            : []
        })
      : []
  return {
    type: 'markit.products',
    action,
    revision: ++state.revision,
    researchId: state.researchId,
    stage: state.stage,
    ...state.displayPreferences,
    products,
    analyses: structuredClone(state.analyses),
    notice: state.notice,
  }
}

export function sortProducts(
  products: ProductCardData[],
  sort: ProductSortMode,
): ProductCardData[] {
  if (sort === 'relevance') return products
  return [...products].sort((left, right) => {
    if (sort === 'reliability_desc')
      return right.sellerReliability.score - left.sellerReliability.score
    if (left.priceValue === undefined && right.priceValue === undefined) return 0
    if (left.priceValue === undefined) return 1
    if (right.priceValue === undefined) return -1
    return sort === 'price_asc'
      ? left.priceValue - right.priceValue
      : right.priceValue - left.priceValue
  })
}
