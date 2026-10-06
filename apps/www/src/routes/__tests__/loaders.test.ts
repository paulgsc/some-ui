/**
 * @vitest-environment jsdom
 *
 * Every data route has a loader that prefetches the key its component reads.
 * Without one, `defaultPreload: "intent"` preloads only route code: nothing
 * fails, navigation is just slower, so the wiring is asserted. The
 * queryClient is a recording stand-in taken from router context.
 */

import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import {
  profileQuery,
  sessionQuery,
  sessionsQuery,
  settingsQuery,
} from "@/lib/tenant"

/** A real client with `prefetchQuery` stubbed: no queryFn runs. */
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

/** The narrowest shape every loader under test reads (`context`, plus
 * `params`/`deps` for `$sessionId` and `new`). */
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
    const { Route } = await import("@/routes/_dashboard/app")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      profileQuery.queryKey,
      sessionsQuery.queryKey,
    ])
  })

  it("/profile warms the profile query", async () => {
    const { Route } = await import("@/routes/_dashboard/profile")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      profileQuery.queryKey,
    ])
  })

  it("/settings warms the settings query", async () => {
    const { Route } = await import("@/routes/_dashboard/settings")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      settingsQuery.queryKey,
    ])
  })

  it("/sessions warms the sessions list", async () => {
    const { Route } = await import("@/routes/_dashboard/sessions/index")

    expect(keysPrefetchedBy(Route.options.loader)).toStrictEqual([
      sessionsQuery.queryKey,
    ])
  })

  it("/sessions/$sessionId warms the session in the URL", async () => {
    const { Route } = await import("@/routes/_dashboard/sessions/$sessionId")

    expect(
      keysPrefetchedBy(Route.options.loader, {
        params: { sessionId: "session-7" },
      })
    ).toStrictEqual([sessionQuery("session-7").queryKey])
  })

  it("/sessions/new warms the draft named by ?edit=", async () => {
    const { Route } = await import("@/routes/_dashboard/sessions/new")

    expect(
      keysPrefetchedBy(Route.options.loader, { deps: { edit: "draft-3" } })
    ).toStrictEqual([sessionQuery("draft-3").queryKey])
  })

  it("/sessions/new fetches nothing without ?edit=", async () => {
    const { Route } = await import("@/routes/_dashboard/sessions/new")

    // A blank composer has nothing to warm: `sessionQuery("")` would cache
    // a permanently-disabled query.
    expect(
      keysPrefetchedBy(Route.options.loader, { deps: { edit: undefined } })
    ).toStrictEqual([])
  })

  it("keeps ?edit= in loaderDeps, so two drafts are two loads", async () => {
    const { Route } = await import("@/routes/_dashboard/sessions/new")
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
