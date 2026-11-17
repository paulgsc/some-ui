/**
 * SIGNIN3 (#3089): signing out of home, and pairing again over a pairing
 * home has forgotten. The model's pairing from forgotten over every
 * ordering with a drain run, a send, a screen's read, a sync, an Unpair
 * and home's answers about the old key; the runtime's re-pair with a
 * drain run in flight, which sends nothing beside it under the old key;
 * and that neither deletes anything this phone keeps.
 */
import { fakeClock } from "@/test-support/fake-clock"
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { HomeLinkEvent, HomeLinkState } from "@/lib/home-link/model"
import { drainFree, INITIAL, mayPair, step } from "@/lib/home-link/model"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"

const HOME = { base: "https://home.example/api/v1", host: "home.example" }

const run = (
  events: ReadonlyArray<HomeLinkEvent>,
  from: HomeLinkState = INITIAL
): HomeLinkState => events.reduce(step, from)

const READ: HomeLinkEvent = {
  type: "read",
  found: { base: HOME.base, id: "p1", since: 1_000 },
}
const heard = (known: boolean, at: number): HomeLinkEvent => ({
  type: "heard",
  id: "p1",
  known,
  at,
})
const PAIR: HomeLinkEvent = { type: "pairPressed", base: HOME.base }
const PAIRED: HomeLinkEvent = {
  type: "paired",
  base: HOME.base,
  id: "p2",
  at: 50,
}
const FAILED: HomeLinkEvent = { type: "pairFailed", failure: "bad-code" }
const ENDS: ReadonlyArray<HomeLinkEvent> = [PAIRED, FAILED]

/** A phone paired as p1, which home has refused. */
const FORGOTTEN = run([READ, heard(false, 9)])

/** What may happen around a re-pair, each a person's tap, a lane or home. */
const AROUND: ReadonlyArray<HomeLinkEvent> = [
  { type: "drainStarted" },
  { type: "drainStopped" },
  { type: "drainEnded" },
  { type: "sendPressed" },
  { type: "keepStarted" },
  { type: "syncPressed" },
  { type: "workEnded" },
  { type: "unpairPressed" },
  heard(true, 30),
  heard(false, 31),
]

describe("pairing again (model)", () => {
  it("starts only unpaired or over a pairing home forgot, never over one it knows", () => {
    expect(mayPair(FORGOTTEN.link)).toBe(true)
    expect(mayPair(run([READ]).link)).toBe(false)
    expect(mayPair(run([READ, heard(true, 9)]).link)).toBe(false)
    expect(mayPair(run([{ type: "read", found: null }]).link)).toBe(true)
    expect(mayPair(INITIAL.link)).toBe(false)
    const known = run([READ, heard(true, 9)])
    expect(step(known, PAIR)).toBe(known)
    expect(step(FORGOTTEN, PAIR).activity).toEqual({
      kind: "pairing",
      base: HOME.base,
    })
  })

  it("replaces the forgotten pairing on success, and leaves it as it was on a failure", () => {
    const again = run([PAIR, PAIRED], FORGOTTEN)
    expect(again.link).toEqual({
      kind: "paired",
      base: HOME.base,
      id: "p2",
      notForgotten: false,
      since: 50,
      standing: { kind: "known" },
    })
    const failed = run([PAIR, FAILED], FORGOTTEN)
    expect(failed.link).toBe(FORGOTTEN.link)
    expect(failed.activity).toEqual({ kind: "idle" })
    expect(failed.pairFailure).toEqual({
      failure: "bad-code",
      base: HOME.base,
    })
  })

  it("over every ordering, starts no run under the old key while it pairs, and ends known or forgotten as it was", () => {
    for (const before of [null, ...AROUND]) {
      const start = before === null ? FORGOTTEN : step(FORGOTTEN, before)
      const pressed = step(start, PAIR)
      if (pressed === start) {
        // Only something else under way keeps Pair from starting.
        expect(start.activity.kind === "idle" && mayPair(start.link)).toBe(
          false
        )
        continue
      }
      for (const during of AROUND) {
        const mid = step(pressed, during)
        // Nothing else of the person's starts and no drain run starts while
        // it pairs; only home's word on the old key may change the old
        // pairing, as it would at any time.
        expect(mid.activity).toEqual(pressed.activity)
        if (during.type !== "heard") expect(mid.link).toBe(pressed.link)
        if (pressed.drain.kind === "idle") {
          expect(mid.drain.kind).toBe("idle")
        }
        expect(drainFree(mid)).toBe(false)
        for (const end of ENDS) {
          const after = step(mid, end)
          expect(after.activity).toEqual({ kind: "idle" })
          if (end === PAIRED) {
            expect(after.link).toMatchObject({
              id: "p2",
              standing: { kind: "known" },
            })
          } else {
            // A failure leaves the old pairing as home last said it was.
            expect(after.link).toBe(mid.link)
          }
        }
      }
    }
  })

  it("keeps home's word that it knows the old key again, heard while pairing failed", () => {
    const failed = run([PAIR, heard(true, 30), FAILED], FORGOTTEN)
    expect(failed.link).toMatchObject({ id: "p1", standing: { kind: "known" } })
  })

  it("carries home's busy over to a pairing with the same home, never another", () => {
    const busy = step(FORGOTTEN, {
      type: "homeBusy",
      until: 99,
      base: HOME.base,
    })
    expect(run([PAIR, PAIRED], busy).homeBusyUntil).toBe(99)
    const elsewhere = run(
      [
        { type: "pairPressed", base: "https://other.example/api/v1" },
        {
          type: "paired",
          base: "https://other.example/api/v1",
          id: "p2",
          at: 50,
        },
      ],
      busy
    )
    expect(elsewhere.homeBusyUntil).toBeNull()
  })

  it("lets the drain start again once the new pairing is made", () => {
    const again = run([PAIR, PAIRED], FORGOTTEN)
    expect(drainFree(again)).toBe(true)
    expect(step(again, { type: "drainStarted" }).drain.kind).toBe("draining")
  })
})

type Home = {
  link: HomeLink
  sent: Array<HomeRequest>
  record: () => string | null
}

/** A link over a phone holding p1's record, whose key home now refuses. */
function forgottenHome(
  answer: (call: HomeRequest) => Promise<HomeAnswer>
): Home {
  let record: string | null = JSON.stringify({
    base: HOME.base,
    token: "old",
    id: "p1",
    pairedAt: 1_000,
  })
  const sent: Array<HomeRequest> = []
  const clock = fakeClock()
  const link = createHomeLink({
    credential: {
      read: () => Promise.resolve({ record, lost: false }),
      write: (next) => {
        record = next
        return Promise.resolve()
      },
      clear: () => {
        record = null
        return Promise.resolve()
      },
    },
    request: (call) => {
      sent.push(call)
      return answer(call)
    },
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
  })
  return { link, sent, record: () => record }
}

const REFUSED: HomeAnswer = { status: 401, body: "{}" }

describe("pairing again (runtime)", () => {
  it("waits for a drain run under the old key to end, sends nothing more under it, then pairs", async () => {
    let release: (answer: HomeAnswer) => void = () => undefined
    let released = false
    let pairedAfterRelease: boolean | null = null
    const home = forgottenHome((call) => {
      if (call.url.endsWith("/auth/pairing/finish")) {
        pairedAfterRelease = released
        return Promise.resolve({
          status: 200,
          body: JSON.stringify({ token: "new", expiresAt: 1 }),
        })
      }
      if (call.url.endsWith("/auth/session")) return Promise.resolve(REFUSED)
      return new Promise((resolve) => {
        release = resolve
      })
    })
    await home.link.load()
    await home.link.check()
    expect(home.link.getSnapshot().link).toMatchObject({
      standing: { kind: "forgotten" },
    })

    // A lane's run, its first request out under the old key.
    const lane = home.link.drain(async (send) => {
      await send("PUT", "/sessions/a", "{}")
      await send("PUT", "/sessions/b", "{}")
    })
    while (!home.sent.some((call) => call.url.endsWith("/sessions/a"))) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const before = home.sent.length

    const pairing = home.link.pair(HOME, "K7QF2M9X")
    // However long the drain's request takes, the pairing waits for it.
    for (let tick = 0; tick < 5; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    expect(home.sent).toHaveLength(before)
    released = true
    release({ status: 200, body: "{}" })
    await lane
    await pairing

    const after = home.sent.slice(before)
    expect(after.map((call) => call.url)).toEqual([
      `${HOME.base}/auth/pairing/finish`,
    ])
    expect(after.every((call) => call.token !== "old")).toBe(true)
    expect(pairedAfterRelease).toBe(true)
    expect(home.link.getSnapshot().link).toMatchObject({
      kind: "paired",
      standing: { kind: "known" },
    })
    expect(JSON.parse(home.record() ?? "{}")).toMatchObject({ token: "new" })
  })

  it("keeps the old record when pairing again fails, and pairs over a known pairing never", async () => {
    const home = forgottenHome((call) =>
      Promise.resolve(
        call.url.endsWith("/auth/pairing/finish")
          ? { status: 400, body: "{}" }
          : REFUSED
      )
    )
    await home.link.load()
    await home.link.check()
    const kept = home.record()
    await home.link.pair(HOME, "K7QF2M9X")
    expect(home.record()).toBe(kept)
    expect(home.link.getSnapshot().link).toMatchObject({
      id: "p1",
      standing: { kind: "forgotten" },
    })

    const knownHome = forgottenHome(() =>
      Promise.resolve({ status: 200, body: "{}" })
    )
    await knownHome.link.load()
    await knownHome.link.check()
    const sent = knownHome.sent.length
    await knownHome.link.pair(HOME, "K7QF2M9X")
    expect(knownHome.sent).toHaveLength(sent)
  })
})
