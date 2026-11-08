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

/**
 * The link this test made, and the one clock of the file, which the drain's
 * pace (made as `./lanes` loads) keeps too.
 */
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
}

/**
 * The paired link, on the test's clock, to a home that keeps LeetType's
 * events and reads them back, echoes a written reflection, and admits
 * requests as file_host's limiter does.
 */
async function limitedHome(): Promise<Home> {
  const clock = theClock()
  // Long enough since the last test for the pace to be whole again.
  clock.pass(600_000)
  const reached: Array<string> = []
  const events = new Map<string, Array<unknown>>()
  let tokens = 60
  let filled = clock.now()
  let turnedAway = 0
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
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  askLane(lane)
  await settle()
  while (run.getSnapshot().running) {
    if (!theClock().next()) await settle()
    await settle()
  }
  return run.getSnapshot().last
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
})
