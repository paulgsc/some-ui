/**
 * @vitest-environment jsdom
 *
 * That every data route still has a loader, and that the loader prefetches the
 * key its component reads.
 *
 * This exists because the bug it guards against is silent. The router was
 * configured with `defaultPreload: "intent"` and `defaultPreloadStaleTime: 0`
 * and no route had a `loader`, so hovering a link preloaded route *code* and
 * fetched no data - a setting that looks switched on and does nothing. Nothing
 * failed; navigation was just slower than it read. Deleting a loader below, or
 * pointing one at a key its component does not use, would restore exactly that
 * silence, so the wiring is asserted rather than assumed.
 *
 * The queryClient is a recording stand-in: the loaders take theirs from router
 * context, so what is checkable here is which query options each one hands
 * over, without a repository, a fetch, or a render in the picture.
 */

import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import {
  profileQuery,
  sessionQuery,
  sessionsQuery,
  settingsQuery,
} from "@/lib/tenant"

/**
 * A real client with `prefetchQuery` stubbed, so the options each loader hands
 * over are readable without any queryFn running: this is a test about wiring,
 * not about what the repositories return.
 */
function recordingContext(): {
  context: { queryClient: QueryClient }
  prefetched: () => Array<ReadonlyArray<unknown>>
} {
  const queryClient = new QueryClient()
  const prefetchQuery = vi
    .spyOn(queryClient, "prefetchQuery")
    .mockResolvedValue(undefined)

  return {
    context: { queryClient },
    prefetched: () =>
      prefetchQuery.mock.calls.map(([options]) => options.queryKey),
  }
}

/**
 * `Route.options.loader` is typed against the whole route tree's context and
 * params; every loader under test reads only `context`, and `$sessionId`/`new`
 * additionally read `params`/`deps`. This is the narrowest shape that covers
 * all of them.
 */
type LoaderUnderTest = (args: {
  context: { queryClient: QueryClient }
  params?: Record<string, string>
  deps?: Record<string, string | undefined>
}) => unknown

function keysPrefetchedBy(
  loader: unknown,
  args: {
    params?: Record<string, string>
    deps?: Record<string, string | undefined>
  } = {}
): Array<ReadonlyArray<unknown>> {
  expect(loader, "route has no loader").toBeTypeOf("function")
  const { context, prefetched } = recordingContext()
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see LoaderUnderTest
  const run = loader as LoaderUnderTest
  run({ context, ...args })
  return prefetched()
}

describe("route loaders prefetch what their components read", () => {
  it("/app warms both of its queries", async () => {
    const { Route } = await import("./_dashboard/app")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      profileQuery.queryKey,
      sessionsQuery.queryKey,
    ])
  })

  it("/profile warms the profile query", async () => {
    const { Route } = await import("./_dashboard/profile")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      profileQuery.queryKey,
    ])
  })

  it("/settings warms the settings query", async () => {
    const { Route } = await import("./_dashboard/settings")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      settingsQuery.queryKey,
    ])
  })

  it("/sessions warms the sessions list", async () => {
    const { Route } = await import("./_dashboard/sessions/index")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      sessionsQuery.queryKey,
    ])
  })

  it("/sessions/$sessionId warms the session in the URL", async () => {
    const { Route } = await import("./_dashboard/sessions/$sessionId")

    expect(
      keysPrefetchedBy(Route.options.loader, {
        params: { sessionId: "session-7" },
      })
    ).toStrictEqual([sessionQuery("session-7").queryKey])
  })

  it("/sessions/new warms the draft named by ?edit=", async () => {
    const { Route } = await import("./_dashboard/sessions/new")

    expect(
      keysPrefetchedBy(Route.options.loader, { deps: { edit: "draft-3" } })
    ).toStrictEqual([sessionQuery("draft-3").queryKey])
  })

  it("/sessions/new fetches nothing without ?edit=", async () => {
    const { Route } = await import("./_dashboard/sessions/new")

    // A blank composer has no existing session to warm. Prefetching
    // `sessionQuery("")` instead would put a permanently-disabled query in the
    // cache under a key nothing reads.
    expect(
      keysPrefetchedBy(Route.options.loader, { deps: { edit: undefined } })
    ).toStrictEqual([])
  })

  it("keeps ?edit= in loaderDeps, so two drafts are two loads", async () => {
    const { Route } = await import("./_dashboard/sessions/new")
    const loaderDeps = Route.options.loaderDeps

    expect(loaderDeps, "route has no loaderDeps").toBeTypeOf("function")
    expect(
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- loaderDeps is typed against this route's validated search; the one field the loader reads is what matters here
      (loaderDeps as (args: { search: { edit?: string } }) => unknown)({
        search: { edit: "draft-3" },
      })
    ).toStrictEqual({ edit: "draft-3" })
  })
})
