/**
 * What a pull reads again in PULL0 (`lib/pull-refresh/reads`): the queries a
 * mounted screen shows, not the ones nothing shows, and the route's loaders;
 * a query that fails fails the check; and only a move to another route counts
 * as leaving the page.
 */
import {
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { PullRouter } from "@/lib/pull-refresh/reads"
import { readsOnScreen } from "@/lib/pull-refresh/reads"

type Navigated = { pathChanged: boolean }

const fakeRouter = (): {
  router: PullRouter
  invalidate: () => Promise<void>
  navigate: (event: Navigated) => void
} => {
  const listeners = new Set<(event: Navigated) => void>()
  const invalidate = vi.fn(() => Promise.resolve())
  const router: PullRouter = {
    invalidate,
    subscribe: (_type, listener) => {
      listeners.add(listener)
      return (): void => {
        listeners.delete(listener)
      }
    },
  }
  return {
    router,
    invalidate,
    navigate: (event) => listeners.forEach((listener) => listener(event)),
  }
}

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
const stops: Array<() => void> = []

/** A query a mounted screen shows, until the test ends. */
function shown(key: string, read: () => Promise<string>): void {
  const observer = new QueryObserver(client, { queryKey: [key], queryFn: read })
  stops.push(observer.subscribe(() => undefined))
}

afterEach(() => {
  stops.splice(0).forEach((stop) => stop())
  client.clear()
  onlineManager.setOnline(true)
})

/** The network as the cache sees it, but told it is online regardless. */
const sayOnline = { isOnline: (): boolean => true }

describe("a pull's reads", () => {
  it("reads again what is on screen, fresh or not, and runs the loaders", async () => {
    const onScreen = vi.fn(() => Promise.resolve("a"))
    const offScreen = vi.fn(() => Promise.resolve("b"))
    shown("on", onScreen)
    await client.prefetchQuery({ queryKey: ["off"], queryFn: offScreen })
    await vi.waitFor(() => expect(onScreen).toHaveBeenCalledTimes(1))
    const { router, invalidate } = fakeRouter()

    expect(await readsOnScreen(client, router, onlineManager).readAgain()).toBe(
      "read"
    )

    expect(onScreen).toHaveBeenCalledTimes(2)
    expect(offScreen).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it("fails when something on screen could not be read", async () => {
    let fail = false
    shown("flaky", () =>
      fail ? Promise.reject(new Error("offline")) : Promise.resolve("ok")
    )
    await vi.waitFor(() => expect(client.getQueryData(["flaky"])).toBe("ok"))
    fail = true
    const { router } = fakeRouter()

    await expect(
      readsOnScreen(client, router, onlineManager).readAgain()
    ).rejects.toThrow()
  })

  it("reads nothing, and says so, with no connection", async () => {
    const read = vi.fn(() => Promise.resolve("a"))
    shown("on", read)
    await vi.waitFor(() => expect(client.getQueryData(["on"])).toBe("a"))
    onlineManager.setOnline(false)
    const { router, invalidate } = fakeRouter()

    expect(await readsOnScreen(client, router, onlineManager).readAgain()).toBe(
      "offline"
    )
    expect(read).toHaveBeenCalledTimes(1)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it("does not take a read the cache paused for a connection as read", async () => {
    // The cache resolves `refetchQueries` at once for a query it paused, as
    // when the connection drops between the check's start and its reads.
    const read = vi.fn(() => Promise.resolve("a"))
    shown("on", read)
    await vi.waitFor(() => expect(client.getQueryData(["on"])).toBe("a"))
    onlineManager.setOnline(false)
    const { router } = fakeRouter()

    expect(await readsOnScreen(client, router, sayOnline).readAgain()).toBe(
      "offline"
    )
    expect(read).toHaveBeenCalledTimes(1)
  })

  it("leaves the page only when the route's path changes", () => {
    const { router, navigate } = fakeRouter()
    const left = vi.fn()
    const stop = readsOnScreen(client, router, onlineManager).onLeave(left)
    navigate({ pathChanged: false })
    expect(left).not.toHaveBeenCalled()
    navigate({ pathChanged: true })
    expect(left).toHaveBeenCalledTimes(1)
    stop()
    navigate({ pathChanged: true })
    expect(left).toHaveBeenCalledTimes(1)
  })
})
