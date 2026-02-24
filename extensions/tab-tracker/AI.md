# AI Provenance

> This file is machine- and human-readable attribution for AI-assisted work in this repository.
> Format: `AI.md` v1.1 — place at repo root, commit alongside source, update per session.

---

## Model

| Field     | Value                                   |
| --------- | --------------------------------------- |
| Provider  | Anthropic                               |
| Model     | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Interface | claude.ai (web)                         |

---

## Session Record

---

### Session 2026-02-20 — Ideation, Spec & Initial Implementation

#### Phase 1 — Ideation & Spec

**Human prompt (paraphrased):**

> Design a browser extension that passively tracks time-per-tab, surfaces the true
> accounting of where browser-time goes, and provides non-intrusive visual feedback —
> no side effects like switching or closing tabs. Stack: TypeScript, vanilla CSS, Vite,
> Mozilla Manifest v2.

**AI contribution:**

- Reframed the product concept as a _temporal accountability ledger_ (not a timer)
- Defined the `TabRecord` / `LedgerState` data model
- Specified active-only tracking semantics (window blur pauses clock)
- Designed the HUD, threshold toast, and drift-correction flash UX patterns
- Specified the tag taxonomy: `rabbit-hole`, `deep-work`, `neglected`, `cold`, `intent`
- Proposed the fallback idiom for tab theming (threshold toasts, since the browser API disallows direct tab color mutation)
- Outlined the 30-minute build order and file architecture

**Human contribution:**

- Original problem framing and motivation
- Core constraint: strictly permissionless, no side effects
- Stack selection (TS / vanilla CSS / Vite / Firefox)
- Rejection of prior AI response (Gemini) as insufficient — raising the quality bar
- Approval and direction between spec and implementation phases

#### Phase 2 — Implementation

**AI contribution (generated in full):**
All source files below were written by the AI in a single generation pass with no
human edits at time of initial commit. See per-file table.

**Human contribution:**

- Reviewed output for correctness
- Integrated into monorepo (`@some-ui/tab-tracker`), encountered type errors

---

### Session 2026-02-23 — Bug Fix: MV3 Migration & Type Correctness

**Trigger:**
Human shared TypeScript/ESLint error log from real integration. Errors fell into
three categories:

1. Conflicting WebExtension type packages (`@types/firefox-webext-browser` vs `@types/webextension-polyfill`) causing namespace collision and `Expected 0 arguments` errors on `browser.action.*`
2. Broken discriminated union narrowing in the message handler — `message.tabId` accessed before type narrowing, causing TS2339 errors
3. MV2-only API usage (`browser.browserAction`) in a codebase targeting Firefox MV3

Human also shared a ChatGPT-generated remediation plan and asked: (a) which path is
architecturally correct, and (b) to rewrite accordingly.

**Decision rationale (Claude):**

- MV3 is the correct target: Firefox supports MV3 since v109, it aligns with long-term
  browser direction, and the extension's event-driven model fits the service worker
  lifecycle cleanly
- Drop `@types/firefox-webext-browser` entirely — using both type packages simultaneously
  causes namespace conflicts; `webextension-polyfill` is the single correct source
- Remove `setInterval` heartbeat: `liveMs()` already computes elapsed on-demand so badge
  accuracy does not require a polling loop; event-driven updates are sufficient and
  survive service worker sleep
- Refactor message handler to Promise-based (return `Promise<OutboundMessage>`) — cleaner
  than `sendResponse` + `return true`, and correct for webextension-polyfill's wrapped API
- Fold `GET_OWN_TAB_ID` into the `InboundMessage` union so the switch is exhaustive and
  requires no unsafe casts anywhere
- `gecko.strict_min_version` bumped from `91.0` → `109.0` (MV3 support landed in Firefox 109)

**AI contribution:**

- Architectural decision (MV3 vs MV2 stay, single type package)
- Full rewrite of `src/background/background.ts`
- Updated `src/types.ts`: renamed `MessageType`→`InboundMessage`, `ResponseType`→`OutboundMessage`, added `GET_OWN_TAB_ID` to union, extracted threshold constants
- Updated `manifest.json`: `manifest_version: 3`, `background.service_worker`, `action` (was `browser_action`), removed `windows` permission (not needed for `onFocusChanged` in MV3)
- Updated `tsconfig.json`: removed `firefox-webext-browser` from `types`, removed `jsx`/`useDefineForClassFields`/`allowImportingTsExtensions` options not needed for this target
- Updated `package.json`: removed `@types/firefox-webext-browser` devDep

**Human contribution:**

- Provided real error output from actual integration
- Provided ChatGPT remediation for cross-reference
- Asked the deciding question (MV3 Mozilla-friendly?) that resolved the architectural ambiguity
- Will apply diff and validate

---

### Session 2026-02-23 — Content Script Decomposition & HUD Redesign

**Trigger:**
Human reviewed `content.ts` and found it monolithic, poorly designed, and visually
underwhelming. Raised five architectural requirements and one aesthetic requirement
in a single prompt.

**Requirements stated:**

1. Minimal UI — reduce visual noise at rest
2. Draggable to any part of the screen
3. On click, reveal a richer dialog/context menu with full meta schema
4. Auto-disappear on fullscreen video
5. Composable `content.ts` — UI components in separate files, business/browser logic
   isolated from pure UI logic, composed at the entry point
6. Storybook all components — using the React bridge idiom (monorepo Storybook is
   React/Vite; extension components remain vanilla TS + CSS, no React in the bundle)

Human confirmed via follow-up that the goal is _not_ to introduce React into the
extension. React is only the Storybook sandbox. The bridge pattern (vanilla class
mounted into a React `ref`) is the correct idiom.

**Decision rationale (Claude):**

- Each UI primitive (`Dot`, `Timer`, `SessionLabel`, `NeglectLabel`, `Toast`) becomes
  its own class with a consistent `mount` / `update` / `getElement` contract — trivially
  bridgeable and independently storyable
- `FloatingHUD` composes the primitives and owns: drag (with `sessionStorage` persistence),
  idle opacity fade, fullscreen hide (`fullscreenchange` + `webkitfullscreenchange`),
  and click-to-expand context panel
- `ContextPanel` is a new component — renders tab title, favicon, domain, stats grid
  (total time, session time, status, tier), smoothed SVG sparkline from `record.buckets`,
  and derived tag badges; animates open/close via CSS transform + opacity
- `logic.ts` is completely DOM-free: `computeElapsed`, `checkThresholds`, `deriveTags`,
  `injectStyles`, and `startPolling` are pure functions or thin async wrappers; no
  `document.*` references anywhere in the file
- `content.ts` reduced to ~40 lines: inject CSS → mount HUD → mount Toast → start poll
  → wire `hud.update()` and `toast.show()` callbacks
- CSS substantially redesigned: `backdrop-filter: saturate(180%)`, inset glow on chip,
  cubic-bezier panel entrance animation, `tabular-nums`, Berkeley Mono font stack,
  grab/grabbing cursor states, proper hover elevation on chip

**AI contribution:**

- Architectural decomposition into `ui/` primitives + `logic.ts` + thin `content.ts`
- All new source files (see file table below)
- CSS redesign: refined dark glass aesthetic, context panel animations, tag badge system
- Storybook bridge stories for `Dot`, `Timer`, `Toast`, `FloatingHUD` (8 stories total,
  including `play` interaction test for expand)
- `ContextPanel` design and implementation (new component, not in prior versions)
- `deriveTags` logic extracted and made pure

**Human contribution:**

- Identified the monolith problem and named all five architectural requirements precisely
- Confirmed the React-is-only-Storybook constraint when clarification was needed
- Provided `TabRecord` / `LedgerState` / formatter types for context
- Will review, integrate, and validate against real extension build

---

## File Attribution

| File                                  | Origin | Last touched       | Notes                                                                                      |
| ------------------------------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------ |
| `src/types.ts`                        | AI     | Session 2026-02-23 | Renamed message types; added `GET_OWN_TAB_ID` to union; extracted constants                |
| `src/background/background.ts`        | AI     | Session 2026-02-23 | Full MV3 rewrite: `browser.action`, Promise messages, no interval heartbeat                |
| `src/content/content.ts`              | AI     | Session 2026-02-23 | Decomposed to ~40-line orchestrator: inject → mount → poll → wire                          |
| `src/content/logic.ts`                | AI     | Session 2026-02-23 | New. DOM-free business logic: polling, thresholds, tag derivation, style injection         |
| `src/content/ui/Dot.ts`               | AI     | Session 2026-02-23 | New. Status indicator dot with tier color + pulse animation                                |
| `src/content/ui/Timer.ts`             | AI     | Session 2026-02-23 | New. Live clock display with tier-aware color                                              |
| `src/content/ui/SessionLabel.ts`      | AI     | Session 2026-02-23 | New. Session text with flash-in animation for drift correction                             |
| `src/content/ui/NeglectLabel.ts`      | AI     | Session 2026-02-23 | New. Blinking neglect nag label                                                            |
| `src/content/ui/Toast.ts`             | AI     | Session 2026-02-23 | New. Threshold milestone toast, extracted from content.ts                                  |
| `src/content/ui/ContextPanel.ts`      | AI     | Session 2026-02-23 | New. Rich click-expanded dialog: stats grid, sparkline SVG, tag badges, close-on-outside   |
| `src/content/ui/FloatingHUD.ts`       | AI     | Session 2026-02-23 | New. Composed chip: drag + sessionStorage, idle fade, fullscreen hide, panel toggle        |
| `src/content/ui/content.css`          | AI     | Session 2026-02-23 | Full redesign: glass dark theme, cubic-bezier animations, Berkeley Mono, tabular-nums      |
| `src/stories/Dot.stories.tsx`         | AI     | Session 2026-02-23 | New. Storybook bridge + 5 stories (all tiers + controls)                                   |
| `src/stories/Timer.stories.tsx`       | AI     | Session 2026-02-23 | New. Storybook bridge + 5 stories (all thresholds + AllTiers)                              |
| `src/stories/Toast.stories.tsx`       | AI     | Session 2026-02-23 | New. Storybook bridge + 4 stories (all milestones + AllToasts)                             |
| `src/stories/FloatingHUD.stories.tsx` | AI     | Session 2026-02-23 | New. 8 stories: all tiers, neglect, flash, inactive, expanded (with play interaction test) |
| `src/popup/popup.ts`                  | AI     | Session 2026-02-20 | Ledger render, tags, sparkline, export                                                     |
| `src/popup/popup.html`                | AI     | Session 2026-02-20 | Popup markup and CSS (DM Mono / DM Sans)                                                   |
| `manifest.json`                       | AI     | Session 2026-02-23 | MV3: `service_worker`, `action`, gecko min version 109                                     |
| `vite.config.ts`                      | AI     | Session 2026-02-20 | Based on human-supplied sample vite config                                                 |
| `tsconfig.json`                       | AI     | Session 2026-02-23 | Single type source: `webextension-polyfill` only                                           |
| `package.json`                        | AI     | Session 2026-02-23 | Removed `@types/firefox-webext-browser`                                                    |
| `assets/icon-*.png`                   | AI     | Session 2026-02-20 | Programmatically generated placeholder icons                                               |
| `README.md`                           | AI     | Session 2026-02-20 | Setup, architecture, tag legend                                                            |
| `AI.md`                               | AI     | Session 2026-02-23 | This file                                                                                  |

**Attribution key:**

- `AI` — generated entirely by AI; human has not yet modified
- `Human` — written by human, no AI involvement
- `Collab` — meaningful contribution from both; annotate inline if granularity matters

---

## Collaboration Ratio

```
                    Session 1 (2026-02-20)    Session 2 (2026-02-23a)   Session 3 (2026-02-23b)
Ideation:           60% AI  / 40% Human       20% AI  / 80% Human  *    30% AI  / 70% Human  **
Specification:      75% AI  / 25% Human       40% AI  / 60% Human  **   35% AI  / 65% Human
Implementation:    100% AI  /  0% Human      100% AI  /  0% Human      100% AI  /  0% Human

*  Human drove the bug surface; the error log is the spec
** Human chose MV3 direction by asking the decisive question
** Human identified all five architectural requirements without prompting
```

_These ratios reflect AI vs human contribution at time of each session commit.
They are not a judgment of ownership. The human directs, constrains, integrates,
and maintains. The ratio will shift toward Human as the codebase evolves._

---

## Reproduction Note

All sessions occurred in the same claude.ai conversation thread. Sessions are not
publicly archived. Prompts above are faithful paraphrases of the human's intent.
If this project is forked or redistributed, this file should be preserved to maintain
an honest provenance chain.

---

## Versioning This File at Scale

As iteration frequency increases, maintaining `AI.md` manually becomes the bottleneck.
Below is a tiered strategy — pick the level that matches your current pace.

---

### Tier 1 — Low iteration (current pace, 1–3 sessions/week)

**Keep doing exactly this.** Append a `### Session YYYY-MM-DD` block per session.
Update the file attribution table's `Last touched` and `Notes` columns only for
files that actually changed. The only discipline required: **commit `AI.md` in the
same commit as the code it describes.** Never let it drift.

One rule to add now: when a file transitions from `AI` → `Collab` → `Human`, update
the `Origin` field and add a one-line note like `Human rewrote business logic; AI
skeleton remains in structure only`. This is more honest than leaving stale `AI` labels.

---

### Tier 2 — Medium iteration (daily sessions, active feature development)

The session narrative blocks will get unwieldy. Switch to a **two-file split:**

```
AI.md              ← model identity, ratios, versioning policy, reproduction note
AI-sessions.md     ← append-only session log (one block per session, no editing old blocks)
```

`AI.md` stays short and stable — safe to read at a glance. `AI-sessions.md` grows
freely. Cross-reference: `AI.md` links to `AI-sessions.md#session-YYYY-MM-DD` anchors.

For the file attribution table, consider dropping verbose `Notes` and instead tracking
only `Origin` + `Last touched` + a brief change verb (`rewrite`, `extend`, `extract`,
`human-modified`). You can always trace details back to the session log by date.

---

### Tier 3 — High iteration (multiple sessions/day, or multiple contributors)

At this pace, human maintenance of `AI.md` is unreliable. Automate the mechanical parts:

**Option A — git commit hook:** Write a `prepare-commit-msg` hook that detects whether
any `src/` files in the staged diff were AI-generated (you mark them with a
`// @ai-generated` header comment) and appends a stub session entry to `AI-sessions.md`
with the date, changed files, and a `[fill in]` placeholder. You complete the narrative
before pushing.

**Option B — session template:** Keep a `AI-session-template.md` in the repo. At the
start of each AI session, duplicate it, fill in the date, and draft the narrative
while the session is fresh. Merge into `AI-sessions.md` on commit. Takes 3 minutes
while context is live; takes 20 minutes reconstructed from memory later.

**Option C — structured frontmatter:** If you ever need to query provenance
programmatically (e.g., "which files has a human never touched?"), switch the file
attribution table to YAML frontmatter or a `provenance.json` at repo root. The
Markdown `AI.md` becomes a human-readable view generated from that source. This is
the right move if you add a second AI provider or start tracking per-function
granularity rather than per-file.

---

### Permanent rules regardless of tier

1. **Commit atomicity.** `AI.md` update and the code it describes live in the same
   commit. A provenance file that trails the code by even one commit is already wrong.

2. **Never edit old session blocks.** Append only. If a prior session's description
   was incomplete or wrong, add a `**Correction:**` note in the next session block that
   references it. Old blocks are a historical record, not a live document.

3. **File transitions are the highest-value signal.** A file moving from `AI` to
   `Collab` to `Human` is the most important thing this file tracks. Update `Origin`
   aggressively; it degrades fast if neglected.

4. **The ratios are estimates, not audits.** Their value is directional: a project
   trending from `100% AI / 0% Human` toward `40% AI / 60% Human` over time tells
   a meaningful story about how deeply you've internalised and taken ownership. Don't
   over-engineer the measurement.

5. **When in doubt, over-attribute to AI.** It is always safe to later correct
   `AI` → `Collab`. The reverse — discovering that something labelled `Human` was
   substantially AI-generated — is the failure mode this file exists to prevent.

---

## Future Sessions

_Append a new `### Session YYYY-MM-DD` block under **Session Record** for each
subsequent AI-assisted work session. Update the **File Attribution** table's
"Last touched" column for files that changed. When a file's `Origin` transitions
(AI → Collab → Human), update that field and add a note. Commit atomically._
