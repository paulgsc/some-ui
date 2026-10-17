/**
 * @vitest-environment jsdom
 *
 * Reflecting on a session: a typed line and the one-tap answers are kept
 * with the session's ID and the moment, and a full phone offers the way out
 * (let go) instead of a place to add another.
 */

import { withQueryClient } from "@/test-support/query-client"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { REFLECTION_LIMIT, reflections } from "@/lib/session-reflection"
import { ReflectPanel } from "@/components/reflection/reflect-panel"

function fill(count: number, sessionId = "older"): void {
  for (let i = 0; i < count; i++)
    reflections.keep({
      id: `r${i}`,
      sessionId,
      createdAt: "2026-09-01T00:00:00.000Z",
      atMs: null,
      body: { kind: "text", text: `line ${i}` },
    })
}

beforeEach(() => {
  localStorage.clear()
  reflections.letGo(reflections.getSnapshot().kept.map((r) => r.id))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("ReflectPanel", () => {
  it("keeps a typed line with the session and the moment, and lists it", () => {
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={570_000} />))

    fireEvent.change(screen.getByLabelText("Type a reflection"), {
      target: { value: "  이/가 keeps tripping me " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Keep" }))

    expect(reflections.getSnapshot().kept).toMatchObject([
      {
        sessionId: "s1",
        atMs: 570_000,
        body: { kind: "text", text: "이/가 keeps tripping me" },
      },
    ])
    expect(screen.getByText("9:30")).toBeTruthy()
    expect(screen.getByText(/1 of 20 kept/)).toBeTruthy()
  })

  it("offers letting go instead of a new one once every slot is taken", () => {
    fill(REFLECTION_LIMIT)
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={1_000} />))

    expect(screen.getByText("Time to hand these off")).toBeTruthy()
    expect(screen.queryByLabelText("Type a reflection")).toBeNull()
    expect(screen.getByText("stale")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /let go/i }))
    const sheet = screen.getByRole("dialog")
    expect(reflections.getSnapshot().kept).toHaveLength(REFLECTION_LIMIT)
    fireEvent.click(within(sheet).getByRole("button", { name: "Let go" }))

    expect(reflections.getSnapshot().kept).toEqual([])
    expect(screen.getByLabelText("Type a reflection")).toBeTruthy()
  })

  it("says so when an answer has no slot", () => {
    fill(REFLECTION_LIMIT)
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={null} />))

    const energy = screen.getByRole("group", { name: "Energy" })
    fireEvent.click(within(energy).getByRole("button", { name: "Keen" }))

    expect(screen.getByRole("alert").textContent).toMatch(/no room/i)
  })
})
