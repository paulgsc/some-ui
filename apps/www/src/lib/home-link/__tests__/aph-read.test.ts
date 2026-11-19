/**
 * @vitest-environment jsdom
 *
 * AR1 (declared in packages/ui/aph `lib/__tests__/sync.test.ts`): aph's
 * read of home as its screens open goes beside the drain, over the real
 * link, so a lane's long run (a reinstalled phone re-sending everything,
 * #3197) never holds home's history back.
 */
import type { FakeClock } from "@/test-support/fake-clock"
import { fakeClock } from "@/test-support/fake-clock"
import type { AphStore, AphWhere } from "@some-ui/aph"
import type { HomeAnswer, HomeExchanged } from "@some-ui/core-utils"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { HomeRequest } from "@/lib/device-backend/native-http"
import type { AphKeeping } from "@/lib/home-link/aph"
import { readAphOnOpen } from "@/lib/home-link/aph"
import type { HomeLinkState, Pairing } from "@/lib/home-link/model"
import type { HomeLink } from "@/lib/home-link/runtime"
import { createHomeLink } from "@/lib/home-link/runtime"

const BASE = "https://home.example/api/v1"

const made = vi.hoisted(
  (): { link: HomeLink | null; clock: FakeClock | null } => ({
    link: null,
    clock: null,
  })
)

function theLink(): HomeLink {
  if (made.link === null) throw new Error("no link made yet")
  return made.link
}

vi.mock("@/lib/home-link/index", async () => {
  const { pairingIn } = await import("@/lib/home-link/model")
  return {
    homeLink: theLink,
    pairing: (state?: HomeLinkState): Pairing =>
      pairingIn(state ?? theLink().getSnapshot()),
    LINK_CLOCK: {
      now: (): number => made.clock?.now() ?? 0,
      after: (ms: number, run: () => void): (() => void) =>
        made.clock?.after(ms, run) ?? ((): void => undefined),
    },
  }
})

afterEach(() => {
  made.link = null
})

/** A paired link whose drain requests wait until released; `/aph` answers at once. */
async function pairedHome(): Promise<{
  sent: Array<string>
  release: () => void
}> {
  const clock = fakeClock()
  made.clock = clock
  const sent: Array<string> = []
  const held: Array<() => void> = []
  made.link = createHomeLink({
    credential: {
      read: () =>
        Promise.resolve({
          record: JSON.stringify({ base: BASE, token: "t", id: "p" }),
          lost: false,
        }),
      write: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    request: (call: HomeRequest): Promise<HomeAnswer> => {
      const path = call.url.slice(BASE.length)
      sent.push(path)
      const ok: HomeAnswer = { status: 200, body: "{}" }
      if (path === "/aph") return Promise.resolve(ok)
      return new Promise((resolve) => held.push(() => resolve(ok)))
    },
    onHidden: () => (): void => undefined,
    now: clock.now,
    after: clock.after,
  })
  await made.link.load()
  return {
    sent,
    release: (): void => {
      for (const go of held.splice(0)) go()
    },
  }
}

/** aph's store as the read sees it: kept on home or not, nothing else used. */
function storeOf(kept: boolean): AphStore {
  const where: AphWhere = kept
    ? {
        kind: "home",
        pulled: false,
        unsent: 0,
        refused: [],
        hidden: 0,
        edits: 0,
      }
    : { kind: "device" }
  return {
    get: () => ({
      settings: {
        checkpoints: [],
        labels: [],
        step: 100,
        usualLow: 0,
        usualHigh: 0,
        tolerance: 0,
        since: "2026-10-01",
      },
      entries: [],
    }),
    subscribe: () => (): void => undefined,
    where: () => where,
    keepOnHome: () => kept,
    outbox: () => null,
    sent: () => undefined,
    pulled: () => true,
    save: () => null,
    review: () => false,
    editEntry: () => false,
    rewriteMine: () => false,
    remove: () => false,
    submit: () => false,
    deleteDraft: () => false,
    editSettings: () => false,
  }
}

/** aph kept on home, whose read notes each answer it got. */
function aph(read: Array<number>, kept = true): AphKeeping {
  return {
    store: storeOf(kept),
    exchange: (): Promise<HomeExchanged> => Promise.resolve({ kind: "synced" }),
    read: async (_, send): Promise<HomeExchanged> => {
      const answer = await send("GET", "/aph")
      read.push(answer.status)
      return { kind: "synced" }
    },
  }
}

describe("AR1: aph reads home beside the drain", () => {
  it("is answered while another lane's run holds the drain", async () => {
    const home = await pairedHome()
    // Another lane's run, its request out and not yet answered.
    const draining = theLink().drain((send) => send("PUT", "/sessions/1"))
    await vi.waitFor(() => expect(home.sent).toContain("/sessions/1"))
    expect(theLink().getSnapshot().drain.kind).not.toBe("idle")

    const read: Array<number> = []
    readAphOnOpen(aph(read))
    await vi.waitFor(() => expect(read).toEqual([200]))
    // The drain's run is still out.
    expect(theLink().getSnapshot().drain.kind).not.toBe("idle")
    home.release()
    await draining
  })

  it("reads nothing before aph is kept on home", async () => {
    const home = await pairedHome()
    const read: Array<number> = []
    readAphOnOpen(aph(read, false))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(home.sent).toEqual([])
    expect(read).toEqual([])
  })
})
