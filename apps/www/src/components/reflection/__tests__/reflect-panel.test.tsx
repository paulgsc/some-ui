/**
 * @vitest-environment jsdom
 *
 * Reflecting on a session: a typed line and the one-tap answers are kept
 * with the session's ID and the moment.
 */

import { withQueryClient } from "@/test-support/query-client"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reflections } from "@/lib/session-reflection"
import { ReflectPanel } from "@/components/reflection/reflect-panel"

// On the phone the panel also records voice; that is its own module's test.
vi.mock("@/components/reflection/device-reflection-voice", () => ({
  DeviceReflectionVoice: (): null => null,
}))

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

  it("says on the phone that the written ones go to home while paired", () => {
    vi.stubEnv("VITE_DEVICE_BACKEND", "true")
    reflections.keep({
      id: "now",
      sessionId: "s1",
      createdAt: "2026-10-10T09:00:00.000Z",
      atMs: 252_000,
      body: { kind: "text", text: "particles" },
    })
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={300_000} />))

    expect(
      screen.getByText(/written ones go to home while paired/)
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Let go of the one at 4:12" })
    ).toBeTruthy()
  })

  it("asks before letting a written one go, and keeps it on Keep it", () => {
    vi.stubEnv("VITE_DEVICE_BACKEND", "true")
    reflections.keep({
      id: "typed",
      sessionId: "s1",
      createdAt: "2026-10-10T09:00:00.000Z",
      atMs: 252_000,
      body: { kind: "text", text: "particles" },
    })
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={300_000} />))

    const letGo = screen.getByRole("button", {
      name: "Let go of the one at 4:12",
    })
    fireEvent.click(letGo)
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }))
    expect(reflections.getSnapshot().kept).toHaveLength(1)
    fireEvent.click(letGo)
    fireEvent.click(screen.getByRole("button", { name: "Let it go" }))
    expect(reflections.getSnapshot().kept).toHaveLength(0)
  })

  it("lists only the written ones: a spoken one is the take pattern's row", () => {
    reflections.keep({
      id: "said",
      sessionId: "s1",
      createdAt: "2026-10-10T09:00:00.000Z",
      atMs: 1_000,
      body: {
        kind: "voice",
        durationMs: 4_000,
        mimeType: "audio/webm",
        bytes: 3,
      },
    })
    render(withQueryClient(<ReflectPanel sessionId="s1" atMs={300_000} />))
    expect(screen.queryByText(/^Voice ·/)).toBeNull()
  })
})
