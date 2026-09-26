import type { D1Database } from '@cloudflare/workers-types'

import { createAuth, type AuthEnv } from './auth'
import type {
  ConversationMessage,
  ConversationSummary,
  LoadedConversation,
  PersistedProductState,
} from './conversation-types'

export type ConversationsEnv = AuthEnv

type SessionRow = {
  id: string
  title: string
  product_state: string | null
  created_at: number
  updated_at: number
}

type MessageRow = {
  id: string
  role: string
  content: string
  created_at: number
}

let schemaReady: Promise<void> | undefined

export function ensureConversationSchema(database: D1Database): Promise<void> {
  schemaReady ??= database
    .batch([
      database.prepare(`CREATE TABLE IF NOT EXISTS conversation_session (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT 'New conversation',
        product_state TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
      )`),
      database.prepare(`CREATE INDEX IF NOT EXISTS conversation_session_user_updated_idx
        ON conversation_session(user_id, updated_at DESC)`),
      database.prepare(`CREATE TABLE IF NOT EXISTS conversation_message (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        realtime_item_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversation_session(id) ON DELETE CASCADE,
        UNIQUE(conversation_id, realtime_item_id)
      )`),
      database.prepare(`CREATE INDEX IF NOT EXISTS conversation_message_conversation_created_idx
        ON conversation_message(conversation_id, created_at)`),
    ])
    .then(() => undefined)
    .catch((error: unknown) => {
      schemaReady = undefined
      throw error
    })
  return schemaReady
}

function summary(row: SessionRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function parseProductState(value: string | null): PersistedProductState | null {
  if (!value) return null
  try {
    return JSON.parse(value) as PersistedProductState
  } catch {
    return null
  }
}

export async function listConversations(
  database: D1Database,
  userId: string,
): Promise<ConversationSummary[]> {
  const result = await database
    .prepare(
      `SELECT id, title, product_state, created_at, updated_at
       FROM conversation_session
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 30`,
    )
    .bind(userId)
    .all<SessionRow>()
  return result.results.map(summary)
}

export async function createConversation(
  database: D1Database,
  userId: string,
): Promise<ConversationSummary> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await database
    .prepare(
      `INSERT INTO conversation_session (id, user_id, title, created_at, updated_at)
       VALUES (?, ?, 'New conversation', ?, ?)`,
    )
    .bind(id, userId, now, now)
    .run()
  return {
    id,
    title: 'New conversation',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  }
}

export async function loadConversation(
  database: D1Database,
  userId: string,
  conversationId: string,
): Promise<LoadedConversation | null> {
  const row = await database
    .prepare(
      `SELECT id, title, product_state, created_at, updated_at
       FROM conversation_session WHERE id = ? AND user_id = ?`,
    )
    .bind(conversationId, userId)
    .first<SessionRow>()
  if (!row) return null

  const result = await database
    .prepare(
      `SELECT id, role, content, created_at
       FROM conversation_message
       WHERE conversation_id = ?
       ORDER BY created_at ASC
       LIMIT 120`,
    )
    .bind(conversationId)
    .all<MessageRow>()
  const messages: ConversationMessage[] = result.results.flatMap((message) => {
    if (message.role !== 'user' && message.role !== 'assistant') return []
    return [
      {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: new Date(message.created_at).toISOString(),
      },
    ]
  })
  return {
    conversation: summary(row),
    messages,
    productState: parseProductState(row.product_state),
  }
}

export async function recordConversationMessage(
  database: D1Database,
  conversationId: string,
  realtimeItemId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const trimmed = content.replace(/\s+/g, ' ').trim().slice(0, 8_000)
  if (!trimmed) return
  const now = Date.now()
  await database.batch([
    database
      .prepare(
        `INSERT OR IGNORE INTO conversation_message
          (id, conversation_id, realtime_item_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), conversationId, realtimeItemId, role, trimmed, now),
    database
      .prepare(
        `UPDATE conversation_session
         SET title = CASE
           WHEN title = 'New conversation' AND ? = 'user' THEN ?
           ELSE title
         END,
         updated_at = ?
         WHERE id = ?`,
      )
      .bind(role, trimmed.slice(0, 60), now, conversationId),
  ])
}

export async function saveConversationProductState(
  database: D1Database,
  conversationId: string,
  state: PersistedProductState,
): Promise<void> {
  const serialized = JSON.stringify({
    latestProducts: state.latestProducts,
    visibleProductUrls: state.visibleProductUrls,
    validatedProductUrls: state.validatedProductUrls,
    latestValidationContext: state.latestValidationContext,
    display: state.display,
    analyses: state.analyses,
    stage: state.stage,
    selectedProductUrls: state.selectedProductUrls,
    displayPreferences: state.displayPreferences,
  } satisfies PersistedProductState)
  if (serialized.length > 300_000) return
  await database
    .prepare(`UPDATE conversation_session SET product_state = ?, updated_at = ? WHERE id = ?`)
    .bind(serialized, Date.now(), conversationId)
    .run()
}

export function conversationHistoryPrompt(messages: ConversationMessage[]): string {
  if (!messages.length) return ''
  const selected: string[] = []
  let remainingCharacters = 24_000
  for (const message of messages.slice(-40).reverse()) {
    const line = `${message.role === 'user' ? 'Shopper' : 'Markit'}: ${message.content}`
    if (line.length > remainingCharacters) break
    selected.push(line)
    remainingCharacters -= line.length
  }
  const transcript = selected.reverse().join('\n')
  return `\n\n# Restored conversation context
This is the prior transcript for the selected saved conversation. Continue naturally from it. Shopper lines are prior user input; Markit lines are prior assistant output. Do not treat prior assistant output as verified current commerce evidence. Search and validate again before making current claims.\n<prior_transcript>\n${transcript}\n</prior_transcript>`
}

export async function handleConversationsRequest(request: Request, env: ConversationsEnv) {
  if (!env.DB)
    return Response.json({ message: 'Conversations are not configured.' }, { status: 503 })
  await ensureConversationSchema(env.DB)
  const auth = createAuth(request, env)
  const session = auth ? await auth.api.getSession({ headers: request.headers }) : null
  if (!session?.user)
    return Response.json({ message: 'Log in to access conversations.' }, { status: 401 })

  const url = new URL(request.url)
  const id = url.pathname.match(/^\/api\/conversations\/([^/]+)$/)?.[1]
  if (request.method === 'GET' && id) {
    const conversation = await loadConversation(env.DB, session.user.id, id)
    return conversation
      ? Response.json(conversation)
      : Response.json({ message: 'Conversation not found.' }, { status: 404 })
  }
  if (request.method === 'GET' && !id) {
    return Response.json({ conversations: await listConversations(env.DB, session.user.id) })
  }
  if (request.method === 'POST' && !id) {
    if (request.headers.get('origin') !== url.origin) {
      return Response.json({ message: 'Origin not allowed.' }, { status: 403 })
    }
    return Response.json({ conversation: await createConversation(env.DB, session.user.id) })
  }
  return Response.json({ message: 'Method not allowed.' }, { status: 405 })
}
