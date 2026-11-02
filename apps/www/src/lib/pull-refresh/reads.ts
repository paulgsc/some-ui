/**
 * What a pull reads again: every query a mounted screen is showing, every
 * matched route's loader (each only a `prefetchQuery` head start, so a
 * failing one leaves the page as it is), and what each shown screen
 * registered past the query cache (`./refreshers`, PULL1).
 */
import type { CheckEnd } from "./model"
import type { Refreshers } from "./refreshers"
import { screenRefreshers } from "./refreshers"
import type { PullPorts } from "./runtime"
import { PULL_WORDS } from "./words"

/**
 * The query cache's calls a pull makes: read again every query a mounted
 * screen shows, then look for one whose read failed or still waits for a
 * connection. The app's `QueryClient` is one.
 */
export type PullCache = {
  readonly refetchQueries: (filters: {
    readonly type: "active"
  }) => Promise<void>
  readonly getQueryCache: () => {
    readonly findAll: (filters: { readonly type: "active" }) => ReadonlyArray<{
      readonly state: { readonly fetchStatus: string; readonly status: string }
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

const OFFLINE: CheckEnd = { kind: "offline" }

/**
 * The ports over the app's query cache, router, connection and the screens'
 * refreshers (`./refreshers`).
 */
export function readsOnScreen(
  queryClient: PullCache,
  router: PullRouter,
  network: PullNetwork,
  refreshers: Refreshers = screenRefreshers
): PullPorts {
  const active = (): ReturnType<
    ReturnType<PullCache["getQueryCache"]>["findAll"]
  > => queryClient.getQueryCache().findAll({ type: "active" })
  // A read that finds no connection pauses, and `refetchQueries` does not
  // wait for it: nothing was read, whatever it resolved, and a paused query
  // keeps any error from before, so it is looked for first.
  const paused = (): boolean =>
    active().some((query) => query.state.fetchStatus === "paused")
  // A failed read is found in the cache, not thrown: with `throwOnError` the
  // cache leaves a paused read's promise uncaught, and it rejects unhandled
  // once that read is cancelled.
  const failed = (): boolean =>
    active().some((query) => query.state.status === "error")
  /** The page's queries and loaders: offline, or what could not be read. */
  const page = (): Promise<ReadonlyArray<string> | "offline"> =>
    Promise.all([
      queryClient.refetchQueries({ type: "active" }),
      router.invalidate(),
    ]).then(
      () => (paused() ? "offline" : failed() ? [PULL_WORDS.page] : []),
      () => (paused() ? "offline" : [PULL_WORDS.page])
    )
  return {
    readAgain: async (): Promise<CheckEnd> => {
      // No connection: nothing is asked, neither the page nor its screens.
      if (!network.isOnline()) return OFFLINE
      const [onPage, registered] = await Promise.all([
        page(),
        refreshers.checkAll(),
      ])
      if (onPage === "offline") return OFFLINE
      const what = [...new Set([...onPage, ...registered])]
      return what.length === 0 ? { kind: "read" } : { kind: "unread", what }
    },
    onLeave: (listener) =>
      router.subscribe("onBeforeNavigate", (event) => {
        if (event.pathChanged) listener()
      }),
    now: () => Date.now(),
  }
}
