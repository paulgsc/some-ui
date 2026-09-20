/**
 * The effect ledger: for every page-affecting primitive that reaches the
 * shipped bundle, a declared cost class, retention class and owner.
 *
 * ── the admission rule this file participates in ─────────────────────────
 *
 * The rule lives in `@some-extension/common/budgets` and applies to any
 * extension in this workspace; see `admission.ts` there for its statement
 * and its limits. It enforces four conditions over the built artifact, none
 * of which mentions any function, module or file in this extension:
 *
 *   1. **Closure.** Every alphabet occurrence in every shipped bundle has a
 *      ledger entry. No entry ⇒ red. This is what makes the rule survive a
 *      diff: an unbounded walk added to a new module, to an imported
 *      workspace package, or to `public/prepaint-start.js` still puts a
 *      `createTreeWalker` or `querySelectorAll` into the bundle.
 *   2. **Ratchet.** The occurrence count matches the declared count. A new
 *      call site of an already-declared primitive ⇒ red, and must be
 *      justified by editing this file, which is a reviewable diff.
 *   3. **Cost admission.** The declared cost class is admitted.
 *      `unbounded-per-dispatch` never is.
 *   4. **Retention admission.** The declared retention class is admitted.
 *      `unbounded` never is.
 *
 * Conditions 3 and 4 are what the current head fails. Conditions 1 and 2
 * are what make that failure general rather than a recognition of today's
 * code: renaming `scan()`, moving it to another module, or rewriting its
 * `while` loop as `for…of` over `querySelectorAll` changes which entry is
 * red, never whether one is.
 *
 * ── honest limits, stated once here and again in README.md ───────────────
 *
 * The cost and retention classes below are **declarations, not proofs**.
 * Nothing in CI currently verifies that an entry marked `budgeted` really
 * bounds its work — that would require the effects to run through a kernel
 * that enforces a credit bound at runtime, which this extension does not
 * yet have (see README, "What is proved and what is declared"). What CI
 * does verify is that every effect is declared, that no effect is declared
 * with an inadmissible class, and that the set cannot grow silently.
 *
 * A declaration of `budgeted` on an effect that is not actually budgeted is
 * therefore a *lie the gate will believe*. That is the residual trust
 * surface, it is deliberately concentrated in this one reviewable file, and
 * it is the reason every entry carries an owner and a note rather than just
 * a class.
 */

import type { EffectLedger, LedgerEntry } from "@some-extension/common/budgets"

const contentScript: ReadonlyMap<string, LedgerEntry> = new Map([
  [
    "createTreeWalker",
    {
      count: 3,
      cost: "unbounded-per-dispatch",
      retention: "unbounded",
      owner:
        "adapter/pipeline.ts scan(), adapter/legibility-audit.ts senseLegibility(), adapter/shadow-scope-discovery.ts",
      note: "Each walker is pumped to exhaustion in one synchronous dispatch: O(S_i) visits with no budget, deadline or resumption cursor. Retention is charged here rather than to the style reads because it is the walk's *result* that is kept: both passes push every matched element into a Map<Key, Array<Element>> that createContentSession holds as `lastScan` until the next round — measured at 1.01 Element references per document element across the two channels.",
    },
  ],
  [
    "querySelectorAll",
    {
      count: 7,
      cost: "unbounded-per-dispatch",
      retention: "none",
      owner:
        "adapter/foreground-repair.ts, adapter/actuator.ts, adapter/shadow-actuator.ts, adapter/legibility-audit.ts, lib/content/theme-detector.ts",
      note: "Result size scales with the number of tagged elements, i.e. with S_i, and each result is iterated to completion in the same dispatch. theme-detector's own `body > *` query is additionally a universal-subject selector.",
    },
  ],
  [
    "closest",
    {
      count: 3,
      cost: "unbounded-per-dispatch",
      retention: "none",
      owner: "lib/content/theme-detector.ts, adapter/legibility-audit.ts",
      note: "O(H_i) per call. Admissible in isolation; not admissible at the call sites here, which sit inside per-element loops, making the pass O(S_i x H_i).",
    },
  ],
  [
    "matches",
    {
      count: 1,
      cost: "constant",
      retention: "none",
      owner: "adapter/legibility-audit.ts",
      note: "Single compound selector against one element, not in a per-element loop.",
    },
  ],
  [
    "getComputedStyle",
    {
      count: 13,
      cost: "unbounded-per-dispatch",
      retention: "none",
      owner:
        "adapter/legibility-audit.ts (incl. resolveEffectiveBackdrop's ancestor chain), adapter/pipeline.ts, lib/content/color.ts, lib/content/theme-detector.ts, lib/content/vendor-filter.ts, adapter/shadow-scope-theming.ts, lib/content/coverage-watchdog.ts",
      note: "Measured at 1.36 reads/element for the surface channel and 11.43 for the contrast channel, whose resolveEffectiveBackdrop walks ancestors per element: O(S_i x H_i) style resolutions in one dispatch.",
    },
  ],
  [
    "getBoundingClientRect",
    {
      count: 1,
      cost: "constant",
      retention: "none",
      owner: "lib/content/theme-detector.ts viewportCoverage()",
      note: "Called over a set already truncated to the 8 largest candidates, so its count is independent of S_i.",
    },
  ],
  [
    "adoptedStyleSheets",
    {
      count: 8,
      cost: "constant",
      retention: "bounded",
      owner: "adapter/shadow-actuator.ts, adapter/shadow-scope-theming.ts",
      note: "One adopted sheet per shadow scope, LRU-capped at MAX_CACHED_SHEETS = 500 — bounded independently of S_i. Style matching cost for the rules themselves is charged to the style budget, not here.",
    },
  ],
  [
    "insertRule",
    {
      count: 3,
      cost: "constant",
      retention: "bounded",
      owner: "adapter/shadow-actuator.ts, lib/content/theme-apply.ts",
      note: "One rule per distinct surface colour, not per element — the SurfaceKey design dedupes by colour, so rule count is bounded by the palette rather than by S_i.",
    },
  ],
  [
    "setProperty",
    {
      count: 1,
      cost: "constant",
      retention: "none",
      owner: "lib/content/prepaint.ts",
      note: "Single custom-property write on documentElement.",
    },
  ],
  [
    "MutationObserver",
    {
      count: 8,
      cost: "arrival-source",
      retention: "bounded",
      owner:
        "adapter/pipeline.ts, adapter/shadow-scope-discovery.ts, lib/content/coverage-watchdog.ts (x2), adapter/document-scope.ts",
      note: "Subtree observers on documentElement. Coalesced by RECONCILE_POLICY's 50ms debounce, which bounds rounds per unit time but NOT the work inside one round — so the arrival discipline is real and the per-dispatch bound it feeds is not. The eighth (#1258, coverage-watchdog.ts attachLegacyStyleObserver) observes only the extension's own #__sw_legacy_filter <style> element — childList/characterData on one node this extension writes — so its arrivals are bounded by the extension's own writes, not by S_i; it is re-attached only when the html observer sees that element re-created.",
    },
  ],
  [
    "setInterval",
    {
      count: 3,
      cost: "arrival-source",
      retention: "bounded",
      owner:
        "adapter/shadow-scope-theming.ts, adapter/shadow-scope-discovery.ts, lib/content/coverage-watchdog.ts",
      note: "Periodic polls. Fixed period, so arrivals per unit time are bounded per tab; across N tabs the aggregate is N x rate, which no global admission control currently bounds.",
    },
  ],
  [
    "setTimeout",
    {
      count: 6,
      cost: "arrival-source",
      retention: "bounded",
      owner:
        "adapter/pipeline.ts (coalescer, trailingAuditTimer), lib/content/prepaint.ts, content/content.ts",
      note: "Debounce and veil-teardown timers; each is cancelled or replaced rather than accumulating one pending job per arrival. The sixth (#1459, pipeline.ts trailingAuditTimer) is armed with ??= — at most one pending timer regardless of how many settles arrive during the interaction-audit cooldown — and cleared on teardown.",
    },
  ],
  [
    "requestAnimationFrame",
    {
      count: 4,
      cost: "arrival-source",
      retention: "none",
      owner: "lib/content/prepaint.ts commitVisualState(), content/content.ts",
      note: "Double-rAF commit handshake. Bounded count per commit, not per mutation.",
    },
  ],
  [
    "addEventListener",
    {
      count: 6,
      cost: "arrival-source",
      retention: "bounded",
      owner:
        "content/content.ts (yt-navigate-finish, pointer/keyboard settle), lib/content/visibility-gate.ts (visibilitychange)",
      note: "Fixed set of named page and runtime events; count is independent of S_i. The sixth (visibility-gate.ts) is one document-level visibilitychange listener, removed by cancel() before the next arm, so at most one is registered at a time.",
    },
  ],
  [
    "<computed-member-access>",
    {
      count: 16,
      cost: "constant",
      retention: "none",
      owner: "content-script bundle, whole dependency closure",
      note: "Record and registry lookups (swatch tables, per-key maps, message dispatch). NOT semantically verified: after mangling these are indistinguishable from a dynamic reach for a DOM primitive, so this entry claims only that there are exactly this many and that adding one requires review. It is the ratchet that catches aliasing such as `const d = document; d[name]`, which no root-name heuristic can see.",
    },
  ],
])

const backgroundWorker: ReadonlyMap<string, LedgerEntry> = new Map([
  [
    "insertCSS",
    {
      count: 1,
      cost: "constant",
      retention: "none",
      owner: "background/background.ts",
      note: "One user-origin sheet per tab. The *matching* cost of its selectors is not charged here — it is the subject of enforcement-css-budget.test.ts, which analyses the sheet text this call ships.",
    },
  ],
  [
    "<computed-member-access>",
    {
      count: 10,
      cost: "constant",
      retention: "none",
      owner: "background worker, whole dependency closure",
      note: "Record and registry lookups (swatch tables, per-key maps, message dispatch). NOT semantically verified: after mangling these are indistinguishable from a dynamic reach for a DOM primitive, so this entry claims only that there are exactly this many and that adding one requires review. It is the ratchet that catches aliasing such as `const d = document; d[name]`, which no root-name heuristic can see.",
    },
  ],
])

const prepaintStart: ReadonlyMap<string, LedgerEntry> = new Map([
  [
    "MutationObserver",
    {
      count: 1,
      cost: "arrival-source",
      retention: "bounded",
      owner: "public/prepaint-start.js",
      note: "childList-only observer on documentElement's direct children — explicitly NOT subtree, so arrivals are bounded by root-child churn rather than by S_i. This file is plain JS under public/ and ships as a document_start content script; the previous src/-only source scan never looked at it.",
    },
  ],
])

/**
 * Bundles that run inside a *page*. Extension-owned documents (popup.html,
 * debug.html) are excluded deliberately: their DOM is authored in this
 * repository and bounded by it, so page-size arguments do not apply. That
 * exclusion is itself checked — `bundle-closure-budget.test.ts` asserts the
 * page-facing set matches the manifest, so moving code into popup.js to
 * escape the ledger fails instead of passing.
 */
export const EFFECT_LEDGER: EffectLedger = new Map([
  ["content.js", contentScript],
  ["background.js", backgroundWorker],
  ["prepaint-start.js", prepaintStart],
])
