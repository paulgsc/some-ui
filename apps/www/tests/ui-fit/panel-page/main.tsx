/**
 * The ui-fit panel page (`../panel-fit.spec.ts`): mounts one fixture
 * (`?panel=<id>`, ./fixtures.tsx) in a rect shaped like a session leaf, with
 * www's own providers and stylesheets, so the sweep measures panels against
 * the CSS the app ships rather than a separate pipeline's copy of it.
 *
 * Built only on request (`pnpm --filter www build:fit`, which sets
 * `WWW_FIT_HARNESS`; vite.config.ts), into `dist-fit/`. No shipped build has
 * this entry. With no `?panel`, the page lists the ids it knows, so the sweep
 * can tell a stale build from a renamed fixture.
 */

import type { JSX, ReactNode } from "react"
import { StrictMode, Suspense } from "react"
import { QueryProvider } from "@/providers/tanstack-query"
import { ThemeProvider } from "@/providers/theme"
import { AppToaster } from "@/providers/toaster"
import ReactDOM from "react-dom/client"

import "@/index.css"

import { isPanelId, PANEL_FIXTURES, PANEL_IDS } from "./fixtures"

// The authored component CSS www's own entry loads (src/main.tsx), with the
// same globs: keep the two in step. It lives in each entry rather than in a
// shared module because `treeshake.moduleSideEffects: false` drops a module
// imported only for its side effects, globbed stylesheets included.
import.meta.glob(
  [
    "../../../../../packages/ui/**/src/**/*.css",
    "!../../../../../packages/ui/**/src/index.css",
  ],
  { eager: true }
)

/**
 * The rect a session grants a panel, shaped the way `RenderSolved`
 * (packages/ui/wireframes) shapes a leaf: an absolute box that clips, and a
 * full-size box inside it that the panel fills. The sweep measures from the
 * inner box (`data-fit-slot`), so content that would paint outside the leaf
 * is seen rather than clipped from view.
 */
const Leaf = ({ children }: { children: ReactNode }): JSX.Element => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <div
      data-fit-slot=""
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  </div>
)

const PanelPage = ({ id }: { id: string | null }): JSX.Element => {
  if (id === null) {
    return (
      <ul data-fit-panels="">
        {PANEL_IDS.map((panel) => (
          <li key={panel}>{panel}</li>
        ))}
      </ul>
    )
  }
  // An unknown id renders an empty slot, which the sweep reports as a panel
  // that rendered nothing.
  const Fixture = isPanelId(id) ? PANEL_FIXTURES[id] : null
  return <Leaf>{Fixture && <Fixture />}</Leaf>
}

const rootElement = document.getElementById("app")
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider>
        <QueryProvider>
          <PanelPage id={new URLSearchParams(location.search).get("panel")} />
        </QueryProvider>
        <AppToaster />
      </ThemeProvider>
    </StrictMode>
  )
}
