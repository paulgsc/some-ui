/**
 * @vitest-environment jsdom
 *
 * LA11 in Practice's header: the mark says where Practice is kept, and
 * nothing reaches home until its person chose to keep sending; once they
 * did, the mark's watch sends, and says how it went; "Stop sending" adds a
 * stop to the log and nothing more goes.
 */

import { sessionRecord } from "@/test-support/session-record"
import type * as ReactRouterModule from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { HomeCall as NativeCall } from "@/lib/device-backend/native-http"
import { CONSENT_KEY } from "@/lib/home-link/consent-runtime"
import type { SessionRecord } from "@/lib/tenant/types"

const home = vi.hoisted((): { sent: Array<NativeCall> } => ({ sent: [] }))
const SESSION = sessionRecord({
  status: "completed",
  id: "s1",
  updatedAt: "2026-10-18T10:00:00.000Z",
})

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (
    call: NativeCall
  ): Promise<{ status: number; body: string }> => {
    home.sent.push(call)
    return Promise.reject(new Error("no route to host"))
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string | null; lost: boolean }> =>
      Promise.resolve({
        record: JSON.stringify({
          base: "https://home.example/api/v1",
          token: "t",
        }),
        lost: false,
      }),
    write: (): Promise<void> => Promise.resolve(),
    clear: (): Promise<void> => Promise.resolve(),
  },
}))
vi.mock("@/lib/home-link/send", () => ({
  readPhone: (): Promise<unknown> =>
    Promise.resolve({ local: [SESSION], kept: [] }),
}))
vi.mock("@/lib/tenant", () => ({
  useSessions: (): { data: Array<SessionRecord> } => ({ data: [SESSION] }),
}))
vi.mock(
  "@tanstack/react-router",
  async (importOriginal): Promise<typeof ReactRouterModule> => {
    const { withPlainLink } = await import("@/test-support/router-stubs")
    return withPlainLink(await importOriginal<typeof ReactRouterModule>())
  }
)

beforeEach(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
})

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
  home.sent = []
})

async function mount(): Promise<void> {
  const { DeviceHomeGlyph } = await import("@/components/device-home-glyph")
  render(<DeviceHomeGlyph />)
  await act(() => Promise.resolve())
}

const mark = (): HTMLElement =>
  screen.getByRole("button", { name: /Where Practice is kept/ })

function keptBefore(): void {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify([
      {
        seq: 1,
        at: 1,
        pairing: "https://home.example/api/v1",
        kind: "kept",
        scopes: ["sessions", "shelf"],
        said: "yes",
      },
    ])
  )
}

describe("Practice's sharing mark", () => {
  it("says phone only, and sends nothing, until its person keeps sending", async () => {
    await mount()
    expect(mark().textContent).toContain("Phone only")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new Event("online"))
    })
    await act(() => Promise.resolve())
    expect(home.sent).toEqual([])
    fireEvent.click(mark())
    expect(screen.getAllByText("Only on this phone")).toHaveLength(2)
    expect(screen.queryByText("Stop sending...")).toBeNull()
  })

  it("sends once kept, and says when home didn't answer", async () => {
    keptBefore()
    await mount()
    await waitFor(() => expect(home.sent.length).toBeGreaterThan(0))
    await waitFor(() => expect(mark().textContent).toContain("No answer"))
  })

  it("stops sending on the second press, and adds the stop to the log", async () => {
    keptBefore()
    await mount()
    fireEvent.click(mark())
    fireEvent.click(screen.getByRole("button", { name: "Stop sending..." }))
    expect(
      screen.getByText("Stop sending new sessions and kept items to home?")
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Stop sending" }))
    const log: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")
    expect(log).toMatchObject([{ kind: "kept" }, { kind: "stopped" }])
    expect(screen.queryByRole("button", { name: "Stop sending..." })).toBeNull()
  })
})
