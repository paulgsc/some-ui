import { TanstackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { keepToMobileSurface } from "@/lib/app-surface"
import { resolveSessionIfChosen } from "@/lib/auth"
import { AccountRouteGuard } from "@/components/auth/account-route-guard"

/**
 * What every route's `loader` is handed: the app's single `queryClient`
 * (`providers/tanstack-query.tsx`), so loaders prefetch into the cache the
 * components read.
 */
export type RouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ location }) => {
    // The Android app is sessions only; first, so no other page's own guard
    // (sign-in, an audience gate) runs for a path the phone never shows.
    keepToMobileSurface(location.pathname)
    // No route waits for a session: a returning account user's is checked
    // in the background (once per load), and account-only pages check it
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
            // Not a bottom corner: on a phone that is the tab bar, and the
            // trigger swallowed its first tab's taps.
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
