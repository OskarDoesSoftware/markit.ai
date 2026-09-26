import {
  motion,
  useInView,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import type { OrbState } from './VoiceStatus'

import './VoiceOrbArt.css'

const ORBITS = [
  { tilt: 64, turn: -24, twist: 12 },
  { tilt: 72, turn: 36, twist: -32 },
  { tilt: 52, turn: -56, twist: 68 },
]

export function VoiceOrbArt({ state, level }: { state: OrbState; level: MotionValue<number> }) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { amount: 0.2 })
  const reduced = useReducedMotion()
  const [isPageVisible, setPageVisible] = useState(false)
  const amplitude = useSpring(level, { stiffness: 170, damping: 26, mass: 0.6 })
  const scale = useTransform(amplitude, [0, 1], [1, 1.065])
  const signalScale = useTransform(amplitude, [0, 1], [1, 1.15])
  const glowOpacity = useTransform(amplitude, [0, 1], [0.4, 0.7])
  const isWorking = ['connecting', 'thinking', 'searching', 'validating'].includes(state)
  const canAnimate = !reduced && isInView && isPageVisible

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  return (
    <span
      ref={ref}
      className="brand-orb"
      aria-hidden="true"
      data-motion={canAnimate ? 'active' : 'still'}
    >
      <motion.span
        className="brand-orb-glow"
        style={{ opacity: canAnimate ? glowOpacity : 0.4, scale: canAnimate ? signalScale : 1 }}
      />
      <motion.span className="brand-orb-sphere" style={{ scale: canAnimate ? scale : 1 }}>
        <span className="brand-orb-light" />
        <span className="brand-orb-core" />
      </motion.span>
      <motion.span className="brand-orb-signal" style={{ scale: canAnimate ? signalScale : 1 }}>
        {ORBITS.map((orbit, index) => (
          <motion.span
            key={orbit.twist}
            className="brand-orb-orbit"
            initial={false}
            animate={{
              rotateX: reduced ? orbit.tilt : isWorking ? 70 + index * 5 : orbit.tilt,
              rotateY: reduced ? orbit.turn : state === 'speaking' ? orbit.turn * 0.6 : orbit.turn,
              rotateZ:
                canAnimate && isWorking
                  ? [orbit.twist, orbit.twist + 24, orbit.twist - 12, orbit.twist]
                  : orbit.twist,
              opacity: state === 'error' ? 0.3 : 0.65,
            }}
            transition={{
              rotateX: canAnimate
                ? { type: 'spring', stiffness: 80, damping: 20 }
                : { duration: 0 },
              rotateY: canAnimate
                ? { type: 'spring', stiffness: 80, damping: 20 }
                : { duration: 0 },
              rotateZ:
                canAnimate && isWorking
                  ? { duration: 3.6 + index * 0.5, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: canAnimate ? 0.5 : 0 },
              opacity: { duration: 0.2 },
            }}
          >
            <span className="brand-orb-bead" />
          </motion.span>
        ))}
      </motion.span>
    </span>
  )
}
