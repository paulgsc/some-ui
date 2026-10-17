/**
 * some-censor's observability adapter — the extension-specific half of
 * `@some-extension/common/observability` (OBS1).
 *
 * ## Why a per-*page-load* recorder, not a per-session one
 *
 * As in some-filter's `coverage-observability.ts`, state lives in a content
 * script, so concurrently open tabs would clobber one shared `storage.local`
 * key. Each page load gets its own key ({@link sessionStorageKey}) plus its
 * own index key ({@link touchIndex}) so a debug page (OBS2) can pick a
 * recording, listed and bounded by {@link compactIndex}.
 *
 * Core's `session` ordinal is recorded as *event data*, not used as the key:
 *
 *   1. `mkSession()` is per content-script instance, so two YouTube tabs both
 *      mint session 1 and would share a key.
 *   2. The Sensor mints a fresh session on every (debounced)
 *      `yt-navigate-finish`. A recorder per ordinal would cycle the 20-entry
 *      index within minutes and discard the date corpus.
 *
 * One recorder spans those sessions; every boundary is still on the timeline
 * as a `session.start`/`session.reset` pair carrying the ordinal.
 *
 * ## What it records about dates, and why that is not a disclosure
 *
 * `H2` (`docs/quarantine-capsule.md`) treats an upload date as nonsemantic,
 * so the raw string is recorded verbatim, giving QC2 (#1384) an observed
 * corpus. Nothing else extraction touches is recorded: no title, channel
 * name, thumbnail or href; the renderer is its tag name.
 *
 * Distinct raw forms are also deduplicated into a `dates.<surface>` snapshot:
 * the ring buffer sheds oldest events under its byte budget, but metrics and
 * snapshots are never shed, so the corpus survives a long session.
 */

import {
  createSessionIndex,
  extensionStoragePersistence,
  memoryPersistence,
  Recorder,
  type Compaction,
  type Invariant,
  type InvariantOutcome,
  type JsonValue,
  type ObservabilityPersistence,
  type SessionIndex,
} from "@some-extension/common/observability"

import type { ViewState } from "./fsm"
import type { BoyoSurface } from "./layout/surface"
import { surfaceOf } from "./layout/surface"
import { estimate, PARSER } from "./maturity/maturity"

// ── Vocabulary ───────────────────────────────────────────────────────────────

/**
 * Every event kind, as data.
 *
 * The union is derived from this array so there is one place to add a kind,
 * and tests and the OBS2 debug page can enumerate it at runtime.
 */
export const BOYO_EVENT_KINDS = [
  // Lifecycle. `session.start`/`session.reset` carry Core's own
  // `session` ordinal as their subject — see this module's header.
  "session.start",
  "session.reset",
  "navigation.finish",
  "mutation.batch",
  // Mount pipeline, one kind per outcome an observation can reach.
  "mount.resolved",
  "mount.provisional",
  "mount.unresolved",
  "mount.rejected",
  /**
   * An id change on a mounted element *not* treated as a recycle, because the
   * element still advertises the artifact we mounted. The discrimination is a
   * heuristic against a vendor DOM, so a card wrongly torn down or wrongly
   * kept is diagnosed by whether this fired.
   */
  "mount.churn_ignored",
  "channel.backfilled",
  "channel.abandoned",
  // Per-card FSM state, one kind per `ViewState["kind"]` (see ENTRY_EVENT).
  "entry.absent",
  "entry.plated",
  // Date extraction — the corpus QC2 (#1384) depends on.
  "date.observed",
  "date.absent",
  /**
   * A catalogue node the layout table could not place (BC2, #1435; B4). The
   * table's staleness signal — see layout/README.md for the recrawl cadence
   * keyed to it. Subject is the reason; detail carries tag and surface.
   */
  "layout.unknown_shape",
  // Invariant transitions, mirroring some-filter's violated/recovered pair.
  "invariant.violated",
  "invariant.recovered",
] as const

export type BoyoEventKind = (typeof BOYO_EVENT_KINDS)[number]

type BoyoCounter =
  | "sessions_started"
  | "navigations"
  | "mutation_batches"
  | "mounts_resolved"
  | "mounts_provisional"
  | "cards_queued_unresolved"
  | "cards_rejected"
  /** Id changes ruled vendor churn rather than a recycle. */
  | "churn_ignored"
  | "channels_backfilled"
  | "channels_abandoned"
  | "entries_absent"
  | "entries_plated"
  /** Every sighting, including repeats of a form already in the corpus. */
  | "dates_observed"
  | "dates_absent"
  | "invariant_violations"
  /** `layout.unknown_shape` events, per session: the recrawl trigger. */
  | "unknown_shapes"
  /**
   * How many times the invariants were actually evaluated.
   *
   * Without it a `status: "healthy"` export is ambiguous between "checked, and
   * fine" and "never got to check": `sampleHealth()` runs when the runtime
   * starts, on a throttled mutation batch, and from the occlusion and stall
   * watches only while they see something, so a quiet page can legitimately
   * go long stretches evaluating nothing.
   */
  | "health_samples"

type BoyoAggregate =
  /** Candidate elements in one observer batch — mutation pressure per batch. */
  | "mutation_batch_candidates"
  /** The Sensor's unresolved-queue depth, sampled whenever health is. */
  | "unresolved_depth"
  /** Cards the Sensor holds awaiting a channel, sampled alongside it. */
  | "channel_pending_depth"

/**
 * One kind per FSM state, as a total map rather than a partial one: a new
 * `ViewState` variant is then a compile error here instead of a silently
 * unrecorded transition.
 */
const ENTRY_EVENT: Readonly<Record<ViewState["kind"], BoyoEventKind>> = {
  absent: "entry.absent",
  plated: "entry.plated",
}

const ENTRY_COUNTER: Readonly<Record<ViewState["kind"], BoyoCounter>> = {
  absent: "entries_absent",
  plated: "entries_plated",
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export type { BoyoSurface } from "./layout/surface"
export { surfaceOf } from "./layout/surface"

// ── Invariants ───────────────────────────────────────────────────────────────

/**
 * Grace added to `RESOLVE_BUDGET_MS` before `OccludedCardResolves` reports a
 * queued video-shaped card as stuck. The retry loop is a 500 ms interval and
 * the budget is only checked when a pass runs, so a card can legitimately be
 * a pass or two past its budget; this keeps a normal expiry from reading as a
 * violation.
 */
export const RESOLVE_GRACE_MS = 2_000

/** One element waiting in the Sensor's queue, as the invariants see it. */
type QueuedCard = {
  /** `t:<tag>` (unresolved) or `c:<tag>` (channel pending): never content. */
  readonly key: string
  /** When this element's budget started. */
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
 * it — while switched on, the occluder is lifted by exactly one thing, and
 * that thing has given up or never knew.
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
 * Everything {@link boyoInvariants} needs, gathered once per health sample by
 * the runtime reading the Sensor's queues and Core's state. Pure data, so every check below
 * is unit-testable with a plain object and no DOM.
 */
export type BoyoContext = {
  readonly now: number
  readonly phase: "idle" | "running"
  /** `RESOLVE_BUDGET_MS`, passed in rather than imported — see below. */
  readonly resolveBudgetMs: number
  readonly unresolved: ReadonlyArray<QueuedCard>
  readonly channelPending: ReadonlyArray<QueuedCard>
  /**
   * Read from the DOM, not from any queue — see `OccluderReleases`. The only
   * field that can see what the bookkeeping cannot.
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
      "No video-shaped element sits in the Sensor's unresolved queue past RESOLVE_BUDGET_MS. Being video-shaped does not guarantee extraction succeeds (isVideoCard() accepts several tags without checking for a video link, #1422), so the budget binds every queued element, video-shaped or not. A violation here means the budget itself has stopped being applied; a video-shaped element rejected at budget and still occluded is OccluderReleases's to report.",
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
      "No element sits under the static pre-mask occluder, without data-boyo, past OCCLUSION_GRACE_MS. Unlike every other check here this reads the DOM rather than the pipeline's bookkeeping, because the failures it exists for are precisely the ones that leave an element in no queue and held by no card — where a bookkeeping check has nothing to look at and reports healthy while the page is visibly broken (#1421). While switched on, the occluder is lifted by exactly one thing, the content script writing data-boyo; an element it is still hiding after the resolution budget has passed is one nothing is coming back for, and it is inert as well as blurred because that rule sets pointer-events: none.",
    check: (ctx): InvariantOutcome => {
      if (ctx.phase !== "running") return { ok: "unknown" }
      const stranded = ctx.occluded.filter(
        (c) => ctx.now - c.sinceAt >= OCCLUSION_GRACE_MS
      )
      if (stranded.length === 0) return { ok: true }
      // Tags rather than ids: which *kind* of element is stranded is the whole
      // diagnostic, and a tag name carries nothing about the card (#1382).
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
]

// ── Storage keys and the session index ───────────────────────────────────────

const SESSION_KEY_PREFIX = "bc.observability.session."
const SESSION_KEY_SUFFIX = ".v1"

export function sessionStorageKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}${sessionId}${SESSION_KEY_SUFFIX}`
}

/**
 * What the OBS2 debug page's session picker lists.
 *
 * Deliberately **not** the page title (unlike some-filter's `IndexEntry`): on
 * YouTube that is the video title, the field this extension withholds
 * (#1382). The surface is enough to tell recordings apart.
 */
export type IndexEntry = {
  sessionId: string
  origin: string
  surface: BoyoSurface
  /** Core's session ordinal as of the last index touch. */
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

/**
 * One index key per recording, so a tab never writes a key another tab writes
 * (`storage.local` has no compare-and-set). See `createSessionIndex`.
 */
const index: SessionIndex<IndexEntry> = createSessionIndex({
  namespace: "bc.observability",
  payload: { prefix: SESSION_KEY_PREFIX, suffix: SESSION_KEY_SUFFIX },
  isEntry: isIndexEntry,
})

/** This recording's index key. Exported for the debug page's tests. */
export function indexStorageKey(sessionId: string): string {
  return index.indexKey(sessionId)
}

/**
 * Publish (or refresh) this recording's index entry: one write of one key.
 *
 * Best-effort throughout: diagnostics degrading must never affect masking, so
 * every failure is swallowed.
 */
export function touchIndex(entry: IndexEntry): Promise<void> {
  return index.touch(entry)
}

/**
 * List the recordings, enforce the cap and sweep what nothing lists: the
 * debug page's session picker. Every page load mints a new bundle key, so
 * without the sweep unlisted bundles would accumulate without bound.
 */
export function compactIndex(): Promise<Compaction<IndexEntry>> {
  return index.compact()
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
 * `extensionStoragePersistence` throws when there is no storage area, and this
 * runs from `Controller.init()`, so an engine withholding `storage` would take
 * the whole extension down at startup. Observability degrades; the thing
 * observed does not.
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
 * that scope, and not one per session ordinal, is correct.
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
    // The default 2 KB clamp replaces an oversized value with a truncated
    // *string*. The `dates.<surface>` snapshot (MAX_DATE_FORMS_PER_SURFACE
    // forms of up to MAX_RAW_DATE_CHARS) serializes to 2681 bytes plain and
    // 5241 fully escaped, so it would stop being an array. 8 KB clears the
    // escaped worst case; `boyoCorpusSnapshotFits()` pins the arithmetic.
    maxDetailBytes: MAX_SNAPSHOT_BYTES,
  })
}

// ── The live recording ───────────────────────────────────────────────────────

/**
 * How often {@link BoyoObservability.sampleHealth} is allowed to run.
 *
 * `Health.tick()` asks on every mutation batch, and running every invariant
 * plus a `storage.local` index touch that often would cost more than the
 * thing observed (Charter §8). The invariants concern states lasting tens of
 * seconds, so 10 s loses nothing.
 */
export const HEALTH_SAMPLE_INTERVAL_MS = 10_000

/** Distinct raw date forms kept per surface. See {@link BoyoObservability}. */
export const MAX_DATE_FORMS_PER_SURFACE = 40

/** Distinct `<surface>:<renderer>` pairs reported as date-less. */
const MAX_ABSENT_PROBES = 64

/**
 * Longest raw string accepted as a date.
 *
 * A structural guard. Every real form ("3 days ago", "Premiered Jan 5, 2024")
 * is far inside this; a much longer string means the selector drifted onto
 * other metadata. It is reported as an absence, never truncated and kept,
 * because a truncated title is still a title.
 */
export const MAX_RAW_DATE_CHARS = 64

/**
 * One content-script instance's recording, and the small amount of state that
 * keeps it bounded: which raw date forms have already been banked, which
 * surface/renderer pairs have already been reported date-less, and which
 * invariants were violated as of the last health sample.
 *
 * A class so a test can drive a whole recording against `memoryPersistence()`
 * without touching the live singleton below.
 */
export class BoyoObservability {
  readonly sessionId: string
  readonly recorder: BoyoRecorder

  private readonly _dateForms = new Map<BoyoSurface, Set<string>>()
  private readonly _absentProbes = new Set<string>()
  private readonly _violated = new Set<string>()
  private _lastHealthAt = 0
  private _ordinal = 0
  private _compacted = false

  constructor(sessionId: string, recorder: BoyoRecorder) {
    this.sessionId = sessionId
    this.recorder = recorder
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  sessionStart(ordinal: number): void {
    this._ordinal = ordinal
    // This adapter outlives a session, so without this a new SPA session
    // inherits the previous one's throttle and swallows its first sample,
    // the one most likely to have something to say.
    this._lastHealthAt = 0
    this.recorder.record({
      kind: "session.start",
      subject: ordinal,
      detail: {
        surface: currentSurface(),
        // The locale decides how a relative date is phrased, so without it a
        // corpus cannot say whether a form is missing or merely unreachable
        // from this browser's settings.
        locale: typeof navigator === "undefined" ? "" : navigator.language,
      },
    })
    this.recorder.count("sessions_started")
    // Published here as well as on every health sample: a page with nothing
    // queued may never sample, and the OBS2 picker must still see it.
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
   * batch that turned up a card. A playing video alone fires batches
   * continuously, and one event each would evict the whole timeline within
   * seconds.
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

  /**
   * An id change ruled vendor churn rather than a recycle.
   *
   * `debug` severity: a hover preview can fire it on every card; it is
   * the *absence* of a matching mount/entry event afterwards that would
   * indicate something wrong.
   */
  churnIgnored(videoId: string): void {
    this.recorder.record({
      kind: "mount.churn_ignored",
      subject: videoId,
      severity: "debug",
    })
    this.recorder.count("churn_ignored")
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

  unknownShape(tag: string, surface: BoyoSurface, reason: string): void {
    this.recorder.record({
      kind: "layout.unknown_shape",
      subject: reason,
      detail: { tag, surface },
    })
    this.recorder.count("unknown_shapes")
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
   * A repeat of a form already banked for this surface only bumps the counter:
   * otherwise hundreds of "3 days ago" would evict the rare forms a parser
   * actually gets wrong. The distinct set is what QC2 needs; the counter says
   * how representative it is.
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
      // What the parser made of the form, independent of any boundary, so an
      // export shows which forms it holds as unverified (#1384).
      detail: {
        raw,
        renderer,
        estimate: estimate(raw, Date.now()),
        parser: PARSER,
      },
    })
    // Snapshots are never shed by the persistence byte budget, unlike events —
    // so this is the copy of the corpus that survives a long browsing session.
    this.recorder.setSnapshot(`dates.${surface}`, [...forms])
  }

  /**
   * Report a surface/renderer pair that yielded no date, once.
   *
   * Deduplicated by the pair because that is the diagnostic fact: "shorts
   * lockups on Home never carry a date" is worth one event.
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
   * Transitions rather than levels: a violation that persists for ten minutes
   * is one fact, and sixty copies would push its run-up out of the ring buffer.
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
    })

    this._touchIndex(ctx.now)
  }

  private _touchIndex(now: number): void {
    const touched = touchIndex({
      sessionId: this.sessionId,
      origin: typeof location === "undefined" ? "" : location.origin,
      surface: currentSurface(),
      sessionOrdinal: this._ordinal,
      updatedAt: now,
    })
    // Once per recording, after this one is listed: compacting first would
    // evict an older recording to make room for one it cannot see yet. Only
    // where cheap; see `createSessionIndex`.
    if (!this._compacted) {
      this._compacted = true
      void touched.then(() => index.compactIfCheap())
    }
  }
}

// ── The singleton the content script records through ─────────────────────────
//
// Mirrors `debug.ts`'s module-scoped registry: every call site stays a single
// `observability()?.…` line, and a test that never starts a recording sees a
// no-op.

let _live: BoyoObservability | null = null

/**
 * Begin this content-script instance's recording. Idempotent — a second call
 * returns the live recording rather than orphaning the first one's storage
 * key, which matters because `Controller` can re-enter setup (C1, C3).
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

  // The recorder debounces writes by a second, so a tab closing inside that
  // window would leave the OBS2 picker an entry whose bundle was never
  // written.
  //
  // `flush()`, deliberately, where some-filter's handler disposes the recorder
  // and, on a real unload, forgets the session:
  //
  //   - `pagehide` also fires for a document entering the back-forward cache,
  //     which comes back alive; a disposed recorder would silently ignore
  //     every later `record()`.
  //   - this corpus exists to be exported *after* the browsing that produced
  //     it, so delisting on unload would discard it. The index cap bounds
  //     dead entries instead.
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
 * Longest a recorded `subject` may be.
 *
 * `Recorder.record()` clamps `detail` and **not** `subject`, so an unbounded
 * subject is unbounded in the persisted bundle.
 */
const MAX_SUBJECT_CHARS = 64

/**
 * Reduce a queue key to something safe to persist: a diagnostics bundle must
 * not carry a URL (#1382).
 *
 * The runtime's queue keys are `t:<tag>` (`runtime/facts.ts`), which carry no
 * card content and are kept readable, bounded. An `h:` key would be a complete
 * absolute URL, query string and all, so it keeps its prefix and surrenders
 * everything after it to a hash — stable, not legible.
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
 * `getRandomValues` rather than `randomUUID` (needs a secure context) or
 * `Math.random` (flagged by CodeQL). It is not a secret; it only must not
 * collide between two tabs.
 *
 * Wrapped because it is reached from `Controller.init()`: an engine without
 * Web Crypto must not take the extension down. The clock fallback risks only
 * a clobbered diagnostic bundle.
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
