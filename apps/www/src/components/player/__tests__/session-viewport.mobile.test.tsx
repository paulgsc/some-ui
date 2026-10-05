/**
 * @vitest-environment jsdom
 *
 * The layout editor is desktop-only (keyboard, right-click and hover): on a
 * phone, no editor button and no inset frame. The viewport content and the
 * registry are stubbed; under test is the chrome painted around them.
 */

import type { JSX } from "react"
import { withQueryClient } from "@/test-support/query-client"
import { sessionRecord } from "@/test-support/session-record"
import { cleanup, render, screen } from "@testing-library/react"
import type * as SomeUiUtils from "some-ui-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SessionViewport } from "@/components/player/session-viewport"

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

const mount = (): ReturnType<typeof render> =>
  render(
    withQueryClient(
      <SessionViewport
        session={sessionRecord({
          id: "session-mobile-1",
          name: "Mobile viewport test",
          status: "active",
          totalDurationMs: 60_000,
        })}
      />
    )
  )

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

  // The negative control: the editor still renders where it belongs.
  it("keeps the editor and the frame on a wide screen", () => {
    mobile = false
    const { container } = mount()

    expect(screen.getByText(/edit layout/i)).toBeDefined()
    expect(container.firstElementChild?.className).toContain("rounded-lg")
  })
})
