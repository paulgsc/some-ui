/**
 * The ui-fit phone page (`../studio-fit.spec.ts`): mounts one fixture
 * (`?panel=<id>`, ./fixtures.tsx) in the room the Android app's shell gives
 * a document route, with www's stylesheets and the providers a screen's
 * layout can depend on. The same shape as the panel page (`../panel-page`),
 * which says why the rest of `AppProviders` is left out.
 *
 * Built by `pnpm --filter www build:fit-phone` into `out/ui-fit-phone/`;
 * `FIT_PHONE_PAGE` (build.profiles.ts) says why it is its own build.
 */

import type { JSX, ReactNode } from "react"
import { StrictMode, Suspense } from "react"
import { QueryProvider } from "@/providers/tanstack-query"
import { ThemeProvider } from "@/providers/theme"
import { AppToaster } from "@/providers/toaster"
import ReactDOM from "react-dom/client"

import "@/index.css"

import { isPhoneId, PHONE_FIXTURES } from "./fixtures"

// The authored component CSS www's own entry loads (src/main.tsx), with the
// same globs: keep the two in step (../panel-page/main.tsx says why each
// entry carries its own copy).
import.meta.glob(
  [
    "../../../../../packages/ui/**/src/**/*.css",
    "!../../../../../packages/ui/**/src/index.css",
  ],
  { eager: true }
)

/** The shell's header (`h-14`, src/routes/_dashboard.tsx). */
const HEADER_PX = 56

/**
 * The phone's bar along the bottom and its bottom margin (`h-[4.5rem]` and
 * `mb-[0.75rem]`, src/components/mobile-shell), a sibling below the body in
 * the shell's column.
 */
const NAV_PX = 72 + 12

/** The body's padding: `p-4 sm:p-6`, and `sm` is 640px wide. */
const bodyPadding = (): number => (window.innerWidth >= 640 ? 24 : 16)

/**
 * The room the shell gives an ordinary document route on the phone
 * (src/routes/_dashboard.tsx): a column the size of the screen, the header
 * above, the bar below, and between them a body that scrolls as a page
 * (scroll-intent: page), both ways as the shell's `overflow-auto` does. The
 * sweep measures from the column (`data-fit-slot`), so a box in it that
 * holds more than its own height is seen; the body's scroll down is the
 * route's own and not an overflow. Its scroll across is: a screen wider than
 * the phone sizes to its content and leaks nothing, so only the body, which
 * the sweep reads for its page intent (`wide` in `findViolations`), shows
 * it. Inline styles, not utilities: this directory is outside www's
 * Tailwind sources (style.context.ts).
 */
const Phone = ({ children }: { children: ReactNode }): JSX.Element => (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <div
      data-fit-slot=""
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
      <div style={{ height: HEADER_PX, flexShrink: 0 }} />
      <div
        data-scroll-intent="page"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: bodyPadding(),
        }}
      >
        <Suspense fallback={null}>{children}</Suspense>
      </div>
      <div style={{ height: NAV_PX, flexShrink: 0 }} />
    </div>
  </div>
)

// An unknown id renders an empty slot, which the sweep reports as a
// fixture that rendered nothing.
const PhonePage = ({ id }: { id: string | null }): JSX.Element => {
  const Fixture = isPhoneId(id) ? PHONE_FIXTURES[id] : null
  return <Phone>{Fixture && <Fixture />}</Phone>
}

const rootElement = document.getElementById("app")
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <StrictMode>
      <ThemeProvider>
        <QueryProvider>
          <PhonePage id={new URLSearchParams(location.search).get("panel")} />
        </QueryProvider>
        <AppToaster />
      </ThemeProvider>
    </StrictMode>
  )
}
