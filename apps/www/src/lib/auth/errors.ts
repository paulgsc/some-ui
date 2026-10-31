import { FileHostUnreachableError } from "@/lib/file-host-config"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import { PasskeyCancelledError } from "@/lib/passkey"

/**
 * Whether the server refused a new account because it already has its
 * owner's: once it does, signing in is the only way in, so the passkey
 * screen stops offering to create one.
 */
export function isSignupClosed(error: unknown): boolean {
  return (
    error instanceof FileHostResponseError &&
    error.status === 403 &&
    error.code === "signup_closed"
  )
}

/** What went wrong, in words about the person's passkey, not the protocol. */
export function describeAuthError(
  error: unknown,
  attempt: "sign-in" | "create"
): string {
  if (error instanceof PasskeyCancelledError) {
    return attempt === "sign-in"
      ? "No passkey was used. If you don't have one for this site yet, create one."
      : "No passkey was created. Try again when you're ready."
  }
  if (error instanceof FileHostUnreachableError) {
    return "The server can't be reached right now. Try again in a moment."
  }
  if (error instanceof FileHostNotConfiguredError) {
    return "Passkey sign-in isn't set up on this server yet."
  }
  if (error instanceof FileHostResponseError) {
    if (error.status === 401) {
      return "That passkey doesn't open an account here. It may belong to an account that was deleted."
    }
    if (isSignupClosed(error)) {
      return "This server already has its owner's account and makes no new ones. If it's yours, sign in with your passkey."
    }
    if (error.status === 409) {
      return "That passkey is already registered here. Sign in with it instead."
    }
    if (error.status === 503) {
      return attempt === "sign-in"
        ? "The server is busy right now. Try again in a moment."
        : "This server has made all the new accounts it allows today. Try again tomorrow, or sign in if you already have a passkey."
    }
    if (error.status === 422) {
      return "That took too long or the passkey couldn't be checked. Please try again."
    }
  }
  return "Something went wrong. Please try again."
}
