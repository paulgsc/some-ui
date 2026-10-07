/**
 * What reaches the phone's own log: every failure `reportFailure` reports,
 * as one line the launch test can search for, and nothing else unless the
 * app writes it on purpose.
 */
import { FOREIGN_FAILURE_TAG, reportFailure } from "@some-ui/intent-kit"
import { describe, expect, it, vi } from "vitest"

import { failureLine, installNativeLog } from "./index"

const write = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock("@capacitor/core", () => ({
  registerPlugin: (): unknown => ({ write }),
}))

const failure = {
  port: "device storage",
  error: {
    kind: "unavailable" as const,
    retryable: false,
    summary: "This phone's storage couldn't be opened.",
    cause: new Error("CapacitorSQLitePlugin: null"),
  },
}

describe("the native log", () => {
  it("writes a reported failure as one tagged error line with its cause, once however often it is installed", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    installNativeLog()
    installNativeLog()
    reportFailure(failure)
    const line = `${FOREIGN_FAILURE_TAG} [device storage] unavailable: This phone's storage couldn't be opened. (Error: CapacitorSQLitePlugin: null)`
    expect(failureLine(failure)).toBe(line)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith({ line, level: "error" })
  })
})
