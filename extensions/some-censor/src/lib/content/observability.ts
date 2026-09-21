/**
 * some-censor's observability adapter — the extension-specific half of
 * `@some-extension/common/observability` (OBS1, #1395).
 *
 * ## Why a per-*page-load* recorder, not a per-session one
 *
 * `some-filter`'s `coverage-observability.ts` is the named model here: both
 * extensions keep their interesting state in a content script rather than in
 * a long-lived background worker, so there is no single writer to own one
 * shared `storage.local` key, and concurrently open tabs would clobber each
 * other's ring buffer on every flush. Each page load therefore gets its own
 * storage key ({@link sessionStorageKey}) plus an entry in a small capped
 * index ({@link readIndex}/{@link touchIndex}) so a debug page (OBS2, #1396)
 * can discover which recordings exist and pick one.
 *
 * #1395 specified the storage key as `…session.${sessionOrdinal}.v1`, keyed
 * by `VideoManager`'s `_session`. That ordinal is the wrong key for two
 * reasons, so it is recorded as *event data* instead and the storage key is
 * scoped to the content-script instance:
 *
 *   1. `mkSession()` is "strictly increasing for the life of the bundle"
 *      (`common/src/lib/session.ts`) — i.e. per content-script instance. Two
 *      tabs open on YouTube both mint session 1, so both would write the same
 *      key: exactly the cross-tab clobbering the per-session-key scheme
 *      exists to prevent.
 *   2. `Controller` C2 tears the runtime down and mints a *fresh* session on
 *      every `yt-navigate-finish` — every chip click, every sidebar link. A
 *      recorder per ordinal would mean a new storage key and a new index
 *      entry every few seconds of ordinary browsing, cycling the 20-entry
 *      index within minutes and discarding the date corpus this story exists
 *      to accumulate (#1394's "Why this precedes QC2").
 *
 * One recorder spanning those teardown/restart cycles is the same choice
 * `coverage-observability.ts` makes and for the same stated reason ("the same
 * instance keeps recording across those, which is exactly the window a
 * SPA-navigation flash needs to be observed in"). Every session boundary is
 * still on the timeline as a `session.start`/`session.reset` pair carrying the
 * ordinal, so nothing about session granularity is lost — it moves from the
 * key to the events, where it is queryable rather than fragmenting.
 *
 * ## What it records about dates, and why that is not a disclosure
 *
 * `H2` (`docs/quarantine-capsule.md`) treats an upload date as nonsemantic —
 * it is the one field this extension already declines to withhold — so the
 * raw string is recorded verbatim, which is what makes an actually-observed
 * corpus for QC2 (#1384) possible without inventing fixtures. Nothing else
 * extraction touches is recorded: no title, no channel name, no thumbnail,
 * no href. {@link recordUploadDate} takes a raw date string and an element
 * and reads only that element's tag name.
 *
 * Distinct raw forms are additionally deduplicated into a `dates.<surface>`
 * snapshot rather than living only on the event timeline. The ring buffer is
 * bounded and `extensionStoragePersistence` sheds oldest events first under
 * its byte budget, but metrics and snapshots are never shed — so the corpus
 * survives a long browsing session that would otherwise evict the very
 * events it is made of.
 */

import { ext } from "@censor/platform/content"
import {
  extensionStoragePersistence,
  memoryPersistence,
  Recorder,
  type Invariant,
  type InvariantOutcome,
  type JsonValue,
  type ObservabilityPersistence,
} from "@some-extension/common/observability"

import type { ViewState } from "./fsm"
import type { BoyoSurface } from "./layout/surface"
import { surfaceOf } from "./layout/surface"

// ── Vocabulary ───────────────────────────────────────────────────────────────

/**
 * Every event kind, as data.
 *
 * The union is derived from this array rather than declared alongside it so
 * there is one place to add a kind — and so a test (and the OBS2 debug page's
 * filter) can enumerate the vocabulary at runtime instead of restating it and
 * drifting.
 */
export const BOYO_EVENT_KINDS = [
  // Lifecycle. `session.start`/`session.reset` carry VideoManager's own
  // `_session` ordinal as their subject — see this module's header.
  "session.start",
  "session.reset",
  "navigation.finish",
  "mutation.batch",
  // Mount pipeline, one kind per outcome `VideoManager.upsert()` can reach.
  "mount.resolved",
  "mount.provisional",
  "mount.unresolved",
  "mount.rejected",
  /** A promotion discarded post-await because `el` was recycled (#980, M6). */
  "mount.stale_discarded",
  /**
   * An id change on a mounted element that was *not* treated as a recycle,
   * because the element still advertises the artifact we mounted (#1423).
   * Recorded because the discrimination is a heuristic against a vendor DOM:
   * a card the user reports as wrongly re-masked, or wrongly left revealed,
   * is diagnosed by whether this fired and how often.
   */
  "mount.churn_ignored",
  "channel.backfilled",
  "channel.abandoned",
  /**
   * One bulk advance-to-title keystroke, with what it covered (#1424). The
   * detail, not the count, is the diagnostic: a command named "advance all"
   * that advanced 6 of 31 visible cards is the reported symptom, and until
   * this event existed nothing anywhere recorded the denominator.
   */
  "command.advance_all",
  // Per-card FSM state, one kind per `ViewState["kind"]` (see ENTRY_EVENT).
  "entry.masked",
  "entry.meta",
  "entry.title",
  "entry.revealed",
  "entry.whitelisted",
  // Date extraction — the corpus mechanism QC2 (#1384) depends on.
  "date.observed",
  "date.absent",
  // Invariant transitions, mirroring some-filter's violated/recovered pair.
  "invariant.violated",
  "invariant.recovered",
] as const

export type BoyoEventKind = (typeof BOYO_EVENT_KINDS)[number]

export const BOYO_COUNTERS = [
  "sessions_started",
  "navigations",
  "mutation_batches",
  "mounts_resolved",
  "mounts_provisional",
  "cards_queued_unresolved",
  "cards_rejected",
  "stale_promotions_discarded",
  /** Id changes ruled vendor churn rather than a recycle (#1423). */
  "churn_ignored",
  "channels_backfilled",
  "channels_abandoned",
  /** Bulk advance-to-title keystrokes handled while running (#1424). */
  "bulk_advances",
  /** Cards those keystrokes moved from masked/meta to title. */
  "bulk_advance_advanced",
  /**
   * Cards they did not act on and could not have: detached, or hidden by the
   * occluder while mid-resolution, mid-mount, or untracked. Deliberately
   * excludes cards already at or past title, which are covered rather than
   * skipped, and tiles the occluder never hid, which were never cards to miss.
   */
  "bulk_advance_skipped",
  "entries_masked",
  "entries_meta",
  "entries_title",
  "entries_revealed",
  "entries_whitelisted",
  /** Every sighting, including repeats of a form already in the corpus. */
  "dates_observed",
  "dates_absent",
  "invariant_violations",
  /**
   * How many times the invariants were actually evaluated.
   *
   * Without it a `status: "healthy"` export is ambiguous between "checked, and
   * fine" and "never got to check" — a distinction that cost two debugging
   * sessions on #1421, both of which began from an export reading healthy on a
   * visibly broken page. `sampleHealth()` only rides VideoManager's retry loop
   * and the stall watch, so a quiet page can legitimately evaluate nothing.
   */
  "health_samples",
] as const

export type BoyoCounter = (typeof BOYO_COUNTERS)[number]

export const BOYO_AGGREGATES = [
  /** Candidate elements in one observer batch — mutation pressure per batch. */
  "mutation_batch_candidates",
  /** `_unresolved.size` sampled whenever the health cadence fires. */
  "unresolved_depth",
  /** `_channelPending.size`, sampled alongside it. */
  "channel_pending_depth",
  /**
   * Per-keystroke skipped count for a bulk advance (#1424). An aggregate
   * rather than only a counter because the shape is the finding: the live
   * report was a *stable fraction* missed on every press, which a running
   * total cannot distinguish from one catastrophic press among many clean
   * ones.
   */
  "bulk_advance_skipped_per_command",
] as const

export type BoyoAggregate = (typeof BOYO_AGGREGATES)[number]

/**
 * One kind per FSM state, as a total map rather than a partial one: a new
 * `ViewState` variant is then a compile error here instead of a silently
 * unrecorded transition.
 */
const ENTRY_EVENT: Readonly<Record<ViewState["kind"], BoyoEventKind>> = {
  masked: "entry.masked",
  meta: "entry.meta",
  title: "entry.title",
  revealed: "entry.revealed",
  whitelisted: "entry.whitelisted",
}

const ENTRY_COUNTER: Readonly<Record<ViewState["kind"], BoyoCounter>> = {
  masked: "entries_masked",
  meta: "entries_meta",
  title: "entries_title",
  revealed: "entries_revealed",
  whitelisted: "entries_whitelisted",
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export type { BoyoSurface } from "./layout/surface"
export { surfaceOf } from "./layout/surface"

// ── Invariants ───────────────────────────────────────────────────────────────

/**
 * How long an element may sit inside `_promote()`'s re-entrancy guard before
 * {@link boyoInvariants}' `PromotionGuardClears` calls it stuck.
 *
 * Generous on purpose: the guarded region is one `IS_WHITELISTED` round trip
 * to the background worker, which is milliseconds when the worker is alive and
 * seconds at worst when MV3 has to respawn it to answer. Thirty seconds is
 * past any of that, and a promise that has not settled by then is not slow —
 * it is never going to settle.
 */
export const PROMOTION_STALL_MS = 30_000

/**
 * Grace added to `RESOLVE_BUDGET_MS` before `OccludedCardResolves` reports a
 * queued video-shaped card as stuck. The retry loop is a 500 ms interval and
 * the budget is only checked when a pass runs, so a card can legitimately be
 * a pass or two past its budget; this keeps a normal expiry from reading as a
 * violation.
 */
export const RESOLVE_GRACE_MS = 2_000

/** One element waiting in a `VideoManager` queue, as the invariants see it. */
export type QueuedCard = {
  /** `elementKey()`'s output (unresolved) or `c:<videoId>` (channel pending). */
  readonly key: string
  /** When the shared attempt budget started for this key. */
  readonly firstSeenAt: number
  /** `isVideoCard(el)` right now — the pre-mask rule's own predicate. */
  readonly videoShaped: boolean
}

/**
 * How long an element may sit under the static occluder, unadopted, before
 * {@link boyoInvariants}' `OccluderReleases` calls it stranded.
 *
 * Sized above `RESOLVE_BUDGET_MS` on purpose: a card legitimately waiting out
 * its resolution budget is still occluded and must not read as a violation.
 * Past that budget plus a margin, nothing in the design is still coming for
 * it — the occluder is lifted by exactly one thing, and that thing has given
 * up or never knew.
 */
export const OCCLUSION_GRACE_MS = 15_000

/** One element the static occluder is hiding with no `data-boyo` on it. */
export type OccludedCard = {
  /** Renderer tag name, lowercased. Never an id, href, or any card content. */
  readonly tag: string
  /** When this element was first observed occluded-and-unadopted. */
  readonly sinceAt: number
}

/**
 * What one bulk advance-to-title keystroke actually covered (#1424).
 *
 * The command is named *advance all*, is bound to a single key, and is
 * documented as acting on "every masked or meta entry" — but it iterates
 * `_byVideo`, which holds only entries that have already been promoted. Every
 * other population on the page is silently outside its reach. This is the
 * denominator that makes the claim checkable.
 *
 * The buckets are disjoint by construction, so `advanced + alreadyPast +
 * detached` is exactly the registry size at keypress time, and the three
 * non-registry fields partition the rest of the page. They are reported
 * separately rather than as one "skipped" number because they have different
 * causes and different fixes: `unresolved` is a card mid-resolution and will
 * very often be legitimately non-zero on a live feed, while
 * `occludedUntracked` is the orphan population of #1421 and should trend to
 * zero as that epic lands.
 */
export type BulkAdvanceCoverage = {
  /** Registry entries moved from masked/meta to title by this keystroke. */
  readonly advanced: number
  /** Registry entries already at or past title — covered, nothing to do. */
  readonly alreadyPast: number
  /**
   * Registry entries whose element has left the DOM. `advanceToTitle()` has
   * always skipped these, and until #1424 did so without saying so.
   */
  readonly detached: number
  /**
   * Occluded cards waiting in `_unresolved` — hidden, and mid-resolution.
   *
   * Not `_unresolved.size`. `upsert()` enqueues every element failing
   * `isVideoCard()` (a channel lockup, a playlist, an unhydrated shell) so
   * extraction need not rescan their subtrees each pass, and the premask
   * `:has()` guard deliberately leaves those visible. They were never cards
   * and were never missed, so they are not counted (bot-found, #1429 P1).
   */
  readonly unresolved: number
  /**
   * Occluded cards inside `_promote()`'s guard — hidden, and mid-mount.
   *
   * Its own bucket rather than part of the one below, because `_promote()`
   * dequeues before awaiting the `IS_WHITELISTED` round trip: for the length
   * of that trip a perfectly healthy card is occluded and in neither
   * `_unresolved` nor the registry, and attributing it to orphans would muddy
   * the one figure whose value is that it should trend to zero (#1429 P2).
   */
  readonly promoting: number
  /**
   * Occluded cards in no queue and no guard — #1422's rejected non-video
   * renderers and #1423/#1426-class orphans. Nothing is coming for these.
   */
  readonly occludedUntracked: number
  /**
   * How many of `advanced + alreadyPast` were still awaiting channel backfill.
   *
   * Recorded because #1424 asserts that a `_channelPending` card is skipped.
   * It is not: `_promoteProvisional()` puts the entry in `_byVideo` *and*
   * queues the backfill, so the command does advance it. This field is what
   * makes that visible rather than something a future reader has to re-derive
   * from the source — a non-zero value here alongside a covered card is the
   * evidence.
   */
  readonly channelPending: number
}

/** One element currently inside `_promote()`'s re-entrancy guard. */
export type PromotingCard = {
  /**
   * The videoId this promotion is for — not `elementKey()`'s output, unlike
   * {@link QueuedCard}. It is already in hand at the call site (so recording
   * it costs no extra DOM read on the mount path), and it is the more useful
   * half of the answer anyway: a stuck promotion is diagnosed by which video
   * never mounted, not by where its element sat in the tree.
   */
  readonly key: string
  readonly startedAt: number
}

/**
 * Everything {@link boyoInvariants} needs, gathered once per health sample by
 * `VideoManager` reading its own live queues. Pure data, so every check below
 * is unit-testable with a plain object and no DOM.
 */
export type BoyoContext = {
  readonly now: number
  readonly phase: "idle" | "running"
  /** `RESOLVE_BUDGET_MS`, passed in rather than imported — see below. */
  readonly resolveBudgetMs: number
  readonly unresolved: ReadonlyArray<QueuedCard>
  readonly channelPending: ReadonlyArray<QueuedCard>
  readonly promoting: ReadonlyArray<PromotingCard>
  /**
   * Read from the DOM, not from any queue — see `OccluderReleases`. This is
   * the only field here that is not a projection of `VideoManager`'s own
   * bookkeeping, and that is what makes it able to see what the bookkeeping
   * cannot.
   */
  readonly occluded: ReadonlyArray<OccludedCard>
}

const violated = (details: JsonValue): InvariantOutcome => ({
  ok: false,
  details,
})

export const boyoInvariants: ReadonlyArray<Invariant<BoyoContext>> = [
  {
    name: "OccludedCardResolves",
    description:
      "No video-shaped element sits in the unresolved queue past RESOLVE_BUDGET_MS. retryUnresolved() used to exempt video-shaped elements from the budget on the assumption that such an element 'cannot spin either, being video-shaped means it has a watch or shorts href, which is the very thing extractVideoId reads' — an assumption that failed for the one tag isVideoCard() accepted unconditionally (#1422). The budget now binds every queued element, so a violation here means the budget itself has stopped being applied; a video-shaped element rejected at budget and still occluded is OccluderReleases's to report.",
    check: (ctx): InvariantOutcome => {
      if (ctx.phase !== "running") return { ok: "unknown" }
      const deadline = ctx.resolveBudgetMs + RESOLVE_GRACE_MS
      const stuck = ctx.unresolved.filter(
        (c) => c.videoShaped && ctx.now - c.firstSeenAt >= deadline
      )
      return stuck.length === 0
        ? { ok: true }
        : violated({
            keys: stuck.map((c) => c.key),
            waitedMs: stuck.map((c) => ctx.now - c.firstSeenAt),
            budgetMs: ctx.resolveBudgetMs,
          })
    },
  },
  {
    name: "OccluderReleases",
    description:
      "No element sits under the static pre-mask occluder, without data-boyo, past OCCLUSION_GRACE_MS. Unlike every other check here this reads the DOM rather than VideoManager's bookkeeping, because the failures it exists for are precisely the ones that leave an element in no queue, no registry and no guard — where a bookkeeping check has nothing to look at and reports healthy while the page is visibly broken (#1421). The occluder is lifted by exactly one thing, the content script writing data-boyo; an element it is still hiding after the resolution budget has passed is one nothing is coming back for, and it is inert as well as blurred because that rule sets pointer-events: none.",
    check: (ctx): InvariantOutcome => {
      if (ctx.phase !== "running") return { ok: "unknown" }
      const stranded = ctx.occluded.filter(
        (c) => ctx.now - c.sinceAt >= OCCLUSION_GRACE_MS
      )
      if (stranded.length === 0) return { ok: true }
      // Tags rather than ids: which *kind* of element is stranded is the whole
      // diagnostic (a non-video rich-item is #1422, a lockup is #1426), and a
      // tag name carries nothing about the card (#1382).
      const byTag: Record<string, number> = {}
      for (const c of stranded) byTag[c.tag] = (byTag[c.tag] ?? 0) + 1
      return violated({
        count: stranded.length,
        byTag,
        longestMs: Math.max(...stranded.map((c) => ctx.now - c.sinceAt)),
        graceMs: OCCLUSION_GRACE_MS,
      })
    },
  },
  {
    name: "PromotionGuardClears",
    description:
      "No element has been inside _promote()'s _promoting re-entrancy guard longer than PROMOTION_STALL_MS. The guard is released in a finally block, so it clears on both settle paths of the IS_WHITELISTED round trip — but a promise that never settles at all never runs that finally, and every later _promote() for that element then returns at the guard for the life of the session, leaving the card occluded by the pre-mask rule with nothing coming to lift it.",
    check: (ctx): InvariantOutcome => {
      if (ctx.phase !== "running") return { ok: "unknown" }
      const stalled = ctx.promoting.filter(
        (p) => ctx.now - p.startedAt >= PROMOTION_STALL_MS
      )
      return stalled.length === 0
        ? { ok: true }
        : violated({
            keys: stalled.map((p) => p.key),
            heldMs: stalled.map((p) => ctx.now - p.startedAt),
          })
    },
  },
]

// ── Storage keys and the session index ───────────────────────────────────────

const SESSION_KEY_PREFIX = "bc.observability.session."
/** Exported so a test can simulate a competing tab writing the same key. */
export const INDEX_KEY = "bc.observability.index.v1"
const MAX_INDEX_ENTRIES = 20

export function sessionStorageKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}.v1`
}

/**
 * What the OBS2 debug page's session picker lists.
 *
 * Deliberately **not** the page title, which `some-filter`'s own `IndexEntry`
 * carries: on YouTube the document title is the video title, which is the
 * single field this extension exists to withhold (#1382). The surface says
 * enough to pick a recording apart from another without disclosing one.
 */
export type IndexEntry = {
  sessionId: string
  origin: string
  surface: BoyoSurface
  /** VideoManager's session ordinal as of the last index touch. */
  sessionOrdinal: number
  updatedAt: number
}

function isIndexEntry(value: unknown): value is IndexEntry {
  if (value === null || typeof value !== "object") return false
  return (
    typeof Reflect.get(value, "sessionId") === "string" &&
    typeof Reflect.get(value, "origin") === "string" &&
    typeof Reflect.get(value, "surface") === "string" &&
    typeof Reflect.get(value, "sessionOrdinal") === "number" &&
    typeof Reflect.get(value, "updatedAt") === "number"
  )
}

/** The debug page's session picker. Sorted most-recently-updated first. */
export async function readIndex(): Promise<Array<IndexEntry>> {
  try {
    const raw: unknown = await ext.storage.local.get(INDEX_KEY)
    const value: unknown =
      raw !== null && typeof raw === "object"
        ? Reflect.get(raw, INDEX_KEY)
        : undefined
    if (!Array.isArray(value)) return []
    return value.filter(isIndexEntry).sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

/**
 * Index writes, serialized within this tab.
 *
 * Bot-found (#1397's own review): {@link touchIndex} is a read-modify-write
 * over one shared array, so two overlapping calls can each read the same
 * `existing` and the later write can drop the earlier one's entry. Chaining
 * removes that race between this tab's own calls outright. It cannot remove
 * it *between* tabs — `storage.local` offers no compare-and-set to build a
 * lock on — so `touchIndex` additionally reads back and re-applies once; see
 * there.
 */
let _indexWrites: Promise<void> = Promise.resolve()

function serializeIndexWrite(op: () => Promise<void>): Promise<void> {
  const next = _indexWrites.then(op, op)
  _indexWrites = next.catch(() => undefined)
  return next
}

/**
 * Delete one recording's persisted bundle.
 *
 * Bot-found (#1397's own review): an index entry evicted by the cap used to
 * leave its `bc.observability.session.<id>.v1` payload behind, and every page
 * load mints a new key — so the bundles nothing could ever list again
 * accumulated in `storage.local` without bound, until writes began failing
 * silently. That is the exact storage creep this whole subsystem is built to
 * refuse, so eviction now takes the payload with it.
 */
async function dropRecording(sessionId: string): Promise<void> {
  try {
    await ext.storage.local.remove(sessionStorageKey(sessionId))
  } catch {
    // Best-effort.
  }
}

/**
 * Publish (or refresh) this recording's index entry, evicting the oldest past
 * the cap — payload and all.
 *
 * Best-effort throughout: diagnostics degrading must never affect masking, so
 * every failure is swallowed.
 */
export async function touchIndex(entry: IndexEntry): Promise<void> {
  return serializeIndexWrite(async () => {
    try {
      const existing = await readIndex()
      const next = capIndex(entry, existing)
      await ext.storage.local.set({ [INDEX_KEY]: next })

      await dropEvicted(existing, next)

      // Cross-tab reconciliation. Another tab's concurrent read-modify-write
      // can have read the same `existing` we did and written after us,
      // dropping this entry. One read-back and re-apply closes the window that
      // actually matters — a tab whose recording would otherwise never appear
      // in the picker at all — without pretending to be a lock: a second
      // clobber in the same instant is left to the next touch.
      const after = await readIndex()
      if (!after.some((e) => e.sessionId === entry.sessionId)) {
        // Bot-found (#1397's own review, round 2): re-applying at capacity
        // evicts somebody too, so this path has to shed payloads exactly like
        // the one above — otherwise the recovery added for the cross-tab race
        // reintroduces the orphaned-payload leak it was written alongside.
        const reconciled = capIndex(entry, after)
        await ext.storage.local.set({ [INDEX_KEY]: reconciled })
        await dropEvicted(after, reconciled)
      }
    } catch {
      // Best-effort.
    }
  })
}

/** Delete the bundle of every recording present in `before` but not in `after`. */
async function dropEvicted(
  before: ReadonlyArray<IndexEntry>,
  after: ReadonlyArray<IndexEntry>
): Promise<void> {
  const kept = new Set(after.map((e) => e.sessionId))
  for (const evicted of before) {
    if (!kept.has(evicted.sessionId)) await dropRecording(evicted.sessionId)
  }
}

/** `entry` first, everything else by recency, truncated to the cap. */
function capIndex(
  entry: IndexEntry,
  existing: ReadonlyArray<IndexEntry>
): Array<IndexEntry> {
  return [entry, ...existing.filter((e) => e.sessionId !== entry.sessionId)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_INDEX_ENTRIES)
}

/** Forget one recording entirely — its index entry and its stored bundle. */
export async function removeFromIndex(sessionId: string): Promise<void> {
  return serializeIndexWrite(async () => {
    try {
      const existing = await readIndex()
      await ext.storage.local.set({
        [INDEX_KEY]: existing.filter((e) => e.sessionId !== sessionId),
      })
    } catch {
      // Best-effort.
    }
    // Outside the try on purpose: the payload is the larger of the two, so it
    // is dropped even when rewriting the index itself failed.
    await dropRecording(sessionId)
  })
}

// ── The recorder ─────────────────────────────────────────────────────────────

/**
 * Ceiling on any one persisted `detail` or snapshot. Sized by the corpus
 * snapshot, which is the largest thing this adapter stores — see
 * {@link createBoyoRecorder}, and the test that pins the arithmetic.
 */
export const MAX_SNAPSHOT_BYTES = 8192

export type BoyoRecorder = Recorder<
  BoyoEventKind,
  BoyoCounter,
  BoyoAggregate,
  BoyoContext
>

/**
 * `storage.local`-backed persistence, degrading to in-memory rather than
 * throwing.
 *
 * `extensionStoragePersistence` resolves the storage area eagerly and throws
 * when there is none — and this is constructed from `Controller.init()`,
 * before the broadcast listener and the bootstrap round trip. An engine that
 * withholds `storage` (a permission not yet granted, a page the content script
 * runs in with no extension API at all) would therefore take the whole
 * extension down at startup. That inverts this subsystem's own contract:
 * observability degrades, the thing observed does not.
 */
function defaultPersistence(sessionId: string): ObservabilityPersistence {
  try {
    return extensionStoragePersistence({ key: sessionStorageKey(sessionId) })
  } catch {
    return memoryPersistence()
  }
}

/**
 * One recorder per content-script instance — see this module's header for why
 * that scope, and not one per `VideoManager` session ordinal, is correct.
 */
export function createBoyoRecorder(
  sessionId: string,
  /** Injectable so a test can drive a whole recording without touching disk. */
  persistence: ObservabilityPersistence = defaultPersistence(sessionId)
): BoyoRecorder {
  return new Recorder<BoyoEventKind, BoyoCounter, BoyoAggregate, BoyoContext>({
    namespace: "some-censor",
    capacity: 400,
    invariants: boyoInvariants,
    persistence,
    // Bot-found (#1397's own review, round 2). The default 2 KB clamp was
    // sized for small event details, and `clamp()` does not trim an oversized
    // value — it replaces it with a truncated *string*. The `dates.<surface>`
    // snapshot is an array of up to MAX_DATE_FORMS_PER_SURFACE forms of up to
    // MAX_RAW_DATE_CHARS each, which serializes to 40 * (64 + 3) + 1 = 2681
    // bytes plain, and 5241 with every character escaped — so the corpus this
    // story exists to accumulate would have silently stopped being an array,
    // and the OBS2 page could not have read it, well before its own cap.
    // 8 KB clears the escaped worst case with room to spare and is still a
    // small fixed budget; `boyoCorpusSnapshotFits()` pins the arithmetic so a
    // later change to either cap fails a test rather than this ceiling.
    maxDetailBytes: MAX_SNAPSHOT_BYTES,
  })
}

// ── The live recording ───────────────────────────────────────────────────────

/**
 * How often {@link BoyoObservability.sampleHealth} is allowed to run.
 *
 * The only cadence available to piggyback on is `VideoManager`'s 500 ms retry
 * loop, and running every invariant plus a `storage.local` index touch at that
 * rate would make the observer more expensive than the thing observed
 * (Charter §8). Both invariants are about states measured in *tens of
 * seconds*, so sampling at 10 s loses nothing either can detect.
 */
export const HEALTH_SAMPLE_INTERVAL_MS = 10_000

/** Distinct raw date forms kept per surface. See {@link BoyoObservability}. */
export const MAX_DATE_FORMS_PER_SURFACE = 40

/** Distinct `<surface>:<renderer>` pairs reported as date-less. */
const MAX_ABSENT_PROBES = 64

/**
 * Longest raw string accepted as a date.
 *
 * A structural guard, not a formatting one. Every form QC2 (#1384) cares
 * about — "3 days ago", "Streamed 2 hours ago", "Premiered Jan 5, 2024" — is
 * far inside this. A *much* longer string means the selector drifted onto some
 * other metadata run, and the one thing this module must never do is record
 * that: an overlong value is reported as an absence with a reason, never
 * truncated and kept, because a truncated title is still a title.
 */
export const MAX_RAW_DATE_CHARS = 64

/**
 * One content-script instance's recording, and the small amount of state that
 * keeps it bounded: which raw date forms have already been banked, which
 * surface/renderer pairs have already been reported date-less, and which
 * invariants were violated as of the last health sample.
 *
 * A class rather than module-level mutables so a test can drive a whole
 * recording — dedup, caps, invariant transitions, persistence round-trip —
 * against `memoryPersistence()` without touching the live singleton below.
 */
export class BoyoObservability {
  readonly sessionId: string
  readonly recorder: BoyoRecorder

  private readonly _dateForms = new Map<BoyoSurface, Set<string>>()
  private readonly _absentProbes = new Set<string>()
  private readonly _violated = new Set<string>()
  private _lastHealthAt = 0
  private _ordinal = 0

  constructor(sessionId: string, recorder: BoyoRecorder) {
    this.sessionId = sessionId
    this.recorder = recorder
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  sessionStart(ordinal: number): void {
    this._ordinal = ordinal
    // Bot-found (#1428's own review, round 2). This adapter is created once per
    // content-script instance and deliberately outlives a session (see this
    // module's header), so without this a new SPA session inherits the previous
    // one's throttle — and the sample it swallows is the *first* one after the
    // page changed underneath us, which is the sample most likely to have
    // something to say. Every invariant is affected; the one that made it
    // visible was OccluderReleases.
    this._lastHealthAt = 0
    this.recorder.record({
      kind: "session.start",
      subject: ordinal,
      detail: {
        surface: currentSurface(),
        // The locale decides how a relative date is phrased at all, so a
        // corpus that does not carry it cannot say whether a form is missing
        // or simply not reachable from this browser's settings — #1384's
        // acceptance criteria treat an honestly-disclosed gap as correct, and
        // this is what makes disclosing one possible.
        locale: typeof navigator === "undefined" ? "" : navigator.language,
      },
    })
    this.recorder.count("sessions_started")
    // Published here as well as on every health sample: sampleHealth only runs
    // off VideoManager's retry loop, which a page with nothing queued never
    // starts — and a recording the OBS2 picker cannot see is a recording that
    // may as well not exist.
    this._touchIndex(Date.now())
  }

  sessionReset(ordinal: number): void {
    this.recorder.record({
      kind: "session.reset",
      subject: ordinal,
      severity: "debug",
    })
  }

  navigation(): void {
    this.recorder.record({
      kind: "navigation.finish",
      detail: { surface: currentSurface() },
    })
    this.recorder.count("navigations")
  }

  /**
   * Fold one observer batch in.
   *
   * The counter and the aggregate take every batch; the *event* takes only a
   * batch that actually turned up a card. The observer watches `document.body`
   * with `childList`/`subtree`, so a playing video alone fires batches
   * continuously — at one event each they would evict the whole timeline
   * within seconds of playback, which is precisely the history a bug report
   * needs. A batch with no candidates is also the least informative kind:
   * "YouTube mutated something we do not track" is what the aggregate already
   * says, in one number instead of four hundred events.
   */
  mutationBatch(candidates: number): void {
    this.recorder.count("mutation_batches")
    this.recorder.observe("mutation_batch_candidates", candidates)
    if (candidates === 0) return
    this.recorder.record({
      kind: "mutation.batch",
      severity: "debug",
      detail: { candidates },
    })
  }

  // ── Mount pipeline ─────────────────────────────────────────────────────

  mountResolved(videoId: string): void {
    this.recorder.record({ kind: "mount.resolved", subject: videoId })
    this.recorder.count("mounts_resolved")
  }

  mountProvisional(videoId: string): void {
    this.recorder.record({ kind: "mount.provisional", subject: videoId })
    this.recorder.count("mounts_provisional")
  }

  queued(key: string): void {
    this.recorder.record({
      kind: "mount.unresolved",
      subject: redactQueueKey(key),
      severity: "debug",
    })
    this.recorder.count("cards_queued_unresolved")
  }

  rejected(key: string): void {
    this.recorder.record({
      kind: "mount.rejected",
      subject: redactQueueKey(key),
      severity: "debug",
    })
    this.recorder.count("cards_rejected")
  }

  /** A post-await bail in `_promote()` — the element was recycled (#980, M6). */
  staleDiscarded(videoId: string): void {
    this.recorder.record({
      kind: "mount.stale_discarded",
      subject: videoId,
      severity: "warn",
    })
    this.recorder.count("stale_promotions_discarded")
  }

  /**
   * An id change ruled vendor churn rather than a recycle (#1423).
   *
   * `debug` severity: on a page where the user reveals cards this is ordinary
   * traffic — a hover preview fires it on every revealed card — and it is the
   * *absence* of a matching mount/entry event afterwards, not this event, that
   * would indicate something wrong.
   */
  churnIgnored(videoId: string): void {
    this.recorder.record({
      kind: "mount.churn_ignored",
      subject: videoId,
      severity: "debug",
    })
    this.recorder.count("churn_ignored")
  }

  /**
   * One bulk advance-to-title keystroke and what it covered (#1424).
   *
   * `info` rather than `debug`: unlike the per-card traffic around it this
   * fires once per deliberate user action, and the whole point of the story is
   * that a diagnostics export taken after a keypress should say what the
   * keypress did. A severity that the default export filter drops would put it
   * back where it started.
   *
   * No `subject`: a keystroke is not about one card, and naming one would be
   * both arbitrary and a card-identity leak the recorder deliberately avoids
   * elsewhere (#1382).
   */
  bulkAdvance(coverage: BulkAdvanceCoverage): void {
    const skipped =
      coverage.detached +
      coverage.unresolved +
      coverage.promoting +
      coverage.occludedUntracked
    this.recorder.record({
      kind: "command.advance_all",
      severity: "info",
      detail: { ...coverage, skipped },
    })
    this.recorder.count("bulk_advances")
    if (coverage.advanced > 0) {
      this.recorder.count("bulk_advance_advanced", coverage.advanced)
    }
    if (skipped > 0) this.recorder.count("bulk_advance_skipped", skipped)
    // Observed unconditionally, including at zero: a clean press is a real
    // data point about the distribution, and dropping it would bias the
    // aggregate toward exactly the presses the story is about.
    this.recorder.observe("bulk_advance_skipped_per_command", skipped)
  }

  channelBackfilled(videoId: string): void {
    this.recorder.record({ kind: "channel.backfilled", subject: videoId })
    this.recorder.count("channels_backfilled")
  }

  channelAbandoned(videoId: string): void {
    this.recorder.record({
      kind: "channel.abandoned",
      subject: videoId,
      severity: "debug",
    })
    this.recorder.count("channels_abandoned")
  }

  entryState(kind: ViewState["kind"], videoId: string): void {
    this.recorder.record({
      kind: ENTRY_EVENT[kind],
      subject: videoId,
      severity: "debug",
    })
    this.recorder.count(ENTRY_COUNTER[kind])
  }

  // ── Dates (the QC2 corpus) ─────────────────────────────────────────────

  /**
   * Bank one date-extraction attempt.
   *
   * A repeat of a form already banked for this surface bumps the counter and
   * stops there: "3 days ago" appears on most cards of most feeds, and letting
   * each sighting cost a ring slot would evict the rare forms — the ones a
   * parser actually gets wrong — behind hundreds of copies of the common one.
   * The distinct set is what QC2 needs; the counter is what says how
   * representative it is.
   */
  uploadDate(raw: string | null, surface: BoyoSurface, renderer: string): void {
    if (raw === null || raw === "") {
      this._absent(surface, renderer, "missing")
      return
    }
    if (raw.length > MAX_RAW_DATE_CHARS) {
      this._absent(surface, renderer, "overlong")
      return
    }

    this.recorder.count("dates_observed")
    const forms = this._dateForms.get(surface) ?? new Set<string>()
    if (!this._dateForms.has(surface)) this._dateForms.set(surface, forms)
    if (forms.has(raw) || forms.size >= MAX_DATE_FORMS_PER_SURFACE) return

    forms.add(raw)
    this.recorder.record({
      kind: "date.observed",
      subject: surface,
      detail: { raw, renderer },
    })
    // Snapshots are never shed by the persistence byte budget, unlike events —
    // so this is the copy of the corpus that survives a long browsing session.
    this.recorder.setSnapshot(`dates.${surface}`, [...forms])
  }

  /**
   * Report a surface/renderer pair that yielded no date, once.
   *
   * Deduplicated by the pair rather than rate-limited by count because that is
   * the diagnostic fact: "shorts lockups on Home never carry a date" is worth
   * one event, and the hundredth shorts lockup adds nothing to it.
   */
  private _absent(
    surface: BoyoSurface,
    renderer: string,
    reason: "missing" | "overlong"
  ): void {
    this.recorder.count("dates_absent")
    const probe = `${surface}:${renderer}:${reason}`
    if (
      this._absentProbes.has(probe) ||
      this._absentProbes.size >= MAX_ABSENT_PROBES
    ) {
      return
    }
    this._absentProbes.add(probe)
    this.recorder.record({
      kind: "date.absent",
      subject: surface,
      severity: "debug",
      detail: { renderer, reason },
    })
  }

  /** Distinct raw forms banked for `surface`, in first-seen order. */
  dateForms(surface: BoyoSurface): ReadonlyArray<string> {
    return [...(this._dateForms.get(surface) ?? [])]
  }

  // ── Health ─────────────────────────────────────────────────────────────

  /** Cheap enough to call on every 500 ms retry pass; see the interval's doc. */
  shouldSampleHealth(now: number): boolean {
    return now - this._lastHealthAt >= HEALTH_SAMPLE_INTERVAL_MS
  }

  /**
   * Evaluate every invariant, record only the *transitions*, and publish the
   * report and queue depths as snapshots for the OBS2 debug page to project.
   *
   * Transitions rather than levels for the same reason some-filter records
   * `coverage.violated`/`coverage.recovered` rather than a verdict per poll: a
   * violation that persists for ten minutes is one fact, and sixty copies of
   * it would push the run-up to it out of the ring buffer.
   */
  async sampleHealth(ctx: BoyoContext): Promise<void> {
    this._lastHealthAt = ctx.now
    this.recorder.count("health_samples")

    this.recorder.observe("unresolved_depth", ctx.unresolved.length)
    this.recorder.observe("channel_pending_depth", ctx.channelPending.length)

    const report = await this.recorder.health(ctx)

    for (const result of report.invariants) {
      const wasViolated = this._violated.has(result.name)
      if (result.status === "violated" && !wasViolated) {
        this._violated.add(result.name)
        this.recorder.record({
          kind: "invariant.violated",
          subject: result.name,
          severity: "error",
          detail: result.details ?? null,
        })
        this.recorder.count("invariant_violations")
      } else if (result.status === "ok" && wasViolated) {
        this._violated.delete(result.name)
        this.recorder.record({
          kind: "invariant.recovered",
          subject: result.name,
        })
      }
      // "unknown" deliberately neither sets nor clears: an un-evaluable check
      // is not evidence either way (see runInvariants' own contract).
    }

    // Flattened by hand rather than stored wholesale: HealthReport's optional
    // `details` is `JsonValue | undefined`, which JsonValue does not admit.
    this.recorder.setSnapshot("health", {
      score: report.score,
      status: report.status,
      recentErrors: report.recentErrors,
      generatedAt: report.generatedAt,
      invariants: report.invariants.map((r) => ({
        name: r.name,
        status: r.status,
        t: r.t,
        details: r.details ?? null,
      })),
    })
    this.recorder.setSnapshot("queues", {
      phase: ctx.phase,
      resolveBudgetMs: ctx.resolveBudgetMs,
      unresolved: ctx.unresolved.length,
      unresolvedVideoShaped: ctx.unresolved.filter((c) => c.videoShaped).length,
      channelPending: ctx.channelPending.length,
      promoting: ctx.promoting.length,
    })

    this._touchIndex(ctx.now)
  }

  private _touchIndex(now: number): void {
    void touchIndex({
      sessionId: this.sessionId,
      origin: typeof location === "undefined" ? "" : location.origin,
      surface: currentSurface(),
      sessionOrdinal: this._ordinal,
      updatedAt: now,
    })
  }
}

// ── The singleton the content script records through ─────────────────────────
//
// Mirrors `debug.ts`'s module-scoped registry, which is this package's
// established shape for "one live thing every layer reports to": every call
// site stays a single `observability()?.…` line, and a unit test that never
// starts a recording sees a no-op instead of needing to inject one.

let _live: BoyoObservability | null = null

/**
 * Begin this content-script instance's recording. Idempotent — a second call
 * returns the live recording rather than orphaning the first one's storage
 * key, which matters because `Controller` can re-enter setup (C1/C3).
 */
export function startObservability(
  persistence?: ObservabilityPersistence
): BoyoObservability {
  if (_live !== null) return _live
  const sessionId = mkRecordingId()
  const live = new BoyoObservability(
    sessionId,
    createBoyoRecorder(sessionId, persistence)
  )
  _live = live
  void live.recorder.hydrate()

  // Bot-found (#1397's own review, round 3). The recorder debounces its
  // writes by a second, so a tab closing — or a real navigation away — inside
  // that window loses whatever it was holding. `sessionStart()` publishes the
  // index entry immediately, so a short-lived page could otherwise leave the
  // OBS2 picker an entry whose bundle was never written at all.
  //
  // `flush()`, deliberately, where `some-filter`'s equivalent handler calls
  // `dispose()` and `removeFromIndex()`:
  //
  //   - `dispose()` is permanent, and `pagehide` does *not* always destroy
  //     the context — a document entering the back-forward cache fires it and
  //     comes back alive. A disposed recorder silently ignores every later
  //     `record()`, so the restored page would go on masking with its
  //     diagnostics dead and no sign of it. That is the trap some-filter's
  //     own handler documents from its own review; `flush()` persists the
  //     same state without the recorder being unable to resume.
  //   - `removeFromIndex()` is right for some-filter, whose recording is
  //     about a live page, and wrong here: this corpus exists to be exported
  //     *after* the browsing that produced it (#1394), so delisting it on
  //     unload would discard the entire point. Dead entries are bounded by
  //     the index cap instead.
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      void live.recorder.flush()
    })
  }

  return live
}

/** The live recording, or null when none has been started (tests, teardown). */
export function observability(): BoyoObservability | null {
  return _live
}

/** Drop the live recording. Exported for tests; nothing in src/ calls it. */
export function stopObservability(): void {
  _live = null
}

/**
 * Record one date-extraction attempt against the live recording, deriving the
 * surface from the location and the renderer from the element's tag name —
 * and reading nothing else off the element.
 */
export function recordUploadDate(raw: string | null, el: HTMLElement): void {
  _live?.uploadDate(raw, currentSurface(), el.tagName.toLowerCase())
}

/**
 * Longest a recorded `subject` may be.
 *
 * Bot-found (#1397's own review, round 3): `Recorder.record()` clamps
 * `detail` and **not** `subject`, so an unbounded subject is unbounded in the
 * persisted bundle, with nothing upstream to catch it.
 */
const MAX_SUBJECT_CHARS = 64

/**
 * Reduce one of `elementKey()`'s queue keys to something safe to persist.
 *
 * Bot-found (#1397's own review, round 3). `elementKey()` falls back to
 * `h:${a.href}` — a *complete absolute URL* — for a renderer with no
 * `data-video-id`, which is exactly the case `mount.unresolved` fires on. So
 * the events added for the queue were persisting full hrefs, query strings
 * and all: playlist ids, tracking parameters, whatever the vendor hung off
 * the anchor. That flatly contradicts the boundary this module draws for
 * itself three screens up — "derived from `pathname` only — never the query
 * string ... neither is something a diagnostics bundle has any business
 * carrying (#1382)" — and the doctrine it cites.
 *
 * The key's only job on the timeline is to correlate one element's
 * `mount.unresolved` with its later `mount.rejected`, which needs stability,
 * not legibility. So an `h:` key keeps its prefix and surrenders everything
 * after it to a hash. Other shapes (`v:` a videoId, which mount events
 * already record as their own subject; `p:TAG:index`; `r:` a nonce) carry no
 * URL and are kept readable, bounded.
 */
export function redactQueueKey(key: string): string {
  const sep = key.indexOf(":")
  if (sep === -1) return labelFor(key)
  const prefix = key.slice(0, sep)
  const rest = key.slice(sep + 1)
  return prefix === "h"
    ? `h:${labelFor(rest)}`
    : `${prefix}:${rest.slice(0, MAX_SUBJECT_CHARS)}`
}

/**
 * A short, stable, bounded label for a string — FNV-1a, 32-bit.
 *
 * Not a security primitive and not required to be one: nothing downstream
 * treats it as unguessable, and the input it stands in for is a URL the user
 * is looking at on their own screen. It exists to keep two events about the
 * same element correlatable without persisting the element's address.
 */
function labelFor(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

function currentSurface(): BoyoSurface {
  return typeof location === "undefined"
    ? "other"
    : surfaceOf(location.pathname)
}

/**
 * A per-content-script-instance id. Unique across tabs, which is the whole
 * point of the per-recording storage key — see this module's header.
 *
 * `getRandomValues` rather than `randomUUID` (which needs a secure context)
 * or `Math.random` (flagged by CodeQL on this PR, and the weaker source
 * regardless). This id is not a secret and guards nothing — it only has to
 * not collide between two tabs opening at the same instant — but there is no
 * reason to reach for a weaker source when the stronger one is available
 * everywhere `crypto` is.
 *
 * Wrapped because it is reached from `Controller.init()`: an engine without
 * Web Crypto must cost the recording its cross-tab distinctness, never take
 * the extension down at startup. The clock alone is the honest fallback —
 * two tabs loading in the same millisecond would share a key, which costs a
 * clobbered diagnostic bundle and nothing else.
 */
function mkRecordingId(): string {
  try {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  } catch {
    return `t${String(Date.now())}`
  }
}
