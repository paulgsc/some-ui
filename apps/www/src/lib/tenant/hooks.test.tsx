/**
 * @vitest-environment jsdom
 *
 * The read hooks in `hooks.ts` are the one place every tenant-data consumer
 * goes through, whether it lives inside the signed-in dashboard (already
 * covered by the router's `beforeLoad` guard) or above the router entirely
 * (`AppProviders`, `TTSProvider` - no route guard reaches those). This
 * exercises the actual `queryFn`s these hooks drive, through a real
 * `QueryClient`, rather than asserting on an `enabled` flag's shape: the
 * property that matters is that no request goes out before there is a
 * session, and one does once there is - not that some option object looks
 * a particular way. `./queries`' own `queryOptions` are swapped for fakes
 * so this exercises `hooks.ts`'s gating logic without touching the real
 * repositories (localStorage, `file_host`) behind them.
 */

import type { JSX, ReactNode } from "react"
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
} from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as QueriesModule from "./queries"

const profileQueryFn = vi.fn(() => Promise.resolve({ marker: "profile" }))
const settingsQueryFn = vi.fn(() => Promise.resolve({ marker: "settings" }))
const sessionsQueryFn = vi.fn(() => Promise.resolve([{ marker: "sessions" }]))

vi.mock("./queries", async (importOriginal) => {
  const actual = await importOriginal<typeof QueriesModule>()
  return {
    ...actual,
    profileQuery: queryOptions({
      queryKey: ["test", "profile"],
      queryFn: profileQueryFn,
    }),
    settingsQuery: queryOptions({
      queryKey: ["test", "settings"],
      queryFn: settingsQueryFn,
    }),
    sessionsQuery: queryOptions({
      queryKey: ["test", "sessions"],
      queryFn: sessionsQueryFn,
    }),
  }
})

let hasSession = false
vi.mock("@/lib/auth-session", () => ({
  useHasDecorativeSession: (): boolean => hasSession,
}))

function wrapper(
  client: QueryClient
): ({ children }: { children: ReactNode }) => JSX.Element {
  const Wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return Wrapper
}

afterEach(() => {
  vi.resetModules()
  hasSession = false
})

describe("tenant read hooks: no request before there is a session", () => {
  it("useProfile/useSettings/useSessions stay idle while signed out, and fire once signed in", async () => {
    const { useProfile, useSettings, useSessions } = await import("./hooks")
    const client = new QueryClient()

    const { rerender } = renderHook(
      () => {
        useProfile()
        useSettings()
        useSessions()
      },
      { wrapper: wrapper(client) }
    )

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(profileQueryFn).not.toHaveBeenCalled()
    expect(settingsQueryFn).not.toHaveBeenCalled()
    expect(sessionsQueryFn).not.toHaveBeenCalled()

    hasSession = true
    rerender()

    await waitFor(() => {
      expect(profileQueryFn).toHaveBeenCalled()
      expect(settingsQueryFn).toHaveBeenCalled()
      expect(sessionsQueryFn).toHaveBeenCalled()
    })
  })
})
