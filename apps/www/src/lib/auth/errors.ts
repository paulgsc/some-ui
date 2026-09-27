import { FileHostUnreachableError } from "@/lib/file-host-config"
import {
  FileHostNotConfiguredError,
  FileHostResponseError,
} from "@/lib/file-host-config/client"
import { PasskeyCancelledError } from "@/lib/passkey"

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
    if (error.status === 409) {
      return "That passkey is already registered here. Sign in with it instead."
    }
    if (error.status === 422) {
      return "That took too long or the passkey couldn't be checked. Please try again."
    }
  }
  return "Something went wrong. Please try again."
}
