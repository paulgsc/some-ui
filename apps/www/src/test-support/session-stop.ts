import type { Stop } from "@/lib/session-stop"
import { storeEffect } from "@/lib/session-stop"

/** An open stop at 12:18 of 20:00, in "reading", `agoMs` before now. */
export function stopRecord(agoMs = 0, overrides: Partial<Stop> = {}): Stop {
  return {
    sessionId: "session-1",
    stoppedAt: new Date(Date.now() - agoMs).toISOString(),
    elapsedMs: 738_000,
    plannedMs: 1_200_000,
    scene: "reading",
    via: "left",
    reason: null,
    reasonFrom: null,
    outcome: "open",
    settledAt: null,
    ...overrides,
  }
}

/** Stores `stop` as the app would on stopping. */
export function seedStop(stop: Stop): Stop {
  storeEffect({ kind: "save", stop })
  return stop
}
