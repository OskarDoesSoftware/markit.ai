# Markit.ai presentation worker

A standalone, dependency-free slide deck for the current Markit.ai product story. It is isolated from the main application and deploys as its own Cloudflare Worker.

## Present

- Use **Next** / **Back**, the arrow keys, Page Up / Page Down, or Space.
- Swipe horizontally on a touch device.
- Use Home / End to jump to the first / last slide.
- Use the top-right control for fullscreen mode.
- Deep-link to a slide with its hash, for example `#5`.
- On narrow or short screens, scroll vertically within a slide; the toolbar and
  navigation retain their own space and never cover its content.
- **Try the demo** jumps to the final slide. Its primary link opens the live app;
  the QR code offers the same destination on a second device.
- Team profiles have direct LinkedIn links, including on phones where QR codes
  are not useful. Reduced-motion preferences disable slide transitions.

## Run locally

From the repository root:

```bash
bunx wrangler dev --config presentation/wrangler.toml
```

## Deploy

Cloudflare credentials stay in the ignored root `.env` file. Load them into the process without copying them into this folder:

```bash
bun --env-file=.env run deploy:presentation
```

The worker name is `markit-ai-presentation`. Pushes to `main` also deploy it automatically through `.github/workflows/deploy.yml`.

## Files

- `worker.ts` adds caching and security headers around static asset responses.
- `public/index.html` contains the presentation content.
- `public/styles.css` owns tokens, typography, shell, and navigation;
  `slides.css` owns compositions; `responsive.css` owns viewport adaptations.
- `public/deck.js` handles navigation, fullscreen, keyboard controls, and touch gestures.

The Worker caches non-HTML assets for an hour. Bump the `?v=` revision on changed
stylesheet/script links in `index.html` so returning visitors do not combine a
new deck with cached code from an earlier release.

## Artwork and credentials

The soft lavender, peach, and mint direction reinterprets the original
`public/colors.jpeg` concept without its high-intensity lime glow. Jan's phone
portrait supports the voice-shopping story; all four real team portraits remain
unaltered apart from WebP compression. Original files are retained.

`scripts/generate-artwork.ts` follows Pointup's Pi OpenAI Codex subscription
workflow. The requested **`gpt-2.5-sunburst`** image tool model was successfully
used with `gpt-5.6-sol` orchestration. Prompts, generation time, model IDs, and
output hashes live in `artwork/*.json`. Generated images are conceptual artwork,
not evidence of a product, price, seller, or live assistant state.

```bash
# Existing Pi subscription login; never a separately billed API-key fallback.
bun run images:presentation coffee-ritual voice-orbit
# Add --force to regenerate existing artwork. No automatic retries.
bun run images:presentation --portraits
```

The generator reads only the `openai-codex` entry from Pi's private auth store
(`PI_CODING_AGENT_DIR`, otherwise `~/.pi/agent`). It never prints credentials or
raw upstream errors. Authentication failures stop the run; refresh the Pi login
before explicitly rerunning. Artwork generation is local and never runs in CI.

The supplied demo-only API credential is stored as `MARKIT_DEMO_OPENAI_API_KEY`
in the Git-ignored root **`e.nv`**, with owner-only permissions. It is not loaded
by the app, artwork generator, Worker, or deployment. Never copy it to `.env`,
browser code, or a production secret. The presentation remains static and has
no credential-bearing API calls; the live-demo link opens the existing app.

## Browser checks

```bash
bunx playwright install chromium
bun run test:presentation
# Or use an existing browser:
PRESENTATION_BROWSER_PATH=/usr/bin/google-chrome bun run test:presentation
```

The focused suite checks all 13 slides at nine sizes (320px phones through
1920px desktop, including landscape), reachable scroll content, image loading,
keyboard/button/swipe navigation, deep links, focus, and reduced motion.
Optional `PRESENTATION_SCREENSHOTS=1` saves key-slide screenshots under ignored
`.wrangler/`; `PRESENTATION_TEST_URL=https://…` checks a deployment instead of
starting a local Worker. These supplement the required `bun run verify` gate.
