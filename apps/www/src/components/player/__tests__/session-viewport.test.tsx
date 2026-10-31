/**
 * @vitest-environment jsdom
 *
 * The viewport is the only writer of the session context store; leaving it
 * must not leave the store saying a session is live or the editor is open.
 */

import type { JSX } from "react"
import { withQueryClient } from "@/test-support/query-client"
import { sessionRecord } from "@/test-support/session-record"
import { playingActivities } from "@/test-support/session-stop"
import type * as ReactHooks from "@some-ui/react-hooks"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as Orchestrator from "@/lib/orchestrator"
import { useSessionKey, useSuspended } from "@/lib/orchestrator"
import { SessionViewport } from "@/components/player/session-viewport"

vi.mock("@some-ui/react-hooks", async () => ({
  ...(await vi.importActual<typeof ReactHooks>("@some-ui/react-hooks")),
  useIsMobile: (): boolean => false,
}))

vi.mock("@/lib/orchestrator", async () => ({
  ...(await vi.importActual<typeof Orchestrator>("@/lib/orchestrator")),
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
}))

vi.mock("wireframes", () => ({
  OrchestratedYouTubeViewport: (): JSX.Element => <div />,
  LiveEditOverlay: (): JSX.Element => <div />,
  applyIntent: (tree: unknown): unknown => tree,
}))

const Context = (): JSX.Element => (
  <output data-testid="context">
    {`${useSessionKey() ?? "none"}/${String(useSuspended())}`}
  </output>
)

afterEach(cleanup)

describe("SessionViewport and the session context", () => {
  it("releases the session and the editor when it unmounts mid-edit", () => {
    const viewport = render(
      withQueryClient(
        <SessionViewport
          session={sessionRecord({
            id: "session-1",
            name: "Context test",
            status: "active",
            totalDurationMs: 60_000,
          })}
          activities={playingActivities}
        />
      )
    )
    act(() => screen.getByText(/edit layout/i).click())
    render(<Context />)
    expect(screen.getByTestId("context").textContent).toBe("session-1/true")

    viewport.unmount()

    expect(screen.getByTestId("context").textContent).toBe("none/false")
  })
})
