/**
 * Admission — the leading-edge half of per-surface theming.
 *
 * `pipeline.ts`'s round is trailing-edge by construction. The Sensor's
 * `MutationObserver` calls `coalescer.trigger()`, and `RECONCILE_POLICY`'s
 * 50ms debounce *restarts* on every mutation that follows (see
 * `@some-extension/transport/scheduler/reconcile`). That is the right
 * cadence for deciding — one round per burst, Definition 7.2, and #831 is
 * the record of what happens without it — and the wrong one for *binding*.
 * A node the vendor creates on hover paints at its own vendor background
 * for every frame between insertion and the round that finally tags it:
 * three frames minimum at 60Hz, and unbounded on a page that keeps
 * mutating, since each mutation pushes the fire further out.
 *
 * That window is avoidable, and only because of where the Sensor already
 * sits. A `MutationObserver` callback is a microtask — it runs at the
 * microtask checkpoint ending the task that made the mutation, which is
 * before the browser performs that frame's rendering steps. A
 * `data-sw-patched` write from inside the callback lands in the same frame
 * the node was created in, and nothing ever paints untagged.
 *
 * `content.ts` already states this principle for the scale above:
 * reacting to `yt-navigate-finish` rather than `-start` "can shorten a
 * flash, never prevent it". This module is that same correction one scale
 * down, for a popup rather than a route.
 *
 * ## What this pass deliberately does not do
 *
 * It never classifies, never decides, never emits a rule, and never
 * contributes a shred of evidence to the hypothesis. It answers exactly one
 * question per element: does this carrier's *vendor* background match a
 * `SurfaceKey` the page has already committed a rule for? If yes it writes
 * that key's tag; if no it walks away and leaves the element to the
 * debounced round, which behaves exactly as it did before this module
 * existed.
 *
 * That restriction is what keeps #831 closed, in three separate ways:
 *
 *   - **No new evidence.** `update()` is never called from here, so the
 *     append-only hypothesis cannot accumulate anything this pass saw. A
 *     misread here costs one mistagged element until the next round, not a
 *     permanent entry in `Ĥ`.
 *   - **No new CSS.** Only keys already carrying an `emit-surface-color`
 *     rule are admitted, so the dynamic stylesheet is never touched —
 *     `realize()` is not on this path at all.
 *   - **No mutation record.** `data-sw-patched` is outside the Sensor's
 *     `attributeFilter: ["class", "style"]`, so the write queues nothing
 *     for the observer to react to. This pass cannot trigger the round it
 *     runs ahead of.
 *
 * ## Cost, and why it is bounded rather than trusted
 *
 * The reason the round senses inside its debounce window rather than per
 * batch is cost: a full `scan()` is an O(nodes) tree walk plus a
 * `getComputedStyle` per node, and paying it per mutation batch made the
 * Sensor scale with the vendor's churn rate (#831, symptom 3). This pass
 * runs per batch — the thing that was too expensive — so it is only
 * defensible because it is bounded twice over, by
 * {@link ADMISSION_NODE_BUDGET} per batch and by
 * {@link createAdmissionBudget}'s rolling wall-clock allowance across
 * batches. A page that churns hard exhausts the second and gets the old
 * behaviour back, which is the correct failure mode: admission is an
 * accelerator over a mechanism that is already complete on its own, so
 * every bail here loses latency and nothing else.
 */

import { isHTMLElementNode, tagSurfaceElements } from "./actuator"
import type { FilterAction, SurfaceKey, SwatchRole } from "./contracts"

/**
 * The most elements one mutation batch may offer for admission.
 *
 * Sized for what this pass is *for*: a menu, a tooltip, a popper, a handful
 * of virtualised rows. A vendor replacing a whole route emits a subtree far
 * larger than this, and that case is the debounced round's — it needs a
 * verdict, not a binding, and it is already covered.
 *
 * Collection stops at the budget rather than abandoning the batch. A large
 * added subtree and a small popup routinely arrive in the same batch, and
 * abandoning would drop the popup on the large subtree's account; truncating
 * bounds the cost identically and still binds whatever fit. Partial progress
 * is always safe here — an element admission skips is an element the next
 * round tags, exactly as today.
 */
export const ADMISSION_NODE_BUDGET = 64

/** The rolling window over which {@link ADMISSION_SPEND_BUDGET_MS} is allowed. */
export const ADMISSION_WINDOW_MS = 1000

/**
 * Wall-clock milliseconds of admission work permitted per
 * {@link ADMISSION_WINDOW_MS}.
 *
 * The per-batch node budget alone bounds the cost of one batch and says
 * nothing about their *rate* — a page emitting hundreds of small batches a
 * second stays under it on every single one while paying the whole cost
 * #831 removed. This is the bound that actually addresses that, and it is
 * measured rather than estimated (elements-per-second would be a proxy for
 * style-recalc cost; elapsed time is the cost).
 *
 * 8ms is under half a 60Hz frame, spent across a whole second, on a page
 * mutating continuously enough to reach it. Below the budget the pass is
 * doing what it exists for; above it, the page is churning hard enough that
 * a flash on one popup is not the user's problem.
 */
export const ADMISSION_SPEND_BUDGET_MS = 8

/**
 * The keys the page has already committed per-surface CSS for, mapped to
 * the role the round assigned each one.
 *
 * The *role*, not the finished `data-sw-patched` value, because admission
 * does not write that attribute itself — it reconstructs `tag-surface`
 * actions and hands them to `actuator.ts`'s own `tagSurfaceElements`, the
 * same function `realize()` and `shadow-scope-theming.ts` tag through.
 * Admission's whole contract is that it produces a tag indistinguishable
 * from the one the round would have produced, only sooner; spelling the
 * value out a second time here would be exactly the kind of parallel
 * implementation that can drift from it.
 */
export type AdmissionIndex = ReadonlyMap<SurfaceKey, SwatchRole>

/** An index admitting nothing — the state before the first round has fired. */
export const EMPTY_ADMISSION_INDEX: AdmissionIndex = new Map<
  SurfaceKey,
  SwatchRole
>()

/**
 * Derives the index from a round's own realized action list.
 *
 * `decide()` walks the entire (append-only) hypothesis every round and
 * re-emits a `tag-surface` action for every key still crossing a threshold,
 * not only for keys that changed — so one round's action list is the
 * complete committed key set, not a delta, and this can be rebuilt wholesale
 * each round rather than accumulated.
 *
 * Returns an empty index for a round carrying no `activate-theme`. A
 * `restore-native` round has just torn every `data-sw-patched` tag and the
 * dynamic sheet down (`realize()`'s own branch), so admitting against keys
 * from before it would re-tag elements to rules that no longer exist —
 * writing an attribute that selects nothing, on a page the extension has
 * deliberately stopped theming.
 */
export function buildAdmissionIndex(
  actions: ReadonlyArray<FilterAction>
): AdmissionIndex {
  if (!actions.some((action) => action.kind === "activate-theme")) {
    return EMPTY_ADMISSION_INDEX
  }

  const index = new Map<SurfaceKey, SwatchRole>()
  for (const action of actions) {
    if (action.kind !== "tag-surface") continue
    index.set(action.key, action.role)
  }
  return index
}

export type AdmissionBudget = {
  /** True while the current window still has allowance left. */
  available(): boolean
  /** Charges `ms` of admission work against the current window. */
  spend(ms: number): void
}

/**
 * A rolling wall-clock allowance — see {@link ADMISSION_SPEND_BUDGET_MS}.
 *
 * Checked before the work and charged after it, so a single pass may
 * overrun the window's remainder; the overrun is bounded by
 * {@link ADMISSION_NODE_BUDGET} and charging afterwards is what makes the
 * accounting honest about what was actually spent rather than what was
 * predicted.
 *
 * `now` is injected so tests can drive the window deterministically; the
 * default reads `performance.now()` lazily rather than capturing it, since
 * this module is imported in environments (jsdom, the unit suite) whose
 * `performance` is not the one the content script eventually runs against.
 */
export function createAdmissionBudget(
  now: () => number = () => performance.now()
): AdmissionBudget {
  let windowStart: number | null = null
  let spent = 0

  return {
    available(): boolean {
      const at = now()
      if (windowStart === null || at - windowStart >= ADMISSION_WINDOW_MS) {
        windowStart = at
        spent = 0
      }
      return spent < ADMISSION_SPEND_BUDGET_MS
    },
    spend(ms: number): void {
      spent += ms
    },
  }
}

/** True for a node this pass will not spend budget reading. */
function isAdmissible(node: Node): node is HTMLElement {
  if (!isHTMLElementNode(node)) return false
  // A node added and removed again within the same batch is reported but no
  // longer has a computed style worth reading (and nothing to flash).
  if (!node.isConnected) return false
  // The canvas is the static layer's, not the per-surface layer's. `scan()`
  // walks *descendants* of its root and so never tags either of these; a
  // `data-sw-patched` tag here would out-specify `buildDarkThemeCSS`'s own
  // `html, body { background: … }` rule and hand the page canvas to a
  // mechanism that has never owned it.
  if (node === document.body || node === document.documentElement) return false
  return true
}

/**
 * The elements `records` makes newly worth binding, capped at `budget`.
 *
 * Two record types, treated asymmetrically on purpose:
 *
 *   - `childList` contributes each added node *and its subtree*. This is
 *     the case the module exists for — the vendor built a popup and handed
 *     it over whole, and its interesting carriers are usually descendants
 *     of the added node rather than the node itself.
 *   - `attributes` (`class`/`style`) contributes the target **only**, never
 *     its subtree. It covers the real second case — a menu already in the
 *     DOM, scanned in its closed state, whose `.open` class brings a
 *     different background with it — without the pathology the symmetric
 *     choice would have: `class` changes land on `<body>` and on layout
 *     wrappers constantly, and walking those subtrees would burn the whole
 *     budget on elements nothing about the record suggests have changed.
 *     A state class on an *ancestor* of the carrier is the acknowledged gap,
 *     and it degrades to exactly the pre-admission behaviour.
 *
 * Callers pass records already filtered through `isSelfAuthored`, so this
 * does not re-check extension ownership beyond what `isAdmissible` covers;
 * `keyFor` (via `shouldSkip`) is the authoritative exclusion.
 */
export function collectAdmissionCandidates(
  records: ReadonlyArray<MutationRecord>,
  budget: number = ADMISSION_NODE_BUDGET
): ReadonlyArray<HTMLElement> {
  const candidates: Array<HTMLElement> = []

  const offer = (node: Node): boolean => {
    if (candidates.length >= budget) return false
    if (isAdmissible(node)) candidates.push(node)
    return true
  }

  for (const record of records) {
    if (candidates.length >= budget) break

    if (record.type === "attributes") {
      offer(record.target)
      continue
    }

    for (const added of record.addedNodes) {
      if (!offer(added)) break
      if (!isHTMLElementNode(added) || !added.isConnected) continue
      const walker = document.createTreeWalker(added, NodeFilter.SHOW_ELEMENT)
      let node = walker.nextNode()
      while (node !== null && candidates.length < budget) {
        offer(node)
        node = walker.nextNode()
      }
    }
  }

  return candidates
}

/**
 * Binds every candidate whose vendor background names an already-committed
 * key, and returns how many were bound.
 *
 * `keyFor` is injected rather than imported because the read it performs
 * (`readAttr` + `surfaceKeyFor` + `shouldSkip`) lives in `pipeline.ts`,
 * which imports this module — and because the caller, not this function,
 * owns running the whole loop inside `withVendorColorsVisible()`. That
 * suppression is not optional: the static layer paints `th`, `pre`,
 * `input`, `dialog` and the ARIA popup roles with `!important` rules keyed
 * on element type, so an unsuppressed read of a *new* popup returns this
 * extension's own `--sw-surface` and would bind it to whatever key that
 * colour happens to spell. One call around the batch, not one per element.
 *
 * The write itself goes through `actuator.ts`'s `tagSurfaceElements`, not
 * a `dataset` assignment here — that module is documented as the only one
 * that writes `data-sw-patched`, and a leading-edge path is a reason to
 * keep that true, not an exception to it. The actions this synthesises are
 * the same shape `decide()` emitted for these keys in the round that
 * committed them; nothing here invents an action the adapter would not
 * have produced.
 */
export function admit(
  candidates: ReadonlyArray<HTMLElement>,
  index: AdmissionIndex,
  keyFor: (el: HTMLElement) => SurfaceKey | null
): number {
  if (index.size === 0) return 0

  const elementsByKey = new Map<SurfaceKey, Array<HTMLElement>>()
  for (const el of candidates) {
    const key = keyFor(el)
    if (key === null || !index.has(key)) continue
    const bucket = elementsByKey.get(key)
    if (bucket === undefined) elementsByKey.set(key, [el])
    else bucket.push(el)
  }
  if (elementsByKey.size === 0) return 0

  const actions: Array<FilterAction> = []
  for (const key of elementsByKey.keys()) {
    const role = index.get(key)
    if (role === undefined) continue
    actions.push({ kind: "tag-surface", key, role })
  }

  tagSurfaceElements(actions, elementsByKey)

  // Counted from what was offered, not from tagSurfaceElements' own boolean
  // — that reports "did anything change", which is the signal `realize()`
  // needs and not the one a caller measuring admission coverage wants.
  let admitted = 0
  for (const bucket of elementsByKey.values()) admitted += bucket.length
  return admitted
}
