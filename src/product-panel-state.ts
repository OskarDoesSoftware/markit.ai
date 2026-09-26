import type {
  ProductAnalysis,
  ProductCardData,
  ProductSortMode,
  ProductViewMode,
} from './product-types'

export type ProductPanelStage =
  | 'idle'
  | 'searching'
  | 'awaiting-validation'
  | 'validating'
  | 'ready'
  | 'no-matches'
  | 'needs-input'
  | 'search-error'
  | 'validation-error'
  | 'interrupted'
export type ProductDisplayPreferences = {
  heading: string
  view: ProductViewMode
  sort: ProductSortMode
}
export const DEFAULT_PRODUCT_DISPLAY: ProductDisplayPreferences = {
  heading: 'Current picks',
  view: 'list',
  sort: 'relevance',
}

export type ProductPanelState = ProductDisplayPreferences & {
  isOpen: boolean
  products: ProductCardData[]
  analyses: Record<string, ProductAnalysis>
  stage: ProductPanelStage
  revision: number
  researchId: number
  restored: boolean
  notice?: string
}

export type ProductPanelEvent = {
  type: 'markit.products' | 'markit.analysis'
  action?: 'show' | 'close' | 'update'
  revision?: number
  researchId?: number
  stage?: ProductPanelStage
  heading?: string
  view?: ProductViewMode
  sort?: ProductSortMode
  products?: ProductCardData[]
  analyses?: Record<string, ProductAnalysis>
  url?: string
  analysis?: ProductAnalysis
  notice?: string
  restored?: boolean
}

export function initialProductPanel(): ProductPanelState {
  return {
    ...DEFAULT_PRODUCT_DISPLAY,
    isOpen: false,
    products: [],
    analyses: {},
    stage: 'idle',
    revision: -1,
    researchId: -1,
    restored: false,
  }
}

export function isResearchPending(stage: ProductPanelStage) {
  return stage === 'searching' || stage === 'awaiting-validation' || stage === 'validating'
}

export function reduceProductPanel(
  state: ProductPanelState,
  event: ProductPanelEvent | { type: 'connection-reset' | 'connection-lost' },
): ProductPanelState {
  if (event.type === 'connection-reset') return { ...state, revision: -1, researchId: -1 }
  if (event.type === 'connection-lost') {
    return isResearchPending(state.stage) ? { ...state, stage: 'interrupted', products: [] } : state
  }
  if (event.researchId !== undefined && event.researchId < state.researchId) return state
  if (event.revision !== undefined) {
    if (!Number.isSafeInteger(event.revision) || event.revision <= state.revision) return state
  } else if (state.revision >= 0) return state
  const revision = event.revision ?? state.revision
  if (event.type === 'markit.analysis') {
    if (event.researchId !== undefined && event.researchId !== state.researchId) return state
    if (!event.url || !event.analysis) return state
    return { ...state, revision, analyses: { ...state.analyses, [event.url]: event.analysis } }
  }
  if (!event.action) return state
  const newResearch = event.researchId !== undefined && event.researchId !== state.researchId
  const stage = event.stage ?? (event.action === 'show' ? 'ready' : state.stage)
  return {
    ...state,
    revision,
    researchId: event.researchId ?? state.researchId,
    isOpen: event.action === 'update' ? state.isOpen : event.action === 'show',
    heading: event.heading ?? state.heading,
    view: event.view ?? state.view,
    sort: event.sort ?? state.sort,
    products:
      event.action === 'close' ? [] : (event.products ?? (newResearch ? [] : state.products)),
    analyses: event.analyses ?? (newResearch ? {} : state.analyses),
    stage,
    notice: event.notice,
    restored: event.restored ?? (newResearch ? false : state.restored),
  }
}
