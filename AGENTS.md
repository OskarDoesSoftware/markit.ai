# AGENTS.md

Guidance for AI agents working in this repository. This file is the single source of truth; `CLAUDE.md` defers to it.

## Project

`markit.ai` is a realtime voice assistant built on this frontend foundation:

- Bun package manager and task runner; CI always installs the latest canary
- Vite 8
- React 19 with React Compiler
- TanStack Start and TanStack Router for SSR and file-based routing
- HeroUI v3 for accessible UI primitives
- Tailwind CSS v4
- TypeScript in strict mode
- Oxfmt and type-aware Oxlint
- Cloudflare Workers via `@cloudflare/vite-plugin` and Wrangler
- AI SDK v7 for typed realtime tool definitions
- Exa for live ecommerce product retrieval

The app is a single package. Routes live in `src/routes`, the router is in `src/router.tsx`, and the Cloudflare Worker entry is `src/server.ts`.

## Commands

Run commands from the repository root.

| Task                          | Command                                           |
| ----------------------------- | ------------------------------------------------- |
| Install                       | `bun install`                                     |
| Develop                       | `bun run dev`                                     |
| Build                         | `bun run build`                                   |
| Type-aware lint and type gate | `bun run lint:type-aware`                         |
| Format                        | `bun run fmt`                                     |
| Full verification             | `bun run verify`                                  |
| Deploy manually               | `bun run deploy`                                  |
| Reproduce CI locally          | `bun install --frozen-lockfile && bun run verify` |

## Required gate

`bun run verify` must pass before a commit or deployment. It runs formatting, type-aware Oxlint, and the production build.

Use `bun oxlint --type-aware` as the source of truth for linting and type analysis. Do not substitute `tsc` or `tsc --noEmit`.

## Conventions

- Use Bun, not npm, pnpm, or yarn.
- Use strict TypeScript. Avoid `any` and unsafe casts.
- Keep every source script (`.ts`, `.tsx`, `.js`, and `.jsx`) at or below 500 lines. Split larger implementations by feature responsibility into focused modules; do not evade the limit by minifying or compressing formatting.
- Organize code by clear ownership: routes compose pages, components own presentation, and server/domain modules own validation, persistence, and external integrations.
- Use file-based TanStack routes in `src/routes`.
- Prefer HeroUI v3 components over recreating accessible controls. Import from `@heroui/react`; do not use HeroUI v2 packages or patterns.
- HeroUI interactions use `onPress`, not `onClick`.
- Keep `resolve.dedupe: ['react', 'react-dom']` in Vite. A single React copy is required by React Aria overlays.
- Use Tailwind v4 and the design tokens in `src/index.css`.
- The demo shares the presentation's soft lavender/peach/mint identity. Read
  [brand and motion guidance](docs/brand-and-motion.md) for theme ownership,
  Motion animations, subscription-only OG generation, and browser checks.
- The primary interface is a voice orb plus a compact live agent-status indicator. Product cards are the only secondary surface: desktop results open in the right-hand panel and shift the orb left; viewports below 900px must use a controlled HeroUI v3 bottom `Drawer`.
- Voice transport uses the same-origin `/api/realtime` WebSocket proxy to OpenAI's `gpt-realtime-2.1` model. Keep the API key server-side as the `OPENAI_API_KEY` Worker secret.
- Authenticated voice conversations are persistent application-owned threads. D1 stores session metadata, user/assistant transcripts, and restorable product state; `/api/conversations` owns schema bootstrapping, listing, and creation. The selected conversation ID is passed to `/api/realtime`, prior transcript is restored into trusted session context, and realtime transcription events update the thread. Navigating back to Assistant must preserve the selected thread; only the explicit New thread/reset control creates a fresh one.
- `src/product-agent.ts` owns the server-enforced ecommerce system prompt, AI SDK v7 tool definitions, input validation, and Exa result sanitization. Current product claims, discounts, delivery costs, and seller-reliability evidence must be grounded in `search_products` results.
- Discovery is intentionally restrained: ask at most one high-impact missing constraint before the first search (for example shoe size, apparel size, compatibility, or destination). If the shopper says to proceed or has no preference, search immediately and do not repeat the question.
- Seller reliability is a transparent evidence-completeness heuristic, not a certification. Cards show the score at the end with its evidence level; never represent it as guaranteed trustworthiness.
- Product research is a required two-stage realtime workflow: `search_products` gathers Exa evidence, then the voice model announces validation and calls `validate_product_results` before displaying or recommending listings. The Worker uses the same `OPENAI_API_KEY` with the Responses API multi-agent beta and `gpt-5.6-luna`; its root orchestrator creates one concurrent subagent per selected listing, gives each the bounded Exa evidence plus built-in web search, and reconciles strict facts. Server code then deterministically applies this order: missing required information → ask; failed hard criterion → reject; unreliable or over-cap all-in cost → ask/reject; risky or unsupported seller → reject; failed/borderline deadline → reject/ask; exact available product → present; otherwise wait-and-monitor only with permission, propose alternatives only with explicit permission, else reject. Cards receive per-listing `markit.analysis` events and show failed/per-check states plus validation sources. The realtime model may describe returned findings accurately but must not overstate caution, unverified, or failed checks.
- Explicit budgets are hard constraints. `search_products` receives structured `minPrice`, `maxPrice`, and ISO `currency`; results with unknown, mismatched, or out-of-range prices are excluded. If none remain, the model closes existing cards and says no verified product matched instead of showing near-budget fallbacks.
- The model alone opens, updates, and closes product results through `control_product_display`. The client reacts to `markit.products` events; do not automatically show search results or add a separate manual panel toggle.
- For stage, eligibility, and reconnection changes to the panel, read
  [product panel states](docs/product-panel.md) and run its focused offline
  controller and browser tests before the required verification gate.
- Product presentation uses HeroUI v3 compound `Card`, `Link`, and controlled `Drawer` APIs. Shared card data is typed in `src/product-types.ts`; desktop/mobile rendering lives in `src/components/ProductResults.tsx`.
- The Worker injects the trusted prompt and tools into every `session.update`; never trust browser-supplied instructions or tool definitions.
- Exa uses the `EXA_API_KEY` Worker secret. Never expose it to the browser or return raw upstream errors.
- Microphone audio is mono PCM16 at 24 kHz. Use semantic VAD with automatic response creation and interruption enabled.
- WebSocket playback is client-managed. On `input_audio_buffer.speech_started`, stop every queued audio source immediately and send `conversation.item.truncate` with the played duration. Ignore late deltas from interrupted responses, and never allow two response queues to play concurrently.
- Keep secrets out of source, docs, Git, and command output. Local secrets belong in ignored `.env` or `.dev.vars` files; production secrets belong in Cloudflare Worker secrets.
- Do not commit generated build output (`dist`) or dependencies (`node_modules`).

## Purchase-agent roadmap (not implemented)

The current product researches live listings; it does not place orders, charge a payment method, maintain purchase mandates, or issue receipts or Wallet passes. Keep those capabilities clearly labelled as proposed until code and end-to-end verification support them. Preserve the existing `search_products` → `validate_product_results` workflow and its hard budget filtering when extending discovery toward purchasing.

For a future purchase flow, normalize a shopper's request into a structured brief with product and variant requirements, quantity, currency, a hard final-price cap, delivery constraints, seller restrictions, and explicitly permitted alternatives. Ask only for material missing details; permission to search or view alternatives is not permission to buy. A failed hard requirement cannot be outweighed by a fit score. When no exact eligible offer exists, offer waiting or explicitly allowed alternatives without silently relaxing the brief.

Separate model interpretation and evidence gathering from deterministic authorization. A proposed server-side policy should verify the exact product, seller, delivery requirements, and final payable amount, including shipping, taxes, duties, fees, valid discounts, and currency conversion. Unknown charges, an unverified checkout total, or any amount above the cap must block automatic purchase. A listing audit or search result alone is not payment authorization.

Autonomous purchasing would require an explicit, scoped, expiring, revocable mandate and a fresh authorization bound to the verified merchant, product, quantity, amount, currency, and mandate version. Changes to hard criteria or spending scope require renewed consent. Recheck the final quote and mandate immediately before execution, use idempotency to prevent duplicate orders, and keep payment credentials outside model and browser context. A checkout or payment simulator, if introduced for a demo, must be labelled as simulated and must never imply that money moved.

After an actual or clearly simulated purchase, a future flow could create separate merchant and decision receipts, with evidence and reason codes rather than hidden model reasoning. Apple Wallet, Google Wallet, or an in-app pass is a further integration goal; never claim a pass exists or was added before generation succeeds.

## Deployment

The standalone presentation/demo deck lives in `presentation/`, separately from
the application. Start with [its README](presentation/README.md) for the visual
system, Pi-subscription artwork generation, and focused browser checks. Its
demo-only credential belongs exclusively in ignored root `e.nv`; do not load it
into the app, generated artwork, or production deployment.

The Worker is named `markit-ai` and configured in `wrangler.toml`. `bun run build` emits `dist/server/wrangler.json`; deploy that generated configuration with Wrangler.

`.github/workflows/deploy.yml` is the production CI/CD pipeline. Pull requests to `main` run the verification gate. Pushes to `main` and manual dispatches run the same gate, deploy the already-built application output, and deploy the standalone `markit-ai-presentation` Worker from `presentation/wrangler.toml`. The workflow uses the latest Bun canary, a frozen lockfile, Bun's package cache, least-privilege GitHub permissions, and concurrency cancellation for superseded runs.

GitHub Actions requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. Runtime secrets such as `OPENAI_API_KEY` and `EXA_API_KEY` remain Worker secrets and are preserved across deployments. Never write credential values into tracked files or workflow YAML.

After every completed change, run `bun run verify`, commit only the files changed for the task, and push the commit. Do not wait for the user to request deployment. The push deploys automatically; verify the workflow and live URL when deployment behavior changes or a failure is reported.
