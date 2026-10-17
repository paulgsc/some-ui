/**
 * One exchange with home: the outbox sent, home's record read back, and the
 * phone lets go of exactly what home answered with. Whatever ends it early
 * (a refusal, no answer, a stop) keeps on the phone everything home has not
 * confirmed.
 */
import type { AphSettings, Entry } from "@aph/lib/model"
import type { AphStore } from "@aph/lib/store"
import { createAphStore } from "@aph/lib/store"
import { readEntry, readSettings } from "@aph/lib/stored"
import type { HomeCall } from "@aph/lib/sync"
import { exchangeWithHome } from "@aph/lib/sync"
import { memoryStorage } from "@some-ui/vite-config/vitest/memory-storage"
import { describe, expect, it } from "vitest"

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
      settings = readSettings(JSON.parse(body ?? "null"))
      return answer(200, { change: "kept", settings })
    }
    const id = decodeURIComponent(path.replace("/aph/entries/", ""))
    if (options.refuse?.has(id)) {
      return answer(422, {
        error: { details: { labels: ["another entry already stands plain"] } },
      })
    }
    const sent = readEntry(JSON.parse(body ?? "null"))
    if (sent === null) return answer(422, { error: { details: {} } })
    held.set(id, sent)
    return answer(200, { change: "kept", entry: sent })
  }
  const send: HomeCall = (method, path, body) => {
    const failure = options.fail?.(requests.length) ?? null
    requests.push(`${method} ${path}`)
    return failure === null
      ? Promise.resolve(answering(method, path, body))
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
