/**
 * @vitest-environment jsdom
 *
 * The mobile session shell: the activity gets the screen, and everything
 * that is not the activity gets one icon. On a phone the player renders no
 * resident chrome band, which a test that only renders wide cannot see.
 */

import type { JSX, ReactNode } from "react"
import { ThemeProvider } from "@/providers/theme"
import { withQueryClient } from "@/test-support/query-client"
import { SidebarProvider } from "@some-ui/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as Orchestrator from "@/lib/orchestrator"
import { SessionChrome } from "@/components/player/session-chrome"

const pause = vi.fn()
const resume = vi.fn()
const stop = vi.fn()
const skipCurrentScene = vi.fn()

let running = true
let paused = false

// The orchestrator store is faked: this file is about what the chrome renders
// and which command a tap issues.
vi.mock("@/lib/orchestrator", async () => {
  const actual =
    await vi.importActual<typeof Orchestrator>("@/lib/orchestrator")
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
    // A real scene shape: `friendlyActivityName` resolves the registry key
    // through the catalogue, and an empty `ui` would fall back to the raw
    // scene name, proving nothing about the person-facing label.
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
 * The real ancestors of the header controls `SessionChrome` absorbed (sidebar
 * trigger, theme switcher, a query-backed signal), not stubs: this is app
 * chrome, allowed to depend on the app, unlike a registry applet.
 */
function withProviders(node: ReactNode): JSX.Element {
  return withQueryClient(
    <ThemeProvider>
      <SidebarProvider>{node}</SidebarProvider>
    </ThemeProvider>
  )
}

const mount = (): ReturnType<typeof render> =>
  render(withProviders(<SessionChrome scenes={[]} onPlay={vi.fn()} />))

/** Mounts and opens the sheet. */
function open(): void {
  mount()
  fireEvent.click(screen.getByRole("button", { name: /session controls/i }))
}

beforeEach(() => {
  running = true
  paused = false
  // jsdom has no `matchMedia` (`SidebarProvider` reads one); `true` because
  // this component only renders in `LivePlayer`'s phone-width branch.
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
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("SessionChrome", () => {
  it("costs one icon at rest — no resident transport band", () => {
    mount()

    // No jest-dom: `getByRole` throwing when absent is the assertion.
    expect(
      screen.getByRole("button", { name: /session controls/i })
    ).toBeDefined()
    // The transport's buttons are not on screen until asked for.
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /^stop$/i })).toBeNull()
    expect(screen.queryByText(/remaining/i)).toBeNull()
  })

  it("opens onto what is playing and how long is left", () => {
    open()

    expect(screen.getByText("LeetType")).toBeDefined()
    expect(screen.getByText(/remaining/i)).toBeDefined()
  })

  it("issues the transport command the tap names", () => {
    open()

    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }))
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it("closes itself after acting", () => {
    open()
    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }))

    expect(skipCurrentScene).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /^skip$/i })).toBeNull()
  })

  it("offers Resume rather than Pause once paused", () => {
    running = false
    paused = true
    open()

    expect(screen.getByRole("button", { name: /^resume$/i })).toBeDefined()
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull()
  })

  // The theme and audio controls are reachable nowhere else on this route.
  it("still carries the chrome the hidden header was holding", () => {
    open()

    expect(
      screen.getByRole("button", { name: /toggle sidebar/i })
    ).toBeDefined()
    expect(screen.getByRole("button", { name: /theme/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /audio|sound/i })).toBeDefined()
  })

  it("gives every control a thumb-sized target", () => {
    open()

    for (const name of [/^pause$/i, /^skip$/i, /^stop$/i]) {
      const control = screen.getByRole("button", { name })
      expect(control.className).toContain("h-11")
      expect(control.className).toContain("w-full")
    }
  })
})
