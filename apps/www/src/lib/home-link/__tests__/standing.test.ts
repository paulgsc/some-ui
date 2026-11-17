/**
 * SIGNIN1 (#3087): whether home still knows a paired phone. The model's
 * `heard` over every ordering of read, pair, answers and unpair; the
 * runtime's one check and what every credentialed answer says; and the
 * watch's moments, never a timer.
 */
import { fakeClock } from "@/test-support/fake-clock"
import type { HomeAnswer } from "@some-ui/core-utils"
import { describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import { FIRST_HOLD_MS } from "@/lib/home-link/away"
import type { HomeLinkEvent, HomeLinkState } from "@/lib/home-link/model"
import { INITIAL, step } from "@/lib/home-link/model"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink, parsePairing } from "@/lib/home-link/runtime"
import { watchStanding } from "@/lib/home-link/standing"

const HOME = { base: "https://home.example/api/v1", host: "home.example" }
const KEPT = JSON.stringify({
  base: HOME.base,
  token: "t",
  id: "p1",
  pairedAt: 1_000,
})

const run = (events: ReadonlyArray<HomeLinkEvent>): HomeLinkState =>
  events.reduce(step, INITIAL)

const standingOf = (state: HomeLinkState): unknown =>
  state.link.kind === "paired" ? state.link.standing : null

const READ: HomeLinkEvent = {
  type: "read",
  found: { base: HOME.base, id: "p1", since: 1_000 },
}
const known = (id: string, at = 5): HomeLinkEvent => ({
  type: "heard",
  id,
  known: true,
  at,
})
const refused = (id: string, at = 5): HomeLinkEvent => ({
  type: "heard",
  id,
  known: false,
  at,
})

describe("the link's standing (model)", () => {
  it("starts unchecked on a read pairing, and known on a new one", () => {
    expect(standingOf(run([READ]))).toEqual({ kind: "unchecked" })
    const paired = run([
      { type: "read", found: null },
      { type: "pairPressed", base: HOME.base },
      { type: "paired", base: HOME.base, id: "p2", at: 7 },
    ])
    expect(paired.link).toMatchObject({ since: 7, standing: { kind: "known" } })
  })

  it("is forgotten on a refusal; only a success sent after it says known again", () => {
    const lost = run([READ, known("p1"), refused("p1", 9)])
    expect(standingOf(lost)).toEqual({ kind: "forgotten", at: 9 })
    // An older request's success, answering after the refusal.
    expect(step(lost, known("p1", 8))).toBe(lost)
    expect(step(lost, known("p1", 9))).toBe(lost)
    // A second refusal keeps the first moment.
    expect(step(lost, refused("p1", 11))).toBe(lost)
    // Home's sign-in back on: a request sent after the refusal is taken.
    expect(standingOf(step(lost, known("p1", 10)))).toEqual({ kind: "known" })
  })

  it("hears nothing while an Unpair runs, whose own sign-out ends the key", () => {
    const unpairing = run([READ, known("p1"), { type: "unpairPressed" }])
    expect(step(unpairing, refused("p1"))).toBe(unpairing)
  })

  it("drops an answer for any other pairing, or none", () => {
    const read = run([READ])
    expect(step(read, refused("old"))).toBe(read)
    expect(step(INITIAL, refused("p1"))).toBe(INITIAL)
    const unpaired = run([{ type: "read", found: null }])
    expect(step(unpaired, known("p1"))).toBe(unpaired)
  })

  it("changes nothing on a second success, so nothing listening hears it", () => {
    const once = run([READ, known("p1")])
    expect(step(once, known("p1", 99))).toBe(once)
  })

  it("starts over on a new pairing after an unpair, whatever the old one heard", () => {
    const again = run([
      READ,
      refused("p1"),
      { type: "unpairPressed" },
      { type: "unpaired", told: false },
      { type: "pairPressed", base: HOME.base },
      { type: "paired", base: HOME.base, id: "p2", at: 20 },
      // The old pairing's refusal, answering late.
      refused("p1", 21),
    ])
    expect(again.link).toMatchObject({
      id: "p2",
      since: 20,
      standing: { kind: "known" },
    })
  })
})

describe("the record's pairing day", () => {
  it("reads one kept with a day, and one kept before days as none", () => {
    expect(parsePairing(KEPT)).toMatchObject({ id: "p1", since: 1_000 })
    expect(
      parsePairing(JSON.stringify({ base: HOME.base, token: "t", id: "p1" }))
    ).toMatchObject({ since: null })
    expect(
      parsePairing(
        JSON.stringify({ base: HOME.base, token: "t", pairedAt: "soon" })
      )
    ).toMatchObject({ since: null })
  })
})

type Home = {
  link: HomeLink
  sent: Array<HomeRequest>
  pass: (ms: number, timersRun?: boolean) => void
}

function setup(
  options: {
    record?: string | null
    answer?: (call: HomeRequest) => HomeAnswer | Promise<HomeAnswer>
  } = {}
): Home {
  let record = options.record ?? null
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
    request: (call): Promise<HomeAnswer> => {
      sent.push(call)
      return Promise.resolve(
        options.answer?.(call) ?? { status: 200, body: "{}" }
      )
    },
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
  })
  return { link, sent, pass: clock.pass }
}

describe("the link's check (runtime)", () => {
  it("asks home once, with the key, at the paired base", async () => {
    const home = setup({ record: KEPT })
    await home.link.load()
    await home.link.check()
    expect(home.sent).toEqual([
      {
        method: "GET",
        url: "https://home.example/api/v1/auth/session",
        token: "t",
      },
    ])
    expect(standingOf(home.link.getSnapshot())).toEqual({ kind: "known" })
  })

  it("says forgotten on home's refusal, and asks no more after it", async () => {
    const home = setup({
      record: KEPT,
      answer: () => ({ status: 401, body: "" }),
    })
    await home.link.load()
    await home.link.check()
    expect(standingOf(home.link.getSnapshot())).toMatchObject({
      kind: "forgotten",
    })
    await home.link.check()
    expect(home.sent).toHaveLength(1)
  })

  it("says nothing of it on a fault or a silence", async () => {
    const faulty = setup({
      record: KEPT,
      answer: () => ({ status: 502, body: "" }),
    })
    await faulty.link.load()
    await faulty.link.check()
    expect(standingOf(faulty.link.getSnapshot())).toEqual({
      kind: "unchecked",
    })

    const silent = setup({
      record: KEPT,
      answer: () => Promise.reject(new Error("no route to host")),
    })
    await silent.link.load()
    await silent.link.check()
    expect(standingOf(silent.link.getSnapshot())).toEqual({
      kind: "unchecked",
    })
  })

  it("sends nothing unpaired", async () => {
    const home = setup()
    await home.link.load()
    await home.link.check()
    expect(home.sent).toEqual([])
  })

  it("hears a credentialed refusal as forgotten, and a later success as known", async () => {
    let status = 401
    const home = setup({
      record: KEPT,
      answer: () => ({ status, body: "{}" }),
    })
    await home.link.load()
    await home.link.send((send) => send("GET", "/voice-notes/kept"))
    expect(standingOf(home.link.getSnapshot())).toMatchObject({
      kind: "forgotten",
    })
    status = 200
    home.pass(1)
    await home.link.send((send) => send("GET", "/voice-notes/kept"))
    expect(standingOf(home.link.getSnapshot())).toEqual({ kind: "known" })
  })

  it("sends nothing while held away from home", async () => {
    let silent = true
    const home = setup({
      record: KEPT,
      answer: async () => {
        if (!silent) return { status: 200, body: "{}" }
        const { noAnswer } = await import("@/test-support/no-answer")
        throw noAnswer()
      },
    })
    await home.link.load()
    await home.link.check()
    expect(home.link.getSnapshot().away).not.toBeNull()
    silent = false
    const before = home.sent.length
    await home.link.check()
    expect(home.sent).toHaveLength(before)
  })
})

/** A link the watch can hear, whose state the test sets. */
function fakeLink(initial: HomeLinkState): {
  link: Parameters<typeof watchStanding>[0]["link"]
  set: (state: HomeLinkState) => void
  checks: () => number
} {
  let state = initial
  let count = 0
  const listeners = new Set<() => void>()
  return {
    link: {
      getSnapshot: () => state,
      subscribe: (listener): (() => void) => {
        listeners.add(listener)
        return (): void => {
          listeners.delete(listener)
        }
      },
      check: (): Promise<void> => {
        count += 1
        return Promise.resolve()
      },
    },
    set: (next): void => {
      state = next
      for (const listener of listeners) listener()
    },
    checks: (): number => count,
  }
}

function fakeDoc(visible = true): {
  doc: Parameters<typeof watchStanding>[0]["doc"]
  show: (shown: boolean) => void
} {
  let visibility: DocumentVisibilityState = visible ? "visible" : "hidden"
  class Front extends EventTarget {
    get visibilityState(): DocumentVisibilityState {
      return visibility
    }
  }
  const doc = new Front()
  return {
    doc,
    show(shown): void {
      visibility = shown ? "visible" : "hidden"
      doc.dispatchEvent(new Event("visibilitychange"))
    },
  }
}

describe("the standing watch", () => {
  it("checks once as a pairing is found, and again on coming to the front", async () => {
    const fake = fakeLink(INITIAL)
    const page = fakeDoc()
    const stop = watchStanding({ link: fake.link, doc: page.doc })
    expect(fake.checks()).toBe(0)
    fake.set(run([READ]))
    expect(fake.checks()).toBe(1)
    await Promise.resolve()
    // Any other change of the link, a silence or busy ending among them,
    // asks nothing.
    fake.set(run([READ, { type: "unanswered", now: 1 }]))
    fake.set(run([READ]))
    expect(fake.checks()).toBe(1)
    page.show(false)
    expect(fake.checks()).toBe(1)
    page.show(true)
    await Promise.resolve()
    expect(fake.checks()).toBe(2)
    stop()
    page.show(true)
    expect(fake.checks()).toBe(2)
  })

  it("never checks unpaired, hidden, or on a clock", () => {
    vi.useFakeTimers()
    try {
      const fake = fakeLink(run([{ type: "read", found: null }]))
      const page = fakeDoc()
      watchStanding({ link: fake.link, doc: page.doc })
      page.show(true)
      vi.advanceTimersByTime(24 * 60 * 60 * 1_000)
      expect(fake.checks()).toBe(0)

      const hidden = fakeLink(run([READ]))
      watchStanding({ link: hidden.link, doc: fakeDoc(false).doc })
      expect(hidden.checks()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("asks about a pairing found while another check was out, once it ends", async () => {
    let finish: () => void = () => undefined
    const fake = fakeLink(run([READ]))
    let count = 0
    fake.link.check = (): Promise<void> => {
      count += 1
      return new Promise((resolve) => {
        finish = resolve
      })
    }
    watchStanding({ link: fake.link, doc: fakeDoc().doc })
    expect(count).toBe(1)
    fake.set(
      run([{ type: "read", found: { base: HOME.base, id: "p2", since: null } }])
    )
    expect(count).toBe(1)
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(count).toBe(2)
  })

  it("asks nothing once stopped, even as a check that was out ends", async () => {
    let finish: () => void = () => undefined
    const fake = fakeLink(run([READ]))
    let count = 0
    fake.link.check = (): Promise<void> => {
      count += 1
      return new Promise((resolve) => {
        finish = resolve
      })
    }
    const stop = watchStanding({ link: fake.link, doc: fakeDoc().doc })
    fake.set(
      run([{ type: "read", found: { base: HOME.base, id: "p2", since: null } }])
    )
    stop()
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(count).toBe(1)
  })

  it("asks one at a time", () => {
    const fake = fakeLink(run([READ]))
    const page = fakeDoc()
    watchStanding({ link: fake.link, doc: page.doc })
    page.show(true)
    page.show(true)
    expect(fake.checks()).toBe(1)
  })
})

/**
 * RN1 (#3096), end to end: the real link and the real watch, so a paired
 * phone that comes to the front asks home's own `GET /auth/session` with
 * its key, the one request that renews its session. Before SIGNIN1 nothing
 * did, and every pairing ended 30 days after it was made.
 */
describe("RN1: a paired phone's session is renewed while the app is used", () => {
  const settle = (): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  const renewals = (home: Home): Array<HomeRequest> =>
    home.sent.filter(
      (call) =>
        call.method === "GET" &&
        call.url === "https://home.example/api/v1/auth/session" &&
        call.token === "t"
    )

  it("asks home on every coming to the front, known or not", async () => {
    const home = setup({ record: KEPT })
    const page = fakeDoc()
    watchStanding({ link: home.link, doc: page.doc })
    await home.link.load()
    await settle()
    expect(renewals(home)).toHaveLength(1)
    expect(standingOf(home.link.getSnapshot())).toEqual({ kind: "known" })
    for (const n of [2, 3, 4]) {
      page.show(false)
      page.show(true)
      await settle()
      expect(renewals(home)).toHaveLength(n)
    }
  })

  it("lets one ask already out stand for comings to the front while it is, and asks at the next after", async () => {
    let answer: (value: HomeAnswer) => void = () => undefined
    const home = setup({
      record: KEPT,
      answer: () =>
        new Promise<HomeAnswer>((resolve) => {
          answer = resolve
        }),
    })
    const page = fakeDoc()
    watchStanding({ link: home.link, doc: page.doc })
    await home.link.load()
    await settle()
    expect(renewals(home)).toHaveLength(1)
    page.show(false)
    page.show(true)
    page.show(false)
    page.show(true)
    await settle()
    // The one out is the renewal those comings asked for.
    expect(renewals(home)).toHaveLength(1)
    answer({ status: 200, body: "{}" })
    await settle()
    expect(renewals(home)).toHaveLength(1)
    page.show(false)
    page.show(true)
    await settle()
    expect(renewals(home)).toHaveLength(2)
  })

  it("waits out home's busy, then asks again on the next coming to the front", async () => {
    let busy = true
    const home = setup({
      record: KEPT,
      answer: () =>
        busy
          ? { status: 429, body: "", retryAfter: "30" }
          : { status: 200, body: "{}" },
    })
    const page = fakeDoc()
    watchStanding({ link: home.link, doc: page.doc })
    await home.link.load()
    await settle()
    expect(renewals(home)).toHaveLength(1)
    page.show(true)
    await settle()
    expect(renewals(home)).toHaveLength(1)
    busy = false
    // Home's own Retry-After, not the link's shortest wait, holds it.
    home.pass(29_999)
    page.show(true)
    await settle()
    expect(renewals(home)).toHaveLength(1)
    home.pass(1)
    page.show(true)
    await settle()
    expect(renewals(home)).toHaveLength(2)
    expect(standingOf(home.link.getSnapshot())).toEqual({ kind: "known" })
  })

  it("hears home's overload on the check as busy: the link waits out its Retry-After (AD3, #3127)", async () => {
    const home = setup({
      record: KEPT,
      answer: () => ({
        status: 503,
        body: JSON.stringify({ error: { code: "service_overloaded" } }),
        retryAfter: "5",
      }),
    })
    await home.link.load()
    await home.link.check()
    expect(home.link.getSnapshot().homeBusyUntil).toBe(5_000)
    await home.link.check()
    expect(home.sent).toHaveLength(1)
    home.pass(5_000)
    expect(home.link.getSnapshot().homeBusyUntil).toBeNull()
  })

  it("asks nothing while held away, then asks on the first coming to the front after the hold", async () => {
    let silent = true
    const home = setup({
      record: KEPT,
      answer: async () => {
        if (!silent) return { status: 200, body: "{}" }
        const { noAnswer } = await import("@/test-support/no-answer")
        throw noAnswer()
      },
    })
    const page = fakeDoc()
    watchStanding({ link: home.link, doc: page.doc })
    await home.link.load()
    await settle()
    expect(renewals(home)).toHaveLength(1)
    expect(home.link.getSnapshot().away).not.toBeNull()
    silent = false
    page.show(true)
    await settle()
    expect(renewals(home)).toHaveLength(1)
    home.pass(FIRST_HOLD_MS - 1)
    page.show(true)
    await settle()
    expect(renewals(home)).toHaveLength(1)
    // Its timer held back, as a WebView in the background holds it: the
    // hold ends on the link's own reading of the clock.
    home.pass(1, false)
    page.show(true)
    await settle()
    expect(renewals(home)).toHaveLength(2)
    expect(standingOf(home.link.getSnapshot())).toEqual({ kind: "known" })
    expect(home.link.getSnapshot().away).toBeNull()
  })
})
