/**
 * The send's line: what changed, in a few words, then why it stopped if it
 * did. Says nothing about what was already there.
 */
import { noAnswer } from "@/test-support/no-answer"
import type { HomeCall } from "@some-ui/core-utils"
import { inMemoryStorage } from "@some-ui/core-utils"
import { describe, expect, it } from "vitest"

import { SyncStoppedError } from "@/lib/device-backend/home-sync"
import { emptyLogReport } from "@/lib/home-link/leetype-log"
import type { SendOutcome, SendPorts } from "@/lib/home-link/send"
import { describeSend, onPhone, sendHome } from "@/lib/home-link/send"
import { digestOf, readSent } from "@/lib/home-link/sent"
import { HomeForgotPhoneError } from "@/lib/home-link/sessions"
import { emptyReport } from "@/lib/home-link/shelf"
import { emptyHeldReport } from "@/lib/tenant/sessions-copy"

import { home, session } from "./fake-home"

/** One sitting of Studio's time log, opened and left on a scene. */
const SITTING = {
  name: "s1-20261030T100000000Z",
  events: [
    {
      id: "e1",
      at: "2026-10-30T10:00:00.000Z",
      sitting: "s1-20261030T100000000Z",
      kind: "record" as const,
      type: "sitting_opened" as const,
      screen: null,
    },
  ],
}
const REPORT = {
  id: "s1-20261030T100000000Z",
  at: "2026-10-30T10:05:00.000Z",
  sitting: "s1-20261030T100000000Z",
  kind: "record" as const,
  how: "some_snags" as const,
  cause: "The microphone",
  shot: "path",
}

function outcome(over: Partial<SendOutcome> = {}): SendOutcome {
  return {
    copy: { outcome: { kind: "copied", copied: 0 }, alreadyThere: 0 },
    held: emptyHeldReport(),
    freed: 0,
    shelf: emptyReport(),
    log: emptyLogReport(),
    ended: null,
    ...over,
  }
}

describe("describeSend", () => {
  it("says what changed, and what left the phone", () => {
    const shelf = { ...emptyReport(), sent: 3, kept: 1, replaced: 1 }
    expect(
      describeSend(
        outcome({
          copy: { outcome: { kind: "copied", copied: 5 }, alreadyThere: 7 },
          shelf,
          freed: 6,
        }),
        "home.example"
      )
    ).toBe("Copied 5 sessions. Sent 2 kept items. Cleared 6 from this phone.")
  })

  it("is one line when nothing changed", () => {
    expect(describeSend(outcome(), "home.example")).toBe(
      "home.example is up to date."
    )
  })

  it("says what did not fit or was refused", () => {
    const shelf = {
      ...emptyReport(),
      sent: 1,
      kept: 1,
      refused: 1,
      full: new Map([["topik", 2]]),
    }
    expect(describeSend(outcome({ shelf }), "home.example")).toBe(
      "Sent 1 kept item. 2 didn't fit: home's shelf is full. 1 refused by home.example."
    )
  })

  it("says which LeetType sessions home now holds, and which it didn't take", () => {
    const log = {
      ...emptyLogReport(),
      held: 2,
      refused: 1,
      other: 1,
      differs: 1,
    }
    expect(describeSend(outcome({ log }), "home.example")).toBe(
      "Copied 2 LeetType sessions. 2 LeetType sessions refused by home.example. 1 LeetType session kept here: home's copy didn't match."
    )
  })

  it("says why it ended early", () => {
    const stopped = outcome({
      copy: {
        outcome: {
          kind: "partial",
          copied: 1,
          remaining: 2,
          error: new SyncStoppedError(),
        },
        alreadyThere: 0,
      },
    })
    expect(describeSend(stopped, "home.example")).toBe(
      "Copied 1 session. Stopped: send again to carry on."
    )
    const forgotten = outcome({
      shelf: { ...emptyReport(), forgotten: true },
    })
    expect(describeSend(forgotten, "home.example")).toBe(
      "home.example no longer knows this phone: unpair, then pair again."
    )
  })

  it("says home could not be reached when nothing went", () => {
    expect(
      describeSend(
        outcome({ copy: null, ended: new TypeError("Failed to fetch") }),
        "home.example"
      )
    ).toBe(
      "Couldn't reach home.example. Are you on the home network? Nothing was sent."
    )
    expect(
      describeSend(
        outcome({ ended: new HomeForgotPhoneError() }),
        "home.example"
      )
    ).toBe("home.example no longer knows this phone: unpair, then pair again.")
  })

  it("says home was busy when it turned the send away", () => {
    const busy = new Error("home answered 429")
    expect(
      describeSend(
        outcome({ copy: null, ended: busy, busy: true }),
        "home.example"
      )
    ).toBe("Home is busy right now. Nothing was sent; try again in a minute.")
    const shelf = { ...emptyReport(), sent: 1, kept: 1, unreachable: true }
    expect(describeSend(outcome({ shelf, busy: true }), "home.example")).toBe(
      "Sent 1 kept item. Home is busy right now: send again in a minute to carry on."
    )
    expect(
      describeSend(
        outcome({ copy: null, ended: new SyncStoppedError(), busy: true }),
        "home.example"
      )
    ).toBe("Stopped: send again to carry on.")
  })
})

/** One paired run with only the case's phone data and home answers. */
function ports(send: HomeCall, over: Partial<SendPorts> = {}): SendPorts {
  return {
    storage: inMemoryStorage(),
    read: () => Promise.resolve({ local: [], kept: [] }),
    logGoing: () => Promise.resolve([session("a")]),
    studioGoing: () => Promise.resolve({ sittings: [], reports: [] }),
    run: async (r) => ({ kind: "done", value: await r(send) }),
    copy: () =>
      Promise.resolve({
        copy: { outcome: { kind: "copied", copied: 0 }, alreadyThere: 0 },
        ended: null,
      }),
    ...over,
  }
}

const TARGET = { base: "http://home.example", id: "p1" }
const NOW = new Date("2026-10-29T12:00:00.000Z")
const KEPT = { activity: "topik", key: "a", body: '{ "a": 1 }' }
const withKept: SendPorts["read"] = () =>
  Promise.resolve({ local: [], kept: [KEPT] })
const logPuts = (h: ReturnType<typeof home>): Array<string> =>
  h.calls
    .filter(
      ([method, path]) =>
        method === "PUT" && path.startsWith("/leetype/sessions/")
    )
    .map(([, path]) => path)

describe("sendHome's wiring", () => {
  it("sends no LeetType when the sessions copy is partial", async () => {
    const h = home()
    const p = ports(h.send, {
      copy: () =>
        Promise.resolve({
          copy: {
            outcome: {
              kind: "partial",
              copied: 0,
              remaining: 1,
              error: new SyncStoppedError(),
            },
            alreadyThere: 0,
          },
          ended: null,
        }),
    })
    await sendHome(TARGET, undefined, NOW, p)
    expect(logPuts(h)).toEqual([])
  })

  it("sends no shelf or LeetType when the sessions confirm ended early", async () => {
    const h = home()
    const p = ports(h.send, {
      read: withKept,
      copy: () =>
        Promise.resolve({
          copy: { outcome: { kind: "copied", copied: 0 }, alreadyThere: 0 },
          ended: new SyncStoppedError(),
        }),
    })
    await sendHome(TARGET, undefined, NOW, p)
    expect(h.calls.filter(([, path]) => path.startsWith("/shelf/"))).toEqual([])
    expect(logPuts(h)).toEqual([])
  })

  it("sends no LeetType when the shelf ended forgotten", async () => {
    const h = home([{ status: 401, body: "" }])
    await sendHome(TARGET, undefined, NOW, ports(h.send, { read: withKept }))
    expect(h.calls.map(([, path]) => path)).toEqual(["/shelf/topik/a"])
    expect(logPuts(h)).toEqual([])
  })

  it("sends no LeetType when the shelf ended unreachable", async () => {
    const h = home([noAnswer()])
    await sendHome(TARGET, undefined, NOW, ports(h.send, { read: withKept }))
    expect(h.calls.map(([, path]) => path)).toEqual(["/shelf/topik/a"])
    expect(logPuts(h)).toEqual([])
  })

  it("puts LeetType after a clean sessions copy and shelf", async () => {
    const h = home([{ status: 200, body: '{"change":"kept"}' }])
    await sendHome(TARGET, undefined, NOW, ports(h.send, { read: withKept }))
    expect(h.calls[0]?.[1]).toBe("/shelf/topik/a")
    expect(logPuts(h)).toEqual([
      "/leetype/sessions/a/events/a-1",
      "/leetype/sessions/a/events/a-2",
    ])
  })

  it("remembers the digest of the LeetType session home read back", async () => {
    const h = home()
    const p = ports(h.send)
    await sendHome(TARGET, undefined, NOW, p)
    expect(readSent(p.storage, TARGET.id).leetype["a"]).toBe(
      digestOf(session("a"))
    )
  })

  it("counts LeetType in onPhone's total and words", async () => {
    const p = ports(home().send, {
      logGoing: () => Promise.resolve([session("a"), session("b")]),
    })
    expect(await onPhone(TARGET.id, p)).toMatchObject({
      leetype: 2,
      total: 2,
      what: "2 LeetType sessions",
    })
  })

  it("puts Studio's sittings, then their answers, after LeetType, and remembers them", async () => {
    const h = home()
    const p = ports(h.send, {
      studioGoing: () =>
        Promise.resolve({ sittings: [SITTING], reports: [REPORT] }),
    })
    const result = await sendHome(TARGET, undefined, NOW, p)
    expect(
      h.calls
        .filter(([method]) => method === "PUT")
        .map(([, path]) => path)
        .slice(-2)
    ).toEqual([
      "/studio/sittings/s1-20261030T100000000Z/events/e1",
      "/studio/friction/s1-20261030T100000000Z",
    ])
    expect(result.line).toContain("Copied 2 Studio entries.")
    expect(readSent(p.storage, TARGET.id).studio).toEqual({
      [SITTING.name]: digestOf(SITTING),
      [`report:${REPORT.id}`]: expect.any(String),
    })
  })

  it("counts Studio's sittings in onPhone's total and words", async () => {
    const p = ports(home().send, {
      logGoing: () => Promise.resolve([]),
      studioGoing: () =>
        Promise.resolve({ sittings: [SITTING], reports: [REPORT] }),
    })
    expect(await onPhone(TARGET.id, p)).toMatchObject({
      studio: 1,
      total: 1,
      what: "1 Studio sitting",
    })
  })

  it("is not ok when home's LeetType read-back differs", async () => {
    const changed = {
      session: "a",
      events: [{ ...session("a").events[0], declaredMinutes: 11 }],
    }
    const h = home([], [{ status: 200, body: JSON.stringify(changed) }])
    const result = await sendHome(TARGET, undefined, NOW, ports(h.send))
    expect(result.ok).toBe(false)
    expect(result.line).toContain("kept here: home's copy didn't match")
  })
})
