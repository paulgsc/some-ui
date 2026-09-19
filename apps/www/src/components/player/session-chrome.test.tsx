/**
 * @vitest-environment jsdom
 *
 * The mobile session shell: the activity gets the screen, and everything
 * that is not the activity gets one icon.
 *
 * What is pinned here is the thing a later refactor is most likely to undo
 * by accident — that on a phone the session player renders *no* resident
 * chrome band and *no* layout-editor affordance. Both were desktop
 * assumptions leaking through a route that had never been looked at below
 * 768px, and both are invisible in a test that only ever renders wide.
 */

import type { JSX, ReactNode } from "react"
import { ThemeProvider } from "@/providers/theme"
import { SidebarProvider } from "@some-ui/shared"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type * as SomeUiUtils from "some-ui-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SessionChrome } from "./session-chrome"

const pause = vi.fn()
const resume = vi.fn()
const stop = vi.fn()
const skipCurrentScene = vi.fn()

let running = true
let paused = false

// The orchestrator is a global store driven by a clock; this file is about
// what the chrome renders and which command a tap issues, so the store is
// faked and the assertions are about the seam between them.
vi.mock("some-ui-utils", async () => {
  const actual = await vi.importActual<typeof SomeUiUtils>("some-ui-utils")
  return {
    ...actual,
    useIsRunning: (): boolean => running,
    useIsPaused: (): boolean => paused,
    useOrchestratorClock: (): {
      current_time: number
      time_remaining: number
    } => ({
      current_time: 30_000,
      time_remaining: 554_000,
    }),
    // A real scene shape, not a bare name: `friendlyActivityName` resolves
    // the *registry key* through the activity catalogue, so a fixture with an
    // empty `ui` would silently fall back to the raw scene name and this file
    // would stop proving the sheet shows a person-facing label at all.
    usePrimaryScene: (): unknown => ({
      kind: {
        Scene: {
          scene_name: "leetype",
          ui: [{ panels: { mainContent: { registry_key: "leetype" } } }],
        },
      },
    }),
    useOrchestratorStore: (select: (s: unknown) => unknown): unknown =>
      select({ pause, resume, stop, skipCurrentScene }),
  }
})

/**
 * Three providers, none of them scaffolding.
 *
 * `SessionChrome` inherited each one by absorbing a control the dashboard
 * header used to own — the sidebar trigger needs `SidebarProvider`, the
 * theme switcher needs `ThemeProvider`, the migration signal needs a query
 * client — and all three are ancestors in the app, since the session player
 * renders inside `SidebarInset` under the root providers.
 *
 * Wrapping them here rather than stubbing the three controls keeps that
 * dependency honest: this component is not context-free, and if one of these
 * ever stops being an ancestor, this is the shape that breaks. Worth knowing,
 * because the registry's own rule for *applets* is the opposite (render with
 * no ambient context) — this is app chrome, not an applet, and is allowed to
 * depend on the app.
 */
function withProviders(node: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SidebarProvider>{node}</SidebarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const mount = (): ReturnType<typeof render> =>
  render(withProviders(<SessionChrome scenes={[]} onPlay={vi.fn()} />))

beforeEach(() => {
  running = true
  paused = false
  // jsdom implements no `matchMedia`, and `SidebarProvider` reads one
  // through `useIsMobile`. Answered `true` because that is the only
  // condition this component renders under at all — it is the phone-width
  // branch of `LivePlayer`.
  const matchMedia = (query: string): MediaQueryList => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    addListener: (): void => {},
    removeListener: (): void => {},
    dispatchEvent: (): boolean => false,
  })
  vi.stubGlobal("matchMedia", matchMedia)
})

afterEach(() => {
  // No global cleanup in this app's vitest setup — see the sibling component
  // tests, which each do the same.
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("SessionChrome", () => {
  it("costs one icon at rest — no resident transport band", () => {
    mount()

    // No jest-dom in this app's vitest setup, so `getByRole` throwing when
    // absent is the assertion — a plain `toBeDefined` on the returned node
    // is what the sibling component tests use.
    expect(
      screen.getByRole("button", { name: /session controls/i })
    ).toBeDefined()
    // The desktop transport's buttons must not be on screen until asked for;
    // a folded control that still paints its contents has folded nothing.
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /^stop$/i })).toBeNull()
    expect(screen.queryByText(/remaining/i)).toBeNull()
  })

  it("opens onto what is playing and how long is left", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: /session controls/i }))

    expect(screen.getByText("LeetType")).toBeDefined()
    expect(screen.getByText(/remaining/i)).toBeDefined()
  })

  it("issues the transport command the tap names", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: /session controls/i }))

    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }))
    expect(pause).toHaveBeenCalledTimes(1)
  })

  // A person who taps Pause wants the activity back, not the menu they used
  // to pause it.
  it("closes itself after acting", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: /session controls/i }))
    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }))

    expect(skipCurrentScene).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /^skip$/i })).toBeNull()
  })

  it("offers Resume rather than Pause once paused", () => {
    running = false
    paused = true
    mount()
    fireEvent.click(screen.getByRole("button", { name: /session controls/i }))

    expect(screen.getByRole("button", { name: /^resume$/i })).toBeDefined()
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull()
  })

  // Folding the header must not drop what it carried. The theme and audio
  // controls are the only places in the app a person can reach either, and
  // this route stops rendering the header that normally holds them.
  it("still carries the chrome the hidden header was holding", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: /session controls/i }))

    expect(
      screen.getByRole("button", { name: /toggle sidebar/i })
    ).toBeDefined()
    expect(screen.getByRole("button", { name: /theme/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /audio|sound/i })).toBeDefined()
  })

  it("gives every control a thumb-sized target", () => {
    mount()
    fireEvent.click(screen.getByRole("button", { name: /session controls/i }))

    for (const name of [/^pause$/i, /^skip$/i, /^stop$/i]) {
      const control = screen.getByRole("button", { name })
      expect(control.className).toContain("h-11")
      expect(control.className).toContain("w-full")
    }
  })
})
