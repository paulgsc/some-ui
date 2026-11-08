/**
 * @vitest-environment jsdom
 *
 * AD3 and LA15 together, over the real senders: the practice lane's drain
 * (`drainHome`, LeetType's `sendLog`, the written reflections), wired as
 * the app shell wires it (`./lanes`, its pace and the link), against a home
 * whose limiter is file_host's (a burst of 60, one back each second, `429`
 * past it). A LeetType session of any length goes home whole, each event
 * once, home never says busy, and what comes after it in the drain still
 * goes; and a run home turns away part way resumes, once home's busy is
 * over, at the first event home had not taken.
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

/**
 * The practice lane's drain over `session` and one written reflection after
 * it, under `id`: `./lanes` keeps one runtime per lane id per page load, so
 * each test drains under an id of its own.
 */
function practiceLane(
  session: HomeSession,
  id: LaneId
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
      Promise.resolve(logToSend([session], readSent(storage, PAIRING))),
    studioGoing: () => Promise.resolve({ sittings: [], reports: [] }),
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
 * Asks `lane` for a run and moves the clock on, timer by timer, until that
 * run has ended; asks again, after `rest` ms, while it ends short of in
 * step, up to `runs` runs. How the last run ended, and how many ran.
 */
async function drain(
  lane: Lane,
  rest: number,
  runs = 40
): Promise<{ last: KeptRun | null; ran: number }> {
  const run = laneRun(lane)
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  let ran = 0
  while (ran < runs) {
    askLane(lane)
    ran += 1
    await settle()
    while (run.getSnapshot().running) {
      if (!theClock().next()) await settle()
      await settle()
    }
    if (run.getSnapshot().last?.kind === "synced") break
    theClock().pass(rest)
  }
  return { last: run.getSnapshot().last, ran }
}

const puts = (home: Home, path: string): number =>
  home.reached.filter((each) => each === `PUT ${path}`).length

describe("the practice drain under home's limit (AD3, LA15)", () => {
  it.each([20, 100])(
    "takes a LeetType session of %i events home whole, each event once, home never busy, and the reflection after it still goes",
    async (count) => {
      const home = await limitedHome()
      const session = sessionOf(`s${String(count)}`, count)
      const { lane, storage } = practiceLane(
        session,
        count === 20 ? "practice" : "jobs"
      )
      const { last } = await drain(lane, 16_000)
      expect(last?.kind).toBe("synced")
      expect(home.turnedAway()).toBe(0)
      for (const event of session.events) {
        expect(
          puts(home, `/leetype/sessions/${session.session}/events/${event.id}`)
        ).toBe(1)
      }
      expect(
        home.reached.filter(
          (each) => each === `GET /leetype/sessions/${session.session}/events`
        )
      ).toHaveLength(1)
      expect(puts(home, "/routine/reflections/r1")).toBe(1)
      const sent = readSent(storage, PAIRING)
      expect(sent.leetype[session.session]).toBe(digestOf(session))
      expect(Object.keys(sent.reflections)).toEqual(["r1"])
      expect(sent.events).toEqual({})
    }
  )

  it("resumes a session home turned away part way at the first event it had not taken, once home's busy is over", async () => {
    const home = await limitedHome()
    const session = sessionOf("s1", 100)
    const { lane, storage } = practiceLane(session, "voice")
    home.busyAt(31, 20)
    const first = await drain(lane, 0, 1)
    expect(first.last).toMatchObject({ kind: "failed", why: "busy" })
    expect(home.reached).toHaveLength(30)
    expect(Object.keys(readSent(storage, PAIRING).events)).toHaveLength(30)
    // Asked again while home's 20 s last: nothing reaches it.
    theClock().pass(10_000)
    expect((await drain(lane, 0, 1)).last).toMatchObject({ why: "busy" })
    expect(home.reached).toHaveLength(30)
    theClock().pass(10_000)
    const { last } = await drain(lane, 16_000)
    expect(last?.kind).toBe("synced")
    for (const event of session.events) {
      expect(
        puts(home, `/leetype/sessions/s1/events/${event.id}`),
        event.id
      ).toBe(1)
    }
    expect(puts(home, "/routine/reflections/r1")).toBe(1)
    expect(readSent(storage, PAIRING).leetype.s1).toBe(digestOf(session))
  })
})
