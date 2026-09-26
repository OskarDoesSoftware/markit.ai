import { Button } from '@heroui/react'
import { arc, motion, useReducedMotion, type MotionValue } from 'motion/react'
import { useMemo } from 'react'

import type {
  ProductAnalysis,
  ProductCardData,
  ProductSortMode,
  ProductViewMode,
} from '@/product-types'

import { MicrophoneMuteButton } from './MicrophoneMuteButton'
import { ProductResults } from './ProductResults'
import { VoiceOrbArt } from './VoiceOrbArt'
import type { OrbState } from './VoiceStatus'
import { VoiceStatus } from './VoiceStatus'

const MotionButton = motion.create(Button)

type VoiceOrbSurfaceProps = {
  level: MotionValue<number>
  state: OrbState
  isMuted: boolean
  onStart: () => void
  onToggleMute: () => void
  productDisplay: {
    isOpen: boolean
    heading: string
    products: ProductCardData[]
    view: ProductViewMode
    sort: ProductSortMode
  }
  analyses: Record<string, ProductAnalysis>
  savedUrls: ReadonlySet<string>
}

export function VoiceOrbSurface({
  level,
  state,
  isMuted,
  onStart,
  onToggleMute,
  productDisplay,
  analyses,
  savedUrls,
}: VoiceOrbSurfaceProps) {
  const reduced = useReducedMotion()
  const path = useMemo(() => arc({ strength: 0.08 }), [])
  const label =
    state === 'idle'
      ? 'Start voice conversation'
      : state === 'error'
        ? 'Voice unavailable. Try again'
        : 'End voice conversation'

  return (
    <div className={`commerce-agent ${productDisplay.isOpen ? 'has-products' : ''}`}>
      <motion.section
        className="voice-agent"
        aria-labelledby="voice-title"
        layout="position"
        transition={{ layout: { type: 'spring', stiffness: 100, damping: 24, path } }}
      >
        <motion.div className="voice-intro" layout="position">
          <span className="eyebrow">Your personal shopping assistant</span>
          <h1 id="voice-title">
            Less browsing.
            <br />
            <span>More finding.</span>
          </h1>
          <p>Tell me what you need. I'll research the details.</p>
        </motion.div>
        <motion.div
          className="voice-orb-frame"
          layout="position"
          transition={{ layout: { type: 'spring', stiffness: 100, damping: 24, path } }}
        >
          <MotionButton
            whileHover={reduced ? undefined : { scale: 1.025 }}
            whileTap={reduced ? undefined : { scale: 0.97 }}
            type="button"
            isIconOnly
            variant="ghost"
            className="voice-orb"
            data-state={state}
            aria-label={label}
            title={label}
            onPress={onStart}
          >
            <VoiceOrbArt state={state} level={level} />
          </MotionButton>
        </motion.div>
        <motion.div className="voice-controls" layout="position">
          <VoiceStatus state={state} />
          {state !== 'idle' ? (
            <MicrophoneMuteButton isMuted={isMuted} onToggle={onToggleMute} />
          ) : null}
        </motion.div>
        <motion.p className="voice-guidance" layout="position">
          {state === 'idle'
            ? 'Try “Smooth whole-bean coffee under €25.”'
            : state === 'error'
              ? 'Check microphone access, then tap the orb to reconnect.'
              : 'Speak naturally. Tap the orb to end the conversation.'}
        </motion.p>
      </motion.section>
      <ProductResults
        isOpen={productDisplay.isOpen}
        heading={productDisplay.heading}
        products={productDisplay.products}
        analyses={analyses}
        savedUrls={savedUrls}
        view={productDisplay.view}
        sort={productDisplay.sort}
      />
    </div>
  )
}
