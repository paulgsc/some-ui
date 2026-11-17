/**
 * What reaches the phone's own log: every failure `reportFailure` reports,
 * as one line the launch test can search for, and nothing else unless the
 * app writes it on purpose.
 */
import { FOREIGN_FAILURE_TAG, reportFailure } from "@some-ui/intent-kit"
import { describe, expect, it, vi } from "vitest"

import { HomeNoAnswerError } from "@/lib/device-backend/native-http/no-answer"

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

  it("NL1: keeps every cause a failure wraps, so home's silence says which network the phone was on (#3097)", () => {
    const android = new Error(
      "failed to connect to /192.168.1.10 (port 443) from /10.0.0.5 (port 51234) after 10000ms"
    )
    const silence = new HomeNoAnswerError({
      kind: "unreachable",
      retryable: true,
      summary: "Couldn't reach the home server.",
      cause: android,
    })
    const line = failureLine({
      port: "home server",
      error: {
        kind: "unreachable",
        retryable: true,
        summary: "Away from home: home didn't answer.",
        cause: silence,
      },
    })
    expect(line).toBe(
      `${FOREIGN_FAILURE_TAG} [home server] unreachable: Away from home: home didn't answer. (HomeNoAnswerError: Couldn't reach the home server. <- Error: ${android.message})`
    )
    expect(line).toContain("from /10.0.0.5")
  })

  it("NL1: stops at a cycle or a long chain, and writes a cause that is no error as text", () => {
    const loop = new Error("a")
    loop.cause = loop
    const line = failureLine({
      ...failure,
      error: { ...failure.error, cause: loop },
    })
    expect(line.match(/Error: a/g)).toHaveLength(4)
    expect(
      failureLine({ ...failure, error: { ...failure.error, cause: null } })
    ).toMatch(/\(null\)$/)
  })
})
