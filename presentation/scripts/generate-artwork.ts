import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import sharp from 'sharp'
import { z } from 'zod'

const root = join(import.meta.dir, '..')
const output = join(root, 'public', 'art')
const imageModel =
  process.argv.find((arg) => arg.startsWith('--model='))?.slice(8) ?? 'gpt-2.5-sunburst'
const chatModel = 'gpt-5.6-sol'
const direction =
  'Premium editorial still life for Markit.ai, a voice-first shopping research assistant. ' +
  'Soft lavender #dcd4ff, warm peach #ffd9c9, pale mint #cff3df and warm ivory #faf7f2. ' +
  'Beautiful tactile matte ceramic and frosted glass, quiet natural lighting, soft shadows, ' +
  'subtle sunburst diffusion, generous negative space, contemporary art direction. ' +
  'No text, letters, logos, numbers, price tags, watermarks, people or screenshots. ' +
  'Not neon, not oversaturated. Keep all subjects inside the central 75 percent of a square frame.'
const briefs = {
  'coffee-ritual':
    'An inviting coffee ritual: a sculptural ivory ceramic cup of coffee, one unbranded pale ' +
    'lavender whole-bean coffee pouch and a small scattering of coffee beans on a softly curved ' +
    'peach plinth. Pale mint backdrop with lavender ambient light. Three-quarter editorial view. ' +
    'This is conceptual artwork for Jan, who wants smooth whole-bean coffee under €25, not a real listing.',
  'voice-orbit':
    'A single luminous frosted glass sphere floating over a warm ivory surface, with a delicate ' +
    'ribbon orbiting it like a spoken thought. Lavender and peach light within the sphere, ' +
    'mint reflected below. Peaceful, airy, sculptural, almost photographic. A visual metaphor ' +
    'for a calm voice assistant that moves shopping research away from dense screens.',
} as const

await mkdir(output, { recursive: true })

if (process.argv.includes('--portraits')) {
  for (const width of [480, 960]) {
    await sharp(join(root, 'public', 'jan-cutout.png'))
      .resize({ width })
      .webp({ quality: 85, effort: 6 })
      .toFile(join(output, `jan-${width}.webp`))
  }
  for (const name of ['oskar', 'denys', 'dalist', 'frensi']) {
    await sharp(join(root, 'public', `team-${name}.png`))
      .webp({ quality: 85, effort: 6 })
      .toFile(join(output, `team-${name}.webp`))
  }
  console.log('Optimized original portraits without altering their content.')
  process.exit(0)
}

const selected = process.argv.filter((arg) => Object.hasOwn(briefs, arg))
if (!selected.length) throw new Error(`Select an artwork slug: ${Object.keys(briefs).join(', ')}`)

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

for (const slug of selected) {
  const brief = briefs[slug as keyof typeof briefs]
  if (
    !process.argv.includes('--force') &&
    (await Bun.file(join(output, `${slug}.webp`)).exists())
  ) {
    console.log(`${slug}: already exists (use --force to regenerate).`)
    continue
  }
  const prompt = `${brief}\n\n${direction}`
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
      instructions: `Call image_generation exactly once with model ${imageModel}. Follow the brief.`,
      store: false,
      stream: true,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] }],
      tools: [{ type: 'image_generation', model: imageModel, size: '1024x1024' }],
      tool_choice: { type: 'image_generation' },
    }),
  })
  if (!response.ok || !response.body) {
    // Never print upstream bodies: providers may echo request or account details.
    throw new Error(
      `Image generation HTTP ${response.status} for ${imageModel}; stopped without retry.`,
    )
  }
  const image = await readImage(response.body)
  const files = []
  for (const width of [640, 1024]) {
    const name = width === 1024 ? `${slug}.webp` : `${slug}-${width}.webp`
    const bytes = await sharp(image)
      .resize(width, width)
      .webp({ quality: 84, effort: 6 })
      .toBuffer()
    await Bun.write(join(output, name), bytes)
    files.push({ name, width, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  await mkdir(join(root, 'artwork'), { recursive: true })
  await Bun.write(
    join(root, 'artwork', `${slug}.json`),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        authentication: 'Pi OpenAI Codex subscription; no API key',
        chatModel,
        imageModel,
        prompt,
        files,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`${slug}: generated with ${imageModel} through the Pi subscription.`)
}
