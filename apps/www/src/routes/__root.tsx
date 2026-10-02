import { TanstackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { keepToMobileSurface } from "@/lib/app-surface"
import { resolveSessionIfChosen } from "@/lib/auth"
import { AccountRouteGuard } from "@/components/auth/account-route-guard"

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
  beforeLoad: ({ location }) => {
    // The Android app is sessions only; first, so no other page's own guard
    // (sign-in, an audience gate) runs for a path the phone never shows.
    keepToMobileSurface(location.pathname)
    // Learning on the device needs no session, so no route waits for one and
    // nothing is asked of a server to let someone in. A returning account
    // user's session is checked in the background (once per page load, then
    // answered from memory); the pages that really are the account's check it
    // themselves (`requireAccount`, `routes/_dashboard/_lan.tsx`).
    void resolveSessionIfChosen()
  },
  component: () => (
    <>
      <AccountRouteGuard />
      <Outlet />
      {/* Vite strips this whole block (and its two devtools deps) from the
          production bundle - without the guard it also renders on the
          deployed GitHub Pages site, which is what happened before. */}
      {import.meta.env.DEV && (
        <TanstackDevtools
          config={{
            // Not a bottom corner: on a phone the bottom edge is the tab bar
            // (the composer's, the lesson CRM's), and this trigger sat on its
            // first tab and swallowed the tap. The header's far side is empty
            // at every width.
            position: "top-right",
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
