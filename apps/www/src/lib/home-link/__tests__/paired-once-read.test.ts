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
 *   pairing, none, one lost, one it can't read).
 * - _Proof:_ these tests. Each ask is started in a fresh page while the
 *   record's read is held, and must neither answer nor send until it ends;
 *   a pairing then sends its request, and no pairing answers unpaired with
 *   nothing sent. The last test fails on a file in `lib/home-link` that
 *   answers unpaired on the bare `paired()`, so a new ask can't copy the old
 *   gate.
 * - _Tolerance:_ the ask waits as long as the record's read, at most
 *   `./credential`'s 5 s. The link's watchers (`./kept-watch`,
 *   `./practice-reads`, `./lanes`) read `paired()` as it stands and run
 *   again when the link changes, so they are outside this family.
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

/** A record's read held until `end` is called with what it finds. */
function heldRead(): (found: Read) => void {
  let end: (found: Read) => void = () => undefined
  const held = new Promise<Read>((resolve) => {
    end = resolve
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

describe("a one-shot ask as a page opens (PO1)", () => {
  it.each(ASKS)(
    "$name waits for a pairing's record, then asks home",
    async ({ ask }) => {
      const end = heldRead()
      let settled = false
      const asking = ask().then((outcome) => {
        settled = true
        return outcome
      })
      await ticks(5)
      // Still reading the record: nothing said, nothing sent.
      expect(settled).toBe(false)
      expect(home.sent).toHaveLength(0)
      end(PAIRING)
      const outcome = await asking
      expect(home.sent.length).toBeGreaterThan(0)
      expect(outcome).not.toEqual({ kind: "unpaired" })
    }
  )

  for (const found of [
    { record: null, lost: false },
    { record: null, lost: true },
    { record: "not a record", lost: false },
  ] satisfies ReadonlyArray<Read>) {
    it(`says unpaired, sending nothing, once the read finds ${JSON.stringify(found)}`, async () => {
      for (const { ask } of ASKS) {
        vi.resetModules()
        const end = heldRead()
        const asking = ask()
        end(found)
        const outcome = await asking
        expect(home.sent).toHaveLength(0)
        // A take's words say unreachable, and a note's audio none, unpaired.
        expect([
          { kind: "unpaired" },
          { kind: "unreachable" },
          null,
        ]).toContainEqual(outcome)
      }
    })
  }

  it("asks at once once the record was read before", async () => {
    home.read = (): Promise<Read> => Promise.resolve(PAIRING)
    const { homeLink } = await import("@/lib/home-link")
    await homeLink().load()
    const { askDeleted } = await import("@/lib/home-link/deleted-read")
    await askDeleted()
    expect(home.sent).toHaveLength(1)
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
