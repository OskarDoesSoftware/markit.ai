import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'

import { AccountBar, AccountProvider } from '@/account'
import brandAssets from '@/brand-assets.json'

import appCss from '@/index.css?url'

const siteUrl = 'https://markit-ai.dalist.workers.dev'
const title = 'Markit.ai — Less browsing. More finding.'
const description =
  'A more human way to shop. Tell Markit what you need and explore live product research, clear budgets, and evidence you can inspect.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'theme-color', content: '#faf7f2', media: '(prefers-color-scheme: light)' },
      { name: 'theme-color', content: '#1c1924', media: '(prefers-color-scheme: dark)' },
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Markit.ai' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: siteUrl },
      { property: 'og:image', content: `${siteUrl}${brandAssets.socialImage}` },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: String(brandAssets.width) },
      { property: 'og:image:height', content: String(brandAssets.height) },
      { property: 'og:image:alt', content: brandAssets.alt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: `${siteUrl}${brandAssets.socialImage}` },
      { name: 'twitter:image:alt', content: brandAssets.alt },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg?v=soft-1', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/brand/apple-touch-icon.png' },
    ],
  }),
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <MotionConfig reducedMotion="user">
          <AccountProvider>
            <AccountBar />
            <Outlet />
          </AccountProvider>
        </MotionConfig>
        <Scripts />
      </body>
    </html>
  )
}
