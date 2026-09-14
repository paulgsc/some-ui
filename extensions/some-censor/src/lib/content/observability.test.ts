import { tryExtract } from "@censor/lib/content/extract/index"
import {
  BOYO_EVENT_KINDS,
  boyoInvariants,
  BoyoObservability,
  createBoyoRecorder,
  HEALTH_SAMPLE_INTERVAL_MS,
  observability,
  PROMOTION_STALL_MS,
  readIndex,
  removeFromIndex,
  RESOLVE_GRACE_MS,
  sessionStorageKey,
  startObservability,
  stopObservability,
  surfaceOf,
  type BoyoContext,
  type BoyoEventKind,
} from "@censor/lib/content/observability"
import { isVideoCard } from "@censor/lib/content/selectors"
import { RESOLVE_BUDGET_MS } from "@censor/lib/content/video-manager"
import { ext } from "@censor/platform/content"
import {
  memoryPersistence,
  Recorder,
  type InvariantOutcome,
  type ObservabilityEvent,
} from "@some-extension/common/observability"
import { afterEach, describe, expect, it, vi } from "vitest"

// ── Harness ──────────────────────────────────────────────────────────────────

function findInvariant(name: string): {
  check: (ctx: BoyoContext) => InvariantOutcome | Promise<InvariantOutcome>
} {
  const invariant = boyoInvariants.find((inv) => inv.name === name)
  if (invariant === undefined) throw new Error(`no invariant named ${name}`)
  return invariant
}

// Both checks in boyoInvariants are synchronous — runInvariants' generic call
// site is what makes evaluation async, not the checks — so this keeps every
// assertion below a plain synchronous one.
function check(
  invariant: ReturnType<typeof findInvariant>,
  ctx: BoyoContext
): InvariantOutcome {
  const outcome = invariant.check(ctx)
  if (outcome instanceof Promise) throw new Error("expected a sync outcome")
  return outcome
}

const OccludedCardResolves = findInvariant("OccludedCardResolves")
const PromotionGuardClears = findInvariant("PromotionGuardClears")

const NOW = 1_700_000_000_000

/** Nothing queued, nothing promoting, running — each test varies one thing. */
function baseContext(overrides: Partial<BoyoContext> = {}): BoyoContext {
  return {
    now: NOW,
    phase: "running",
    resolveBudgetMs: RESOLVE_BUDGET_MS,
    unresolved: [],
    channelPending: [],
    promoting: [],
    ...overrides,
  }
}

function newObservability(
  persistence = memoryPersistence()
): BoyoObservability {
  return new BoyoObservability(
    "test-session",
    createBoyoRecorder("test-session", persistence)
  )
}

function kindsOf(recorder: {
  events: () => Array<ObservabilityEvent>
}): Array<string> {
  return recorder.events().map((e) => e.kind)
}

afterEach(() => {
  document.body.innerHTML = ""
})

// ── Surfaces ─────────────────────────────────────────────────────────────────

describe("surfaceOf — the surfaces QC2's (#1384) corpus is bucketed by", () => {
  it("names each of Home, Search, watch, playlist and Shorts", () => {
    expect(surfaceOf("/")).toBe("home")
    expect(surfaceOf("/results")).toBe("search")
    expect(surfaceOf("/watch")).toBe("watch")
    expect(surfaceOf("/playlist")).toBe("playlist")
    expect(surfaceOf("/shorts/dQw4w9WgXcQ")).toBe("shorts")
  })

  it("recognises channel pages in all four of YouTube's spellings", () => {
    expect(surfaceOf("/@someone")).toBe("channel")
    expect(surfaceOf("/channel/UCabc")).toBe("channel")
    expect(surfaceOf("/c/someone")).toBe("channel")
    expect(surfaceOf("/user/someone")).toBe("channel")
  })

  it("falls back to 'other' rather than guessing", () => {
    expect(surfaceOf("/feed/history")).toBe("other")
    expect(surfaceOf("/account")).toBe("other")
  })

  it("is derived from the path alone — a watch URL's ?v= never reaches it", () => {
    // surfaceOf takes a pathname, so there is no query string to leak; this
    // pins the contract that callers must not hand it a full URL.
    expect(surfaceOf("/watch")).toBe("watch")
  })
})

// ── The event vocabulary ─────────────────────────────────────────────────────

describe("the event union", () => {
  it("lists every kind exactly once", () => {
    expect(new Set(BOYO_EVENT_KINDS).size).toBe(BOYO_EVENT_KINDS.length)
  })

  it("is fully wired: driving every recording path emits every declared kind", async () => {
    const obs = newObservability()

    obs.sessionStart(1)
    obs.navigation()
    obs.mutationBatch(3)
    obs.mountResolved("vid-a")
    obs.mountProvisional("vid-b")
    obs.queued("h:https://youtube.com/watch?v=vid-c")
    obs.rejected("h:https://youtube.com/watch?v=vid-c")
    obs.staleDiscarded("vid-d")
    obs.channelBackfilled("vid-b")
    obs.channelAbandoned("vid-e")
    obs.entryState("masked", "vid-a")
    obs.entryState("meta", "vid-a")
    obs.entryState("title", "vid-a")
    obs.entryState("revealed", "vid-a")
    obs.entryState("whitelisted", "vid-a")
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")
    obs.uploadDate(null, "home", "ytm-shorts-lockup-view-model")

    // The two invariant kinds are transitions, so they need a violation and
    // then a recovery to be reachable at all.
    const stuck = baseContext({
      now: NOW,
      promoting: [{ key: "p:1", startedAt: NOW - PROMOTION_STALL_MS }],
    })
    await obs.sampleHealth(stuck)
    await obs.sampleHealth(
      baseContext({ now: NOW + HEALTH_SAMPLE_INTERVAL_MS })
    )
    obs.sessionReset(1)

    expect(new Set(kindsOf(obs.recorder))).toEqual(new Set(BOYO_EVENT_KINDS))
  })

  it("records the session ordinal as the subject of a lifecycle event", () => {
    const obs = newObservability()
    obs.sessionStart(7)
    obs.sessionReset(7)
    const lifecycle = obs.recorder
      .events()
      .filter((e) => e.kind.startsWith("session."))
    expect(lifecycle.map((e) => e.subject)).toEqual([7, 7])
  })
})

// ── OccludedCardResolves ─────────────────────────────────────────────────────

describe("OccludedCardResolves — the budget exemption, checked rather than assumed", () => {
  it("is unknown while idle: an empty queue proves nothing about a manager that is not running", () => {
    expect(check(OccludedCardResolves, baseContext({ phase: "idle" }))).toEqual(
      { ok: "unknown" }
    )
  })

  it("holds when nothing is queued", () => {
    expect(check(OccludedCardResolves, baseContext())).toEqual({ ok: true })
  })

  it("holds while a video-shaped card is still inside its budget", () => {
    const ctx = baseContext({
      unresolved: [
        { key: "v:abc", firstSeenAt: NOW - 1_000, videoShaped: true },
      ],
    })
    expect(check(OccludedCardResolves, ctx)).toEqual({ ok: true })
  })

  it("holds through the grace window, so a normal expiry is not a violation", () => {
    const ctx = baseContext({
      unresolved: [
        {
          key: "v:abc",
          firstSeenAt: NOW - RESOLVE_BUDGET_MS - RESOLVE_GRACE_MS + 1,
          videoShaped: true,
        },
      ],
    })
    expect(check(OccludedCardResolves, ctx)).toEqual({ ok: true })
  })

  it("holds for a non-video-shaped card past its budget — that one is given up on, and the pre-mask rule's :has() guard means nothing is left blurred behind it", () => {
    const ctx = baseContext({
      unresolved: [
        {
          key: "p:DIV:3",
          firstSeenAt: NOW - RESOLVE_BUDGET_MS * 10,
          videoShaped: false,
        },
      ],
    })
    expect(check(OccludedCardResolves, ctx)).toEqual({ ok: true })
  })

  it("is violated once a video-shaped card is past budget + grace, and names what is stuck", () => {
    const waited = RESOLVE_BUDGET_MS + RESOLVE_GRACE_MS + 5_000
    const ctx = baseContext({
      unresolved: [
        { key: "v:ok", firstSeenAt: NOW - 500, videoShaped: true },
        { key: "h:stuck", firstSeenAt: NOW - waited, videoShaped: true },
      ],
    })
    expect(check(OccludedCardResolves, ctx)).toEqual({
      ok: false,
      details: {
        keys: ["h:stuck"],
        waitedMs: [waited],
        budgetMs: RESOLVE_BUDGET_MS,
      },
    })
  })
})

describe("OccludedCardResolves — the failure mode it exists for is reachable", () => {
  it("isVideoCard and extractVideoId can disagree: a lockup whose only matching anchor is /feed/watch_later is occluded by the pre-mask rule but yields no videoId", () => {
    // isVideoCard's guard (and PREMASK_SELECTORS' :has()) matches any href
    // *containing* "/watch"; extractVideoId requires v=, /shorts/<id> or
    // /watch/<id>. "/feed/watch_later" satisfies the first and not the second.
    const el = document.createElement("yt-lockup-view-model")
    const a = document.createElement("a")
    a.setAttribute("href", "/feed/watch_later")
    el.appendChild(a)
    document.body.appendChild(el)

    expect(isVideoCard(el)).toBe(true)
    expect(tryExtract(el).kind).toBe("raw")

    // Which is exactly the state retryUnresolved() exempts from the budget, so
    // it stays queued and stays blurred — and is the state this invariant
    // reports rather than leaving silent.
    const ctx = baseContext({
      unresolved: [
        {
          key: "h:/feed/watch_later",
          firstSeenAt: NOW - RESOLVE_BUDGET_MS * 5,
          videoShaped: isVideoCard(el),
        },
      ],
    })
    expect(check(OccludedCardResolves, ctx).ok).toBe(false)
  })

  it("a lockup carrying a real watch href resolves, and is therefore never reported", () => {
    const el = document.createElement("yt-lockup-view-model")
    const a = document.createElement("a")
    a.setAttribute("href", "/watch?v=dQw4w9WgXcQ")
    el.appendChild(a)
    document.body.appendChild(el)

    expect(isVideoCard(el)).toBe(true)
    expect(tryExtract(el).videoId).toBe("dQw4w9WgXcQ")
  })
})

// ── PromotionGuardClears ─────────────────────────────────────────────────────

describe("PromotionGuardClears — an element that never leaves _promoting", () => {
  it("is unknown while idle", () => {
    expect(check(PromotionGuardClears, baseContext({ phase: "idle" }))).toEqual(
      { ok: "unknown" }
    )
  })

  it("holds when nothing is in flight", () => {
    expect(check(PromotionGuardClears, baseContext())).toEqual({ ok: true })
  })

  it("holds for a promotion that is merely slow — an MV3 worker respawn is seconds, not tens of them", () => {
    const ctx = baseContext({
      promoting: [{ key: "v:abc", startedAt: NOW - 5_000 }],
    })
    expect(check(PromotionGuardClears, ctx)).toEqual({ ok: true })
  })

  it("is violated once a promotion has held the guard past PROMOTION_STALL_MS, and names it", () => {
    const held = PROMOTION_STALL_MS + 1_000
    const ctx = baseContext({
      promoting: [
        { key: "v:fine", startedAt: NOW - 10 },
        { key: "v:hung", startedAt: NOW - held },
      ],
    })
    expect(check(PromotionGuardClears, ctx)).toEqual({
      ok: false,
      details: { keys: ["v:hung"], heldMs: [held] },
    })
  })
})

describe("mutationBatch — the observer's firehose, bounded", () => {
  it("records an event for a batch that turned up a card", () => {
    const obs = newObservability()
    obs.mutationBatch(4)
    const event = obs.recorder.events().find((e) => e.kind === "mutation.batch")
    expect(event?.detail).toEqual({ candidates: 4 })
  })

  it("records no event for an empty batch — a playing video fires those continuously and would evict the whole timeline", () => {
    const obs = newObservability()
    for (let i = 0; i < 500; i++) obs.mutationBatch(0)
    expect(kindsOf(obs.recorder)).toEqual([])
  })

  it("still counts and folds every batch, empty or not", () => {
    const obs = newObservability()
    obs.mutationBatch(0)
    obs.mutationBatch(0)
    obs.mutationBatch(6)
    expect(obs.recorder.metrics.counter("mutation_batches")).toBe(3)
    expect(
      Reflect.get(
        Object(obs.recorder.metrics.snapshot().aggregates),
        "mutation_batch_candidates"
      )
    ).toEqual({ count: 3, sum: 6, min: 0, max: 6, last: 6 })
  })
})

// ── The date corpus ──────────────────────────────────────────────────────────

describe("uploadDate — the corpus mechanism #1384 depends on", () => {
  it("banks a distinct raw form once, but counts every sighting", () => {
    const obs = newObservability()
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")

    expect(
      kindsOf(obs.recorder).filter((k) => k === "date.observed")
    ).toHaveLength(1)
    expect(obs.recorder.metrics.counter("dates_observed")).toBe(3)
    expect(obs.dateForms("home")).toEqual(["3 days ago"])
  })

  it("keeps the raw string verbatim — H2 treats a date as nonsemantic, and a normalised corpus would beg QC2's own question", () => {
    const obs = newObservability()
    obs.uploadDate(
      "Streamed 2 hours ago",
      "watch",
      "ytd-compact-video-renderer"
    )
    const event = obs.recorder.events().find((e) => e.kind === "date.observed")
    expect(event?.detail).toEqual({
      raw: "Streamed 2 hours ago",
      renderer: "ytd-compact-video-renderer",
    })
  })

  it("buckets by surface, because the same parser question has different answers per surface", () => {
    const obs = newObservability()
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")
    obs.uploadDate("3 days ago", "search", "ytd-video-renderer")

    expect(obs.dateForms("home")).toEqual(["3 days ago"])
    expect(obs.dateForms("search")).toEqual(["3 days ago"])
    expect(
      kindsOf(obs.recorder).filter((k) => k === "date.observed")
    ).toHaveLength(2)
  })

  it("mirrors each surface's forms into a snapshot, which the byte budget never sheds", () => {
    const obs = newObservability()
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")
    obs.uploadDate("1 year ago", "home", "ytd-rich-item-renderer")
    expect(obs.recorder.snapshotEntries()["dates.home"]).toEqual([
      "3 days ago",
      "1 year ago",
    ])
  })

  it("caps the distinct forms it banks per surface", () => {
    const obs = newObservability()
    for (let i = 0; i < 200; i++) {
      obs.uploadDate(`${String(i)} days ago`, "home", "ytd-rich-item-renderer")
    }
    expect(obs.dateForms("home").length).toBeLessThanOrEqual(40)
    expect(obs.recorder.metrics.counter("dates_observed")).toBe(200)
  })

  it("reports a missing date as an absence, once per surface/renderer pair", () => {
    const obs = newObservability()
    obs.uploadDate(null, "home", "ytm-shorts-lockup-view-model")
    obs.uploadDate("", "home", "ytm-shorts-lockup-view-model")
    obs.uploadDate(null, "home", "ytm-shorts-lockup-view-model")

    const absent = obs.recorder.events().filter((e) => e.kind === "date.absent")
    expect(absent).toHaveLength(1)
    expect(absent[0]?.detail).toEqual({
      renderer: "ytm-shorts-lockup-view-model",
      reason: "missing",
    })
    expect(obs.recorder.metrics.counter("dates_absent")).toBe(3)
  })

  it("refuses an overlong string outright rather than truncating it — a truncated title is still a title", () => {
    const obs = newObservability()
    const title = "a".repeat(200)
    obs.uploadDate(title, "home", "ytd-rich-item-renderer")

    expect(obs.dateForms("home")).toEqual([])
    const serialized = JSON.stringify(obs.recorder.events())
    expect(serialized).not.toContain(title)
    const absent = obs.recorder.events().find((e) => e.kind === "date.absent")
    expect(absent?.detail).toEqual({
      renderer: "ytd-rich-item-renderer",
      reason: "overlong",
    })
  })

  it("records nothing about the element but its tag name", () => {
    const obs = newObservability()
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")
    const serialized = JSON.stringify(obs.recorder.events())
    expect(serialized).toContain("ytd-rich-item-renderer")
    expect(serialized).toContain("3 days ago")
    expect(serialized).not.toContain("href")
  })
})

// ── Health ───────────────────────────────────────────────────────────────────

describe("sampleHealth — transitions, not levels", () => {
  const stalled = (now: number): BoyoContext =>
    baseContext({
      now,
      promoting: [{ key: "v:hung", startedAt: now - PROMOTION_STALL_MS * 2 }],
    })

  it("records a violation once, not once per sample, while it persists", async () => {
    const obs = newObservability()
    await obs.sampleHealth(stalled(NOW))
    await obs.sampleHealth(stalled(NOW + HEALTH_SAMPLE_INTERVAL_MS))
    await obs.sampleHealth(stalled(NOW + HEALTH_SAMPLE_INTERVAL_MS * 2))

    expect(
      kindsOf(obs.recorder).filter((k) => k === "invariant.violated")
    ).toHaveLength(1)
    expect(obs.recorder.metrics.counter("invariant_violations")).toBe(1)
  })

  it("records a violation at error severity, which forces an immediate flush", async () => {
    const obs = newObservability()
    await obs.sampleHealth(stalled(NOW))
    const violated = obs.recorder
      .events()
      .find((e) => e.kind === "invariant.violated")
    expect(violated?.severity).toBe("error")
    expect(violated?.subject).toBe("PromotionGuardClears")
  })

  it("records the recovery when the invariant holds again", async () => {
    const obs = newObservability()
    await obs.sampleHealth(stalled(NOW))
    await obs.sampleHealth(
      baseContext({ now: NOW + HEALTH_SAMPLE_INTERVAL_MS })
    )

    expect(kindsOf(obs.recorder)).toContain("invariant.recovered")
    expect(
      obs.recorder.events().find((e) => e.kind === "invariant.recovered")
        ?.subject
    ).toBe("PromotionGuardClears")
  })

  it("neither opens nor closes a violation on an unknown outcome — an un-evaluable check is not evidence either way", async () => {
    const obs = newObservability()
    // phase "idle" makes both checks report unknown.
    await obs.sampleHealth(baseContext({ phase: "idle" }))
    expect(kindsOf(obs.recorder)).not.toContain("invariant.violated")
    expect(kindsOf(obs.recorder)).not.toContain("invariant.recovered")
  })

  it("publishes the health report and queue depths as snapshots for the OBS2 page to project", async () => {
    const obs = newObservability()
    await obs.sampleHealth(
      baseContext({
        unresolved: [
          { key: "a", firstSeenAt: NOW, videoShaped: true },
          { key: "b", firstSeenAt: NOW, videoShaped: false },
        ],
        channelPending: [{ key: "c:v", firstSeenAt: NOW, videoShaped: false }],
      })
    )

    const snapshots = obs.recorder.snapshotEntries()
    expect(snapshots["queues"]).toEqual({
      phase: "running",
      resolveBudgetMs: RESOLVE_BUDGET_MS,
      unresolved: 2,
      unresolvedVideoShaped: 1,
      channelPending: 1,
      promoting: 0,
    })
    expect(Reflect.get(Object(snapshots["health"]), "status")).toBe("healthy")
    expect(obs.recorder.metrics.counter("dates_observed")).toBe(0)
  })

  it("throttles to HEALTH_SAMPLE_INTERVAL_MS so the 500ms retry loop does not pay for it", async () => {
    const obs = newObservability()
    expect(obs.shouldSampleHealth(NOW)).toBe(true)
    await obs.sampleHealth(baseContext({ now: NOW }))

    expect(obs.shouldSampleHealth(NOW + 500)).toBe(false)
    expect(obs.shouldSampleHealth(NOW + HEALTH_SAMPLE_INTERVAL_MS - 1)).toBe(
      false
    )
    expect(obs.shouldSampleHealth(NOW + HEALTH_SAMPLE_INTERVAL_MS)).toBe(true)
  })
})

describe("startObservability — one recording per content-script instance", () => {
  afterEach(() => {
    stopObservability()
  })

  it("mints a distinct id per instance, so two tabs cannot write the same storage key", () => {
    const first = startObservability(memoryPersistence())
    const firstId = first.sessionId
    stopObservability()
    const second = startObservability(memoryPersistence())

    expect(firstId).not.toBe(second.sessionId)
    expect(sessionStorageKey(firstId)).not.toBe(
      sessionStorageKey(second.sessionId)
    )
    expect(firstId).not.toContain("NaN")
    expect(firstId.length).toBeGreaterThan(0)
  })

  it("is idempotent — a re-entered Controller setup (C1/C3) gets the live recording, not an orphaned second key", () => {
    const first = startObservability(memoryPersistence())
    expect(startObservability(memoryPersistence())).toBe(first)
  })

  it("hands every call site the same recording, and a no-op before one is started", () => {
    expect(observability()).toBeNull()
    const started = startObservability(memoryPersistence())
    expect(observability()).toBe(started)
    stopObservability()
    expect(observability()).toBeNull()
  })
})

// ── The session index (what the OBS2 picker reads) ───────────────────────────

/**
 * The vitest setup stubs `browser` with a `runtime` only, and `ext` captured
 * that object at import time — so the area is installed onto it rather than
 * re-stubbing the global, which `ext` would no longer be looking at.
 */
function installFakeStorage(): Map<string, unknown> {
  const store = new Map<string, unknown>()
  Reflect.set(ext, "storage", {
    local: {
      get: (key: string): Promise<Record<string, unknown>> =>
        Promise.resolve(store.has(key) ? { [key]: store.get(key) } : {}),
      set: (items: Record<string, unknown>): Promise<void> => {
        for (const [k, v] of Object.entries(items)) store.set(k, v)
        return Promise.resolve()
      },
      remove: (key: string): Promise<void> => {
        store.delete(key)
        return Promise.resolve()
      },
    },
  })
  return store
}

describe("the session index", () => {
  afterEach(() => {
    Reflect.deleteProperty(ext, "storage")
  })

  it("publishes an entry as soon as a session starts, not only once a health sample runs", async () => {
    installFakeStorage()
    const obs = newObservability()
    obs.sessionStart(3)
    await vi.waitFor(async () => {
      expect(await readIndex()).toHaveLength(1)
    })

    const [entry] = await readIndex()
    expect(entry?.sessionId).toBe("test-session")
    expect(entry?.sessionOrdinal).toBe(3)
  })

  it("carries no page title — on YouTube that is the video title, the one field this extension exists to withhold (#1382)", async () => {
    installFakeStorage()
    document.title = "Never Gonna Give You Up - YouTube"
    const obs = newObservability()
    obs.sessionStart(1)
    await vi.waitFor(async () => {
      expect(await readIndex()).toHaveLength(1)
    })

    const entries = await readIndex()
    expect(JSON.stringify(entries)).not.toContain("Never Gonna Give You Up")
    // Pins the shape, so a field added later has to be a deliberate choice
    // rather than something that quietly rides along into the picker.
    const first = entries[0]
    expect(first === undefined ? [] : Object.keys(first).sort()).toEqual(
      ["origin", "sessionOrdinal", "sessionId", "surface", "updatedAt"].sort()
    )
  })

  it("refreshes an existing session's entry in place rather than accumulating one per sample", async () => {
    installFakeStorage()
    const obs = newObservability()
    obs.sessionStart(1)
    await vi.waitFor(async () => {
      expect(await readIndex()).toHaveLength(1)
    })
    await obs.sampleHealth(baseContext({ now: NOW }))
    await vi.waitFor(async () => {
      expect((await readIndex())[0]?.updatedAt).toBe(NOW)
    })
    expect(await readIndex()).toHaveLength(1)
  })

  it("drops an entry on request, and survives a storage area that is not there at all", async () => {
    installFakeStorage()
    const obs = newObservability()
    obs.sessionStart(1)
    await vi.waitFor(async () => {
      expect(await readIndex()).toHaveLength(1)
    })
    await removeFromIndex("test-session")
    expect(await readIndex()).toEqual([])

    Reflect.deleteProperty(ext, "storage")
    expect(await readIndex()).toEqual([])
    await expect(removeFromIndex("test-session")).resolves.toBeUndefined()
  })
})

// ── Persistence ──────────────────────────────────────────────────────────────

describe("persistence round-trip", () => {
  it("namespaces the storage key per recording, so concurrent tabs cannot clobber each other", () => {
    expect(sessionStorageKey("abc")).toBe("bc.observability.session.abc.v1")
    expect(sessionStorageKey("abc")).not.toBe(sessionStorageKey("def"))
  })

  it("flushes events, counters and snapshots, and hydrates them all back", async () => {
    const persistence = memoryPersistence()
    const first = newObservability(persistence)
    first.sessionStart(1)
    first.mountResolved("vid-a")
    first.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")
    await first.recorder.flush()

    const second = createBoyoRecorder("test-session", persistence)
    await second.hydrate()

    expect(second.events().map((e) => e.kind)).toEqual([
      "session.start",
      "mount.resolved",
      "date.observed",
    ])
    expect(second.metrics.counter("mounts_resolved")).toBe(1)
    expect(second.snapshotEntries()["dates.home"]).toEqual(["3 days ago"])
  })

  it("merges rather than replaces: events recorded before hydrate resolves are kept and re-sequenced after the stored ones", async () => {
    const persistence = memoryPersistence()
    const first = newObservability(persistence)
    first.sessionStart(1)
    await first.recorder.flush()

    // A second generation starts recording before its hydrate() settles —
    // exactly the window Recorder.hydrate's own doc comment is about.
    const second = createBoyoRecorder("test-session", persistence)
    const hydrating = second.hydrate()
    second.record({ kind: "mutation.batch", detail: { candidates: 2 } })
    await hydrating

    expect(second.events().map((e) => e.kind)).toEqual([
      "session.start",
      "mutation.batch",
    ])
    const seqs = second.events().map((e) => e.seq)
    expect(seqs[1]).toBeGreaterThan(Number(seqs[0]))
  })

  it("discards state written under a different namespace rather than mis-parsing it", async () => {
    const persistence = memoryPersistence()
    await persistence.save({
      version: 1,
      namespace: "some-filter",
      events: [{ seq: 1, t: NOW, kind: "nav.start", severity: "info" }],
      metrics: { counters: { nav_starts: 1 }, aggregates: {} },
      snapshots: {},
      dropped: 0,
      updatedAt: NOW,
    })

    const recorder = createBoyoRecorder("test-session", persistence)
    await recorder.hydrate()
    expect(recorder.events()).toEqual([])
  })

  it("is the same vocabulary on both sides of the round trip", async () => {
    const persistence = memoryPersistence()
    const obs = newObservability(persistence)
    for (const kind of BOYO_EVENT_KINDS) {
      obs.recorder.record({ kind })
    }
    await obs.recorder.flush()

    const rehydrated = new Recorder<BoyoEventKind>({
      namespace: "some-censor",
      persistence,
    })
    await rehydrated.hydrate()
    expect(rehydrated.events().map((e) => e.kind)).toEqual([
      ...BOYO_EVENT_KINDS,
    ])
  })
})
