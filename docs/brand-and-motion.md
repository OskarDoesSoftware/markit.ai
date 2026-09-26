# Brand, motion, and social previews

## Where is the visual system defined?

- `src/index.css` owns HeroUI's semantic light/dark tokens: warm paper, plum ink,
  lavender, peach, and mint. It matches the [presentation](../presentation/README.md).
- `src/styles/voice.css` owns the assistant composition and responsive surfaces.
  `src/components/VoiceOrbArt.css` owns the static glass/ribbon artwork.
- `VoiceOrbSurface.tsx` composes the orb and status. `VoiceOrbArt.tsx` animates
  them; `ProductCards.tsx` owns card presentation. HeroUI still owns accessible
  buttons, account menus, disclosures, and controlled bottom Drawers.
- `use-is-mobile.ts` is the shared **below 900px** breakpoint. Mobile navigation
  exposes existing sessions and the explicit New thread action; opening it does
  not create a conversation. Product results remain model-controlled.

## What moves, and why?

The bespoke **signal weave** uses three translucent elliptical ribbons around a
pastel glass orb. Research gathers the ribbons into a changing formation; real
microphone/playback amplitude expands the sphere and signal with a damped spring.
Idle is still. It is a live state visualization, not a prerecorded/generated video.

- Audio updates a Motion value rather than React state or an inherited CSS
  variable. Gradients, shadows, and geometry stay static; ongoing motion changes
  only transforms and opacity.
- The orb moves into the desktop results layout on a shallow `arc()` spring.
  Layout geometry changes once; we do not animate grid columns/padding each frame.
  Cards enter with a bounded stagger. No page-wide screenshot transition blocks
  voice controls, and HeroUI retains ownership of the mobile Drawer animation.
- `MotionConfig reducedMotion="user"` and explicit reduced-motion guards keep the
  weave stationary and remove spatial transitions. Offscreen/hidden-page ribbons
  stop, including pending springs. No endless decorative idle animation.
- Motion wraps the HeroUI Button directly, not a second focusable gesture wrapper.
  Initial SSR styles do not depend on a browser-only motion preference.

## Which current Motion guidance informed this?

**Motion 13.4.4** was selected by publish date (2026-09-25), newer than the
`canary` build (2026-08-20), rather than trusting the stable tag alone.

- [Introducing Motion Studio — September 22, 2026](https://motion.dev/magazine/introducing-motion-studio):
  reviewed the new editing workflow. No paid Studio feature or subscription was
  installed or purchased; implementation uses the open-source runtime.
- [A View Transition API for the rest of us — June 30, 2026](https://motion.dev/magazine/a-view-transitions-api-for-the-rest-of-us):
  `animateView` is now core, but its interruption/interaction trade-offs are not
  appropriate for the live assistant. Use transform-based layout motion here.
- [Performance tier list](https://motion.dev/magazine/web-animation-performance-tier-list):
  avoid animated gradients, large blurs, inherited per-frame CSS variables, and
  layout-property loops. Offscreen work must stop.
- Runtime references: [arc](https://motion.dev/docs/arc),
  [layout](https://motion.dev/docs/react-layout-animations),
  [motion values](https://motion.dev/docs/react-motion-value),
  [springs](https://motion.dev/docs/react-use-spring), and
  [accessibility](https://motion.dev/docs/react-accessibility).

## How are OG artwork and icons reproduced?

```bash
bun run images:branding          # Recompose from the retained background
bun run images:branding --force  # Explicit new Pi-subscription image request
```

`scripts/subscription-image.ts` is the shared, subscription-only transport used
by both artwork generators. It uses `gpt-2.5-sunburst` with `gpt-5.6-sol`
orchestration, stops on failure, and has no API-key fallback. It never uses the
demo credential in `e.nv` or the application's production secrets.

`scripts/artwork/` retains the generated background, prompt, model IDs, time, and
hash. `generate-branding.ts` composites the real logo and local DejaVu Sans text
over it: text is not baked inaccurately by the image model. It produces:

- A content-addressed **1200×630 PNG** under `public/brand/`.
- `src/brand-assets.json`, used by server-rendered Open Graph / Twitter metadata.
- Matching light/dark SVG favicon and a 180px Apple touch icon.
- The marked social-metadata block in the presentation, referencing the same PNG.

Regeneration does not delete earlier published images: cached social previews may
still refer to them. Generated artwork is branding, not product or seller evidence.

## How do we check the demo without spending model credits?

```bash
bunx playwright install chromium
bun run test:app
# Existing browser, optional snapshots:
APP_BROWSER_PATH=/usr/bin/google-chrome APP_SCREENSHOTS=1 bun run test:app
```

The suite covers six viewport sizes in both themes, card/grid/table layouts,
mobile navigation and thread continuity, login/profile, microphone-denial and
stop behavior, reduced/hidden-page motion, and SSR social metadata/image dimensions.
It intercepts **all account/data APIs and realtime WebSockets**, uses fake audio,
and never creates real accounts, conversations, searches, or model requests.
`APP_TEST_URL=https://…` repeats the UI checks against deployed assets with those
same mocks; this is **not** a live AI/voice-provider verification.

Artifacts stay under ignored `.wrangler/`. The required release gate remains
`bun run verify`; the focused browser suites supplement it.
