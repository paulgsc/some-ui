import { TanstackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { isPublicPath, resolveSession } from "@/lib/auth"
import { SignedOutRedirect } from "@/components/auth/signed-out-redirect"

/**
 * What every route's `loader` is handed. The `queryClient` is the app's single
 * client (`providers/tanstack-query.tsx`), passed in at `createRouter` so a
 * loader can prefetch into the same cache the components read from — the
 * router's own type checking is what guarantees the two cannot drift apart.
 */
export type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    const isPublicRoute = isPublicPath(location.pathname)
    // Asked once per page load, then answered from memory
    // (`lib/auth`). A public route does not wait for the answer,
    // but still asks, so `"/"` can swap to the signed-in landing in place.
    if (isPublicRoute) {
      void resolveSession()
      return
    }
    if (!(await resolveSession())) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      })
    }
  },
  component: () => (
    <>
      <SignedOutRedirect />
      <Outlet />
      {/* Vite strips this whole block (and its two devtools deps) from the
          production bundle - without the guard it also renders on the
          deployed GitHub Pages site, which is what happened before. */}
      {import.meta.env.DEV && (
        <TanstackDevtools
          config={{
            position: "bottom-left",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      )}
    </>
  ),
})
