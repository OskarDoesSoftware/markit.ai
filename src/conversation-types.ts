import type { ProductDisplayPreferences, ProductPanelStage } from './product-panel-state'
import type {
  ProductAnalysis,
  ProductCardData,
  ProductSortMode,
  ProductViewMode,
} from './product-types'

export type ConversationSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type ConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export type PersistedProductState = {
  latestProducts: ProductCardData[]
  visibleProductUrls: string[]
  validatedProductUrls: string[]
  latestValidationContext: {
    requirements: string
    maxPrice?: number
    currency?: string
  } | null
  display: {
    heading: string
    view: ProductViewMode
    sort: ProductSortMode
  } | null
  analyses: Record<string, ProductAnalysis>
  stage?: ProductPanelStage
  selectedProductUrls?: string[]
  displayPreferences?: ProductDisplayPreferences
}

export type LoadedConversation = {
  conversation: ConversationSummary
  messages: ConversationMessage[]
  productState: PersistedProductState | null
}
