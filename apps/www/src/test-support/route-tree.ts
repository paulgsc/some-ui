/**
 * The real route tree, read the way the route-tree tests read it: every
 * route's path as a link names it (no trailing slash but "/"), with its id,
 * which names its layouts and gates. Slow to import, so call it from a
 * `beforeAll` with a long timeout.
 */

import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"

export async function routesByPath(): Promise<Map<string, string>> {
  const { routeTree } = await import("@/routeTree.gen")
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
  })
  return new Map(
    Object.entries(router.routesByPath).map(([path, route]) => [
      path.length > 1 ? path.replace(/\/$/, "") : path,
      route.id,
    ])
  )
}
