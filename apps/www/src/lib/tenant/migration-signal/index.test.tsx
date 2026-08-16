/**
 * @vitest-environment jsdom
 *
 * #947: `sessions-backend.ts:113`'s swallowed migration failure, resolved
 * to this ambient signal instead of a `console.warn`. Each case
 * re-imports the module fresh (`vi.resetModules`) since the signal is
 * deliberately a bare module-level singleton, not something with a reset
 * function exposed to production callers - see the module's own header on
 * why in-memory-for-this-load is the right lifetime.
 */

import type { Intent } from "@some-ui/intent-kit"
import { matchIntent } from "@some-ui/intent-kit"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type * as MigrationSignalModule from "."

function summarize(state: Intent<void>): string {
  return matchIntent(state, {
    idle: () => "idle",
    working: () => "working",
    succeeded: () => "succeeded",
    failed: (error) => `failed:${error.summary}`,
  })
}

async function freshModule(): Promise<typeof MigrationSignalModule> {
  vi.resetModules()
  return import(".")
}

beforeEach(() => {
  vi.resetModules()
})

describe("migration-signal", () => {
  it("starts idle - the common case, when nothing was left partially migrated", async () => {
    const { useMigrationSignal } = await freshModule()

    const { result } = renderHook(() => useMigrationSignal())

    expect(summarize(result.current)).toBe("idle")
  })

  it("reportPartialMigration flips every subscribed reader to a non-retryable failed intent", async () => {
    const { useMigrationSignal, reportPartialMigration } = await freshModule()

    const { result } = renderHook(() => useMigrationSignal())
    expect(summarize(result.current)).toBe("idle")

    act(() => {
      reportPartialMigration(3, 2, new Error("file_host went away"))
    })

    expect(summarize(result.current)).toContain("failed:")
    expect(summarize(result.current)).toContain("2 sessions")

    const retryable = matchIntent(result.current, {
      idle: () => null,
      working: () => null,
      succeeded: () => null,
      failed: (error) => error.retryable,
    })
    expect(retryable).toBe(false)
  })

  it("singular phrasing for exactly one remaining session", async () => {
    const { useMigrationSignal, reportPartialMigration } = await freshModule()
    reportPartialMigration(4, 1, new Error("boom"))

    const { result } = renderHook(() => useMigrationSignal())

    expect(summarize(result.current)).toContain("1 session ")
  })
})
