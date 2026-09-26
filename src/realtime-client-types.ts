import type { ProductPanelEvent } from './product-panel-state'
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

export type RealtimeMessage = Omit<ProductPanelEvent, 'type'> & {
  type?: string
  status?: string
  delta?: string
  item_id?: string
  response_id?: string
  call_id?: string
  content_index?: number
  listings?: SavedListing[]
  phase?: 'waiting' | 'started' | 'completed'
  tool?: string
  response?: { id?: string }
}
