import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import handler from '@tanstack/react-start/server-entry'

import { createAuth, handleAuthRequest, type AuthEnv } from './auth'
import {
  conversationHistoryPrompt,
  ensureConversationSchema,
  handleConversationsRequest,
  loadConversation,
  recordConversationMessage,
  saveConversationProductState,
} from './conversations'
import { PriceAlertScheduler } from './price-alert-scheduler'
import { handlePriceAlertsRequest } from './price-alerts'
import {
  getProductToolDefinitions,
  productSystemPromptForCountry,
  searchProducts,
} from './product-agent'
import { analyzeProductListings } from './product-analysis'
import { ProductToolController } from './product-tool-controller'
import { handleSavedListingsRequest, saveListings } from './saved-listings'

type ExecutionContext = {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

type Env = AuthEnv & {
  OPENAI_API_KEY?: string
  EXA_API_KEY?: string
  TELEGRAM_BOT_TOKEN?: string
  ALERT_SCHEDULER?: DurableObjectNamespace
}

export { PriceAlertScheduler }

type WorkerWebSocket = WebSocket & { accept(): void }
type WebSocketPairConstructor = new () => { 0: WorkerWebSocket; 1: WorkerWebSocket }

const startFetch = handler.fetch as unknown as (
  request: Request,
  env: Env,
  context: ExecutionContext,
) => Promise<Response>

type RealtimeToolCall = {
  type: string
  name?: string
  call_id?: string
  arguments?: string
  item_id?: string
  transcript?: string
}

type ConversationPersistence = { database: NonNullable<Env['DB']>; conversationId: string }

function sendJson(socket: WorkerWebSocket, value: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value))
}

async function realtimeSocket(
  request: Request,
  env: Env,
  context: ExecutionContext,
): Promise<Response> {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('WebSocket upgrade required', { status: 426 })
  }

  const origin = request.headers.get('origin')
  if (!origin || new URL(origin).host !== new URL(request.url).host) {
    return new Response('Origin not allowed', { status: 403 })
  }

  if (!env.OPENAI_API_KEY) {
    return new Response('Voice service is not configured', { status: 503 })
  }

  const toolDefinitions = await getProductToolDefinitions()
  const auth = createAuth(request, env)
  const authSession = auth ? await auth.api.getSession({ headers: request.headers }) : null
  const requestedConversationId = new URL(request.url).searchParams.get('conversationId')
  if (requestedConversationId && env.DB) await ensureConversationSchema(env.DB)
  const loadedConversation =
    requestedConversationId && env.DB && authSession?.user
      ? await loadConversation(env.DB, authSession.user.id, requestedConversationId)
      : null
  if (requestedConversationId && !loadedConversation) {
    return new Response('Conversation not found', { status: 404 })
  }
  const productSystemPrompt =
    productSystemPromptForCountry(request.headers.get('cf-ipcountry')) +
    conversationHistoryPrompt(loadedConversation?.messages ?? [])
  const persistence: ConversationPersistence | null =
    loadedConversation && env.DB
      ? { database: env.DB, conversationId: loadedConversation.conversation.id }
      : null

  const openAIResponse = (await fetch('https://api.openai.com/v1/realtime?model=gpt-realtime-2.1', {
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      Upgrade: 'websocket',
      'OpenAI-Safety-Identifier': 'markit-voice-web',
    },
  })) as Response & { webSocket?: WorkerWebSocket | null }
  const upstream = openAIResponse.webSocket
  if (openAIResponse.status !== 101 || !upstream) {
    return new Response('Realtime upstream unavailable', { status: 502 })
  }
  upstream.accept()

  const Pair = globalThis.WebSocketPair as unknown as WebSocketPairConstructor
  const pair = new Pair()
  const client = pair[0]
  const server = pair[1]
  server.accept()
  let restoredClientState = false
  const toolReadyResolvers = new Map<string, () => void>()
  const waitForToolReady = (callId: string) =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timeout)
        toolReadyResolvers.delete(callId)
        resolve()
      }
      const timeout = setTimeout(finish, 10_000)
      toolReadyResolvers.set(callId, finish)
    })

  const productTools = new ProductToolController(
    {
      send: (event) => sendJson(server, event),
      isConnected: () =>
        server.readyState === WebSocket.OPEN && upstream.readyState === WebSocket.OPEN,
      waitForReady: (call) => {
        const ready = waitForToolReady(call.call_id)
        sendJson(server, {
          type: 'markit.tool',
          phase: 'waiting',
          tool: call.name,
          call_id: call.call_id,
        })
        return ready
      },
      search: (input) => {
        if (!env.EXA_API_KEY) throw new Error('Product search is not configured')
        return searchProducts(input, env.EXA_API_KEY)
      },
      validate: (products, validation, onResult) => {
        if (!env.OPENAI_API_KEY) throw new Error('Product validation is not configured')
        return analyzeProductListings(products, validation, env.OPENAI_API_KEY, onResult)
      },
      save: (products) =>
        authSession?.user && env.DB
          ? saveListings(env.DB, authSession.user.id, products)
          : Promise.resolve(null),
      persist: (state) =>
        persistence
          ? saveConversationProductState(persistence.database, persistence.conversationId, state)
          : Promise.resolve(),
      complete: (callId, output) => {
        sendJson(upstream, {
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) },
        })
        sendJson(upstream, { type: 'response.create' })
      },
    },
    loadedConversation?.productState,
  )

  server.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return
    if (upstream.readyState !== WebSocket.OPEN) return
    try {
      const message = JSON.parse(event.data) as {
        type?: string
        session?: Record<string, unknown>
        call_id?: string
      }
      if (message.type === 'markit.tool.ready' && message.call_id) {
        toolReadyResolvers.get(message.call_id)?.()
        return
      }
      if (message.type === 'session.update') {
        upstream.send(
          JSON.stringify({
            ...message,
            session: {
              ...message.session,
              instructions: productSystemPrompt,
              tools: toolDefinitions,
              tool_choice: 'auto',
              parallel_tool_calls: false,
            },
          }),
        )
        return
      }
    } catch {}
    upstream.send(event.data)
  })
  upstream.addEventListener('message', (event) => {
    if (server.readyState !== WebSocket.OPEN) return
    server.send(event.data)
    if (typeof event.data !== 'string') return
    try {
      const message = JSON.parse(event.data) as RealtimeToolCall
      if (message.type === 'session.updated' && !restoredClientState) {
        restoredClientState = true
        productTools.restore()
      }
      const transcriptRole =
        message.type === 'conversation.item.input_audio_transcription.completed'
          ? 'user'
          : message.type === 'response.output_audio_transcript.done'
            ? 'assistant'
            : null
      if (persistence && transcriptRole && message.item_id && message.transcript) {
        context.waitUntil(
          recordConversationMessage(
            persistence.database,
            persistence.conversationId,
            message.item_id,
            transcriptRole,
            message.transcript,
          ).then(() => sendJson(server, { type: 'markit.conversation.updated' })),
        )
      }
      if (
        message.type === 'response.function_call_arguments.done' &&
        (message.name === 'search_products' ||
          message.name === 'validate_product_results' ||
          message.name === 'control_product_display' ||
          message.name === 'save_product_listings') &&
        message.call_id
      ) {
        context.waitUntil(
          productTools.enqueue({
            name: message.name,
            call_id: message.call_id,
            arguments: message.arguments,
          }),
        )
      }
    } catch {}
  })
  upstream.addEventListener('error', () => {
    if (server.readyState === WebSocket.OPEN) {
      server.send(
        JSON.stringify({ type: 'error', error: { message: 'Realtime connection failed' } }),
      )
    }
  })
  upstream.addEventListener('close', (event) => {
    if (server.readyState === WebSocket.OPEN) server.close(event.code, event.reason)
  })
  server.addEventListener('close', () => {
    for (const resolve of toolReadyResolvers.values()) resolve()
    toolReadyResolvers.clear()
    if (upstream.readyState < WebSocket.CLOSING) upstream.close(1000, 'Client disconnected')
  })

  return new Response(null, { status: 101, webSocket: client } as ResponseInit)
}

export default {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> | Response {
    const url = new URL(request.url)
    if (url.pathname === '/api/realtime') return realtimeSocket(request, env, context)
    if (url.pathname.startsWith('/api/auth/')) return handleAuthRequest(request, env)
    if (url.pathname === '/api/listings') return handleSavedListingsRequest(request, env)
    if (url.pathname.startsWith('/api/conversations')) {
      return handleConversationsRequest(request, env)
    }
    if (url.pathname === '/api/price-alerts') return handlePriceAlertsRequest(request, env)
    return startFetch(request, env, context)
  },
}
