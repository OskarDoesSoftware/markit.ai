import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { chatModel, generateSubscriptionImage } from '../../scripts/subscription-image'

const root = join(import.meta.dir, '..')
const output = join(root, 'public', 'art')
const imageModel =
  process.argv.find((arg) => arg.startsWith('--model='))?.slice(8) ?? 'gpt-2.5-sunburst'
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
  const image = await generateSubscriptionImage(prompt, '1024x1024', imageModel)
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
