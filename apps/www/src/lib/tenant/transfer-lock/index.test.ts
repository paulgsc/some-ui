/**
 * @vitest-environment jsdom
 *
 * One transfer at a time across tabs. The lease path is what the Docker image's
 * plain-http listener uses; the Web Locks path is what everything else uses.
 */

import { describe, expect, it, vi } from "vitest"

import { createInMemoryStorage, readJSON } from "@/lib/tenant/storage"
import type { LockDeps } from "@/lib/tenant/transfer-lock"
import { withTransferLock } from "@/lib/tenant/transfer-lock"

/** A `LockManager` that grants a named lock to one holder at a time. */
class FakeLocks implements LockManager {
  private readonly held = new Set<string>()

  request<T>(
    name: string,
    callback: LockGrantedCallback<T>
  ): Promise<Awaited<T>>
  request<T>(
    name: string,
    options: LockOptions,
    callback: LockGrantedCallback<T>
  ): Promise<Awaited<T>>
  async request<T>(
    name: string,
    second: LockOptions | LockGrantedCallback<T>,
    third?: LockGrantedCallback<T>
  ): Promise<Awaited<T>> {
    const callback = typeof second === "function" ? second : third
    if (callback === undefined) throw new Error("no callback")
    if (this.held.has(name)) return await callback(null)
    this.held.add(name)
    try {
      return await callback({ name, mode: "exclusive" })
    } finally {
      this.held.delete(name)
    }
  }

  query(): Promise<LockManagerSnapshot> {
    return Promise.resolve({})
  }
}

const instantly = (): Promise<void> => Promise.resolve()

describe("with Web Locks", () => {
  it("runs, and a second tab that asks meanwhile is told it is busy", async () => {
    const locks = new FakeLocks()
    let release: () => void = () => undefined
    const first = withTransferLock(
      () =>
        new Promise<string>((resolve) => {
          release = (): void => {
            resolve("done")
          }
        }),
      { locks }
    )
    const second = await withTransferLock(() => Promise.resolve("never"), {
      locks,
    })
    expect(second).toEqual({ held: false })

    release()
    expect(await first).toEqual({ held: true, value: "done" })
    // Released: the next press runs.
    expect(
      await withTransferLock(() => Promise.resolve("again"), { locks })
    ).toEqual({ held: true, value: "again" })
  })

  it("releases when the run fails", async () => {
    const locks = new FakeLocks()
    await expect(
      withTransferLock(() => Promise.reject(new Error("boom")), { locks })
    ).rejects.toThrow("boom")
    expect(await withTransferLock(() => Promise.resolve(1), { locks })).toEqual(
      { held: true, value: 1 }
    )
  })
})

describe("with a storage lease", () => {
  const deps = (storage = createInMemoryStorage(), at = 1_000): LockDeps => ({
    locks: undefined,
    storage,
    now: () => at,
    wait: instantly,
  })

  it("runs, holds the lease while it does, and gives it back", async () => {
    const storage = createInMemoryStorage()
    const seen: Array<string | null> = []
    const result = await withTransferLock(() => {
      seen.push(storage.getItem("some-ui.tenant.sessions.transfer.lease.v1"))
      return Promise.resolve("ok")
    }, deps(storage))

    expect(result).toEqual({ held: true, value: "ok" })
    expect(seen[0]).not.toBeNull()
    expect(
      storage.getItem("some-ui.tenant.sessions.transfer.lease.v1")
    ).toBeNull()
  })

  it("tells a second tab it is busy while the first holds a live lease", async () => {
    const storage = createInMemoryStorage()
    let release: () => void = () => undefined
    const first = withTransferLock(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
      deps(storage)
    )
    await Promise.resolve()
    const second = await withTransferLock(
      () => Promise.resolve("never"),
      deps(storage, 5_000)
    )
    expect(second).toEqual({ held: false })
    release()
    await first
  })

  it("takes over a lease whose holder stopped renewing it", async () => {
    const storage = createInMemoryStorage()
    storage.setItem(
      "some-ui.tenant.sessions.transfer.lease.v1",
      JSON.stringify({ token: "dead-tab", at: 1_000 })
    )
    expect(
      await withTransferLock(
        () => Promise.resolve("ok"),
        deps(storage, 100_000)
      )
    ).toEqual({ held: true, value: "ok" })
  })

  it("gives way when a rival's write lands over its own before it reads back", async () => {
    const storage = createInMemoryStorage()
    const rival = JSON.stringify({ token: "rival", at: 1_000 })
    const result = await withTransferLock(() => Promise.resolve("never"), {
      ...deps(storage),
      wait: () => {
        storage.setItem("some-ui.tenant.sessions.transfer.lease.v1", rival)
        return Promise.resolve()
      },
    })
    expect(result).toEqual({ held: false })
    // And it left the rival's lease alone.
    expect(storage.getItem("some-ui.tenant.sessions.transfer.lease.v1")).toBe(
      rival
    )
  })

  it("releases when the run fails, and treats an unreadable lease as free", async () => {
    const storage = createInMemoryStorage()
    storage.setItem("some-ui.tenant.sessions.transfer.lease.v1", "not json")
    await expect(
      withTransferLock(() => Promise.reject(new Error("boom")), deps(storage))
    ).rejects.toThrow("boom")
    expect(
      storage.getItem("some-ui.tenant.sessions.transfer.lease.v1")
    ).toBeNull()
  })

  it("renews the lease while a long transfer runs", async () => {
    vi.useFakeTimers()
    try {
      const storage = createInMemoryStorage()
      let clock = 1_000
      const run = withTransferLock(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 25_000)
          }),
        { locks: undefined, storage, now: () => clock, wait: instantly }
      )
      await vi.advanceTimersByTimeAsync(0)
      clock = 11_000
      await vi.advanceTimersByTimeAsync(10_000)
      const renewed = readJSON<{ at: number }>(
        storage,
        "some-ui.tenant.sessions.transfer.lease.v1",
        { at: -1 }
      )
      expect(renewed.at).toBe(11_000)
      await vi.advanceTimersByTimeAsync(20_000)
      await run
    } finally {
      vi.useRealTimers()
    }
  })
})
