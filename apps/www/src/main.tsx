import { StrictMode } from "react"
import { AppProviders } from "@/providers"
import { queryClient } from "@/providers/tanstack-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"

import { bootDeviceBackend } from "@/lib/device-backend/boot"
import { releasePushWhenLeavingTheAccount } from "@/lib/study-nudge/leave-account"
import { ErrorState, NotFound, RoutePending } from "@/components/housekeeping"

import { routeTree } from "./routeTree.gen"

import "./index.css"

import reportWebVitals from "./reportWebVitals.ts"

// Authored component CSS (plain keyframes/selectors) lives beside each
// package's components, and the Tailwind pass (index.css) does not carry it,
// so pull it from package source. Root `<pkg>/src/index.css` entries only
// `@import` the shared layer index.css has. The ui-fit panel page
// (tests/ui-fit/panel-page/main.tsx) repeats these globs: keep the two in step.
import.meta.glob(
  [
    "../../../packages/ui/**/src/**/*.css",
    "!../../../packages/ui/**/src/index.css",
  ],
  { eager: true }
)

// The device build answers `file_host` in-process; that has to be in place
// before the app renders and anything issues a request. A no-op elsewhere.
bootDeviceBackend()

// A browser subscribed to push while signed in must not stay subscribed once
// the learner's data is no longer the account's. No request is made to do it.
releasePushWhenLeavingTheAccount()

const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  // Handed to every route's `loader` to prefetch into the components' cache
  // (`routes/__root.tsx`'s RouterContext).
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  // Zero: React Query owns caching. Loaders call `prefetchQuery`, which skips
  // a fresh query and dedupes one in flight.
  defaultPreloadStaleTime: 0,
  // 404, error boundary and loading skeleton for every route, overridable.
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: ErrorState,
  defaultPendingComponent: RoutePending,
})

const rootElement = document.getElementById("app")
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>
  )
}

reportWebVitals()
