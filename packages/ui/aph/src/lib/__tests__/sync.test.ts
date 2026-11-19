/**
 * One exchange with home: the outbox sent, home's record read back, and the
 * phone lets go of exactly what home answered with. Whatever ends it early
 * (a refusal, no answer, a stop) keeps on the phone everything home has not
 * confirmed.
 */
import type { AphSettings, Entry } from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { createAphStore } from "@aph/lib/store"
import { EntrySchema, SettingsSchema } from "@aph/lib/stored"
import { exchangeWithHome, readFromHome } from "@aph/lib/sync"
import type { HomeCall } from "@some-ui/core-utils"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it, vi } from "vitest"

const SETTINGS: AphSettings = {
  checkpoints: [
    { id: "7", label: "7:00", minutes: 420, goal: 4100 },
    { id: "12", label: "12:00", minutes: 720, goal: 5100 },
  ],
  labels: ["no-bs"],
  step: 100,
  usualLow: 3000,
  usualHigh: 6500,
  tolerance: 100,
  since: "2026-10-01",
}

function entry(id: string, day: string): Entry {
  return {
    id,
    day,
    checkpoint: "7",
    time: null,
    mine: { value: 4300, approx: true },
    theirs: null,
    goal: 4100,
    labels: [],
    note: null,
    review: null,
  }
}

const ENTRIES = [
  entry("a", "2026-10-14"),
  entry("b", "2026-10-15"),
  entry("c", "2026-10-16"),
]

class Stopped extends Error {}

/**
 * A home that keeps what it is sent, answering as paulgsc/server's
 * `handlers/aph.rs` does. It refuses the ids in `refuse`, and `fail` may
 * throw in place of the nth answer.
 */
function fakeHome(
  options: {
    refuse?: ReadonlySet<string>
    fail?: (n: number) => Error | null
  } = {}
): {
  send: HomeCall
  held: Map<string, Entry>
  settings: () => AphSettings | null
  requests: Array<string>
} {
  const held = new Map<string, Entry>()
  let settings: AphSettings | null = null
  const requests: Array<string> = []
  const answer = (
    status: number,
    body: unknown
  ): { status: number; body: string } => ({
    status,
    body: JSON.stringify(body),
  })
  const answering = (
    method: string,
    path: string,
    body: string | undefined
  ): { status: number; body: string } => {
    if (method === "GET" && path === "/aph") {
      return answer(200, { settings, entries: [...held.values()] })
    }
    if (path === "/aph/settings") {
      settings = SettingsSchema.parse(JSON.parse(body ?? "null"))
      return answer(200, { change: "kept", settings })
    }
    const id = decodeURIComponent(path.replace("/aph/entries/", ""))
    if (options.refuse?.has(id)) {
      return answer(422, {
        error: { details: { labels: ["another entry already stands plain"] } },
      })
    }
    const sent = EntrySchema.parse(JSON.parse(body ?? "null"))
    held.set(id, sent)
    return answer(200, { change: "kept", entry: sent })
  }
  const send: HomeCall = (method, path, body) => {
    const failure = options.fail?.(requests.length) ?? null
    requests.push(`${method} ${path}`)
    return failure === null
      ? Promise.resolve(
          answering(method, path, typeof body === "string" ? body : undefined)
        )
      : Promise.reject(failure)
  }
  return { send, held, settings: () => settings, requests }
}

function keptOnHome(): AphStore {
  const store = createAphStore(
    { settings: SETTINGS, entries: ENTRIES },
    memoryStorage()
  )
  expect(store.keepOnHome()).toBe(true)
  return store
}

describe("an exchange with home", () => {
  it("sends the outbox, reads home back, and lets go of what home holds", async () => {
    const store = keptOnHome()
    const home = fakeHome()
    expect(await exchangeWithHome(store, home.send)).toEqual({ kind: "synced" })
    expect(home.requests).toEqual([
      "PUT /aph/settings",
      "PUT /aph/entries/a",
      "PUT /aph/entries/b",
      "PUT /aph/entries/c",
      "GET /aph",
    ])
    expect(home.settings()).toEqual(SETTINGS)
    expect([...home.held.values()]).toEqual(ENTRIES)
    expect(store.outbox()).toEqual({ settings: null, entries: [] })
    expect(store.where()).toMatchObject({ pulled: true, unsent: 0 })
    expect(store.get().entries).toEqual(ENTRIES)
  })

  it("keeps a refused entry on the phone, says why, and does not send it again unchanged", async () => {
    const store = keptOnHome()
    const home = fakeHome({ refuse: new Set(["b"]) })
    await exchangeWithHome(store, home.send)
    expect(store.where()).toMatchObject({
      unsent: 1,
      refused: [{ id: "b", why: "labels another entry already stands plain" }],
    })
    expect(store.get().entries.map((e) => e.id)).toEqual(["a", "c", "b"])

    home.requests.length = 0
    await exchangeWithHome(store, home.send)
    expect(home.requests).toEqual(["GET /aph"])
  })

  it("lets go of nothing when home does not answer", async () => {
    const store = keptOnHome()
    const home = fakeHome({ fail: () => new Error("no route to host") })
    await expect(exchangeWithHome(store, home.send)).rejects.toThrow(
      "no route to host"
    )
    expect(store.outbox()).toEqual({ settings: SETTINGS, entries: ENTRIES })
  })

  it("keeps what home confirmed before a stop, and the rest waiting", async () => {
    const store = keptOnHome()
    const home = fakeHome({ fail: (n) => (n === 3 ? new Stopped() : null) })
    await expect(exchangeWithHome(store, home.send)).rejects.toBeInstanceOf(
      Stopped
    )
    expect(store.outbox()).toEqual({ settings: null, entries: [ENTRIES[2]] })
  })

  it("ends at the settings when home refuses them, sending no entry", async () => {
    const store = keptOnHome()
    const home = fakeHome()
    const refusing: HomeCall = async (method, path, body) =>
      path === "/aph/settings"
        ? {
            status: 422,
            body: JSON.stringify({
              error: { details: { checkpoints: ["drops a checkpoint"] } },
            }),
          }
        : home.send(method, path, body)
    expect(await exchangeWithHome(store, refusing)).toEqual({
      kind: "failed",
      why: "home refused the settings: checkpoints drops a checkpoint",
    })
    expect(home.requests).toEqual([])
    expect(store.outbox()?.entries).toEqual(ENTRIES)
  })

  it("says home forgot the phone, keeping everything", async () => {
    const store = keptOnHome()
    const forgot: HomeCall = () => Promise.resolve({ status: 401, body: "" })
    expect(await exchangeWithHome(store, forgot)).toEqual({
      kind: "forgotten",
    })
    expect(store.outbox()).toEqual({ settings: SETTINGS, entries: ENTRIES })
  })

  it("sends nothing for a record kept on this phone", async () => {
    const store = createAphStore(
      { settings: SETTINGS, entries: ENTRIES },
      memoryStorage()
    )
    const home = fakeHome()
    expect(await exchangeWithHome(store, home.send)).toEqual({ kind: "synced" })
    expect(home.requests).toEqual([])
  })
})

/**
 * **AR1: aph's screens show home's record while the drain waits.**
 *
 * - _Claim:_ aph's read as its screens open (`readFromHome`, through
 *   www's `readAphOnOpen` and the link's `keep`, beside the drain) sends
 *   nothing, lays what this phone holds unsent over home's record, and
 *   drops a record it read before a send's receipt or another read reached
 *   the store; so home's history shows before the lane's own exchange has
 *   run, and never over a newer record.
 * - _Family:_ the outbox (empty, entries waiting, settings waiting) ×
 *   home's record (many entries, none) × aph kept on home or not yet × the
 *   link's drain idle or held by another lane's run × the read's answer
 *   landing before, between or after aph's own exchange's receipt and read,
 *   that exchange whole or ending part way.
 * - _Proof:_ this describe over the store (the late answer over an
 *   exchange, with entries and with settings waiting); apps/www
 *   `lib/home-link/__tests__/aph-read.test.ts` for the read going beside a
 *   drain run that is held; `components/__tests__/device-home-glyph.test.tsx`
 *   for aph's screens asking it once as they mount.
 * - _Tolerance:_ one read each opening, asked again only while the link is
 *   busy with the person's own run; one home answers busy, or that finds no
 *   answer, leaves the outbox alone shown until the lane's run or the next
 *   opening; so does a read dropped because aph's own exchange ended part
 *   way after its receipt (a stop, no answer), until that lane's next run.
 */
describe("aph's read of home as its screens open (AR1)", () => {
  it("shows home's history with what waits laid over it, sending nothing", async () => {
    const home = fakeHome()
    // Home holds a's and b's day already; this phone kept c unsent.
    await exchangeWithHome(keptOnHome(), home.send)
    home.held.delete("c")
    const store = createAphStore(
      { settings: SETTINGS, entries: [] },
      memoryStorage()
    )
    expect(store.keepOnHome()).toBe(true)
    const before = home.requests.length
    expect(await readFromHome(store, home.send)).toEqual({ kind: "synced" })
    expect(home.requests.slice(before)).toEqual(["GET /aph"])
    expect(store.where()).toMatchObject({ pulled: true })
    expect(store.get().entries.map(({ id }) => id)).toEqual(["a", "b"])
  })

  it("lays the outbox over home's record", async () => {
    const home = fakeHome()
    const store = keptOnHome()
    home.held.set("z", entry("z", "2026-09-16"))
    await readFromHome(store, home.send)
    expect(
      store
        .get()
        .entries.map(({ id }) => id)
        .sort()
    ).toEqual(["a", "b", "c", "z"])
    // Still waiting: nothing was sent.
    expect(store.outbox()?.entries.map(({ id }) => id)).toEqual(["a", "b", "c"])
  })

  /**
   * The read's `GET /aph` answered before the lane's exchange, its answer
   * landing after the exchange's own receipt and read (the review of
   * c8f18c62): what it found is older than what shows, and is dropped.
   */
  async function lateRead(
    store: AphStore,
    home = fakeHome()
  ): Promise<ReturnType<typeof fakeHome>> {
    const held: { release: (() => void) | null } = { release: null }
    const late: HomeCall = async (method, path, body) => {
      const answer = await home.send(method, path, body)
      await new Promise<void>((resolve) => {
        held.release = resolve
      })
      return answer
    }
    const landed = readFromHome(store, late)
    // Home answered the read before anything was sent.
    await vi.waitFor(() => expect(held.release).not.toBeNull())
    expect(await exchangeWithHome(store, home.send)).toEqual({ kind: "synced" })
    held.release?.()
    await landed
    return home
  }

  it("drops a record read before the exchange and landing after it: no entry vanishes", async () => {
    const store = keptOnHome()
    await lateRead(store)
    expect(store.get().entries.map(({ id }) => id)).toEqual(["a", "b", "c"])
    expect(store.where()).toMatchObject({ pulled: true, unsent: 0 })
  })

  it("drops it too when the settings changed: home's new settings stand", async () => {
    const store = keptOnHome()
    // A first exchange, so home holds the settings; then one changed here.
    const home = fakeHome()
    await exchangeWithHome(store, home.send)
    expect(store.editSettings({ tolerance: 200 })).toBe(true)
    await lateRead(store, home)
    expect(home.settings()?.tolerance).toBe(200)
    expect(store.get().settings.tolerance).toBe(200)
    expect(store.outbox()?.settings ?? null).toBeNull()
  })

  it("with nothing waiting, shows home's record and takes home's settings", async () => {
    const home = fakeHome()
    const store = keptOnHome()
    // An exchange empties the outbox; home's settings then change elsewhere.
    await exchangeWithHome(store, home.send)
    expect(store.outbox()).toEqual({ settings: null, entries: [] })
    const elsewhere = { ...SETTINGS, tolerance: 300 }
    await home.send("PUT", "/aph/settings", JSON.stringify(elsewhere))
    home.held.set("z", entry("z", "2026-09-16"))
    expect(await readFromHome(store, home.send)).toEqual({ kind: "synced" })
    expect(store.get().settings.tolerance).toBe(300)
    expect(
      store
        .get()
        .entries.map(({ id }) => id)
        .sort()
    ).toEqual(["a", "b", "c", "z"])
  })

  it("with home holding nothing, shows only what waits here", async () => {
    const home = fakeHome()
    const store = keptOnHome()
    expect(await readFromHome(store, home.send)).toEqual({ kind: "synced" })
    expect(store.where()).toMatchObject({ pulled: true })
    expect(store.get().entries.map(({ id }) => id)).toEqual(["a", "b", "c"])
    expect(store.get().settings).toEqual(SETTINGS)
  })

  it("reads nothing before aph is kept on home", async () => {
    const home = fakeHome()
    const store = createAphStore(
      { settings: SETTINGS, entries: ENTRIES },
      memoryStorage()
    )
    expect(await readFromHome(store, home.send)).toEqual({ kind: "synced" })
    expect(home.requests).toEqual([])
  })
})
