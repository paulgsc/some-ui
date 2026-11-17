/**
 * @vitest-environment jsdom
 *
 * PO1 (#3128): a read of home made as a page opens never says this phone
 * isn't paired while its pairing record is still being read.
 *
 * **PO1: a one-shot ask waits for the pairing record before it says unpaired.**
 *
 * - _Claim:_ every one-shot ask of home in `lib/home-link` (each read or
 *   delete a screen awaits, which answers "unpaired" when the phone holds no
 *   pairing) decides it through `pairedOnceRead`, after the phone's pairing
 *   record has been read, so a paired phone's screen never says "Pair this
 *   phone" because it asked before the record was read.
 * - _Family:_ each ask (Studio's renders and every read through
 *   `while-busy`'s `asked`, home's compat, takes, what home keeps, its
 *   receipts, ideas, a note's delete, an episode step's let-go, a take's
 *   words, a note's audio) × when the record's read ends (after the ask
 *   starts, as a fresh page load has it, or before) × what it finds (a
 *   pairing, none, one lost, a record that won't parse, a read that itself
 *   fails).
 * - _Proof:_ these tests, one per member of the family (`FAMILY`), each in
 *   a fresh page. Where the read ends after the ask starts, the ask must
 *   neither answer nor send while it is held. A pairing then sends the
 *   ask's request; every other outcome answers unpaired with nothing sent.
 *   With the old gate back in every ask, each ask's five held-read cases
 *   fail. The last test fails on a file in `lib/home-link` that answers
 *   unpaired on the bare `paired()`, so a new ask can't copy the old gate.
 * - _Tolerance:_ the ask waits as long as the record's read, at most
 *   `./credential`'s 5 s. The link's watchers (`./kept-watch`,
 *   `./practice-reads`, `./lanes`) read `paired()` as it stands and run
 *   again when the link changes, so they are outside this family. The scan
 *   catches the old gate as it was written (`if (!paired())` beside an
 *   unpaired answer, in this folder); a new ask gated another way is held
 *   only once it joins `ASKS`.
 *
 * Relates: none (New). The asks were each written to read `paired()` as
 * it stood, which a screen opened from the app's launcher only ever read
 * after the record (the foyer reads it first), and no test opened one on a
 * fresh page load.
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

  it("no ask in lib/home-link says unpaired on the bare paired()", () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const files = readdirSync(dir).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
    )
    // The scan reads the right folder.
    expect(files).toContain("index.ts")
    const offenders = files.filter((name) => {
      const text = readFileSync(join(dir, name), "utf8")
      return /kind: "unpaired"/.test(text) && /(?<![.\w])!paired\(\)/.test(text)
    })
    expect(offenders).toEqual([])
  })
})
