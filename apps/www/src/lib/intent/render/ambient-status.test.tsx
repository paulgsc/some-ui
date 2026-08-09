/**
 * @vitest-environment jsdom
 */

import { failed, idle, succeeded, working } from "@some-ui/intent-kit"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AmbientIntentStatus } from "./ambient-status"

afterEach(() => {
  cleanup()
})

describe("AmbientIntentStatus", () => {
  it("idle, working, succeeded: renders nothing - ambient means quiet progress", () => {
    for (const state of [idle(), working(), succeeded("x")] as const) {
      const { container, unmount } = render(
        <AmbientIntentStatus state={state} />
      )
      expect(container.textContent).toBe("")
      unmount()
    }
  })

  it("failed: renders a persistent status affordance, not nothing - ambient may be quiet, never silent", () => {
    render(
      <AmbientIntentStatus
        state={failed(
          {
            kind: "unreachable",
            retryable: true,
            summary: "Some sessions are still local.",
            cause: null,
          },
          vi.fn()
        )}
      />
    )

    const status = screen.getByRole("status")
    expect(status.textContent).toContain("Some sessions are still local.")
  })

  it("failed and retryable: offers a retry control wired to the intent's own retry", () => {
    const retry = vi.fn()
    render(
      <AmbientIntentStatus
        state={failed(
          {
            kind: "unreachable",
            retryable: true,
            summary: "Failed to sync.",
            cause: null,
          },
          retry
        )}
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("failed and not retryable: no retry control", () => {
    render(
      <AmbientIntentStatus
        state={failed(
          {
            kind: "unavailable",
            retryable: false,
            summary: "Not available here.",
            cause: null,
          },
          vi.fn()
        )}
      />
    )

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
  })
})
