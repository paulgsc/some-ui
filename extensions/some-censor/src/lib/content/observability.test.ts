import { tryExtract } from "@censor/lib/content/extract/index"
import {
  BOYO_EVENT_KINDS,
  boyoInvariants,
  BoyoObservability,
  createBoyoRecorder,
  HEALTH_SAMPLE_INTERVAL_MS,
  INDEX_KEY,
  MAX_DATE_FORMS_PER_SURFACE,
  MAX_RAW_DATE_CHARS,
  MAX_SNAPSHOT_BYTES,
  observability,
  OCCLUSION_GRACE_MS,
  PROMOTION_STALL_MS,
  readIndex,
  redactQueueKey,
  removeFromIndex,
  RESOLVE_GRACE_MS,
  sessionStorageKey,
  startObservability,
  stopObservability,
  surfaceOf,
  touchIndex,
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
const OccluderReleases = findInvariant("OccluderReleases")

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
    occluded: [],
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
    obs.churnIgnored("vid-a")
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

describe("OccluderReleases — the DOM-truth check the bookkeeping cannot make", () => {
  // #1425. Every other invariant reads a queue, so the failures that leave an
  // element in no queue at all — #1423's churn teardown, #1426's collision,
  // the session race fixed in d024f8f — were invisible to all of them, and
  // health reported 100/healthy on a page that was visibly broken.

  it("says nothing about a card that has only just appeared", () => {
    const outcome = check(
      OccluderReleases,
      baseContext({
        occluded: [{ tag: "ytd-rich-item-renderer", sinceAt: NOW - 500 }],
      })
    )
    expect(outcome, "ordinary pre-adoption is not a violation").toEqual({
      ok: true,
    })
  })

  it("still says nothing while a card is inside its resolution budget", () => {
    // The grace window has to clear RESOLVE_BUDGET_MS, or every slow card on
    // every feed reads as stranded and the signal is worthless.
    const outcome = check(
      OccluderReleases,
      baseContext({
        occluded: [
          { tag: "yt-lockup-view-model", sinceAt: NOW - RESOLVE_BUDGET_MS },
        ],
      })
    )
    expect(outcome).toEqual({ ok: true })
  })

  it("reports an element the occluder has held past the grace window", () => {
    const outcome = check(
      OccluderReleases,
      baseContext({
        occluded: [
          { tag: "ytd-rich-item-renderer", sinceAt: NOW - OCCLUSION_GRACE_MS },
        ],
      })
    )
    expect(outcome.ok).toBe(false)
  })

  it("reports the tag rather than anything about the card", () => {
    const outcome = check(
      OccluderReleases,
      baseContext({
        occluded: [
          { tag: "ytd-rich-item-renderer", sinceAt: NOW - 60_000 },
          { tag: "ytd-rich-item-renderer", sinceAt: NOW - 60_000 },
          { tag: "yt-lockup-view-model", sinceAt: NOW - 30_000 },
        ],
      })
    )
    // Which *kind* of element is stranded is the whole diagnostic: a non-video
    // rich-item is #1422, a lockup is #1426. A tag name carries nothing about
    // the card itself (#1382).
    expect(outcome).toEqual({
      ok: false,
      details: {
        count: 3,
        byTag: { "ytd-rich-item-renderer": 2, "yt-lockup-view-model": 1 },
        longestMs: 60_000,
        graceMs: OCCLUSION_GRACE_MS,
      },
    })
  })

  it("is un-evaluable rather than clean while the manager is idle", () => {
    // Between teardown and the next session every card is legitimately
    // unadopted. Reporting that as a violation would make every navigation
    // look like a breakage; reporting it as `ok` would be a lie.
    const outcome = check(
      OccluderReleases,
      baseContext({
        phase: "idle",
        occluded: [{ tag: "ytd-rich-item-renderer", sinceAt: NOW - 60_000 }],
      })
    )
    expect(outcome).toEqual({ ok: "unknown" })
  })
})

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

describe("the health throttle is per session, not per content script (#1428)", () => {
  it("forgets the previous session's last-sample time on sessionStart", async () => {
    // Bot-found on #1428's own review, round 2. This adapter is created once
    // per content-script instance and deliberately outlives a session, so
    // without the reset an SPA navigation inherits the old session's throttle —
    // and the sample it swallows is the first one after the page changed
    // underneath us, which is the one most likely to have something to say.
    const obs = newObservability()
    await obs.sampleHealth(baseContext({ now: NOW }))

    expect(
      obs.shouldSampleHealth(NOW + 1),
      "precondition: the throttle is engaged"
    ).toBe(false)

    obs.sessionStart(2)

    expect(obs.shouldSampleHealth(NOW + 1)).toBe(true)
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

describe("queue keys never carry a URL into the bundle (#1397's own review, round 3)", () => {
  it("replaces an href key's URL with a stable bounded label — elementKey() emits a complete absolute URL for exactly the elements mount.unresolved fires on", () => {
    const key = "h:https://www.youtube.com/feed/watch_later?list=PLabc&si=xyz"
    const redacted = redactQueueKey(key)

    expect(redacted).not.toContain("youtube.com")
    expect(redacted).not.toContain("watch_later")
    expect(redacted).not.toContain("PLabc")
    expect(redacted).not.toContain("?")
    expect(redacted).toMatch(/^h:[0-9a-f]{8}$/)
  })

  it("is stable, so one element's queued and rejected events still correlate", () => {
    const key = "h:https://www.youtube.com/watch?v=abc"
    expect(redactQueueKey(key)).toBe(redactQueueKey(key))
    expect(redactQueueKey(key)).not.toBe(
      redactQueueKey("h:https://www.youtube.com/watch?v=def")
    )
  })

  it("keeps the non-URL key shapes readable — a videoId is already a mount event's own subject, and p:/r: keys carry no address", () => {
    expect(redactQueueKey("v:dQw4w9WgXcQ")).toBe("v:dQw4w9WgXcQ")
    expect(redactQueueKey("p:YTD-RICH-ITEM-RENDERER:3")).toBe(
      "p:YTD-RICH-ITEM-RENDERER:3"
    )
  })

  it("bounds every subject it records — Recorder clamps detail but not subject", () => {
    const long = `v:${"x".repeat(5000)}`
    expect(redactQueueKey(long).length).toBeLessThanOrEqual(80)
    expect(redactQueueKey(`h:${"x".repeat(5000)}`).length).toBeLessThanOrEqual(
      80
    )
  })

  it("applies the redaction at the recording call, not just as an exported helper", () => {
    const obs = newObservability()
    const key = "h:https://www.youtube.com/feed/watch_later?list=PLsecret"
    obs.queued(key)
    obs.rejected(key)

    const serialized = JSON.stringify(obs.recorder.events())
    expect(serialized).not.toContain("PLsecret")
    expect(serialized).not.toContain("youtube.com")
    // Both events still name the same element.
    const subjects = obs.recorder
      .events()
      .filter((e) => e.kind.startsWith("mount."))
      .map((e) => e.subject)
    expect(subjects).toHaveLength(2)
    expect(subjects[0]).toBe(subjects[1])
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

  it("flushes on pagehide, so a tab closing inside the 1s write debounce does not lose its bundle", async () => {
    const persistence = memoryPersistence()
    const obs = startObservability(persistence)
    obs.sessionStart(1)
    obs.uploadDate("3 days ago", "home", "ytd-rich-item-renderer")

    // Still only scheduled — the recorder debounces its writes.
    expect(persistence.peek()).toBeUndefined()

    window.dispatchEvent(new Event("pagehide"))

    await vi.waitFor(() => {
      expect(persistence.peek()?.events.map((e) => e.kind)).toContain(
        "date.observed"
      )
    })
    expect(persistence.peek()?.snapshots["dates.home"]).toEqual(["3 days ago"])
  })

  it("keeps recording after a pagehide — a document entering the back-forward cache fires it and comes back alive, so the flush must not be a dispose", async () => {
    const persistence = memoryPersistence()
    const obs = startObservability(persistence)
    obs.sessionStart(1)
    window.dispatchEvent(new Event("pagehide"))

    // Restored from bfcache: the content script never died.
    obs.mountResolved("vid-after-restore")
    await obs.recorder.flush()

    expect(persistence.peek()?.events.map((e) => e.kind)).toContain(
      "mount.resolved"
    )
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
function installFakeStorage(
  /** Fires after each write, so a test can simulate a competing tab. */
  onSet?: (key: string) => void
): Map<string, unknown> {
  const store = new Map<string, unknown>()
  Reflect.set(ext, "storage", {
    local: {
      get: (key: string): Promise<Record<string, unknown>> =>
        Promise.resolve(store.has(key) ? { [key]: store.get(key) } : {}),
      set: (items: Record<string, unknown>): Promise<void> => {
        for (const [k, v] of Object.entries(items)) {
          store.set(k, v)
          onSet?.(k)
        }
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

describe("the index cap does not orphan payloads (#1397's own review)", () => {
  afterEach(() => {
    Reflect.deleteProperty(ext, "storage")
  })

  /** An indexed recording: its index entry plus its persisted bundle. */
  async function record(store: Map<string, unknown>, i: number): Promise<void> {
    store.set(sessionStorageKey(`s${String(i)}`), { version: 1, events: [] })
    await touchIndex({
      sessionId: `s${String(i)}`,
      origin: "https://www.youtube.com",
      surface: "home",
      sessionOrdinal: 1,
      updatedAt: NOW + i,
    })
  }

  it("deletes the stored bundle of an entry the cap evicts — every page load mints a new key, so leaving them behind grows storage without bound", async () => {
    const store = installFakeStorage()
    for (let i = 0; i < 21; i++) await record(store, i)

    expect(await readIndex()).toHaveLength(20)
    // s0 is the oldest and the one pushed out by the 21st.
    expect((await readIndex()).map((e) => e.sessionId)).not.toContain("s0")
    expect(store.has(sessionStorageKey("s0"))).toBe(false)
    expect(store.has(sessionStorageKey("s20"))).toBe(true)

    // Nothing but the index key and the 20 live bundles is left behind.
    expect(store.size).toBe(21)
  })

  it("also sheds payloads on the reconciliation write, which evicts too when the index is already at capacity", async () => {
    let store: Map<string, unknown> | undefined
    let clobbered = false
    store = installFakeStorage((key) => {
      if (key !== INDEX_KEY || clobbered) return
      clobbered = true
      // A competing tab writes a full index of its own, without our entry —
      // so our read-back re-applies at capacity and must evict somebody.
      store?.set(
        INDEX_KEY,
        Array.from({ length: 20 }, (_unused, i) => ({
          sessionId: `other${String(i)}`,
          origin: "https://www.youtube.com",
          surface: "home",
          sessionOrdinal: 1,
          updatedAt: NOW + 100 + i,
        }))
      )
    })
    for (let i = 0; i < 20; i++) {
      store.set(sessionStorageKey(`other${String(i)}`), { version: 1 })
    }

    await touchIndex({
      sessionId: "mine",
      origin: "https://www.youtube.com",
      surface: "home",
      sessionOrdinal: 1,
      updatedAt: NOW + 1000,
    })

    expect(clobbered).toBe(true)
    const index = await readIndex()
    expect(index).toHaveLength(20)
    expect(index.map((e) => e.sessionId)).toContain("mine")
    // other0 is the oldest of the competing tab's entries, so re-applying
    // ours at capacity pushed it out — its bundle must go with it.
    expect(index.map((e) => e.sessionId)).not.toContain("other0")
    expect(store.has(sessionStorageKey("other0"))).toBe(false)
    expect(store.has(sessionStorageKey("other1"))).toBe(true)
  })

  it("re-lists a live recording that a competing tab evicted, on its next touch — the cap bounds indexed recordings, and an evicted tab that is still running restores itself", async () => {
    const store = installFakeStorage()
    const obs = newObservability()

    await touchIndex({
      sessionId: obs.sessionId,
      origin: "https://www.youtube.com",
      surface: "home",
      sessionOrdinal: 1,
      updatedAt: NOW,
    })
    expect((await readIndex()).map((e) => e.sessionId)).toContain(obs.sessionId)

    // Another tab evicts us and our bundle is deleted with the entry.
    for (let i = 0; i < 20; i++) await record(store, i)
    expect((await readIndex()).map((e) => e.sessionId)).not.toContain(
      obs.sessionId
    )

    // Our recorder is still live, so its next health sample re-lists it.
    await obs.sampleHealth(baseContext({ now: NOW + 5000 }))
    await vi.waitFor(async () => {
      expect((await readIndex()).map((e) => e.sessionId)).toContain(
        obs.sessionId
      )
    })
  })

  it("takes the bundle with it when a recording is removed outright", async () => {
    const store = installFakeStorage()
    await record(store, 1)
    expect(store.has(sessionStorageKey("s1"))).toBe(true)

    await removeFromIndex("s1")
    expect(await readIndex()).toEqual([])
    expect(store.has(sessionStorageKey("s1"))).toBe(false)
  })
})

describe("the corpus snapshot survives the recorder's own clamp (#1397's own review, round 2)", () => {
  it("budgets for the worst case the caps allow, escaping included — Recorder.clamp() replaces an oversized value with a truncated string rather than trimming it", () => {
    const plain = Array.from({ length: MAX_DATE_FORMS_PER_SURFACE }, () =>
      "x".repeat(MAX_RAW_DATE_CHARS)
    )
    // Every character escaping to two is the worst JSON.stringify can do to
    // a string of this length, and clamp() measures the serialized form.
    const escaped = Array.from({ length: MAX_DATE_FORMS_PER_SURFACE }, () =>
      '"'.repeat(MAX_RAW_DATE_CHARS)
    )

    expect(JSON.stringify(plain).length).toBeLessThanOrEqual(MAX_SNAPSHOT_BYTES)
    expect(JSON.stringify(escaped).length).toBeLessThanOrEqual(
      MAX_SNAPSHOT_BYTES
    )
    // The default this overrides would not have held it.
    expect(JSON.stringify(plain).length).toBeGreaterThan(2048)
  })

  it("keeps a full surface's corpus readable as an array, not a truncated string", () => {
    const obs = newObservability()
    for (let i = 0; i < MAX_DATE_FORMS_PER_SURFACE; i++) {
      // Each form padded to the cap, so the snapshot lands at its true ceiling.
      obs.uploadDate(
        `${String(i)} days ago`.padEnd(MAX_RAW_DATE_CHARS, "."),
        "home",
        "ytd-rich-item-renderer"
      )
    }

    const snapshot = obs.recorder.snapshotEntries()["dates.home"]
    expect(Array.isArray(snapshot)).toBe(true)
    expect(snapshot).toHaveLength(MAX_DATE_FORMS_PER_SURFACE)
    expect(obs.dateForms("home")).toHaveLength(MAX_DATE_FORMS_PER_SURFACE)
  })
})

describe("concurrent index writes (#1397's own review)", () => {
  afterEach(() => {
    Reflect.deleteProperty(ext, "storage")
  })

  it("re-applies its own entry when a competing tab's write dropped it", async () => {
    let store: Map<string, unknown> | undefined
    let clobbered = false
    store = installFakeStorage((key) => {
      // The other tab read the same `existing` we did and wrote after us,
      // carrying only its own entry.
      if (key !== INDEX_KEY || clobbered) return
      clobbered = true
      store?.set(INDEX_KEY, [
        {
          sessionId: "other-tab",
          origin: "https://www.youtube.com",
          surface: "watch",
          sessionOrdinal: 1,
          updatedAt: NOW,
        },
      ])
    })

    await touchIndex({
      sessionId: "mine",
      origin: "https://www.youtube.com",
      surface: "home",
      sessionOrdinal: 1,
      updatedAt: NOW + 1,
    })

    expect(clobbered).toBe(true)
    const ids = (await readIndex()).map((e) => e.sessionId)
    expect(ids).toContain("mine")
    expect(ids).toContain("other-tab")
  })

  it("serializes this tab's own overlapping writes, so neither drops the other", async () => {
    installFakeStorage()
    await Promise.all(
      Array.from({ length: 5 }, async (_unused, i) =>
        touchIndex({
          sessionId: `s${String(i)}`,
          origin: "https://www.youtube.com",
          surface: "home",
          sessionOrdinal: 1,
          updatedAt: NOW + i,
        })
      )
    )

    expect((await readIndex()).map((e) => e.sessionId).sort()).toEqual([
      "s0",
      "s1",
      "s2",
      "s3",
      "s4",
    ])
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
