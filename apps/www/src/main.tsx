import { StrictMode } from "react"
import { AppProviders } from "@/providers"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import ReactDOM from "react-dom/client"

import { ErrorState, NotFound, RoutePending } from "@/components/housekeeping"

// Import the generated route tree
import { routeTree } from "./routeTree.gen"

import "./index.css"

import reportWebVitals from "./reportWebVitals.ts"

// Authored component CSS (plain keyframes/selectors — not Tailwind utilities)
// lives in each package's source next to its component. The single Tailwind
// pass (index.css) regenerates every utility from scanned source but does not
// carry this authored CSS, so pull it straight from package source here, the
// way .storybook/preview.tsx already does. The root `<pkg>/src/index.css`
// entries are excluded: they only `@import` the shared layer that index.css
// already provides.
import.meta.glob(
  [
    "../../../packages/ui/**/src/**/*.css",
    "!../../../packages/ui/**/src/index.css",
  ],
  { eager: true }
)

// Create a new router instance
const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  context: {},
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultStructuralSharing: true,
  defaultPreloadStaleTime: 0,
  // Housekeeping fallbacks applied to every route: 404, error boundary, and a
  // loading skeleton. Individual routes can still override these.
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: ErrorState,
  defaultPendingComponent: RoutePending,
})

// Render the app
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

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
