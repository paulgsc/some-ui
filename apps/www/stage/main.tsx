/**
 * The recording stage (`pnpm --filter www build:stage`): the five pages the
 * recorders capture (`tests/record`), `/call`, `/essay`, `/report`,
 * `/playoff-delta` and `/burn-ins`, and nothing else of the app
 * (infra/render/Dockerfile). RI2
 * (`src/lib/render-image/__tests__/stage-routes.test.ts`) reads `stageRoutes`
 * below and fails a recorder that opens a page it does not list.
 *
 * The routes are www's own route files, under a bare root: the same search
 * validation and the same stages, through the web surface's door (A4,
 * packages/some-vite-config/AUDIENCES.md). The root leaves out the app's
 * sign-in and phone guards, and the providers are only the ones a stage
 * depends on: the theme, for its look, and the query client its reads go
 * through (`@some-ui/fetch-kit`'s `useResource`).
 */

import { StrictMode } from "react"
import { QueryProvider } from "@/providers/tanstack-query"
import { ThemeProvider } from "@/providers/theme"
import { Route as BurnInsRoute } from "@/routes/burn-ins"
import { Route as CallRoute } from "@/routes/call"
import { Route as EssayRoute } from "@/routes/essay"
import { Route as PlayoffDeltaRoute } from "@/routes/playoff-delta"
import { Route as ReportRoute } from "@/routes/report"
import {
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router"
import ReactDOM from "react-dom/client"

import { NotFound } from "@/components/housekeeping"

import "@/index.css"

// The authored component CSS www's own entry loads (src/main.tsx), with the
// same globs: keep the two in step (the ui-fit panel page repeats them too,
// and says why each entry carries its own).
import.meta.glob(
  [
    "../../../packages/ui/**/src/**/*.css",
    "!../../../packages/ui/**/src/index.css",
  ],
  { eager: true }
)

const rootRoute = createRootRoute({ component: Outlet })

const stageRoutes = [
  [CallRoute, "/call"],
  [EssayRoute, "/essay"],
  [ReportRoute, "/report"],
  [PlayoffDeltaRoute, "/playoff-delta"],
  [BurnInsRoute, "/burn-ins"],
] as const

const routeTree = rootRoute.addChildren(
  stageRoutes.map(([route, path]) =>
    route.update(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-explicit-any -- as src/routeTree.gen.ts mounts the same routes
      { id: path, path, getParentRoute: () => rootRoute } as any
    )
  )
)

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFound,
})

const rootElement = document.getElementById("app")
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider>
        <QueryProvider>
          <RouterProvider router={router} />
        </QueryProvider>
      </ThemeProvider>
    </StrictMode>
  )
}
