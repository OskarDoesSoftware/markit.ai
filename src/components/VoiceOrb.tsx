import { useMotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import type {
  ProductAnalysis,
  ProductCardData,
  ProductSortMode,
  ProductViewMode,
} from '@/product-types'
import { INPUT_RATE, base64ToPcm, bytesToBase64, floatToPcm16, resample } from '@/realtime-audio'
import type { ActiveOutput, AudioRuntime, RealtimeMessage } from '@/realtime-client-types'

import { VoiceOrbSurface } from './VoiceOrbSurface'
import type { OrbState } from './VoiceStatus'

type VoiceOrbProps = {
  conversationId?: string
  onConversationUpdated: () => void
}

const MAX_USER_TURN_MS = 5_000

export function VoiceOrb({ conversationId, onConversationUpdated }: VoiceOrbProps) {
  const [state, setState] = useState<OrbState>('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [productDisplay, setProductDisplay] = useState<{
    isOpen: boolean
    heading: string
    products: ProductCardData[]
    view: ProductViewMode
    sort: ProductSortMode
  }>({ isOpen: false, heading: 'Current picks', products: [], view: 'list', sort: 'relevance' })
  const [analyses, setAnalyses] = useState<Record<string, ProductAnalysis>>({})
  const [savedUrls, setSavedUrls] = useState<ReadonlySet<string>>(new Set())
  const socketRef = useRef<WebSocket | null>(null)
  const audioRef = useRef<AudioRuntime | null>(null)
  const audioLevel = useMotionValue(0)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const playbackAtRef = useRef(0)
  const playbackSourcesRef = useRef(new Set<AudioBufferSourceNode>())
  const playbackGenerationRef = useRef(0)
  const activeOutputRef = useRef<ActiveOutput | null>(null)
  const activeResponseRef = useRef<string | null>(null)
  const interruptedResponsesRef = useRef(new Set<string>())
  const toolActiveRef = useRef(false)
  const pendingToolCallRef = useRef<string | null>(null)
  const sessionReadyRef = useRef(false)
  const runningRef = useRef(false)
  const mutedRef = useRef(false)
  const mountedRef = useRef(true)
  const turnDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnResponseRequestedRef = useRef(false)

  const clearTurnDeadline = () => {
    if (turnDeadlineRef.current) clearTimeout(turnDeadlineRef.current)
    turnDeadlineRef.current = null
  }

  const requestTurnResponse = (socket: WebSocket, commitAudio: boolean) => {
    if (
      turnResponseRequestedRef.current ||
      socket.readyState !== WebSocket.OPEN ||
      toolActiveRef.current ||
      pendingToolCallRef.current
    ) {
      return
    }
    turnResponseRequestedRef.current = true
    clearTurnDeadline()
    if (commitAudio) socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
    socket.send(JSON.stringify({ type: 'response.create' }))
    setState('thinking')
  }

  const setLevel = (level: number) => {
    audioLevel.set(Math.max(0, Math.min(1, level)))
  }

  const signalToolReady = () => {
    const callId = pendingToolCallRef.current
    const socket = socketRef.current
    if (!callId || playbackSourcesRef.current.size > 0 || socket?.readyState !== WebSocket.OPEN)
      return
    pendingToolCallRef.current = null
    socket.send(JSON.stringify({ type: 'markit.tool.ready', call_id: callId }))
  }

  const haltPlayback = (socket?: WebSocket, truncate = false) => {
    const context = playbackContextRef.current
    const output = activeOutputRef.current
    if (truncate && context && output && socket?.readyState === WebSocket.OPEN) {
      const audioEndMs = Math.max(0, Math.round((context.currentTime - output.startedAt) * 1000))
      socket.send(
        JSON.stringify({
          type: 'conversation.item.truncate',
          item_id: output.itemId,
          content_index: output.contentIndex,
          audio_end_ms: audioEndMs,
        }),
      )
    }

    playbackGenerationRef.current += 1
    for (const source of playbackSourcesRef.current) {
      try {
        source.stop()
      } catch {}
      source.disconnect()
    }
    playbackSourcesRef.current.clear()
    playbackAtRef.current = context?.currentTime ?? 0
    activeOutputRef.current = null
    setLevel(0.08)
  }

  const shutdown = (updateState = true) => {
    runningRef.current = false
    const socket = socketRef.current
    socketRef.current = null
    socket?.close()

    const audio = audioRef.current
    audioRef.current = null
    if (audio) {
      audio.processor.disconnect()
      audio.source.disconnect()
      audio.silentGain.disconnect()
      for (const track of audio.stream.getTracks()) track.stop()
      void audio.context.close()
    }

    haltPlayback()
    if (playbackContextRef.current) void playbackContextRef.current.close()
    playbackContextRef.current = null
    playbackAtRef.current = 0
    activeResponseRef.current = null
    interruptedResponsesRef.current.clear()
    toolActiveRef.current = false
    pendingToolCallRef.current = null
    sessionReadyRef.current = false
    clearTurnDeadline()
    turnResponseRequestedRef.current = false
    setLevel(0)
    if (updateState && mountedRef.current) {
      setProductDisplay({
        isOpen: false,
        heading: 'Current picks',
        products: [],
        view: 'list',
        sort: 'relevance',
      })
      setAnalyses({})
      setState('idle')
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      shutdown(false)
    }
  }, [])

  const playAudio = (base64: string, output: Omit<ActiveOutput, 'startedAt'>) => {
    const pcm = base64ToPcm(base64)
    const context = playbackContextRef.current
    if (!context || !pcm.length) return

    const currentOutput = activeOutputRef.current
    if (
      currentOutput &&
      (currentOutput.itemId !== output.itemId || currentOutput.responseId !== output.responseId)
    ) {
      haltPlayback()
    }

    const buffer = context.createBuffer(1, pcm.length, INPUT_RATE)
    const channel = buffer.getChannelData(0)
    let peak = 0
    for (let index = 0; index < pcm.length; index += 1) {
      channel[index] = (pcm[index] ?? 0) / 0x8000
      peak = Math.max(peak, Math.abs(channel[index] ?? 0))
    }

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startsAt = Math.max(context.currentTime, playbackAtRef.current)
    if (!activeOutputRef.current) activeOutputRef.current = { ...output, startedAt: startsAt }
    const generation = playbackGenerationRef.current
    playbackSourcesRef.current.add(source)
    source.start(startsAt)
    playbackAtRef.current = startsAt + buffer.duration
    setLevel(Math.max(0.16, peak))

    source.addEventListener('ended', () => {
      source.disconnect()
      playbackSourcesRef.current.delete(source)
      if (
        generation === playbackGenerationRef.current &&
        playbackSourcesRef.current.size === 0 &&
        context.currentTime >= playbackAtRef.current - 0.04
      ) {
        activeOutputRef.current = null
        setLevel(0.08)
        if (runningRef.current && !pendingToolCallRef.current) setState('listening')
        signalToolReady()
      }
    })
  }

  const start = async () => {
    if (runningRef.current) {
      shutdown()
      return
    }

    mutedRef.current = false
    setIsMuted(false)
    runningRef.current = true
    setState('connecting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      if (!runningRef.current) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      for (const track of stream.getAudioTracks()) track.enabled = !mutedRef.current

      const context = new AudioContext()
      const playbackContext = new AudioContext({ sampleRate: INPUT_RATE })
      await Promise.all([context.resume(), playbackContext.resume()])
      if (!runningRef.current) {
        for (const track of stream.getTracks()) track.stop()
        void context.close()
        void playbackContext.close()
        return
      }
      playbackContextRef.current = playbackContext
      playbackAtRef.current = playbackContext.currentTime

      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const silentGain = context.createGain()
      silentGain.gain.value = 0
      source.connect(processor)
      processor.connect(silentGain)
      silentGain.connect(context.destination)
      audioRef.current = { context, stream, source, processor, silentGain }

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ''
      const socket = new WebSocket(`${protocol}//${location.host}/api/realtime${query}`)
      socketRef.current = socket

      socket.addEventListener('open', () => {
        if (!runningRef.current || socketRef.current !== socket) return
        socket.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              model: 'gpt-realtime-2.1',
              reasoning: { effort: 'low' },
              output_modalities: ['audio'],
              audio: {
                input: {
                  format: { type: 'audio/pcm', rate: INPUT_RATE },
                  transcription: { model: 'gpt-realtime-whisper', delay: 'low' },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.55,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                    create_response: false,
                    interrupt_response: true,
                  },
                },
                output: { format: { type: 'audio/pcm', rate: INPUT_RATE }, voice: 'marin' },
              },
            },
          }),
        )
      })

      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string' || socketRef.current !== socket) return
        const message = JSON.parse(event.data) as RealtimeMessage

        if (message.type === 'session.updated') {
          sessionReadyRef.current = true
          setState('listening')
        } else if (message.type === 'response.created') {
          clearTurnDeadline()
          turnResponseRequestedRef.current = true
          const responseId = message.response?.id
          if (responseId && activeResponseRef.current && activeResponseRef.current !== responseId) {
            haltPlayback()
          }
          activeResponseRef.current = responseId ?? null
          setState('thinking')
        } else if (message.type === 'response.output_audio.delta') {
          if (
            !toolActiveRef.current &&
            message.delta &&
            message.item_id &&
            message.response_id &&
            !interruptedResponsesRef.current.has(message.response_id)
          ) {
            setState('speaking')
            playAudio(message.delta, {
              itemId: message.item_id,
              responseId: message.response_id,
              contentIndex: message.content_index ?? 0,
            })
          }
        } else if (message.type === 'input_audio_buffer.speech_started') {
          if (toolActiveRef.current || pendingToolCallRef.current) return
          clearTurnDeadline()
          turnResponseRequestedRef.current = false
          turnDeadlineRef.current = setTimeout(
            () => requestTurnResponse(socket, true),
            MAX_USER_TURN_MS,
          )
          const responseId = activeOutputRef.current?.responseId ?? activeResponseRef.current
          if (responseId) interruptedResponsesRef.current.add(responseId)
          haltPlayback(socket, true)
          if (!toolActiveRef.current) setState('listening')
        } else if (message.type === 'input_audio_buffer.speech_stopped') {
          clearTurnDeadline()
          requestTurnResponse(socket, false)
        } else if (message.type === 'markit.status') {
          if (message.status === 'searching') setState('searching')
          else if (message.status === 'validating') setState('validating')
          else if (message.status === 'thinking') setState('thinking')
          else if (message.status === 'search-error') setState('search-error')
          else if (message.status === 'validation-error') setState('validation-error')
        } else if (message.type === 'markit.tool') {
          if (message.phase === 'waiting' && message.call_id) {
            pendingToolCallRef.current = message.call_id
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
            }
            window.setTimeout(signalToolReady, 120)
          } else {
            toolActiveRef.current = message.phase === 'started'
          }
          if (message.phase === 'started') {
            setState(
              message.tool === 'search_products'
                ? 'searching'
                : message.tool === 'validate_product_results'
                  ? 'validating'
                  : 'thinking',
            )
          }
        } else if (message.type === 'markit.products') {
          if (message.action === 'show' && message.products?.length) {
            setProductDisplay({
              isOpen: true,
              heading: message.heading || 'Current picks',
              products: message.products,
              view: message.view ?? productDisplay.view,
              sort: message.sort ?? productDisplay.sort,
            })
          } else if (message.action === 'close') {
            setProductDisplay({
              isOpen: false,
              heading: 'Current picks',
              products: [],
              view: 'list',
              sort: 'relevance',
            })
            setAnalyses({})
          }
        } else if (message.type === 'markit.analysis') {
          const { url, analysis } = message
          if (url && analysis) {
            setAnalyses((previous) => ({ ...previous, [url]: analysis }))
          }
        } else if (message.type === 'markit.conversation.updated') {
          onConversationUpdated()
        } else if (message.type === 'markit.listings' && message.listings?.length) {
          setSavedUrls((previous) => {
            const updated = new Set(previous)
            for (const listing of message.listings ?? []) updated.add(listing.url)
            return updated
          })
        } else if (message.type === 'response.done') {
          const responseId = message.response?.id
          if (responseId) interruptedResponsesRef.current.delete(responseId)
          if (!responseId || activeResponseRef.current === responseId) {
            activeResponseRef.current = null
          }
          turnResponseRequestedRef.current = false
        } else if (message.type === 'error') {
          setState('error')
        }
      })

      socket.addEventListener('close', () => {
        if (socketRef.current === socket && runningRef.current) setState('error')
      })
      socket.addEventListener('error', () => {
        if (socketRef.current === socket && runningRef.current) setState('error')
      })

      processor.addEventListener('audioprocess', (event) => {
        if (
          !runningRef.current ||
          !sessionReadyRef.current ||
          mutedRef.current ||
          socketRef.current !== socket
        )
          return
        const input = event.inputBuffer.getChannelData(0)
        let sum = 0
        for (const sample of input) sum += sample * sample
        const level = Math.sqrt(sum / input.length)
        if (playbackSourcesRef.current.size === 0) setLevel(Math.min(1, level * 7))
        if (toolActiveRef.current || pendingToolCallRef.current) return
        if (socket.readyState !== WebSocket.OPEN) return
        const pcm = floatToPcm16(resample(input, context.sampleRate))
        socket.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: bytesToBase64(new Uint8Array(pcm.buffer)),
          }),
        )
      })
    } catch {
      shutdown(false)
      if (mountedRef.current) setState('error')
    }
  }

  const toggleMute = () => {
    const nextMuted = !mutedRef.current
    mutedRef.current = nextMuted
    setIsMuted(nextMuted)
    for (const track of audioRef.current?.stream.getAudioTracks() ?? []) track.enabled = !nextMuted
    if (nextMuted) {
      clearTurnDeadline()
      turnResponseRequestedRef.current = false
      setLevel(0.08)
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
      }
    }
  }

  return (
    <VoiceOrbSurface
      level={audioLevel}
      state={state}
      isMuted={isMuted}
      onStart={() => void start()}
      onToggleMute={toggleMute}
      productDisplay={productDisplay}
      analyses={analyses}
      savedUrls={savedUrls}
    />
  )
}
