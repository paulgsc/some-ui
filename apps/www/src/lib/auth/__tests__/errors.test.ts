import { describe, expect, it } from "vitest"

import { describeAuthError, isSignupClosed } from "@/lib/auth"
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
      new FileHostResponseError(403, "/auth/register/start", "signup_closed"),
      "create",
      /already has its owner's account.*sign in with your passkey/,
    ],
    [
      new FileHostResponseError(
        503,
        "/auth/register/start",
        "service_overloaded"
      ),
      "create",
      /all the new accounts it allows today/,
    ],
    [
      new FileHostResponseError(
        503,
        "/auth/sign-in/start",
        "service_overloaded"
      ),
      "sign-in",
      /busy/,
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

  it.each([
    [
      new FileHostResponseError(
        422,
        "/auth/register/finish",
        "unprocessable_entity"
      ),
      /WebAuthn|unprocessable|422|ceremony/i,
    ],
    [
      new FileHostResponseError(403, "/auth/register/start", "signup_closed"),
      /signup|closed|403|forbidden|operator|subject/i,
    ],
  ] as const)(
    "never names the protocol or the server's error codes (%s)",
    (error, internal) => {
      expect(describeAuthError(error, "create")).not.toMatch(internal)
    }
  )
})

describe("isSignupClosed", () => {
  it.each([
    [
      new FileHostResponseError(403, "/auth/register/start", "signup_closed"),
      true,
    ],
    [
      new FileHostResponseError(403, "/auth/register/finish", "signup_closed"),
      true,
    ],
    [
      new FileHostResponseError(403, "/auth/register/start", "forbidden"),
      false,
    ],
    [new FileHostResponseError(403, "/auth/register/start", null), false],
    [
      new FileHostResponseError(409, "/auth/register/finish", "signup_closed"),
      false,
    ],
    [new Error("signup_closed"), false],
  ] as const)("%s is %s", (error, closed) => {
    expect(isSignupClosed(error)).toBe(closed)
  })
})
