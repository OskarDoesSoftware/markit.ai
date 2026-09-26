import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { chatModel, generateSubscriptionImage, imageModel } from './subscription-image'

const root = join(import.meta.dir, '..')
const publicDir = join(root, 'public', 'brand')
const sourceDir = join(root, 'scripts', 'artwork')
const prompt =
  'A premium widescreen editorial brand image for Markit.ai, a calm voice-first shopping assistant. ' +
  'One luminous frosted glass sphere on the RIGHT third, wrapped in three delicate elliptical ' +
  'ribbons like a gentle voice signal finding its rhythm. A small ivory coffee cup and a few coffee ' +
  'beans below it subtly connect to the specialty-coffee shopping story. Beautiful tactile matte ' +
  'surfaces. Soft lavender #dcd4ff, peach #ffd9c9 and mint #cff3df light on warm ivory #faf7f2. ' +
  'The entire LEFT 55 percent is almost empty warm ivory negative space for typography to be added ' +
  'later. Diffuse natural studio lighting, refined shadows, calm rather than busy, not neon. ' +
  'All key objects within the central vertical 65 percent, safe for a 1200x630 crop. ' +
  'Absolutely no text, lettering, numbers, logos, watermarks, people, screens, UI or fake product claims.'

await Promise.all([mkdir(publicDir, { recursive: true }), mkdir(sourceDir, { recursive: true })])
const backgroundPath = join(sourceDir, 'brand-background.webp')
if (!(await Bun.file(backgroundPath).exists()) || process.argv.includes('--force')) {
  const source = await generateSubscriptionImage(prompt, '1536x1024')
  await sharp(source)
    .resize(1200, 630, { fit: 'cover' })
    .webp({ quality: 92 })
    .toFile(backgroundPath)
  await Bun.write(
    join(sourceDir, 'brand-background.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        authentication: 'Pi OpenAI Codex subscription; no API key',
        imageModel,
        chatModel,
        prompt,
        sha256: createHash('sha256')
          .update(await Bun.file(backgroundPath).bytes())
          .digest('hex'),
      },
      null,
      2,
    ) + '\n',
  )
}

const type = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="wash"><stop stop-color="#faf7f2"/><stop offset=".52" stop-color="#faf7f2" stop-opacity=".98"/><stop offset=".76" stop-color="#faf7f2" stop-opacity="0"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#wash)"/>
  <g font-family="DejaVu Sans, sans-serif" fill="#252332">
    <text x="118" y="99" font-size="32" font-weight="700" letter-spacing="-1.5">markit.ai</text>
    <text x="64" y="220" font-size="16" font-weight="600" letter-spacing="2.5" fill="#69518f">YOUR VOICE. YOUR NEXT FIND.</text>
    <text x="60" y="308" font-size="65" font-weight="700" letter-spacing="-3">Less browsing.</text>
    <text x="60" y="382" font-size="65" font-weight="700" letter-spacing="-3" fill="#69518f">More finding.</text>
    <text x="64" y="440" font-size="22" fill="#605c6d">A more human way to shop.</text>
    <text x="64" y="563" font-size="16" fill="#605c6d">Voice-first shopping · Live research · Clear evidence</text>
  </g>
</svg>`)
const logoSource = await Bun.file(join(root, 'public', 'logo.svg')).text()
const logo = await sharp(Buffer.from(logoSource.replace('fill="#ffffff"', 'fill="#252332"')))
  .resize(38, 40)
  .png()
  .toBuffer()
const social = await sharp(backgroundPath)
  .composite([{ input: type }, { input: logo, left: 65, top: 66 }])
  .png()
  .toBuffer()
const hash = createHash('sha256').update(social).digest('hex').slice(0, 12)
const filename = `markit-social-${hash}.png`
await Bun.write(join(publicDir, filename), social)
await Bun.write(
  join(root, 'src', 'brand-assets.json'),
  JSON.stringify(
    {
      socialImage: `/brand/${filename}`,
      width: 1200,
      height: 630,
      alt: 'Markit.ai — Less browsing. More finding. A pastel glass voice orb wrapped in lavender, peach and mint ribbons.',
    },
    null,
    2,
  ) + '\n',
)
console.log(`Created ${filename}: 1200×630, Pi subscription artwork with crisp local typography.`)

const favicon = logoSource
  .slice(logoSource.indexOf('<svg'))
  .replace(/<metadata>[\s\S]*?<\/metadata>/, '')
  .replace('fill="#ffffff"', 'fill="#69518f"')
  .replace(
    '</svg>',
    '<style>@media (prefers-color-scheme: dark) { g { fill: #dfc8f8; } }</style></svg>',
  )
await Bun.write(join(root, 'public', 'favicon.svg'), favicon)
const touchIcon = await sharp(Buffer.from(favicon)).resize(132, 138).png().toBuffer()
await sharp({ create: { width: 180, height: 180, channels: 4, background: '#faf7f2' } })
  .composite([{ input: touchIcon, left: 24, top: 21 }])
  .png()
  .toFile(join(publicDir, 'apple-touch-icon.png'))

const deckPath = join(root, 'presentation', 'public', 'index.html')
const deck = await Bun.file(deckPath).text()
const socialTags = `<!-- brand-social:start -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Markit.ai — Less browsing. More finding." />
    <meta property="og:description" content="A more human way to shop. Meet Jan and his voice-first shopping assistant." />
    <meta property="og:url" content="https://markit-ai-presentation.dalist.workers.dev/" />
    <meta property="og:image" content="https://markit-ai.dalist.workers.dev/brand/${filename}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Markit.ai — Less browsing. More finding. A pastel voice orb with soft lavender, peach and mint ribbons." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://markit-ai.dalist.workers.dev/brand/${filename}" />
    <!-- brand-social:end -->`
if (!deck.includes('<!-- brand-social:start -->'))
  throw new Error('Missing presentation social metadata marker')
await Bun.write(
  deckPath,
  deck.replace(/<!-- brand-social:start -->[\s\S]*?<!-- brand-social:end -->/, socialTags),
)
