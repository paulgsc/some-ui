// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Covers both halves of the observability seam:
 *
 *   - the shared core in `@some-extension/common/observability` (ring buffer,
 *     recorder, metrics, persistence budget) — exercised through its public
 *     subpath, exactly as another extension's adapter would consume it;
 *   - this extension's adapter — the invariants, which are pure functions of a
 *     context object and so need no browser mock at all.
 *
 * The core's tests live here rather than in `extensions/common` because that
 * workspace's `test` script currently runs Playwright only; they should move
 * alongside the package the moment it gains a unit runner.
 */

import {
  memoryPersistence,
  Recorder,
  RingBuffer,
  runInvariants,
  scoreHealth,
  type InvariantResult,
} from "@some-extension/common/observability"
import { describe, expect, it } from "vitest"

import {
  clampCheckPeriodSeconds,
  safeOrigin,
  suspenderInvariants,
  type InvariantContext,
} from "./observability"

// ── Shared core ──────────────────────────────────────────────────────────────

describe("RingBuffer", () => {
  it("keeps insertion order while below capacity", () => {
    const buffer = new RingBuffer<number>(5)
    buffer.extend([1, 2, 3])
    expect(buffer.toArray()).toEqual([1, 2, 3])
    expect(buffer.dropped).toBe(0)
  })

  it("overwrites oldest-first at capacity and counts the loss", () => {
    const buffer = new RingBuffer<number>(3)
    buffer.extend([1, 2, 3, 4, 5])

    // Bounded footprint is the whole reason this exists: an extension running
    // for months must never grow its retained history.
    expect(buffer.size).toBe(3)
    expect(buffer.toArray()).toEqual([3, 4, 5])
    expect(buffer.dropped).toBe(2)
  })

  it("returns only the newest n from tail()", () => {
    const buffer = new RingBuffer<number>(10)
    buffer.extend([1, 2, 3, 4])
    expect(buffer.tail(2)).toEqual([3, 4])
    expect(buffer.tail(0)).toEqual([])
  })

  it("sheds overflow when rehydrated into a smaller capacity", () => {
    // A capacity *reduction* between versions must shrink the footprint
    // immediately, not gradually over the next few hundred writes.
    const restored = RingBuffer.from(2, [1, 2, 3, 4], 7)
    expect(restored.toArray()).toEqual([3, 4])
    expect(restored.dropped).toBe(9)
  })

  it("rejects a nonsensical capacity rather than silently degrading", () => {
    expect(() => new RingBuffer<number>(0)).toThrow(RangeError)
  })
})

describe("Recorder", () => {
  const makeRecorder = (
    persistence = memoryPersistence()
  ): Recorder<"a" | "b", "hits", "latency"> =>
    new Recorder<"a" | "b", "hits", "latency">({
      namespace: "test",
      capacity: 3,
      persistence,
      flushIntervalMs: 5,
    })

  it("records events with a monotonic sequence and a timestamp", () => {
    const rec = makeRecorder()
    rec.record({ kind: "a", subject: 1 })
    rec.record({ kind: "b", subject: 2, detail: { why: "because" } })

    const events = rec.events()
    expect(events.map((e) => e.kind)).toEqual(["a", "b"])
    expect(events[1]?.seq).toBe(2)
    expect(events[1]?.detail).toEqual({ why: "because" })
    expect(typeof events[0]?.t).toBe("number")
  })

  it("bounds the timeline at capacity", () => {
    const rec = makeRecorder()
    for (let i = 0; i < 6; i += 1) {
      rec.record({ kind: "a", subject: i })
    }
    expect(rec.events()).toHaveLength(3)
    expect(rec.dropped).toBe(3)
  })

  it("survives a worker restart through the persistence port", async () => {
    const persistence = memoryPersistence()
    const first = makeRecorder(persistence)
    first.count("hits", 4)
    first.observe("latency", 120)
    first.record({ kind: "a", subject: "x" })
    await first.flush()

    // A fresh Recorder is what a respawned event page gets: counters must span
    // the extension's life, not this generation's.
    const second = makeRecorder(persistence)
    await second.hydrate()

    expect(second.metrics.counter("hits")).toBe(4)
    expect(second.metrics.aggregate("latency")?.count).toBe(1)
    expect(second.events().map((e) => e.kind)).toEqual(["a"])
  })

  it("keeps events recorded before hydrate resolves", async () => {
    const persistence = memoryPersistence()
    const first = makeRecorder(persistence)
    first.record({ kind: "a", subject: "old" })
    await first.flush()

    // The startup window: an MV3 worker registers its listeners at module
    // evaluation and they fire immediately — an alarm that fired *and is what
    // woke the page* records here, while hydrate's storage read is still in
    // flight. Clearing the buffer on load deleted exactly that, which is how a
    // sweep's `tab.skipped` events came to appear with no `check.start` before
    // them, and how a real alarm fire came to look like a missed one.
    const second = makeRecorder(persistence)
    const loading = second.hydrate()
    second.record({ kind: "b", subject: "during-hydrate" })
    await loading

    expect(second.events().map((e) => e.subject)).toEqual([
      "old",
      "during-hydrate",
    ])
    // Re-sequenced to follow the restored history, not left colliding with it.
    expect(second.events().map((e) => e.seq)).toEqual([1, 2])
  })

  it("adds counters taken during the hydrate window to the stored ones", async () => {
    const persistence = memoryPersistence()
    const first = makeRecorder(persistence)
    first.count("hits", 4)
    await first.flush()

    const second = makeRecorder(persistence)
    const loading = second.hydrate()
    second.count("hits", 2)
    await loading

    // 6, not 4 — overwriting would silently discard the live count, which is
    // what made `alarm_fires` under-report every fire that woke the worker.
    expect(second.metrics.counter("hits")).toBe(6)
  })

  it("does not let a stored snapshot overwrite a fresher live one", async () => {
    const persistence = memoryPersistence()
    const first = makeRecorder(persistence)
    first.setSnapshot("alarm:lastFire", 1000)
    await first.flush()

    const second = makeRecorder(persistence)
    const loading = second.hydrate()
    second.setSnapshot("alarm:lastFire", 2000)
    await loading

    expect(second.snapshotEntries()["alarm:lastFire"]).toBe(2000)
  })

  it("continues the sequence after hydrating rather than restarting at 1", async () => {
    const persistence = memoryPersistence()
    const first = makeRecorder(persistence)
    first.record({ kind: "a" })
    first.record({ kind: "a" })
    await first.flush()

    const second = makeRecorder(persistence)
    await second.hydrate()
    second.record({ kind: "b" })

    const events = second.events()
    expect(events[events.length - 1]?.seq).toBe(3)
  })

  it("flushes an error immediately instead of waiting out the debounce", async () => {
    const persistence = memoryPersistence()
    const rec = makeRecorder(persistence)

    rec.record({ kind: "a", severity: "error", detail: "boom" })
    await Promise.resolve()
    await Promise.resolve()

    // An error is the event most likely to be followed by the worker dying.
    const persisted = persistence.peek()?.events ?? []
    expect(persisted[persisted.length - 1]?.severity).toBe("error")
  })

  it("clamps an oversized detail payload instead of storing it whole", () => {
    const rec = new Recorder<"a", "hits", "latency">({
      namespace: "test",
      capacity: 2,
      maxDetailBytes: 32,
      persistence: memoryPersistence(),
    })
    rec.record({ kind: "a", detail: { blob: "x".repeat(500) } })

    const detail = rec.events()[0]?.detail
    expect(typeof detail).toBe("string")
    expect(String(detail)).toContain("truncated")
  })

  it("evicts the oldest snapshot key once the cap is reached", () => {
    const rec = new Recorder<"a", "hits", "latency">({
      namespace: "test",
      maxSnapshots: 2,
      persistence: memoryPersistence(),
    })
    rec.setSnapshot("tab:1", 1)
    rec.setSnapshot("tab:2", 2)
    rec.setSnapshot("tab:3", 3)

    expect(Object.keys(rec.snapshotEntries())).toEqual(["tab:2", "tab:3"])
  })

  it("stops recording when paused and resumes cleanly", () => {
    const rec = makeRecorder()
    rec.pause()
    rec.record({ kind: "a" })
    expect(rec.events()).toHaveLength(0)

    rec.resume()
    rec.record({ kind: "a" })
    expect(rec.events()).toHaveLength(1)
  })

  it("ignores persisted state written under a different namespace", async () => {
    const persistence = memoryPersistence()
    await persistence.save({
      version: 1,
      namespace: "some-other-extension",
      events: [{ seq: 1, t: 1, kind: "a", severity: "info" }],
      metrics: { counters: { hits: 99 }, aggregates: {} },
      snapshots: {},
      dropped: 0,
      updatedAt: 1,
    })

    const rec = makeRecorder(persistence)
    await rec.hydrate()

    expect(rec.events()).toHaveLength(0)
    expect(rec.metrics.counter("hits")).toBe(0)
  })
})

describe("scoreHealth", () => {
  const result = (
    name: string,
    status: InvariantResult["status"]
  ): InvariantResult => ({ name, description: "", status, t: 0 })

  it("is perfect when everything holds and nothing errored", () => {
    expect(scoreHealth([result("a", "ok"), result("b", "ok")], 0)).toEqual({
      score: 100,
      status: "healthy",
    })
  })

  it("reports unhealthy as soon as any invariant is violated", () => {
    const { status } = scoreHealth(
      [result("a", "ok"), result("b", "violated")],
      0
    )
    expect(status).toBe("unhealthy")
  })

  it("does not penalise checks that could not be evaluated", () => {
    // An un-evaluable check is not evidence of breakage; treating it as one
    // would make the score cry wolf on a fresh profile.
    expect(
      scoreHealth([result("a", "ok"), result("b", "unknown")], 0).score
    ).toBe(100)
  })

  it("shaves points for recent errors without collapsing the score", () => {
    const { score } = scoreHealth([result("a", "ok")], 3)
    expect(score).toBe(94)
  })
})

// ── Adapter: the suspender's own invariants ──────────────────────────────────

const NOW = 1_700_000_000_000
const INTERVAL = 200_000

const context = (over: Partial<InvariantContext> = {}): InvariantContext => ({
  now: NOW,
  schedulingEnabled: true,
  expectedIntervalMs: INTERVAL,
  alarmScheduledTime: NOW + INTERVAL,
  lastCheckAt: NOW - 1000,
  sweepsStarted: 10,
  sweepsSettled: 10,
  marker: "💤",
  tabs: [],
  inFlight: [],
  ...over,
})

const check = async (
  name: string,
  ctx: InvariantContext
): Promise<InvariantResult> => {
  const results = await runInvariants(suspenderInvariants, ctx, NOW)
  const found = results.find((r) => r.name === name)
  if (!found) {
    throw new Error(`no invariant named ${name}`)
  }
  return found
}

describe("suspender invariants", () => {
  it("SchedulerAlarmExists holds when the alarm is registered", async () => {
    expect((await check("SchedulerAlarmExists", context())).status).toBe("ok")
  })

  it("SchedulerAlarmExists fires when scheduling is on but no alarm exists", async () => {
    const result = await check(
      "SchedulerAlarmExists",
      context({ alarmScheduledTime: undefined })
    )
    expect(result.status).toBe("violated")
  })

  it("SchedulerAlarmExists stays quiet when suspending is switched off", async () => {
    const result = await check(
      "SchedulerAlarmExists",
      context({ schedulingEnabled: false, alarmScheduledTime: undefined })
    )
    expect(result.status).toBe("ok")
  })

  it("SchedulerAlarmNotStale catches an alarm long past due", async () => {
    const result = await check(
      "SchedulerAlarmNotStale",
      context({ alarmScheduledTime: NOW - INTERVAL * 2 })
    )
    expect(result.status).toBe("violated")
  })

  it("CheckRanRecently catches a scheduler that stopped waking us", async () => {
    // The signature of the bug this patch fixes, seen from the health page.
    const result = await check(
      "CheckRanRecently",
      context({ lastCheckAt: NOW - INTERVAL * 5 })
    )
    expect(result.status).toBe("violated")
  })

  it("CheckRanRecently reports unknown on a profile that has never swept", async () => {
    const result = await check(
      "CheckRanRecently",
      context({ lastCheckAt: undefined })
    )
    expect(result.status).toBe("unknown")
  })

  it("SweepsTerminate catches sweeps that start and never finish", async () => {
    // The exact shape of the reported regression: the scheduler is healthy and
    // firing, every sweep is entered, and not one of them ever reaches a
    // terminal outcome because a tab probe hangs mid-loop. Every other
    // invariant reads green through this — which is how a profile that had not
    // suspended a single tab in hours still scored 100.
    const result = await check(
      "SweepsTerminate",
      context({ sweepsStarted: 13, sweepsSettled: 0 })
    )
    expect(result.status).toBe("violated")
  })

  it("SweepsTerminate tolerates exactly one sweep in flight", async () => {
    const result = await check(
      "SweepsTerminate",
      context({ sweepsStarted: 13, sweepsSettled: 12 })
    )
    expect(result.status).toBe("ok")
  })

  it("SweepsTerminate reports unknown before any sweep has run", async () => {
    const result = await check(
      "SweepsTerminate",
      context({ sweepsStarted: 0, sweepsSettled: 0 })
    )
    expect(result.status).toBe("unknown")
  })

  it("NoActiveTabSuspended catches a discarded foreground tab", async () => {
    const result = await check(
      "NoActiveTabSuspended",
      context({
        tabs: [{ id: 7, active: true, discarded: true, title: "Example" }],
      })
    )
    expect(result.status).toBe("violated")
    expect(result.details).toEqual({ tabIds: [7] })
  })

  it("NoStrandedMarkerOnLiveTab catches a rollback that never completed", async () => {
    const result = await check(
      "NoStrandedMarkerOnLiveTab",
      context({
        tabs: [{ id: 8, active: false, discarded: false, title: "💤 Example" }],
      })
    )
    expect(result.status).toBe("violated")
  })

  it("NoStrandedMarkerOnLiveTab leaves a genuinely discarded tab alone", async () => {
    // A discarded tab *should* wear the marker — that is the feature.
    const result = await check(
      "NoStrandedMarkerOnLiveTab",
      context({
        tabs: [{ id: 9, active: false, discarded: true, title: "💤 Example" }],
      })
    )
    expect(result.status).toBe("ok")
  })

  it("NoStuckInFlightSuspend catches an attempt that never settled", async () => {
    const result = await check(
      "NoStuckInFlightSuspend",
      context({ inFlight: [{ tabId: 11, startedAt: NOW - 120_000 }] })
    )
    expect(result.status).toBe("violated")
  })

  it("NoStuckInFlightSuspend tolerates a suspend that is merely in progress", async () => {
    const result = await check(
      "NoStuckInFlightSuspend",
      context({ inFlight: [{ tabId: 11, startedAt: NOW - 500 }] })
    )
    expect(result.status).toBe("ok")
  })
})

describe("safeOrigin", () => {
  it("keeps the origin and discards path and query", () => {
    // Browsing content has no business being written to disk; the origin is
    // enough to answer "why wasn't this tab suspended?".
    expect(safeOrigin("https://example.com/private/doc?token=secret")).toBe(
      "https://example.com"
    )
  })

  it("labels a missing or unparseable url instead of throwing", () => {
    expect(safeOrigin(undefined)).toBe("(none)")
    expect(safeOrigin("not a url")).toBe("(opaque)")
  })
})

describe("clampCheckPeriodSeconds", () => {
  it("sweeps at a third of the configured age threshold", () => {
    expect(clampCheckPeriodSeconds(30 * 60)).toBe(600)
  })

  it("clamps to the 1–20 minute band the browser will honour", () => {
    expect(clampCheckPeriodSeconds(30)).toBe(60)
    expect(clampCheckPeriodSeconds(24 * 60 * 60)).toBe(1200)
  })
})
