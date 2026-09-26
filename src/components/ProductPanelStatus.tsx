import { Button, Spinner } from '@heroui/react'

import { isResearchPending, type ProductPanelStage } from '@/product-panel-state'

import { MicrophoneMuteButton } from './MicrophoneMuteButton'
import { VoiceStatus, type OrbState } from './VoiceStatus'

const STAGES: Record<ProductPanelStage, { title: string; description: string }> = {
  idle: { title: 'Your shortlist', description: 'Ask Markit to research something for you.' },
  searching: {
    title: 'Researching new options',
    description:
      'The previous shortlist is being replaced. New offers will appear only after validation.',
  },
  'awaiting-validation': {
    title: 'Research gathered',
    description: 'Waiting for independent validation before any listings are recommended.',
  },
  validating: {
    title: 'Checking the details',
    description: 'Comparing the price, offer, and seller evidence against your requirements.',
  },
  ready: { title: 'Checks complete', description: 'Ask Markit to show the eligible shortlist.' },
  'no-matches': {
    title: 'No eligible matches',
    description:
      'No verified option meets this request. Ask Markit to change a requirement or close the results.',
  },
  'needs-input': {
    title: 'A detail needs your input',
    description: 'Answer Markit’s follow-up before it can recommend an option.',
  },
  'search-error': {
    title: 'Research could not be completed',
    description:
      'No previous offers are being presented as current matches. Ask Markit to try again.',
  },
  'validation-error': {
    title: 'Checks could not be completed',
    description:
      'These listings cannot be recommended yet. Ask Markit to retry or close the results.',
  },
  interrupted: {
    title: 'Research paused',
    description: 'Resume the conversation to continue. No unfinished checks are shown as verified.',
  },
}

export function ProductPanelStatus({ stage }: { stage: ProductPanelStage }) {
  return (
    <div className="product-panel-status" role="status" data-stage={stage}>
      {isResearchPending(stage) ? <Spinner size="sm" aria-hidden="true" /> : null}
      <h3>{STAGES[stage].title}</h3>
      <p>{STAGES[stage].description}</p>
    </div>
  )
}

export type ProductVoiceControlsProps = {
  state: OrbState
  isMuted: boolean
  onStart: () => void
  onToggleMute: () => void
}

export function ProductVoiceControls({
  state,
  isMuted,
  onStart,
  onToggleMute,
}: ProductVoiceControlsProps) {
  const paused = state === 'idle' || state === 'error'
  return (
    <div className="product-voice-controls" role="group" aria-label="Result voice controls">
      <VoiceStatus state={state} />
      <div>
        {!paused ? <MicrophoneMuteButton isMuted={isMuted} onToggle={onToggleMute} /> : null}
        <Button size="sm" variant="secondary" onPress={onStart}>
          {paused ? 'Resume voice' : 'End voice'}
        </Button>
      </div>
      <p>Ask Markit to change or close these results.</p>
    </div>
  )
}
