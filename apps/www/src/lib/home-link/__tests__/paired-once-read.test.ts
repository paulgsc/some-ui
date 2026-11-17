/**
 * @vitest-environment jsdom
 *
 * PO1 (#3128, widened by #3152 and #3157): no reader of whether this phone
 * is paired takes a pairing record still being read for no pairing.
 *
 * **PO1: no reader says unpaired while the pairing record is read.**
 *
 * - _Claim:_ each reader named in the Family reads whether this phone is
 *   paired as `../model`'s `Pairing` (`pairing()`, `usePairing()`,
 *   `pairingIn`), whose `reading` member stands for not known yet, and says
 *   nothing it would say of no pairing while it is `reading`. Each one-shot
 *   ask of home in `lib/home-link` decides "unpaired" only after the record
 *   has been read (`pairedOnceRead`).
 * - _Family:_ each reader × when the record's read ends (after the reader
 *   looks, as a fresh page load has it, or before) × what it finds (a
 *   pairing, none, one lost, a record that won't parse, a read that itself
 *   fails). The readers: the ten one-shot asks (Studio's renders and every
 *   read through `while-busy`'s `asked`, home's compat, takes, what home
 *   keeps, its receipts, ideas, a note's delete, an episode step's let-go,
 *   a take's words, a note's audio); what this phone knows home holds
 *   (`sentUnder`, the waiting counts over it, and Studio › Feedback's place
 *   of each note); the lanes' readings and runs (`laneReading`,
 *   `laneExchange`, a run turned away); the Jobs cards' journeys and the
 *   morning row, on Jobs and on the status board; Settings › Home's layout;
 *   the lane mark's sheet; the game outbox; idea hearing's reach and
 *   listener; the voice record's pairing port; ask-answer; the link's
 *   watchers (`kept-watch`, `practice-reads`, `serves`, `standing`, `live`,
 *   the voice copy's gates). Outside it, until #3157's second part:
 *   soundbites' `isPaired`, which folds not known into unpaired, and
 *   `voiceKept`, which says a take going home is on this phone while
 *   reading. Outside it too, as they say nothing of no pairing (a control
 *   that is absent until paired): `routine.ts`'s pairing port,
 *   `device-routine-files` and Studio's clip frames.
 * - _Proof:_ the type where it reaches. `pairing()` and `usePairing()` are
 *   the only reads of the pairing `lib/home-link` exports for a screen, and
 *   a switch over the union fails to compile without `reading`; a reader
 *   that folds it to `kind === "paired"` is not held by the type, so each
 *   reader holds its `reading` case in its own test. `./pairing.test.ts`
 *   holds the union's transitions over every link state × every event, and
 *   maps each way the read ends. These tests hold each ask over its whole
 *   family (`FAMILY`); with the old gate back, each ask's held-read cases
 *   fail. The readers' own: the waiting counts, Studio › Feedback
 *   (`lib/episode-feedback`), the journey and morning (`lib/jobs`), the Jobs
 *   screen, the status board, Settings › Home and the lane mark's sheet
 *   (each with the read held, then ending both ways), a run turned away and
 *   `laneExchange` (`./kept.test.ts`), ask-answer, idea hearing, the voice
 *   record, and the game outbox's words.
 * - _Tolerance:_ an ask waits as long as the record's read, at most
 *   `./credential`'s 5 s. Until #3152's second part, a run the link turns
 *   away while reading is said as busy and asked again.
 *
 * Relates: widens PO1 (#3157). Its first Family held only the ten asks;
 * the readers past it took the answer as a boolean or an id-or-null, which
 * had no member for not known yet, so `false` and `null` stood for it.
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
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

/** A read of the pairing as it is now, without waiting for the record. */
const BARE = /(?<![.\w])pairing\(\)\.kind/

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

  it("no ask in lib/home-link says unpaired on the bare pairing()", () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const files = readdirSync(dir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
    )
    // The scan reads the right folder.
    expect(files).toContain("index.ts")
    const offenders = files.filter((name) => {
      const text = readFileSync(join(dir, name), "utf8")
      return /kind: "unpaired"/.test(text) && BARE.test(text)
    })
    expect(offenders).toEqual([])
    // The scan matches the gate as it would be written now.
    expect(BARE.test('if (pairing().kind !== "paired")')).toBe(true)
    expect(BARE.test('if (homeLink.pairing().kind !== "paired")')).toBe(false)
  })
})
