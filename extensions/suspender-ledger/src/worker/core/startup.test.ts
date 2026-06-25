// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type GetCb = (items: Record<string, unknown>) => void
type Listener = () => void

const flush = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(chrome.storage.local.get).mockImplementation(
    (_keys: unknown, cb: GetCb) => cb({})
  )
})

afterEach(() => {
  vi.resetModules()
})

describe("starters", () => {
  it("becomes ready on module load without needing onStartup or onInstalled", async () => {
    const { starters } = await import("./startup")

    await flush()

    expect(starters.ready).toBe(true)
    expect(chrome.runtime.onStartup.addListener).toHaveBeenCalled()
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled()
  })

  it("drains cached callbacks that were pushed before ready", async () => {
    // Delay storage so we can push a callback before ready fires.
    let resolve!: () => void
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (_keys: unknown, cb: GetCb): void => {
        resolve = (): void => {
          cb({})
        }
      }
    )

    const { starters } = await import("./startup")
    const cb = vi.fn()
    starters.push(cb)

    expect(starters.ready).toBe(false)
    expect(cb).not.toHaveBeenCalled()

    resolve()
    await flush()

    expect(starters.ready).toBe(true)
    expect(cb).toHaveBeenCalledOnce()
  })

  it("runs a callback pushed after ready immediately", async () => {
    const { starters } = await import("./startup")
    await flush()

    const cb = vi.fn()
    starters.push(cb)

    expect(cb).toHaveBeenCalledOnce()
  })

  it("does not double-fire callbacks when onStartup fires after module load", async () => {
    const onStartupListeners: Array<Listener> = []
    vi.mocked(chrome.runtime.onStartup.addListener).mockImplementation(
      (fn: Listener) => {
        onStartupListeners.push(fn)
      }
    )

    const { starters } = await import("./startup")
    await flush() // module-level once() resolves → ready = true

    const cb = vi.fn()
    starters.push(cb) // pushed after ready: fires immediately once
    expect(cb).toHaveBeenCalledOnce()

    // Simulate onStartup firing (e.g. browser restart while extension is loaded)
    onStartupListeners.forEach((fn) => fn())
    await flush()

    // once() is idempotent — cb is not called a second time
    expect(cb).toHaveBeenCalledOnce()
  })
})
