/**
 * What a pull reads again in PULL0: every query a mounted screen is showing,
 * and every matched route's loader. A screen whose runtime reads past the
 * query cache registers its own reads in PULL1 (#2458).
 */
import type { PullPorts } from "./runtime"

/**
 * The query cache's one call a pull makes: read again every query a mounted
 * screen shows, failing if any read fails. The app's `QueryClient` is one.
 */
export type PullCache = {
  readonly refetchQueries: (
    filters: { readonly type: "active" },
    options: { readonly throwOnError: true }
  ) => Promise<void>
}

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

/**
 * The ports over the app's query cache and router. Loaders only give the
 * cache a head start (`prefetchQuery`), so a loader that fails leaves the
 * page as it is; a query that fails is what makes a check fail.
 */
export function readsOnScreen(
  queryClient: PullCache,
  router: PullRouter
): PullPorts {
  return {
    readAgain: async (): Promise<void> => {
      await Promise.all([
        queryClient.refetchQueries({ type: "active" }, { throwOnError: true }),
        router.invalidate(),
      ])
    },
    onLeave: (listener) =>
      router.subscribe("onBeforeNavigate", (event) => {
        if (event.pathChanged) listener()
      }),
    now: () => Date.now(),
  }
}
