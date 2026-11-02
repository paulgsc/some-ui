/**
 * What a pull reads again in PULL0: every query a mounted screen is showing,
 * and every matched route's loader (each only a `prefetchQuery` head start,
 * so a failing one leaves the page as it is). A screen whose runtime reads
 * past the query cache registers its own reads in PULL1 (#2458).
 */
import type { PullPorts } from "./runtime"

/**
 * The query cache's calls a pull makes: read again every query a mounted
 * screen shows, failing if any read fails, then look for one still waiting
 * for a connection. The app's `QueryClient` is one.
 */
export type PullCache = {
  readonly refetchQueries: (
    filters: { readonly type: "active" },
    options: { readonly throwOnError: true }
  ) => Promise<void>
  readonly getQueryCache: () => {
    readonly findAll: (filters: { readonly type: "active" }) => ReadonlyArray<{
      readonly state: { readonly fetchStatus: string }
    }>
  }
}

/** Whether the phone has a connection, as the cache sees it (`onlineManager`). */
export type PullNetwork = { readonly isOnline: () => boolean }

/**
 * The router's two calls a pull makes: re-run the loaders, and hear a route
 * change. The app's router is one.
 */
export type PullRouter = {
  readonly invalidate: () => Promise<void>
  readonly subscribe: (
    type: "onBeforeNavigate",
    listener: (event: { readonly pathChanged: boolean }) => void
  ) => () => void
}

/** The ports over the app's query cache, router and connection. */
export function readsOnScreen(
  queryClient: PullCache,
  router: PullRouter,
  network: PullNetwork
): PullPorts {
  return {
    readAgain: async (): Promise<"read" | "offline"> => {
      if (!network.isOnline()) return "offline"
      await Promise.all([
        queryClient.refetchQueries({ type: "active" }, { throwOnError: true }),
        router.invalidate(),
      ])
      // A read that finds no connection pauses, and `refetchQueries` does
      // not wait for it: nothing was read, whatever it resolved.
      const paused = queryClient
        .getQueryCache()
        .findAll({ type: "active" })
        .some((query) => query.state.fetchStatus === "paused")
      return paused ? "offline" : "read"
    },
    onLeave: (listener) =>
      router.subscribe("onBeforeNavigate", (event) => {
        if (event.pathChanged) listener()
      }),
    now: () => Date.now(),
  }
}
