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
  INITIAL_ANNOUNCER_STATE,
  voiceKindOf,
} from "."

const statusArbitrary: fc.Arbitrary<SpeechStatus> = fc.record({
  voice: fc.constantFrom("device" as const, "hosted" as const),
  health: fc.constantFrom(
    "ready" as const,
    "faulted" as const,
    "unavailable" as const
  ),
})

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
  it("calls the browser's own synthesizer the device voice, and anything else hosted", () => {
    const browser = {
      ...createControllableAdapter(),
      id: "web-speech" as const,
    }
    const backend = { ...createControllableAdapter(), id: "http" as const }

    expect(voiceKindOf(browser)).toBe("device")
    expect(voiceKindOf(backend)).toBe("hosted")
  })

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
    announcer.observe({ voice: "hosted", health: "ready" })
    const notice = announcer.observe({ voice: "hosted", health: "faulted" })

    // The queue's `error` is a backend message - "openai TTS API error: 503
    // Service Unavailable - upstream is down" and the like. It is useful in
    // the queue state a developer reads, and it is not a disclosure.
    expect(notice?.title).not.toMatch(/error|http|openai|5050/i)
    expect(notice?.description).not.toMatch(/error|http|openai|5050/i)
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
      fc.property(
        fc.constantFrom("device" as const, "hosted" as const),
        fc.integer({ min: 1, max: 40 }),
        (voice, failures) => {
          const notices = noticesFor([
            { voice, health: "ready" },
            ...Array.from({ length: failures }, () => ({
              voice,
              health: "faulted" as const,
            })),
          ])

          expect(notices.map((n) => n.kind)).toEqual(["activated", "faulted"])
        }
      ),
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

  it("rule 4: no two consecutive notices are ever identical", () => {
    // Stated over the whole notice rather than its kind, because one
    // same-kind repeat is deliberate: a voice change re-discloses, since
    // text that stayed on the device may now be leaving it. That notice
    // reads differently, which is the whole reason it is worth showing. A
    // property test caught the version of this rule that said "same kind"
    // and the two places where the machine violated it by accident.
    fc.assert(
      fc.property(
        fc.array(statusArbitrary, { minLength: 1, maxLength: 60 }),
        (statuses) => {
          const notices = noticesFor(statuses)
          notices.forEach((notice, index) => {
            if (index === 0) return
            expect(notice).not.toEqual(notices[index - 1])
          })
        }
      ),
      { numRuns: 300 }
    )
  })

  it("rule 4a: the only same-kind repeat is a re-disclosure across voices", () => {
    fc.assert(
      fc.property(
        fc.array(statusArbitrary, { minLength: 1, maxLength: 60 }),
        (statuses) => {
          const notices = noticesFor(statuses)
          notices.forEach((notice, index) => {
            if (index === 0) return
            if (notice.kind !== notices[index - 1]?.kind) return
            expect(notice.kind).toBe("activated")
            expect(notice.description).not.toBe(notices[index - 1]?.description)
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
            return (
              index === 0 ||
              previous?.health !== status.health ||
              previous.voice !== status.voice
            )
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
  it("discloses once on activation, and says which voice is speaking", () => {
    const device = noticesFor([{ voice: "device", health: "ready" }])
    const hosted = noticesFor([{ voice: "hosted", health: "ready" }])

    expect(device[0]?.kind).toBe("activated")
    expect(device[0]?.description).toMatch(/nothing you hear is sent anywhere/i)
    // The one distinction worth disclosing: whether text leaves the machine.
    expect(hosted[0]?.description).toMatch(/sent to this site's voice service/i)
  })

  it("walks activation, fault and recovery once each across a whole session", () => {
    const notices = noticesFor([
      { voice: "hosted", health: "ready" },
      { voice: "hosted", health: "ready" },
      { voice: "hosted", health: "faulted" },
      { voice: "hosted", health: "faulted" },
      { voice: "hosted", health: "faulted" },
      { voice: "hosted", health: "ready" },
      { voice: "hosted", health: "ready" },
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
      { voice: "device", health: "ready" },
      { voice: "device", health: "ready" },
    ])

    expect(notices.map((notice) => notice.kind)).toEqual(["activated"])
  })

  it("announces an unusable runtime once, rather than on every attempt", () => {
    const notices = noticesFor(
      Array.from({ length: 10 }, () => ({
        voice: "device" as const,
        health: "unavailable" as const,
      }))
    )

    expect(notices.map((notice) => notice.kind)).toEqual(["unavailable"])
  })

  it("re-discloses when the voice itself changes", () => {
    // A different voice means different data handling - text that stayed on
    // the device may now be leaving it. That is a new disclosure, not noise.
    const notices = noticesFor([
      { voice: "device", health: "ready" },
      { voice: "hosted", health: "ready" },
    ])

    expect(notices.map((notice) => notice.kind)).toEqual([
      "activated",
      "activated",
    ])
    expect(notices[1]?.description).toMatch(/voice service/i)
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
