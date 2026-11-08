/**
 * @vitest-environment jsdom
 *
 * AD3 and LA15 over the real senders, wired as the app shell wires them
 * (`./lanes`, its pace and the link), against file_host's limiter.
 */
import type { FakeClock } from "@/test-support/fake-clock"
import { fakeClock } from "@/test-support/fake-clock"
import type { HomeAnswer } from "@some-ui/core-utils"
import { isRecord } from "@some-ui/core-utils"
import type { HomeEvent, HomeSession } from "@some-ui/leetype"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { beforeAll, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { DrainPorts } from "@/lib/home-link/drain"
import { drainHome } from "@/lib/home-link/drain"
import type { KeptRun } from "@/lib/home-link/kept-model"
import type { Lane, LaneId } from "@/lib/home-link/lanes"
import { askLane, laneRun } from "@/lib/home-link/lanes"
import type { EventLog } from "@/lib/home-link/leetype-log"
import type { HomeLinkState } from "@/lib/home-link/model"
import { writtenToSend } from "@/lib/home-link/reflections"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"
import { digestOf, logToSend, readSent } from "@/lib/home-link/sent"

const BASE = "https://home.example/api/v1"
const PAIRING = "p"

/** The link this test made, and the one clock of the file (`LINK_CLOCK`). */
const held = vi.hoisted(
  (): { link: HomeLink | null; clock: FakeClock | null } => ({
    link: null,
    clock: null,
  })
)

function theClock(): FakeClock {
  held.clock ??= fakeClock()
  return held.clock
}

function theLink(): HomeLink {
  if (held.link === null) throw new Error("no link made yet")
  return held.link
}

vi.mock("@/lib/home-link/index", () => {
  const pairingOf = (state?: HomeLinkState): string | null => {
    const now = state ?? theLink().getSnapshot()
    return now.link.kind === "paired" ? now.link.id : null
  }
  return {
    homeLink: theLink,
    pairingOf,
    paired: (): boolean => pairingOf() !== null,
    useHomeLink: (): HomeLinkState => theLink().getSnapshot(),
    LINK_CLOCK: {
      now: (): number => theClock().now(),
      after: (ms: number, run: () => void): (() => void) =>
        theClock().after(ms, run),
    },
  }
})

beforeAll(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
})

/** A finished LeetType session of `count` events. */
function sessionOf(id: string, count: number): HomeSession {
  const events = Array.from(
    { length: count },
    (_, i): HomeEvent => ({
      id: `${id}-${String(i)}`,
      at: "2026-10-24T20:00:00.000Z",
      session: id,
      type: "started",
      file: "t1-01-one-node.json",
      form: "full",
      declaredMinutes: 10,
    })
  )
  return { session: id, events }
}

const LINE = {
  id: "r1",
  sessionId: "s1",
  createdAt: "2026-10-30T10:06:00.000Z",
  atMs: 61_000,
  body: { kind: "text" as const, text: "More level two, please." },
}

type Home = {
  /** Each request that reached home, as `METHOD path`. */
  readonly reached: Array<string>
  /** How many requests home's limiter turned away. */
  readonly turnedAway: () => number
  /** Has home answer the `n`th request from now busy, asking for `seconds`. */
  readonly busyAt: (n: number, seconds: number) => void
  /** The fewest requests home's bucket held. */
  readonly lowest: () => number
}

/**
 * The paired link, on the test's clock, to a home that keeps LeetType's
 * events and reads them back, echoes a written reflection, and admits
 * requests as file_host's limiter does.
 */
async function limitedHome(): Promise<Home> {
  const clock = theClock()
  const reached: Array<string> = []
  const events = new Map<string, Array<unknown>>()
  let tokens = 60
  let filled = clock.now()
  let turnedAway = 0
  let lowest = tokens
  let busyIn: { n: number; seconds: number } | null = null
  const answer = (call: HomeRequest): HomeAnswer => {
    tokens = Math.min(60, tokens + (clock.now() - filled) / 1000)
    filled = clock.now()
    if (busyIn !== null && --busyIn.n === 0) {
      const { seconds } = busyIn
      busyIn = null
      return { status: 429, body: "", retryAfter: String(seconds) }
    }
    if (tokens < 1) {
      turnedAway += 1
      return { status: 429, body: "", retryAfter: "1" }
    }
    tokens -= 1
    lowest = Math.min(lowest, tokens)
    const path = call.url.slice(BASE.length)
    reached.push(`${call.method} ${path}`)
    const [, , , session = ""] = path.split("/")
    const sent: unknown =
      typeof call.body === "string" ? JSON.parse(call.body) : call.body
    if (path.startsWith("/routine/reflections/")) {
      return {
        status: 200,
        body: JSON.stringify({ change: "added", reflection: sent }),
      }
    }
    if (call.method === "GET") {
      return {
        status: 200,
        body: JSON.stringify({ session, events: events.get(session) ?? [] }),
      }
    }
    if (isRecord(sent)) {
      events.set(session, [
        ...(events.get(session) ?? []).filter(
          (each) => !isRecord(each) || each.id !== sent.id
        ),
        sent,
      ])
    }
    return { status: 200, body: '{"change":"added"}' }
  }
  held.link = createHomeLink({
    credential: {
      read: () =>
        Promise.resolve({
          record: JSON.stringify({ base: BASE, token: "t", id: PAIRING }),
          lost: false,
        }),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    request: (call) => Promise.resolve(answer(call)),
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
  })
  await held.link.load()
  return {
    reached,
    turnedAway: () => turnedAway,
    busyAt: (n, seconds): void => {
      busyIn = { n, seconds }
    },
    lowest: () => lowest,
  }
}

/** A Studio sitting of `count` events. */
function sittingOf(name: string, count: number): EventLog {
  const events = Array.from({ length: count }, (_, i) => ({
    id: `${name}-${String(i)}`,
    at: "2026-10-30T10:00:00.000Z",
    sitting: name,
    kind: "record",
    type: "sitting_opened",
    screen: null,
  }))
  return { name, events }
}

/**
 * The practice lane's drain over a LeetType `session` or a Studio
 * `sitting`, and one written reflection after it, under `id`: `./lanes`
 * keeps one runtime per lane id per page load, so each test drains under
 * an id of its own.
 */
function practiceLane(
  id: LaneId,
  going: { session?: HomeSession; sitting?: EventLog }
): {
  lane: Lane
  storage: DrainPorts["storage"]
} {
  const storage = memoryStorage()
  const nothing = (): Promise<{ going: []; onPhone: () => boolean }> =>
    Promise.resolve({ going: [], onPhone: () => true })
  const ports: DrainPorts = {
    read: () => Promise.resolve({ local: [], kept: [] }),
    logGoing: () =>
      Promise.resolve(
        going.session === undefined
          ? []
          : logToSend([going.session], readSent(storage, PAIRING))
      ),
    studioGoing: () => {
      const { sitting } = going
      const held =
        sitting === undefined ||
        readSent(storage, PAIRING).studio[sitting.name] === digestOf(sitting)
      return Promise.resolve({
        sittings: held ? [] : [sitting],
        reports: [],
      })
    },
    reflectionsGoing: () => writtenToSend([LINE], readSent(storage, PAIRING)),
    letGoHeld: () => undefined,
    promptsGoing: () => [],
    letGoHeldPrompts: () => undefined,
    notesGoing: nothing,
    holdNotes: () => undefined,
    lensGoing: nothing,
    koreanGoing: nothing,
    pairing: PAIRING,
    storage,
  }
  const lane: Lane = {
    id,
    exchange: (send) => drainHome(send, ports),
    revision: () => 0,
    subscribe: () => (): void => undefined,
    useCounts: () => {
      throw new Error("not shown here")
    },
  }
  return { lane, storage }
}

/**
 * Asks `lane` for one run and moves the clock on, timer by timer, until
 * that run has ended; how it ended.
 */
async function drain(lane: Lane): Promise<KeptRun | null> {
  const run = laneRun(lane)
  askLane(lane)
  await until(() => !run.getSnapshot().running)
  return run.getSnapshot().last
}

/** Moves the clock on, timer by timer, until `done` holds. */
async function until(done: () => boolean): Promise<void> {
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await settle()
  while (!done()) {
    if (!theClock().next()) await settle()
    await settle()
  }
}

/** `asked`'s outcome, and how long after it was asked it ended. */
async function timed<T>(asked: Promise<T>): Promise<{ value: T; ms: number }> {
  const from = theClock().now()
  const ended: Array<{ value: T; ms: number }> = []
  void asked.then((value) => {
    ended.push({ value, ms: theClock().now() - from })
  })
  await until(() => ended.length > 0)
  const first = ended.at(0)
  if (first === undefined) throw new Error("never ended")
  return first
}

const puts = (home: Home, path: string): number =>
  home.reached.filter((each) => each === `PUT ${path}`).length

describe("the practice drain under home's limit (AD3, LA15)", () => {
  it("takes a LeetType session of 100 events home whole in one run, each event once, home never busy, and the reflection after it still goes", async () => {
    const home = await limitedHome()
    const session = sessionOf("s1", 100)
    const { lane, storage } = practiceLane("practice", { session })
    expect((await drain(lane))?.kind).toBe("synced")
    expect(home.turnedAway()).toBe(0)
    for (const event of session.events) {
      expect(puts(home, `/leetype/sessions/s1/events/${event.id}`)).toBe(1)
    }
    expect(
      home.reached.filter((each) => each === "GET /leetype/sessions/s1/events")
    ).toHaveLength(1)
    expect(puts(home, "/routine/reflections/r1")).toBe(1)
    const sent = readSent(storage, PAIRING)
    expect(sent.leetype.s1).toBe(digestOf(session))
    expect(Object.keys(sent.reflections)).toEqual(["r1"])
    expect(sent.events).toEqual({})
  })

  it("resumes a session home turned away part way at the first event it had not taken, once home's busy is over", async () => {
    const home = await limitedHome()
    const session = sessionOf("s1", 100)
    const { lane, storage } = practiceLane("jobs", { session })
    home.busyAt(31, 20)
    expect(await drain(lane)).toMatchObject({ kind: "failed", why: "busy" })
    expect(home.reached).toHaveLength(30)
    expect(Object.keys(readSent(storage, PAIRING).events)).toHaveLength(30)
    theClock().pass(20_000)
    expect((await drain(lane))?.kind).toBe("synced")
    for (const event of session.events) {
      expect(
        puts(home, `/leetype/sessions/s1/events/${event.id}`),
        event.id
      ).toBe(1)
    }
    expect(puts(home, "/routine/reflections/r1")).toBe(1)
    expect(readSent(storage, PAIRING).leetype.s1).toBe(digestOf(session))
  })

  it("resumes a Studio sitting home turned away part way at the first event it had not taken, once home's busy is over", async () => {
    const home = await limitedHome()
    const sitting = sittingOf("s1-20261030T100000000Z", 100)
    const { lane, storage } = practiceLane("voice", { sitting })
    home.busyAt(31, 20)
    expect(await drain(lane)).toMatchObject({ kind: "failed", why: "busy" })
    expect(home.reached).toHaveLength(30)
    theClock().pass(20_000)
    expect((await drain(lane))?.kind).toBe("synced")
    for (const event of sitting.events) {
      expect(
        puts(home, `/studio/sittings/${sitting.name}/events/${event.id}`),
        event.id
      ).toBe(1)
    }
    expect(puts(home, "/routine/reflections/r1")).toBe(1)
    const sent = readSent(storage, PAIRING)
    expect(sent.studio[sitting.name]).toBe(digestOf(sitting))
    expect(sent.events).toEqual({})
  })

  it("answers a screen's read and Sync within one turn of the pace while a 100-event drain runs, and home's bucket never goes below 11 (AD3)", async () => {
    const home = await limitedHome()
    const session = sessionOf("s2", 100)
    const { lane } = practiceLane("rust-rounds", { session })
    const run = laneRun(lane)
    askLane(lane)
    const reads: Array<number> = []
    for (let n = 0; n < 6; n += 1) {
      await until(() => home.reached.length >= 50 + n * 8)
      expect(run.getSnapshot().running).toBe(true)
      const read = await timed(
        theLink().keep((send) => send("GET", "/voice-notes/kept"))
      )
      expect(read.value?.kind).toBe("done")
      reads.push(read.ms)
    }
    const synced = await timed(
      theLink().sync((get) => get(`${BASE}/curriculum/manifest.json`))
    )
    expect(synced.value?.kind).toBe("done")
    expect(Math.max(...reads, synced.ms)).toBeLessThanOrEqual(2_000)
    await until(() => !run.getSnapshot().running)
    expect(run.getSnapshot().last?.kind).toBe("synced")
    expect(home.lowest()).toBeGreaterThanOrEqual(11)
  })

  it("stops the drain's run for a tap's send, which goes first, and the run resumes where it stopped", async () => {
    const home = await limitedHome()
    const session = sessionOf("s3", 100)
    const { lane } = practiceLane("app-events", { session })
    const run = laneRun(lane)
    askLane(lane)
    await until(() => home.reached.length >= 60)
    const tap = await timed(
      theLink().send((send) => send("DELETE", "/voice-notes/n1"))
    )
    expect(tap.value?.kind).toBe("done")
    expect(tap.ms).toBeLessThanOrEqual(2_000)
    // The tap's DELETE is the last request home has seen.
    expect(home.reached.at(-1)).toBe("DELETE /voice-notes/n1")
    await until(() => !run.getSnapshot().running)
    expect(run.getSnapshot().last?.kind).toBe("busy")
    expect((await drain(lane))?.kind).toBe("synced")
    for (const event of session.events) {
      expect(puts(home, `/leetype/sessions/s3/events/${event.id}`)).toBe(1)
    }
  })

  it("stops the drain's run for Unpair, and nothing reaches home after its sign-out", async () => {
    const home = await limitedHome()
    const session = sessionOf("s4", 100)
    const { lane } = practiceLane("aph", { session })
    const run = laneRun(lane)
    askLane(lane)
    await until(() => home.reached.length >= 60)
    const unpaired = await timed(theLink().unpair())
    expect(unpaired.ms).toBeLessThanOrEqual(2_000)
    expect(theLink().getSnapshot().link).toEqual({
      kind: "unpaired",
      note: "unpaired",
    })
    await until(() => !run.getSnapshot().running)
    theClock().pass(60_000)
    await until(() => true)
    expect(home.reached.at(-1)).toBe("POST /auth/sign-out")
  })
})
