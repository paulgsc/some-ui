/**
 * @vitest-environment jsdom
 *
 * The layout editor is desktop-only, and this is the tripwire for it coming
 * back to a phone.
 *
 * Every gesture the editor offers assumes hardware a phone does not have —
 * `E` needs a keyboard, resize needs a right-click, retopologising needs a
 * hovering pointer. What leaked through before this was a button advertising
 * a mode that could not be entered, sitting on top of an activity that had
 * been inset and squeezed to make room for a frame nobody could edit.
 *
 * `OrchestratedYouTubeViewport` and the registry are stubbed: what is under
 * test is which chrome this component paints around them, not what they
 * render.
 */

import type { JSX, ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import type * as SomeUiUtils from "some-ui-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { SessionRecord } from "@/lib/tenant"

import { SessionViewport } from "./session-viewport"

let mobile = true

vi.mock("some-ui-utils", async () => {
  const actual = await vi.importActual<typeof SomeUiUtils>("some-ui-utils")
  return {
    ...actual,
    useIsMobile: (): boolean => mobile,
    useSceneLifetimes: (): Array<unknown> => [
      {
        kind: {
          Scene: {
            scene_name: "leetype",
            ui: [{ panels: { mainContent: { registry_key: "leetype" } } }],
          },
        },
      },
    ],
    useSessionKey: (): string => "session-mobile-1",
    useSuspended: (): boolean => false,
    setSessionKey: (): void => {},
    setSuspended: (): void => {},
  }
})

vi.mock("wireframes", () => ({
  OrchestratedYouTubeViewport: (): JSX.Element => (
    <div data-testid="viewport-content" />
  ),
  LiveEditOverlay: (): JSX.Element => <div data-testid="live-edit-overlay" />,
  applyIntent: (tree: unknown): unknown => tree,
}))

function fixtureSession(): SessionRecord {
  return {
    id: "session-mobile-1",
    name: "Mobile viewport test",
    status: "active",
    activities: [],
    scenes: [],
    layoutMode: "basic",
    totalDurationMs: 60_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }
}

function withQueryClient(node: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

const mount = (): ReturnType<typeof render> =>
  render(withQueryClient(<SessionViewport session={fixtureSession()} />))

beforeEach(() => {
  mobile = true
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("SessionViewport on a phone", () => {
  it("offers no way into the layout editor", () => {
    mount()

    expect(screen.queryByText(/edit layout/i)).toBeNull()
    expect(screen.queryByTestId("live-edit-overlay")).toBeNull()
  })

  it("is full-bleed — no frame inset from the edges of the screen", () => {
    const { container } = mount()
    const frame = container.firstElementChild

    expect(frame?.className).not.toContain("rounded-lg")
    expect(frame?.className).not.toContain("border")
  })

  it("still renders the activity", () => {
    mount()
    expect(screen.getByTestId("viewport-content")).toBeDefined()
  })

  // The negative control. Without it, all three assertions above would pass
  // just as well against a component that had simply stopped rendering its
  // editor at every width.
  it("keeps the editor and the frame on a wide screen", () => {
    mobile = false
    const { container } = mount()

    expect(screen.getByText(/edit layout/i)).toBeDefined()
    expect(container.firstElementChild?.className).toContain("rounded-lg")
  })
})
