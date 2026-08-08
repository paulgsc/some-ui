/**
 * The mode gate, which is the whole of #924.
 *
 * These assert on `runNudgeTick` rather than on the hook because the
 * property worth pinning is not "an interval was installed" - it is that a
 * day which earns a reminder produces exactly one, from one policy. Shipping
 * the server half without this gate does not produce "occasionally two"
 * notifications; it produces reliably two on every such day, from two
 * cooldowns that cannot see each other.
 */
import { describe, expect, it, vi } from "vitest"

import type { SessionRecord } from "../tenant/types"
import type { NudgeDecision } from "./index"
import { DEFAULT_NUDGE_PREFERENCES } from "./index"
import { clientOwnsNudgeDelivery, runNudgeTick } from "./use-study-nudge"

const PREFERENCES = { ...DEFAULT_NUDGE_PREFERENCES, enabled: true }

/** 14:00 local - outside the default 22->8 quiet range on any machine. */
const NOW = new Date(2026, 2, 15, 14, 0, 0)

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "s1",
    name: "Korean review",
    status: "scheduled",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 10 * 60_000,
    createdAt: "2026-03-14T09:00:00.000Z",
    updatedAt: "2026-03-14T09:00:00.000Z",
    ...overrides,
  }
}

function tickWith(
  deliver: boolean,
  sessions = [session()]
): {
  show: ReturnType<typeof vi.fn>
  record: ReturnType<typeof vi.fn>
  run: () => Promise<NudgeDecision>
} {
  const show = vi.fn().mockResolvedValue(true)
  const record = vi.fn()
  return {
    show,
    record,
    run: (): Promise<NudgeDecision> =>
      runNudgeTick({
        sessions,
        preferences: PREFERENCES,
        now: NOW,
        pageVisible: false,
        lastNudgeAt: null,
        deliver,
        show,
        record,
      }),
  }
}

describe("clientOwnsNudgeDelivery", () => {
  it("is the static build's job and nobody else's", () => {
    // Pages has no backend, so there it is the only policy there is.
    expect(clientOwnsNudgeDelivery("static")).toBe(true)
    // vite dev, vite preview and the Docker image all have file_host.
    expect(clientOwnsNudgeDelivery("server")).toBe(false)
  })
})

describe("runNudgeTick", () => {
  it("raises and stamps the cooldown in static mode", () => {
    const { show, record, run } = tickWith(true)

    return run().then((decision) => {
      expect(decision.kind).toBe("nudge")
      expect(show).toHaveBeenCalledTimes(1)
      expect(record).toHaveBeenCalledTimes(1)
    })
  })

  it("decides but stays quiet in server mode", async () => {
    const { show, record, run } = tickWith(false)

    const decision = await run()

    // The decision still happens - the settings status line is built on it.
    expect(decision.kind).toBe("nudge")
    // What must not happen is the second notification.
    expect(show).not.toHaveBeenCalled()
    // And no local cooldown stamp either: it would be a stamp nothing reads,
    // and a misleading one if delivery ever moved back.
    expect(record).not.toHaveBeenCalled()
  })

  it("does not stamp a cooldown for a notification that was not shown", async () => {
    const show = vi.fn().mockResolvedValue(false)
    const record = vi.fn()

    await runNudgeTick({
      sessions: [session()],
      preferences: PREFERENCES,
      now: NOW,
      pageVisible: false,
      lastNudgeAt: null,
      deliver: true,
      show,
      record,
    })

    // A denied permission or a failed registration must not silently burn
    // the next few hours of eligibility.
    expect(record).not.toHaveBeenCalled()
  })

  it("raises nothing in either mode when the policy is silent", async () => {
    for (const deliver of [true, false]) {
      const { show, run } = tickWith(deliver, [])
      expect((await run()).kind).toBe("silent")
      expect(show).not.toHaveBeenCalled()
    }
  })
})
