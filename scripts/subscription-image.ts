import { homedir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

export const imageModel = 'gpt-2.5-sunburst'
export const chatModel = 'gpt-5.6-sol'

const eventSchema = z.object({
  type: z.string(),
  item: z.object({ type: z.string(), result: z.string().optional() }).optional(),
})

async function readImage(body: ReadableStream<Uint8Array>) {
  let pending = ''
  let image: string | undefined
  let completed = false
  const decoder = new TextDecoder()
  function consume(line: string) {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    const event = eventSchema.parse(JSON.parse(data))
    if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
      throw new Error(`Generation stopped (${event.type}); no retry or credential fallback.`)
    }
    if (
      event.type === 'response.output_item.done' &&
      event.item?.type === 'image_generation_call'
    ) {
      image = event.item.result
    }
    if (event.type === 'response.completed') completed = true
  }
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true })
    let boundary: number
    while ((boundary = pending.indexOf('\n')) !== -1) {
      consume(pending.slice(0, boundary).trimEnd())
      pending = pending.slice(boundary + 1)
    }
  }
  consume(pending + decoder.decode())
  if (!image || !completed) throw new Error('No completed image result; no assets written.')
  return Buffer.from(image, 'base64')
}

export async function generateSubscriptionImage(
  prompt: string,
  size: '1024x1024' | '1536x1024' = '1024x1024',
  model = imageModel,
) {
  const authPath = join(
    process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent'),
    'auth.json',
  )
  const authFile: unknown = await Bun.file(authPath).json()
  const auth = z
    .object({
      'openai-codex': z.object({ access: z.string().min(1), accountId: z.string().min(1) }),
    })
    .parse(authFile)['openai-codex']
  const response = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    signal: AbortSignal.timeout(300_000),
    headers: {
      Authorization: `Bearer ${auth.access}`,
      'chatgpt-account-id': auth.accountId,
      originator: 'pi',
      'OpenAI-Beta': 'responses=experimental',
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: chatModel,
      instructions: `Call image_generation exactly once with model ${model}. Follow the brief.`,
      store: false,
      stream: true,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      tools: [{ type: 'image_generation', model, size }],
      tool_choice: { type: 'image_generation' },
    }),
  })
  if (!response.ok || !response.body) {
    throw new Error(
      `Image generation HTTP ${response.status}; stopped without retry. Raw errors are not logged.`,
    )
  }
  return readImage(response.body)
}
