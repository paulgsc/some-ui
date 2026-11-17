/**
 * The one sanitizer (#3152, #3155): each raw outcome of the pairing
 * record's read, and of a run of the link, lands in one member of its
 * union. The read's: a record, none, one lost, one that won't parse, the
 * read failing, its deadline passing; a second answer to the read, and one
 * landing after the link moved on, which the step drops. A run's: it ran,
 * was stopped, was turned away for each reason, or threw home's silence,
 * a block (NA1), or a fault on this phone.
 *
 * Promise RO1 (#3155): every run of the home link ends in one named
 * outcome, and every ask of home reads it through `../settle` alone.
 *
 * - _Claim:_ `../runtime`'s `sync`, `send`, `keep`, `drain` and `look`
 *   each end in `../model`'s `Run` (done, stopped, or refused with its
 *   `Refusal`) or a throw, never `null`; `../while-busy`'s `asked` and
 *   `answered` say each through `settleRun`, which reports a fault on this
 *   phone and says home's silence or a block as unreachable.
 * - _Family:_ the run's kind (`sync`, `send`, `keep`, `drain`, `look`) ×
 *   the link's state at its start (reading, unpaired, busy with another
 *   run, pairing or unpairing, a drain preempted, its record gone, paired
 *   and free) × its raw outcome (ran, stopped, refused, threw home's
 *   silence, a block, a fault, a foreign port's fault).
 * - _Proof:_ the type (`Run` has no `null`, `Refusal` no not-known-yet);
 *   `./pairing.test.ts` holds `refusalOf` against `step` over every link
 *   state × every start (the four person and drain kinds; `look` takes
 *   none, and reads the pairing itself); this file holds `settleRun` over
 *   every raw outcome; `./runtime.test.ts` holds a run parked over the
 *   read, a look refused unpaired, and a drain preempted by an Unpair, then
 *   refused as unpaired; `./takes-read.test.ts` holds a fault reported
 *   once.
 * - _Tolerance:_ `askWhileBusy` still ends a link that stayed busy for all
 *   its tries as unreachable, and so do the screens that read through it;
 *   their busy words are #3155's rest.
 */
import { describe, expect, it } from "vitest"

import {
  HomeBlockedError,
  HomeNoAnswerError,
} from "@/lib/device-backend/native-http/no-answer"
import type {
  HomeLinkEvent,
  HomeLinkState,
  Refusal,
} from "@/lib/home-link/model"
import { INITIAL, pairingIn, step } from "@/lib/home-link/model"
import type { RawRead, RawRun, Settled } from "@/lib/home-link/settle"
import { settleRead, settleRun } from "@/lib/home-link/settle"

const BASE = "https://home.example/api/v1"
const RECORD = JSON.stringify({ base: BASE, token: "t", id: "p1", pairedAt: 1 })

const read = (raw: RawRead): HomeLinkState =>
  step(INITIAL, { type: "read", found: settleRead(raw) })

describe("the pairing record's read, settled", () => {
  it.each<[string, RawRead, ReturnType<typeof pairingIn>["kind"], unknown]>([
    ["a record", { kind: "read", record: RECORD, lost: false }, "paired", null],
    ["none", { kind: "read", record: null, lost: false }, "unpaired", null],
    [
      "one lost",
      { kind: "read", record: null, lost: true },
      "unpaired",
      "lost",
    ],
    [
      "one that won't parse (corrupt)",
      { kind: "read", record: "{not json", lost: false },
      "unpaired",
      null,
    ],
    [
      "one missing its token (corrupt)",
      { kind: "read", record: JSON.stringify({ base: BASE }), lost: false },
      "unpaired",
      null,
    ],
    // The plugin failing, and `./credential`'s deadline passing, both
    // reject the read.
    [
      "the read failing or past its deadline",
      { kind: "failed" },
      "unpaired",
      "unreadable",
    ],
  ])("%s", (_, raw, kind, note) => {
    const state = read(raw)
    expect(pairingIn(state).kind).toBe(kind)
    if (state.link.kind === "unpaired") expect(state.link.note).toBe(note)
  })

  it("keeps the first answer: a duplicate read, or one after the link moved on, is dropped", () => {
    const paired = read({ kind: "read", record: RECORD, lost: false })
    const again: HomeLinkEvent = { type: "read", found: null }
    expect(step(paired, again)).toBe(paired)
    const unpaired = read({ kind: "read", record: null, lost: false })
    const pairedSince = step(
      step(unpaired, { type: "pairPressed", base: BASE }),
      { type: "paired", base: BASE, id: "p2", at: 5, name: null }
    )
    // The record's read, answering late after a pairing was made.
    expect(
      step(pairedSince, {
        type: "read",
        found: settleRead({ kind: "failed" }),
      })
    ).toBe(pairedSince)
  })
})

const noAnswer = new HomeNoAnswerError({
  kind: "unreachable",
  retryable: true,
  summary: "no answer",
  cause: null,
})
const blocked = new HomeBlockedError(
  { kind: "rejected", retryable: true, summary: "blocked", cause: null },
  "trust"
)
const fault = new Error("Keystore")

/** Each way a run is turned away, and what an ask says of it. */
const REFUSALS: ReadonlyArray<readonly [Refusal, Settled<number>]> = [
  ["unpaired", { kind: "unpaired" }],
  ["gone", { kind: "unpaired" }],
  ["busy", { kind: "busy" }],
  ["pairing", { kind: "busy" }],
  ["preempted", { kind: "busy" }],
]

const RUNS: ReadonlyArray<readonly [string, RawRun<number>, Settled<number>]> =
  [
    [
      "it ran",
      { kind: "ran", run: { kind: "done", value: 7 } },
      { kind: "answered", value: 7 },
    ],
    [
      "it was stopped",
      { kind: "ran", run: { kind: "stopped" } },
      { kind: "busy" },
    ],
    ...REFUSALS.map(
      ([why, settled]) =>
        [
          `it was turned away, ${why}`,
          { kind: "ran", run: { kind: "refused", why } },
          settled,
        ] as const
    ),
    [
      "home was silent",
      { kind: "threw", error: noAnswer },
      { kind: "unreachable" },
    ],
    [
      "home was silent, wrapped",
      { kind: "threw", error: new Error("send", { cause: noAnswer }) },
      { kind: "unreachable" },
    ],
    [
      "the phone was blocked (NA1)",
      { kind: "threw", error: blocked },
      { kind: "unreachable" },
    ],
    [
      "a fault on this phone",
      { kind: "threw", error: fault },
      { kind: "failed", fault },
    ],
  ]

describe("a run of the link, settled", () => {
  it.each(RUNS)("%s", (_, raw, settled) => {
    expect(settleRun(raw)).toEqual(settled)
  })
})
