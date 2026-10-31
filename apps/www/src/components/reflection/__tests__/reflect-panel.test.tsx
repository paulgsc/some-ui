/**
 * @vitest-environment jsdom
 *
 * Reflecting on a session: a typed line and the one-tap answers are kept
 * with the session's ID and the moment, and there is always room for another
 * (LA16: the phone keeps an offline set, and home the written ones).
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

// On the phone the panel also records voice; that is its own module's test.
vi.mock("@/components/reflection/device-reflection-voice", () => ({
  DeviceReflectionVoice: (): null => null,
}))

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
  vi.unstubAllEnvs()
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
    expect(screen.getByText(/1 kept · kept in this browser/)).toBeTruthy()
  })

  it("takes another however many are kept, typed or tapped", () => {
    fill(REFLECTION_LIMIT * 2)
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={1_000} />))

    fireEvent.change(screen.getByLabelText("Type a reflection"), {
      target: { value: "one more" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Keep" }))
    const energy = screen.getByRole("group", { name: "Energy" })
    fireEvent.click(within(energy).getByRole("button", { name: "Keen" }))

    expect(screen.queryByRole("alert")).toBeNull()
    expect(reflections.getSnapshot().kept).toHaveLength(
      REFLECTION_LIMIT * 2 + 2
    )
  })

  it("says on the phone that the written ones go to home, and offers no share", () => {
    vi.stubEnv("VITE_DEVICE_BACKEND", "true")
    reflections.keep({
      id: "now",
      sessionId: "s1",
      createdAt: "2026-10-10T09:00:00.000Z",
      atMs: 252_000,
      body: { kind: "text", text: "particles" },
    })
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={300_000} />))

    expect(screen.getByText(/written ones go to home/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /share/i })).toBeNull()
    expect(
      screen.getByRole("button", { name: "Let go of the one at 4:12" })
    ).toBeTruthy()
  })
})
