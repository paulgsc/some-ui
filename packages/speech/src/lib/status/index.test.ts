/**
 * The noise budget, as tests.
 *
 * The requirement is "make speech legible without a thunderstorm", and the
 * failure mode is entirely about sequences: a backend that fails once fails
 * for every retry, an applet that speaks per message drives the queue
 * dozens of times a minute, and a rule that looks obviously fine on one
 * transition produces forty toasts on a real one. So the four rules are
 * checked against arbitrary status sequences, not chosen ones.
 */

import { createControllableAdapter } from "@speech/lib/testing"
import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type { SpeechNotice, SpeechStatus } from "."
import {
  announce,
  createSpeechAnnouncer,
  deriveSpeechStatus,
  describeStatus,
  INITIAL_ANNOUNCER_STATE,
} from "."

const statusWith = (muted: fc.Arbitrary<boolean>): fc.Arbitrary<SpeechStatus> =>
  fc.record({
    health: fc.constantFrom(
      "ready" as const,
      "faulted" as const,
      "unavailable" as const
    ),
    muted,
  })

const statusArbitrary = statusWith(fc.constant(false))

/** The same space, but with muting in play - used where that is the subject. */
const mutableStatusArbitrary = statusWith(fc.boolean())

/** Runs a sequence through the machine and collects what a person would see. */
function noticesFor(
  statuses: ReadonlyArray<SpeechStatus>
): Array<SpeechNotice> {
  const announcer = createSpeechAnnouncer()
  const seen: Array<SpeechNotice> = []
  for (const status of statuses) {
    const notice = announcer.observe(status)
    if (notice) seen.push(notice)
  }
  return seen
}

describe("deriveSpeechStatus", () => {
  it("is unavailable when the runtime cannot speak, whatever the queue says", () => {
    const adapter = { ...createControllableAdapter(), supported: false }

    expect(deriveSpeechStatus(adapter, { error: null }).health).toBe(
      "unavailable"
    )
    expect(deriveSpeechStatus(adapter, { error: "boom" }).health).toBe(
      "unavailable"
    )
  })

  it("is faulted while the queue holds an error, and ready once it clears", () => {
    const adapter = createControllableAdapter()

    expect(deriveSpeechStatus(adapter, { error: "boom" }).health).toBe(
      "faulted"
    )
    expect(deriveSpeechStatus(adapter, { error: null }).health).toBe("ready")
  })

  it("never carries the underlying error text into what a person sees", () => {
    const announcer = createSpeechAnnouncer()
    announcer.observe({ health: "ready", muted: false })
    const notice = announcer.observe({
      health: "faulted",
      muted: false,
    })

    // The queue's `error` is a backend message - "synthesis-failed" and the
    // like. It is useful in
    // the queue state a developer reads, and it is not a disclosure.
    expect(notice?.title).not.toMatch(/error|synthesis/i)
    expect(notice?.description).not.toMatch(/error|synthesis/i)
  })
})

describe("announcer - the four rules", () => {
  it("rule 1: repeating a status emits nothing after the first", () => {
    fc.assert(
      fc.property(
        statusArbitrary,
        fc.integer({ min: 1, max: 50 }),
        (status, repeats) => {
          const notices = noticesFor(
            Array.from({ length: repeats }, () => status)
          )
          expect(notices).toHaveLength(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("rule 2: an episode of N failures is one notice", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), (failures) => {
        const notices = noticesFor([
          { health: "ready", muted: false },
          ...Array.from({ length: failures }, () => ({
            health: "faulted" as const,
            muted: false,
          })),
        ])

        expect(notices.map((n) => n.kind)).toEqual(["activated", "faulted"])
      }),
      { numRuns: 100 }
    )
  })

  it("rule 3: recovery is announced once, and never before a fault", () => {
    fc.assert(
      fc.property(
        fc.array(statusArbitrary, { minLength: 1, maxLength: 40 }),
        (statuses) => {
          const kinds = noticesFor(statuses).map((notice) => notice.kind)

          kinds.forEach((kind, index) => {
            if (kind !== "recovered") return
            const earlier = kinds.slice(0, index)
            expect(earlier.at(-1)).toBe("faulted")
          })
        }
      ),
      { numRuns: 300 }
    )
  })

  it("rule 4: no two consecutive notices are of the same kind", () => {
    fc.assert(
      fc.property(
        fc.array(statusArbitrary, { minLength: 1, maxLength: 60 }),
        (statuses) => {
          const notices = noticesFor(statuses)
          notices.forEach((notice, index) => {
            if (index === 0) return
            expect(notice.kind).not.toBe(notices[index - 1]?.kind)
          })
        }
      ),
      { numRuns: 300 }
    )
  })

  it("property: a session never emits more notices than it saw transitions", () => {
    fc.assert(
      fc.property(
        fc.array(statusArbitrary, { minLength: 1, maxLength: 60 }),
        (statuses) => {
          const transitions = statuses.filter((status, index) => {
            const previous = statuses[index - 1]
            return index === 0 || previous?.health !== status.health
          })

          expect(noticesFor(statuses).length).toBeLessThanOrEqual(
            transitions.length
          )
        }
      ),
      { numRuns: 200 }
    )
  })
})

describe("announcer - the happy path a person actually sees", () => {
  it("discloses once on activation, and says whose voice is speaking", () => {
    const notices = noticesFor([{ health: "ready", muted: false }])

    expect(notices[0]?.kind).toBe("activated")
    expect(notices[0]?.description).toMatch(/your browser or phone provides/i)
  })

  it("walks activation, fault and recovery once each across a whole session", () => {
    const notices = noticesFor([
      { health: "ready", muted: false },
      { health: "ready", muted: false },
      { health: "faulted", muted: false },
      { health: "faulted", muted: false },
      { health: "faulted", muted: false },
      { health: "ready", muted: false },
      { health: "ready", muted: false },
    ])

    expect(notices.map((notice) => notice.kind)).toEqual([
      "activated",
      "faulted",
      "recovered",
    ])
    expect(notices.map((notice) => notice.tone)).toEqual([
      "info",
      "warning",
      "info",
    ])
  })

  it("says nothing about recovery when speech was never announced broken", () => {
    const notices = noticesFor([
      { health: "ready", muted: false },
      { health: "ready", muted: false },
    ])

    expect(notices.map((notice) => notice.kind)).toEqual(["activated"])
  })

  it("announces an unusable runtime once, rather than on every attempt", () => {
    const notices = noticesFor(
      Array.from({ length: 10 }, () => ({
        health: "unavailable" as const,
        muted: false,
      }))
    )

    expect(notices.map((notice) => notice.kind)).toEqual(["unavailable"])
  })
})

describe("announce - purity", () => {
  it("is a function of its inputs, with no hidden clock or counter", () => {
    fc.assert(
      fc.property(statusArbitrary, (status) => {
        const first = announce(INITIAL_ANNOUNCER_STATE, status)
        const second = announce(INITIAL_ANNOUNCER_STATE, status)

        expect(second.notice).toEqual(first.notice)
        expect(second.state).toEqual(first.state)
      }),
      { numRuns: 100 }
    )
  })
})

describe("announcer - muting is a choice, not an event", () => {
  it("says nothing at all while muted", () => {
    fc.assert(
      fc.property(
        fc.array(mutableStatusArbitrary, { minLength: 1, maxLength: 40 }),
        (statuses) => {
          const muted = statuses.map((status) => ({ ...status, muted: true }))
          // A person who just clicked mute does not need a toast confirming
          // their own click, and "voice output is on" would be a lie.
          expect(noticesFor(muted)).toEqual([])
        }
      ),
      { numRuns: 200 }
    )
  })

  it("freezes rather than forgets - unmuting discloses what mute deferred", () => {
    const notices = noticesFor([
      { health: "ready", muted: true },
      { health: "ready", muted: true },
      { health: "ready", muted: false },
    ])

    expect(notices.map((notice) => notice.kind)).toEqual(["activated"])
  })

  it("does not re-disclose on every mute/unmute cycle", () => {
    const cycles: Array<SpeechStatus> = []
    for (let i = 0; i < 6; i++) {
      cycles.push({ health: "ready", muted: false })
      cycles.push({ health: "ready", muted: true })
    }

    expect(noticesFor(cycles).map((notice) => notice.kind)).toEqual([
      "activated",
    ])
  })

  it("describes muting as a choice, never as a broken browser", () => {
    const text = describeStatus({
      health: "ready",
      muted: true,
    })

    expect(text).toMatch(/off/i)
    expect(text).not.toMatch(/unavailable|can't|problem|stopped working/i)
  })
})
