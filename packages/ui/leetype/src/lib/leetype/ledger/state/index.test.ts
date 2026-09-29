import { EMPTY_LEDGER, recordObservations } from "@leetype/lib/leetype/ledger"
import {
  demonstrated,
  RETENTION_WINDOW_BASE_MS,
} from "@leetype/lib/leetype/ledger/demonstration"
import type { FiledObservation } from "@leetype/lib/leetype/ledger/observation"
import { observationsOfCommitment } from "@leetype/lib/leetype/ledger/observation"
import {
  lastRoundId,
  LEDGER_STATE_COPY,
  LEDGER_STATES,
  ledgerStateOf,
  touchedIn,
  whatIsLeft,
} from "@leetype/lib/leetype/ledger/state"
import type { PropositionId } from "@leetype/lib/leetype/proposition-register/generated"
import { describe, expect, it } from "vitest"

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const T0 = 1_790_000_000_000

function card(options: {
  answerId: PropositionId
  choice: PropositionId | "abstain"
  presented?: ReadonlyArray<PropositionId>
  rewriteKey?: string
  sessionId?: string
  at: number
}): ReadonlyArray<FiledObservation> {
  return observationsOfCommitment({
    answerId: options.answerId,
    presented: options.presented ?? [options.answerId, "CW-P3"],
    commitment:
      options.choice === "abstain"
        ? { kind: "abstain" }
        : { kind: "choice", id: options.choice },
    roundId: `round-${options.at}`,
    rewriteKey: options.rewriteKey ?? "rw:a",
    sessionId: options.sessionId ?? "s1",
    at: options.at,
  })
}

describe("Def. 10.1 — four states, derived at read time", () => {
  it("has exactly four states and no fifth", () => {
    expect(LEDGER_STATES).toEqual([
      "unseen",
      "exposed",
      "recognized",
      "demonstrated",
    ])
  })

  it("is unseen with no entry, and exposed once presented", () => {
    expect(ledgerStateOf("CW-P3", EMPTY_LEDGER, T0)).toBe("unseen")
    const ledger = recordObservations(
      EMPTY_LEDGER,
      card({ answerId: "CW-P6", choice: "abstain", at: T0 })
    )
    expect(ledgerStateOf("CW-P3", ledger, T0)).toBe("exposed")
    expect(ledgerStateOf("CW-P6", ledger, T0)).toBe("exposed")
  })

  it("advances through recognized to demonstrated, and lapses back to recognized", () => {
    let ledger = EMPTY_LEDGER
    const play = (
      filed: ReadonlyArray<FiledObservation>
    ): ReadonlyArray<FiledObservation> => {
      ledger = recordObservations(ledger, filed)
      return filed
    }
    play(
      card({ answerId: "CW-P6", choice: "CW-P6", rewriteKey: "rw:a", at: T0 })
    )
    play(
      card({
        answerId: "CW-P6",
        choice: "CW-P6",
        rewriteKey: "rw:b",
        at: T0 + MINUTE,
      })
    )
    const nextDay = T0 + DAY
    play(
      card({
        answerId: "CW-P6",
        choice: "CW-P6",
        rewriteKey: "rw:c",
        sessionId: "s2",
        at: nextDay,
      })
    )
    expect(ledgerStateOf("CW-P6", ledger, nextDay)).toBe("recognized")
    // A correct rejection: CW-P6 offered, CW-P8 the witness, CW-P8 chosen.
    play(
      card({
        answerId: "CW-P8",
        choice: "CW-P8",
        presented: ["CW-P8", "CW-P6"],
        sessionId: "s2",
        at: nextDay + MINUTE,
      })
    )
    expect(ledgerStateOf("CW-P6", ledger, nextDay + MINUTE)).toBe(
      "demonstrated"
    )
    // Same ledger, later clock: nothing was written, and the claim decayed.
    const later = nextDay + MINUTE + RETENTION_WINDOW_BASE_MS + 1
    expect(ledgerStateOf("CW-P6", ledger, later)).toBe("recognized")
  })
})

describe("Cor. 10.1 — recognition is cheap and is labelled as such", () => {
  it("makes one correct selection recognized, never demonstrated", () => {
    const ledger = recordObservations(
      EMPTY_LEDGER,
      card({ answerId: "CW-P6", choice: "CW-P6", at: T0 })
    )
    expect(ledgerStateOf("CW-P6", ledger, T0)).toBe("recognized")
    expect(ledgerStateOf("CW-P6", ledger, T0 + 30 * DAY)).toBe("recognized")
  })

  it("says recognized is not demonstrated, and no copy calls any state mastery", () => {
    expect(LEDGER_STATE_COPY.recognized).toMatch(/Not demonstrated/)
    for (const copy of Object.values(LEDGER_STATE_COPY)) {
      expect(copy).not.toMatch(/master|%|level|streak/i)
    }
  })
})

describe("whatIsLeft — the conjuncts still open, in words", () => {
  it("names every open conjunct after one correct selection, and none once demonstrated", () => {
    const one = recordObservations(
      EMPTY_LEDGER,
      card({ answerId: "CW-P6", choice: "CW-P6", at: T0 })
    )
    expect(whatIsLeft(demonstrated("CW-P6", one, T0))).toEqual([
      "named on different rewrites",
      "rejected where it was the wrong answer",
      "named again in a later session",
    ])
    const rejected = recordObservations(
      one,
      card({
        answerId: "CW-P8",
        choice: "CW-P8",
        presented: ["CW-P8", "CW-P6"],
        at: T0 + MINUTE,
      })
    )
    expect(whatIsLeft(demonstrated("CW-P6", rejected, T0 + MINUTE))).toEqual([
      "named on different rewrites",
      "named again in a later session",
    ])
    for (const line of whatIsLeft(demonstrated("CW-P6", one, T0))) {
      expect(line).not.toMatch(/master|%|\d/i)
    }
  })
})

describe("touchedIn", () => {
  it("lists the entries a session filed into, in register order", () => {
    let ledger = recordObservations(
      EMPTY_LEDGER,
      card({ answerId: "CW-P6", choice: "abstain", sessionId: "s1", at: T0 })
    )
    ledger = recordObservations(
      ledger,
      card({
        answerId: "CW-P1",
        choice: "abstain",
        sessionId: "s2",
        at: T0 + 1,
      })
    )
    expect(touchedIn(ledger, "s1")).toEqual(["CW-P3", "CW-P6"])
    expect(touchedIn(ledger, "s2")).toEqual(["CW-P1", "CW-P3"])
    expect(touchedIn(ledger, "s3")).toEqual([])
  })
})

describe("lastRoundId", () => {
  it("is the round of the newest observation, or undefined for an empty ledger", () => {
    expect(lastRoundId(EMPTY_LEDGER)).toBeUndefined()
    let ledger = recordObservations(
      EMPTY_LEDGER,
      card({ answerId: "CW-P6", choice: "abstain", at: T0 + 5 })
    )
    ledger = recordObservations(
      ledger,
      card({ answerId: "CW-P1", choice: "abstain", at: T0 })
    )
    expect(lastRoundId(ledger)).toBe(`round-${T0 + 5}`)
  })
})
