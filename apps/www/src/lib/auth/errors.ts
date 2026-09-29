import { FileHostUnreachableError } from "@/lib/file-host-config"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import { PasskeyCancelledError } from "@/lib/passkey"

/**
 * What went wrong, in words about the person's passkey, not the protocol.
 * A `"claim"` is a `"create"` through an operator's `#claim=` link.
 */
export function describeAuthError(
  error: unknown,
  attempt: "sign-in" | "create" | "claim"
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
    if (attempt === "claim" && error.status === 403) {
      return "That claim link isn't valid for this server. Check it with whoever runs the server."
    }
    if (attempt === "claim" && error.status === 409) {
      return "This server's earlier data has already been claimed. Open /auth without the link to create a new, empty account."
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
