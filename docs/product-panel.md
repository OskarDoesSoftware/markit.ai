# AI-controlled product panel

The model alone chooses when to show, update, rearrange, and close results via
`control_product_display`. Do not add a manual open/close control, automatically
show raw search candidates, or bypass independent validation. The server is the
authority on eligibility; the UI only renders its snapshots.

## What happens at each stage?

| Stage                                    | Visible when panel was already open                | What can be displayed                                                    |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Search started                           | “Researching new options”                          | No old cards, even while Exa is pending                                  |
| Candidates collected                     | “Research gathered”                                | No raw, unvalidated listings                                             |
| Validation running                       | “Checking the details”                             | No recommendations yet; per-URL checks attach to this research ID        |
| Eligible checks complete                 | “Checks complete” until model calls show           | Only eligible URLs from this search                                      |
| No results / input needed / tool failure | A specific status and next step                    | No near-budget, failed, or unverified fallback cards                     |
| Display show / sort / view / subset      | Checked cards, retailer links, validation evidence | Only eligible selected URLs; model chooses presentation                  |
| Display close                            | Panel and drawer closed                            | Retain validated selection and preferences for a model-controlled reopen |
| Reconnected saved conversation           | Previous shortlist with a stale-data warning       | Only previously eligible saved URLs; search again for current claims     |

`src/product-tool-controller.ts` serializes calls and D1 snapshots; it rejects
unknown, duplicate, or non-eligible URLs without replacing the current selection.
`src/product-session.ts` owns the server selection/sort/restore semantics. The
reusable `productDisplayInputSchema` and ecommerce prompt live in
`src/product-agent.ts`; required nullable fields keep the realtime tool schema
strict while null preserves unchanged presentation settings.
The Worker also safely normalizes omitted optional display fields to null for
upstream calls from older sessions; it never treats an empty URL array as close.

`markit.products` carries a monotonically increasing `revision`, `researchId`,
stage, selection, and its bounded analysis snapshot. `markit.analysis` carries
the same IDs. The client reducer in `src/product-panel-state.ts` discards stale
revisions or older research IDs and does not let an old callback reopen a new
panel. A closed socket marks unfinished research interrupted; it does not claim
checks completed. Audio and tool status remain separate from display state.

`src/components/ProductResults.tsx` owns the desktop rail and the controlled
HeroUI bottom Drawer below 900px. `ProductCards.tsx` and `ProductTable.tsx` share
the validation badge/evidence status. Disclosure expansion is URL-keyed across
reordering; table view includes the checks and sources rather than losing them.
The mobile Drawer traps focus appropriately and exposes **voice, microphone,
and resume/end** inside the modal so model-only closing does not strand users.

## Verification without live AI charges

```bash
bun test tests/unit/product-tool-controller.test.ts
APP_BROWSER_PATH=/usr/bin/google-chrome bun run test:app
bun run verify
```

Unit tests run the actual tool controller through search, validation, display,
error, sort, close/reopen, serialization, and persistence with stubbed Exa,
validation, D1, and sockets. Browser tests inject versioned model-control
events across phone/tablet/desktop, including narrow-phone voice controls and
stale-event rejection. All browser API/WS requests are mocked; **these tests do
not verify live OpenAI/Exa, microphone hardware, or real offers**. A production
URL browser run tests deployed assets with the same mocks. Do not reinterpret
that result as a live commerce/AI validation.
