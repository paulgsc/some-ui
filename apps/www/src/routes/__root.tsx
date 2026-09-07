import { TanstackDevtools } from "@tanstack/react-devtools"
import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  Outlet,
  redirect,
} from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"

import { hasDecorativeSession } from "@/lib/auth-session"

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
    // The router's own basepath rewrite preserves a trailing slash (it
    // only strips the basepath prefix), and GitHub Pages' /resume/index.html
    // shell (see vite.config.ts's build.rolldownOptions.input) is the
    // canonical, publicly-shared résumé URL - with the slash. A bare
    // string match against "/resume" would pass every in-app navigation
    // (which the router's default trailingSlash: "never" always produces
    // without one) but fail a fresh visitor's first hit on that exact
    // canonical link, redirecting them to /auth instead of the résumé they
    // followed. Stripping a single trailing slash before comparing (never
    // for "/" itself, which has nothing left to strip) matches that
    // default instead of special-casing "/resume/" alone.
    const normalizedPathname =
      location.pathname !== "/" && location.pathname.endsWith("/")
        ? location.pathname.slice(0, -1)
        : location.pathname
    const isPublicRoute =
      normalizedPathname === "/" ||
      normalizedPathname === "/auth" ||
      normalizedPathname === "/resume"
    if (!isPublicRoute && !hasDecorativeSession()) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      })
    }
  },
  component: () => (
    <>
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
