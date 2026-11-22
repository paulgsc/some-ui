/**
 * @vitest-environment jsdom
 *
 * PO1 (#3128, widened by #3152 and #3157, moved onto the type by #3152's
 * second part): no reader of whether this phone is paired takes a pairing
 * record still being read for no pairing.
 *
 * **PO1: no reader says unpaired while the pairing record is read.**
 *
 * - _Claim:_ each reader named in the Family reads whether this phone is
 *   paired as `../model`'s `Pairing` (`pairing()`, `usePairing()`,
 *   `pairingIn`), whose `reading` member stands for not known yet, or, in
 *   soundbites, as voice-capture's `HomeReach` that idea hearing's
 *   `reachOf` makes of it (`unknown`, through `pairedOf`), and says nothing
 *   it would say of no pairing while it is not known. A run of the link
 *   asked for while the record is read waits for it as the link's own state
 *   (`../model`'s `parked`), and is then started, or turned away, against
 *   the link as the read left it, so no run's end says anything of a
 *   record not yet read.
 * - _Family:_ each reader × when the record's read ends (after the reader
 *   looks, as a fresh page load has it, or before) × what it finds (a
 *   pairing, none, one lost, a record that won't parse, a read that itself
 *   fails). The readers: every run of the link (`sync`, `send`, `keep`,
 *   `drain`, `look`) and so every ask made through one (Studio's renders and
 *   every read through `../while-busy`'s `asked`, home's compat, takes,
 *   what home keeps, its receipts, ideas, a note's delete, an episode
 *   step's let-go, a take's words, a note's audio); what this phone knows
 *   home holds (`sentUnder`, the waiting counts over it, and Studio ›
 *   Feedback's place of each note); the lanes' readings and runs
 *   (`laneReading`, `laneExchange`, a run turned away); the Jobs cards'
 *   journeys and the morning row, on Jobs and on the status board;
 *   Settings › Home's layout; the lane mark's sheet; the game outbox; idea
 *   hearing's reach and listener; the voice record's pairing port; the
 *   link's watchers (`kept-watch`, `practice-reads`,
 *   `serves`, `standing`, `live`, the voice copy's gates); where a take is
 *   kept (`voiceKept`, every screen's take row through it, and My data's
 *   count, which says `unknown` places as not known yet and reads this
 *   phone's side again once `whenPlacesKnown` hears the pairing known);
 *   Studio's takes and what Studio keeps, through voice-capture's
 *   `pairedOf` and its `unknown` place. Outside it, as they say nothing of
 *   no pairing (a control that is absent until paired): `routine.ts`'s
 *   and `leetype-files.ts`'s pairing ports, `device-routine-files`,
 *   `device-leetype-home-files` and Studio's clip frames.
 * - _Proof:_ the type. `pairing()` and `usePairing()` are the only reads of
 *   the pairing `lib/home-link` exports for a screen, and a switch over the
 *   union fails to compile without `reading`. A run's end is `../model`'s
 *   `Run`, whose `Refusal` has no member for not known yet: `refusalOf`'s
 *   `reading` is handled inside the runtime, which parks the run, and
 *   nowhere else can it be returned. `./pairing.test.ts` holds the union's
 *   transitions and the parked runs' release over every link state × every
 *   event; `./runtime.test.ts` holds a run parked over the read, released
 *   both ways; these tests hold each ask over its whole family (`FAMILY`),
 *   through the real link. A reader that folds the union to
 *   `kind === "paired"` is not held by the type, so each such reader holds
 *   its `reading` case in its own test: the waiting counts, Studio ›
 *   Feedback (`lib/episode-feedback`), the journey and morning
 *   (`lib/jobs`), the Jobs screen, the status board, Settings › Home and the
 *   lane mark's sheet (each with the read held, then ending both ways), a
 *   run turned away and `laneExchange` (`./kept.test.ts`), idea hearing, the voice record, the game outbox's words, where a take is
 *   kept and `whenPlacesKnown` (`./voice-send.test.ts`), My data's re-read
 *   (`lib/my-data`'s runtime test), `pairedOf` and the unknown place's words
 *   (voice-capture's `not-known.test.ts`), and soundbites' Studio and
 *   records (`record-take`, `records` and `studio` tests).
 * - _Tolerance:_ a run waits as long as the record's read, at most
 *   `./credential`'s 5 s, usually a few milliseconds.
 *
 * Relates: widens PO1 (#3157), then moves its proof onto the type
 * (#3152). Its first Family held only the ten asks, which each awaited the
 * record before asking (`pairedOnceRead`); the readers past it took the
 * answer as a boolean or an id-or-null, which had no member for not known
 * yet. The second part made the wait the link's own state, so no ask
 * awaits the record itself, and the grep that held the ten is gone.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HomeRequest as NativeCall } from "@/lib/device-backend/native-http"

type Read = { record: string | null; lost: boolean }

const home = vi.hoisted(
  (): {
    sent: Array<NativeCall>
    read: () => Promise<Read>
  } => ({
    sent: [],
    read: () => Promise.resolve({ record: null, lost: false }),
  })
)

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: NativeCall
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.resolve({ status: 200, body: "{}" })
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<Read> => home.read(),
    write: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
  },
}))

const PAIRING: Read = {
  record: JSON.stringify({
    base: "https://home.example/api/v1",
    token: "t",
    id: "p1",
    pairedAt: 1_000,
  }),
  lost: false,
}

/** Each one-shot ask, as a screen makes it, in a fresh page. */
const ASKS: ReadonlyArray<{
  readonly name: string
  readonly ask: () => Promise<unknown>
}> = [
  {
    name: "Studio's renders (while-busy's asked)",
    ask: async () => (await import("@/lib/home-link/renders")).askRenders(),
  },
  {
    name: "home's compat",
    ask: async () => (await import("@/lib/home-link/compat-read")).askCompat(1),
  },
  {
    name: "the takes home keeps",
    ask: async () =>
      (await import("@/lib/home-link/takes-read")).askTakes(null),
  },
  {
    name: "what home keeps",
    ask: async () => (await import("@/lib/home-link/kept-read")).askKept(null),
  },
  {
    name: "home's receipts",
    ask: async () =>
      (await import("@/lib/home-link/deleted-read")).askDeleted(),
  },
  {
    name: "ideas",
    ask: async () =>
      (await import("@/lib/home-link/idea-reads")).askIdeas({ kind: "ideas" }),
  },
  {
    name: "a note's delete",
    ask: async () =>
      (await import("@/lib/home-link/delete-note")).deleteNotes(["n1"], () =>
        Promise.resolve()
      ),
  },
  {
    name: "an episode step's let-go",
    ask: async (): Promise<unknown> => {
      const { FEEDS } = await import("@/lib/feeds")
      const { deleteCallStep } = await import("@/lib/home-link/delete-note")
      return deleteCallStep(FEEDS[0], "k", "video")
    },
  },
  {
    name: "a take's words",
    ask: async () => (await import("@/lib/home-link/heard")).askHeard("n1"),
  },
  {
    name: "a note's audio",
    ask: async () =>
      (await import("@/lib/home-link/voice-audio")).askAudio("n1"),
  },
]

/** What the record's read comes to: a record it found, or a failure. */
type Found =
  | { readonly kind: "found"; readonly read: Read }
  | { readonly kind: "fails" }

/** Every outcome of the read, and whether it leaves the phone paired. */
const OUTCOMES: ReadonlyArray<{
  readonly name: string
  readonly found: Found
  readonly paired: boolean
}> = [
  { name: "a pairing", found: { kind: "found", read: PAIRING }, paired: true },
  {
    name: "no record",
    found: { kind: "found", read: { record: null, lost: false } },
    paired: false,
  },
  {
    name: "a record lost",
    found: { kind: "found", read: { record: null, lost: true } },
    paired: false,
  },
  {
    name: "a record that won't parse",
    found: { kind: "found", read: { record: "not a record", lost: false } },
    paired: false,
  },
  {
    // The phone couldn't read its record (its key gone, say).
    name: "a read that itself fails",
    found: { kind: "fails" },
    paired: false,
  },
]

/** When the record's read ends: after the ask starts, or before it. */
const TIMINGS = ["after the ask starts", "before the ask"] as const

/** A record's read held until the returned call ends it with `found`. */
function heldRead(): (found: Found) => void {
  let end: (found: Found) => void = () => undefined
  const held = new Promise<Read>((resolve, reject) => {
    end = (found): void => {
      if (found.kind === "found") resolve(found.read)
      else reject(new Error("unreadable"))
    }
  })
  home.read = (): Promise<Read> => held
  return (found) => end(found)
}

const ticks = async (count: number): Promise<void> => {
  for (let tick = 0; tick < count; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

afterEach(() => {
  vi.resetModules()
  home.sent = []
  home.read = (): Promise<Read> =>
    Promise.resolve({ record: null, lost: false })
})

/** Each ask × each outcome × each timing: PO1's whole family. */
const FAMILY = ASKS.flatMap((ask) =>
  OUTCOMES.flatMap((outcome) =>
    TIMINGS.map((timing) => ({
      ask: ask.ask,
      paired: outcome.paired,
      found: outcome.found,
      timing,
      name: `${ask.name}, the read finding ${outcome.name} ${timing}`,
    }))
  )
)

describe("a one-shot ask as a page opens (PO1)", () => {
  it.each(FAMILY)("$name", async ({ ask, paired, found, timing }) => {
    const end = heldRead()
    if (timing === "before the ask") {
      end(found)
      const { homeLink } = await import("@/lib/home-link")
      await homeLink().load()
    }
    let settled = false
    const asking = ask().then((outcome) => {
      settled = true
      return outcome
    })
    if (timing === "after the ask starts") {
      await ticks(5)
      // Still reading the record: nothing said, nothing sent.
      expect(settled).toBe(false)
      expect(home.sent).toHaveLength(0)
      end(found)
    }
    const outcome = await asking
    if (paired) {
      expect(home.sent.length).toBeGreaterThan(0)
      expect(outcome).not.toEqual({ kind: "unpaired" })
    } else {
      expect(home.sent).toHaveLength(0)
      // A take's words say unreachable, and a note's audio none, unpaired.
      expect([
        { kind: "unpaired" },
        { kind: "unreachable" },
        null,
      ]).toContainEqual(outcome)
    }
  })
})
