/**
 * The pairing's record, kept by the app's own `HomeCredential` plugin
 * (apps/mobile/android `HomeCredentialPlugin`): sealed with a key the
 * Android Keystore holds, and kept out of every backup. A plugin call is a
 * foreign wait, so each goes through `callForeign` (F1).
 */
import { registerPlugin } from "@capacitor/core"
import type { ForeignPort, ForeignVerdict } from "@some-ui/intent-kit"
import { callForeign, reportFailure } from "@some-ui/intent-kit"

import { foreignValue, isMissingPlugin } from "@/lib/intent/foreign"

import type { CredentialPort } from "./runtime"

type HomeCredentialPlugin = {
  read: () => Promise<{ record: string | null; lost: boolean }>
  write: (options: { record: string }) => Promise<void>
  clear: () => Promise<void>
}

const HomeCredential = registerPlugin<HomeCredentialPlugin>("HomeCredential")

/** The Keystore answers in milliseconds; this is for a stuck bridge. */
const DEADLINE_MS = 5_000

function classify(error: unknown): ForeignVerdict {
  return isMissingPlugin(error)
    ? {
        kind: "unavailable",
        retryable: false,
        summary: "This build of the app can't keep a pairing.",
      }
    : {
        kind: "unknown",
        retryable: true,
        summary: "The phone couldn't read or keep its pairing.",
      }
}

const PORT: ForeignPort = {
  name: "home credential (keystore)",
  classify,
  report: reportFailure,
}

function call<T>(start: () => Promise<T>): Promise<T> {
  return foreignValue(
    callForeign({ port: PORT, deadlineMs: DEADLINE_MS, start })
  )
}

/**
 * Each method is called on the plugin, never the plugin returned from an
 * async function: a Capacitor plugin is a thenable (CLAUDE.md).
 */
export const nativeCredential: CredentialPort = {
  read: () => call(() => HomeCredential.read()),
  write: (record) => call(() => HomeCredential.write({ record })),
  clear: () => call(() => HomeCredential.clear()),
}
