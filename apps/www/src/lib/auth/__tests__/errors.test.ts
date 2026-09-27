import { describe, expect, it } from "vitest"

import { describeAuthError } from "@/lib/auth"
import { FileHostUnreachableError } from "@/lib/file-host-config"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import { PasskeyCancelledError } from "@/lib/passkey"

describe("describeAuthError", () => {
  it.each([
    [new PasskeyCancelledError(), "sign-in", /create one/],
    [new PasskeyCancelledError(), "create", /No passkey was created/],
    [
      new FileHostUnreachableError(
        "/auth/sign-in/start",
        new TypeError("Failed to fetch")
      ),
      "sign-in",
      /can't be reached/,
    ],
    [
      new FileHostNotConfiguredError("/auth/sign-in/start"),
      "sign-in",
      /isn't set up/,
    ],
    [
      new FileHostResponseError(401, "/auth/sign-in/finish", "unauthorized"),
      "sign-in",
      /doesn't open an account/,
    ],
    [
      new FileHostResponseError(409, "/auth/register/finish", "conflict"),
      "create",
      /already registered/,
    ],
    [
      new FileHostResponseError(
        422,
        "/auth/register/finish",
        "unprocessable_entity"
      ),
      "create",
      /try again/,
    ],
    [new Error("anything else"), "create", /Something went wrong/],
  ] as const)("%s during %s", (error, attempt, wording) => {
    expect(describeAuthError(error, attempt)).toMatch(wording)
  })

  it("never names the protocol or the server's error codes", () => {
    const message = describeAuthError(
      new FileHostResponseError(
        422,
        "/auth/register/finish",
        "unprocessable_entity"
      ),
      "create"
    )
    expect(message).not.toMatch(/WebAuthn|unprocessable|422|ceremony/i)
  })
})
