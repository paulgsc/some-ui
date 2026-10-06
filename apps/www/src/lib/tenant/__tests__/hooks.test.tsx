/**
 * @vitest-environment jsdom
 *
 * The read hooks gate every tenant-data consumer, including those above the
 * router (`AppProviders`, `TTSProvider`) that no route guard reaches. This
 * drives the real hooks through a real `QueryClient` and checks that no
 * request goes out before the authority is decided, with `./queries`'
 * `queryOptions` swapped for fakes.
 */

import { queryClientWrapper } from "@/test-support/query-client"
import { queryOptions } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type * as QueriesModule from "@/lib/tenant/queries"

const profileQueryFn = vi.fn(() => Promise.resolve({ marker: "profile" }))
const settingsQueryFn = vi.fn(() => Promise.resolve({ marker: "settings" }))
const sessionsQueryFn = vi.fn(() => Promise.resolve([{ marker: "sessions" }]))

vi.mock("@/lib/tenant/queries", async (importOriginal) => {
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

let kind: "pending" | "local" | "account" = "pending"
vi.mock("@/lib/authority", () => ({
  useAuthority: (): { kind: typeof kind; epoch: number } => ({
    kind,
    epoch: 0,
  }),
}))

async function renderReadHooks(): Promise<{ rerender: () => void }> {
  const { useProfile, useSettings, useSessions } = await import(
    "@/lib/tenant/hooks"
  )
  return renderHook(
    () => {
      useProfile()
      useSettings()
      useSessions()
    },
    { wrapper: queryClientWrapper() }
  )
}

async function expectAllRead(): Promise<void> {
  await waitFor(() => {
    expect(profileQueryFn).toHaveBeenCalled()
    expect(settingsQueryFn).toHaveBeenCalled()
    expect(sessionsQueryFn).toHaveBeenCalled()
  })
}

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  kind = "pending"
})

describe("tenant read hooks: no read before the authority is decided", () => {
  it("useProfile/useSettings/useSessions stay idle while it is undecided, and fire once it is", async () => {
    const { rerender } = await renderReadHooks()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(profileQueryFn).not.toHaveBeenCalled()
    expect(settingsQueryFn).not.toHaveBeenCalled()
    expect(sessionsQueryFn).not.toHaveBeenCalled()

    kind = "account"
    rerender()

    await expectAllRead()
  })

  it("reads at once on the device, where there is no session to wait for", async () => {
    kind = "local"
    await renderReadHooks()

    await expectAllRead()
  })
})
