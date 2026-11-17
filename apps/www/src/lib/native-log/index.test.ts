/**
 * What reaches the phone's own log: every failure `reportFailure` reports,
 * as one line the launch test can search for, and nothing else unless the
 * app writes it on purpose.
 */
import { fakeClock } from "@/test-support/fake-clock"
import { FOREIGN_FAILURE_TAG, reportFailure } from "@some-ui/intent-kit"
import type { ForeignFailure } from "@some-ui/intent-kit"
import { describe, expect, it, vi } from "vitest"

import { HomeNoAnswerError } from "@/lib/device-backend/native-http/no-answer"
import { createHomeLink } from "@/lib/home-link/runtime"

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

  it("NL1: the home link's one report of a stretch away carries the phone's network", async () => {
    const reported: Array<ForeignFailure> = []
    const clock = fakeClock()
    const link = createHomeLink({
      credential: {
        read: () =>
          Promise.resolve({
            record: JSON.stringify({
              base: "https://home.example/api/v1",
              token: "t",
              id: "p1",
            }),
            lost: false,
          }),
        write: () => Promise.resolve(),
        clear: () => Promise.resolve(),
      },
      request: () =>
        Promise.reject(
          new HomeNoAnswerError({
            kind: "unreachable",
            retryable: true,
            summary: "Couldn't reach the home server.",
            cause: new Error(
              "failed to connect to /192.168.1.10 (port 443) from /10.0.0.5 (port 51234) after 10000ms"
            ),
          })
        ),
      onHidden: () => (): void => undefined,
      now: clock.now,
      after: clock.after,
      report: (reportedFailure) => reported.push(reportedFailure),
    })
    await link.load()
    await link
      .send((send) => send("GET", "/voice-notes/kept"))
      .catch(() => undefined)
    expect(reported).toHaveLength(1)
    expect(failureLine(reported[0])).toContain("from /10.0.0.5")
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
    const wrapped = new Error("a", { cause: "the plugin's own words" })
    expect(
      failureLine({ ...failure, error: { ...failure.error, cause: wrapped } })
    ).toMatch(/\(Error: a <- the plugin's own words\)$/)
  })
})
