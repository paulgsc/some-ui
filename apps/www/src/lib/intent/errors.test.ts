import { describe, expect, it } from "vitest"

import { FileHostUnreachableError } from "@/lib/file-host-config"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"

import { mapFileHostError } from "./errors"

describe("mapFileHostError", () => {
  // #942's acceptance criterion: every error class reachable from apps/www's
  // write paths maps to exactly one kind, enumerated here rather than
  // asserted in prose.
  it.each([
    [
      "FileHostUnreachableError",
      new FileHostUnreachableError(
        "/sessions",
        new TypeError("Failed to fetch")
      ),
      "unreachable",
      true,
    ],
    [
      "FileHostNotConfiguredError",
      new FileHostNotConfiguredError("/push/vapid-key"),
      "unavailable",
      false,
    ],
    [
      "FileHostResponseError (5xx)",
      new FileHostResponseError(500, "/sessions", "internal_error"),
      "rejected",
      true,
    ],
    [
      "FileHostResponseError (4xx)",
      new FileHostResponseError(404, "/sessions/abc", "not_found"),
      "rejected",
      false,
    ],
  ] as const)(
    "%s -> kind %s, retryable %s",
    (_label, error, kind, retryable) => {
      const result = mapFileHostError(error)
      expect(result.kind).toBe(kind)
      expect(result.retryable).toBe(retryable)
      expect(result.cause).toBe(error)
      expect(result.summary.length).toBeGreaterThan(0)
    }
  )

  it("falls back to intent-kit's generic normalizer for anything else, rather than throwing", () => {
    const inputs: ReadonlyArray<unknown> = [
      new Error("some unrelated failure"),
      new TypeError("Failed to fetch"),
      undefined,
      "a bare string",
      { not: "an error at all" },
    ]

    for (const input of inputs) {
      expect(() => mapFileHostError(input)).not.toThrow()
      const result = mapFileHostError(input)
      expect(result.kind).toBe("unknown")
      expect(result.retryable).toBe(true)
    }
  })

  it("retains file_host's own error code on cause for a developer, without putting it in summary", () => {
    const error = new FileHostResponseError(500, "/sessions", "internal_error")
    const result = mapFileHostError(error)

    expect(result.cause).toBe(error)
    // `cause` is `unknown` by design (see intent-kit's IntentError) - `error`
    // itself, still in scope, is the typed handle; asserting through it
    // avoids narrowing `result.cause` back down with a type assertion.
    expect(error.code).toBe("internal_error")
    expect(result.summary).not.toMatch(/internal_error/)
  })
})
