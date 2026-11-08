/**
 * The runtime over a fake home: it reads, sets one change at a time, says a
 * change that did not land over the screen, and never lets an older answer
 * land over a newer one. The client's own reading of home's answers, over a
 * fake transport, is here too.
 */
import { describe, expect, it, vi } from "vitest"

import type { FileHostTransport } from "@/lib/file-host-config/client"
import { FileHostResponseError } from "@/lib/file-host-config/client"
import type { SwitchesClient } from "@/lib/home-switches/client"
import { createSwitchesClient, refusalOf } from "@/lib/home-switches/client"
import type { Standing } from "@/lib/home-switches/model"
import { createHomeSwitches } from "@/lib/home-switches/runtime"

const ON: Standing = { recording: true, set: null }
const PAUSED: Standing = {
  recording: false,
  set: { by: "owner", at: "2026-11-08T14:05:00.000Z" },
}

type Pending<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** A home whose every answer the test gives by hand, in order. */
function fakeHome(): {
  client: SwitchesClient
  reads: Array<Pending<Standing>>
  sets: Array<[boolean, Pending<Standing>]>
} {
  const reads: Array<Pending<Standing>> = []
  const sets: Array<[boolean, Pending<Standing>]> = []
  return {
    reads,
    sets,
    client: {
      read: (): Promise<Standing> => {
        const answer = pending<Standing>()
        reads.push(answer)
        return answer.promise
      },
      set: (recording): Promise<Standing> => {
        const answer = pending<Standing>()
        sets.push([recording, answer])
        return answer.promise
      },
    },
  }
}

const settled = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

describe("createHomeSwitches", () => {
  it("reads, then sets, one change at a time", async () => {
    const home = fakeHome()
    const notify = vi.fn()
    const switches = createHomeSwitches({ client: home.client, notify })
    const seen = vi.fn()
    switches.subscribe(seen)

    switches.read()
    home.reads[0]?.resolve(ON)
    await settled()
    expect(switches.getSnapshot()).toEqual({
      kind: "read",
      standing: ON,
      setting: null,
    })

    switches.turn(false)
    switches.turn(true)
    expect(home.sets.map(([recording]) => recording)).toEqual([false])
    home.sets[0]?.[1].resolve(PAUSED)
    await settled()
    expect(switches.getSnapshot()).toEqual({
      kind: "read",
      standing: PAUSED,
      setting: null,
    })
    expect(notify).not.toHaveBeenCalled()
    expect(seen).toHaveBeenCalled()
  })

  it("asks no read while a set is under way, so the set's answer stands", async () => {
    const home = fakeHome()
    const switches = createHomeSwitches({
      client: home.client,
      notify: vi.fn(),
    })
    switches.read()
    home.reads[0]?.resolve(ON)
    await settled()
    switches.turn(false)
    switches.read()
    expect(home.reads).toHaveLength(1)
    home.sets[0]?.[1].resolve(PAUSED)
    await settled()
    expect(switches.getSnapshot()).toMatchObject({ standing: PAUSED })
  })

  it("says a change home did not confirm, then shows what home follows now", async () => {
    const home = fakeHome()
    const notify = vi.fn()
    const switches = createHomeSwitches({ client: home.client, notify })
    switches.read()
    home.reads[0]?.resolve(ON)
    await settled()
    switches.turn(false)
    home.sets[0]?.[1].reject(
      new FileHostResponseError(403, "/admin/settings/rust-rounds", "forbidden")
    )
    await settled()
    expect(notify).toHaveBeenCalledWith("not-operator", false)
    expect(switches.getSnapshot()).toEqual({ kind: "reading" })
    expect(home.reads).toHaveLength(2)
    // Home took the change and only its answer was lost: the page shows it.
    home.reads[1]?.resolve(PAUSED)
    await settled()
    expect(switches.getSnapshot()).toEqual({
      kind: "read",
      standing: PAUSED,
      setting: null,
    })
  })

  it("a read that fails says why, and asking again asks home again", async () => {
    const home = fakeHome()
    const switches = createHomeSwitches({
      client: home.client,
      notify: vi.fn(),
    })
    switches.read()
    home.reads[0]?.reject(
      new FileHostResponseError(401, "/admin/settings/rust-rounds", null)
    )
    await settled()
    expect(switches.getSnapshot()).toEqual({
      kind: "unread",
      why: "signed-out",
    })
    switches.read()
    expect(home.reads).toHaveLength(2)
  })
})

describe("createSwitchesClient", () => {
  const answer = {
    namespace: "rust-rounds",
    value: { recording: false },
    isDefault: false,
    default: { recording: true },
    revision: 3,
    setBy: "owner",
    setAt: "2026-11-08T14:05:00.000Z",
  }

  it("reads and sets Rust Rounds recording, and keeps only what the page says", async () => {
    const calls: Array<[string, string, string | undefined]> = []
    const transport: FileHostTransport = (route, init) => {
      calls.push([
        init?.method ?? "GET",
        route,
        typeof init?.body === "string" ? init.body : undefined,
      ])
      return Promise.resolve(Response.json(answer))
    }
    const client = createSwitchesClient(transport)
    await expect(client.read()).resolves.toEqual(PAUSED)
    await expect(client.set(false)).resolves.toEqual(PAUSED)
    expect(calls).toEqual([
      ["GET", "/admin/settings/rust-rounds", undefined],
      ["PUT", "/admin/settings/rust-rounds", '{"recording":false}'],
    ])
  })

  it("reads an untouched switch as nobody's change", async () => {
    const transport: FileHostTransport = () =>
      Promise.resolve(
        Response.json({
          ...answer,
          value: { recording: true },
          isDefault: true,
          revision: null,
          setBy: null,
          setAt: null,
        })
      )
    await expect(createSwitchesClient(transport).read()).resolves.toEqual(ON)
  })

  it("turns every way it can fail into a reason the page can say", async () => {
    await expect(createSwitchesClient(null).read()).rejects.toSatisfy(
      (error: unknown) => refusalOf(error) === "no-home"
    )
    const garbled: FileHostTransport = () =>
      Promise.resolve(Response.json({ value: "on" }))
    await expect(createSwitchesClient(garbled).read()).rejects.toSatisfy(
      (error: unknown) => refusalOf(error) === "failed"
    )
    const route = "/admin/settings/rust-rounds"
    expect(refusalOf(new FileHostResponseError(404, route, null))).toBe(
      "not-on-home"
    )
    expect(refusalOf(new FileHostResponseError(500, route, null))).toBe(
      "failed"
    )
  })
})
