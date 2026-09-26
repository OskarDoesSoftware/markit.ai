import type {
  ProductAnalysis,
  ProductCardData,
  ProductSortMode,
  ProductViewMode,
} from './product-types'
import type { SavedListing } from './saved-listing-types'

export type AudioRuntime = {
  context: AudioContext
  stream: MediaStream
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  silentGain: GainNode
}

export type ActiveOutput = {
  itemId: string
  responseId: string
  contentIndex: number
  startedAt: number
}

export type RealtimeMessage = {
  type?: string
  status?: string
  delta?: string
  item_id?: string
  response_id?: string
  call_id?: string
  content_index?: number
  action?: 'show' | 'close'
  heading?: string
  products?: ProductCardData[]
  view?: ProductViewMode
  sort?: ProductSortMode
  listings?: SavedListing[]
  url?: string
  analysis?: ProductAnalysis
  phase?: 'waiting' | 'started' | 'completed'
  tool?: string
  response?: { id?: string }
}
