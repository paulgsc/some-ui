/**
 * @vitest-environment jsdom
 *
 * The study list says what waits to be handed off, and each card which of
 * its session's reflections wait, or that they were shared.
 */

import { withQueryClient } from "@/test-support/query-client"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { reflections } from "@/lib/session-reflection"
import { HandOff } from "@/components/reflection/hand-off"
import { HandOffStrip } from "@/components/reflection/hand-off-strip"
import { SessionReflectionsRow } from "@/components/reflection/session-reflections-row"

beforeEach(() => {
  localStorage.clear()
  reflections.letGo(reflections.getSnapshot().kept.map((r) => r.id))
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

function keep(id: string, sessionId: string, createdAt: string): void {
  reflections.keep({
    id,
    sessionId,
    createdAt,
    atMs: null,
    body: { kind: "text", text: id },
  })
}

describe("HandOffStrip", () => {
  it("is absent with nothing kept", () => {
    const { container } = render(withQueryClient(<HandOffStrip />))
    expect(container.textContent).toBe("")
  })

  it("counts what is kept across sessions", () => {
    keep("a", "s1", new Date().toISOString())
    keep("b", "s2", new Date().toISOString())

    render(withQueryClient(<HandOffStrip />))

    expect(screen.getByText(/2 kept · oldest today/)).toBeTruthy()
  })
})

describe("HandOff", () => {
  it("counts every reflection a session holds, names those set aside, and says so before letting them go", () => {
    vi.stubEnv("VITE_DEVICE_BACKEND", "true")
    keep("a", "s1", new Date().toISOString())
    for (const id of ["v1", "v2"]) {
      reflections.keep({
        id,
        sessionId: "s1",
        createdAt: new Date().toISOString(),
        atMs: null,
        body: {
          kind: "voice",
          durationMs: 3_000,
          mimeType: "audio/webm",
          bytes: 3,
        },
      })
    }
    reflections.standAside("v1", "set-aside")
    reflections.standAside("v2", "earlier")

    render(withQueryClient(<HandOff />))

    expect(screen.getByText(/3 reflections, 2 set aside ·/)).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", { name: /^Let go of the reflections/ })
    )
    expect(
      screen.getByText(
        /including 2 set aside or recorded again\. They won't be shared/
      )
    ).toBeTruthy()
  })
})

describe("SessionReflectionsRow", () => {
  it("counts only those in the session's view: one recorded again or set aside is kept, not counted", () => {
    keep("a", "s1", new Date().toISOString())
    reflections.keep({
      id: "aside",
      sessionId: "s1",
      createdAt: new Date().toISOString(),
      atMs: null,
      body: {
        kind: "voice",
        durationMs: 3_000,
        mimeType: "audio/webm",
        bytes: 3,
      },
    })
    reflections.standAside("aside", "set-aside")

    render(<SessionReflectionsRow sessionId="s1" finished />)

    expect(screen.getByText(/1 reflection ·/)).toBeTruthy()
    expect(reflections.getSnapshot().kept).toHaveLength(2)
  })

  it("says how many are kept for this session and that they are stale", () => {
    keep("a", "s1", "2026-01-01T00:00:00.000Z")
    keep("b", "s2", new Date().toISOString())

    render(<SessionReflectionsRow sessionId="s1" finished />)

    expect(screen.getByText(/1 reflection ·/)).toBeTruthy()
    expect(screen.getByText("stale")).toBeTruthy()
  })

  it("says they were shared once none wait", () => {
    reflections.markShared(["s1"])
    render(<SessionReflectionsRow sessionId="s1" finished />)
    expect(screen.getByText(/Reflections shared/)).toBeTruthy()
  })

  it("says there are none for a finished session, and nothing for a draft", () => {
    const { rerender, container } = render(
      <SessionReflectionsRow sessionId="s1" finished />
    )
    expect(screen.getByText("No reflections")).toBeTruthy()
    rerender(<SessionReflectionsRow sessionId="s1" finished={false} />)
    expect(container.textContent).toBe("")
  })
})
