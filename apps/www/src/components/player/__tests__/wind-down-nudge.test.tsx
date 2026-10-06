/**
 * @vitest-environment jsdom
 *
 * The wind-down nudge: absent until a session's last minutes, then one pill
 * whose two buttons are "+5 min" (Extend) and "Wrap up" (Stop).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as Orchestrator from "@/lib/orchestrator"
import { WindDownNudge } from "@/components/player/wind-down-nudge"

const extend = vi.fn()
const stop = vi.fn()
let clock = { time_remaining: 0, total_duration: 0 }
let running = true

vi.mock("@/lib/orchestrator", async () => {
  const actual =
    await vi.importActual<typeof Orchestrator>("@/lib/orchestrator")
  return {
    ...actual,
    useIsRunning: (): boolean => running,
    useIsPaused: (): boolean => false,
    useOrchestratorClock: (): typeof clock => clock,
    useOrchestratorStore: (select: (s: unknown) => unknown): unknown =>
      select({ extend, stop }),
  }
})

afterEach(() => {
  cleanup()
  extend.mockClear()
  stop.mockClear()
  running = true
})

const MIN = 60_000

describe("WindDownNudge", () => {
  it("stays away until the last two minutes", () => {
    clock = { time_remaining: 3 * MIN, total_duration: 15 * MIN }
    const { container } = render(<WindDownNudge />)
    expect(container.textContent).toBe("")
  })

  it("counts down, extends by five minutes, or wraps up now", () => {
    clock = { time_remaining: 105_000, total_duration: 15 * MIN }
    render(<WindDownNudge />)

    expect(screen.getByText("1:45 left")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "+5 min" }))
    expect(extend).toHaveBeenCalledWith(5 * MIN)
    fireEvent.click(screen.getByRole("button", { name: "Wrap up" }))
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it("is gone once the session is not live", () => {
    running = false
    clock = { time_remaining: 0, total_duration: 15 * MIN }
    const { container } = render(<WindDownNudge />)
    expect(container.textContent).toBe("")
  })
})
