/**
 * @vitest-environment jsdom
 *
 * Settings' ledger of what this phone shares with home: it reads the
 * phone's own choices and sends nothing, says each record's state in its
 * own words, stops Practice and the Jobs record on a second press, and
 * sends aph's stop to aph's own mark.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CONSENT_KEY } from "@/lib/home-link/consent-runtime"
import type { SessionRecord } from "@/lib/tenant/types"

const PAIRING = "https://home.example/api/v1"

const home = vi.hoisted((): { sent: Array<unknown> } => ({ sent: [] }))

vi.mock("@/lib/device-backend/native-http", () => ({
  homeRequest: (call: unknown): Promise<never> => {
    home.sent.push(call)
    return Promise.reject(new Error("nothing should be sent"))
  },
}))
vi.mock("@/lib/home-link/credential", () => ({
  nativeCredential: {
    read: (): Promise<{ record: string; lost: boolean }> =>
      Promise.resolve({
        record: JSON.stringify({ base: PAIRING, token: "t" }),
        lost: false,
      }),
  },
}))
vi.mock("@/lib/home-link/send", () => ({
  readPhone: (): Promise<unknown> => Promise.resolve({ local: [], kept: [] }),
}))
vi.mock("@/lib/jobs", async () => {
  const { EMPTY: state } = await import("@/lib/jobs/model")
  // One snapshot, as `useSyncExternalStore` needs.
  const snapshot = { state }
  return {
    phoneJobs: (): unknown => ({
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    }),
  }
})
vi.mock("@/lib/tenant", () => ({
  useSessions: (): { data: Array<SessionRecord> } => ({ data: [] }),
}))

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
  home.sent = []
})

function logged(
  ...events: Array<{ kind: "kept" | "stopped"; scopes: Array<string> }>
): void {
  localStorage.setItem(
    CONSENT_KEY,
    JSON.stringify(
      events.map((event, i) => ({
        seq: i + 1,
        at: Date.parse(`2026-10-0${String(i + 1)}T10:00:00Z`),
        pairing: PAIRING,
        ...event,
        ...(event.kind === "kept" ? { said: "yes" } : {}),
      }))
    )
  )
}

async function mount(): Promise<void> {
  const { SharingLedger } = await import(
    "@/components/settings/device-sharing-ledger"
  )
  render(<SharingLedger />)
  await act(() => Promise.resolve())
}

describe("the sharing ledger", () => {
  it("says everything is only on this phone, and sends nothing", async () => {
    await mount()
    expect(screen.getAllByText(/: Only on this phone$/)).toHaveLength(4)
    expect(screen.getByText(/No choice made yet/)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
    expect(home.sent).toEqual([])
  })

  it("stops Practice on the second press, and shows each choice", async () => {
    logged({ kind: "kept", scopes: ["sessions", "shelf"] })
    await mount()
    expect(
      screen.getByText(/^Finished sessions: Kept on home since/)
    ).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Stop sending..." }))
    fireEvent.click(screen.getByRole("button", { name: "Stop sending" }))
    const log: unknown = JSON.parse(localStorage.getItem(CONSENT_KEY) ?? "[]")
    expect(log).toMatchObject([{ kind: "kept" }, { kind: "stopped" }])
    expect(
      screen.getByText(/^Finished sessions: Sent to home until/)
    ).toBeTruthy()
    expect(
      screen.getByText(/Practice: stopped sending to home\. Home keeps/)
    ).toBeTruthy()
    expect(screen.getByText(/Practice: kept on home\.$/)).toBeTruthy()
    expect(home.sent).toEqual([])
  })

  it("sends aph's stop to aph's own mark", async () => {
    logged({ kind: "kept", scopes: ["aph"] })
    await mount()
    expect(screen.getByText(/tap the mark at the top of aph/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Stop sending..." })).toBeNull()
  })
})
