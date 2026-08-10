/**
 * The ambient signal `sessions-backend.ts`'s partial-migration outcome
 * resolves to, replacing the `console.warn` that used to be the only
 * record of it - #933's own named example of "an error channel that
 * terminates at the developer," in literal source form.
 *
 * In-memory only, and that is enough: the condition this names ("some
 * sessions haven't synced yet") is retried automatically on the very next
 * full page load (see `sessions-migration.ts`), so there is nothing here
 * that needs to survive one - a fresh load gets a fresh, accurate read
 * rather than a stale flag left over from a previous visit. Contrast with
 * `lib/intent/durable-failure.ts`, whose whole reason to exist is a
 * failure that must survive without a reload.
 *
 * Not retryable, on purpose: the retry already happens automatically on
 * the next load, and a button that re-ran the migration mid-session would
 * race the very requests it is trying to get ahead of.
 */

import { useSyncExternalStore } from "react"
import type { Intent } from "@some-ui/intent-kit"
import { failed, idle } from "@some-ui/intent-kit"

type MigrationSignal =
  | { readonly kind: "clear" }
  | {
      readonly kind: "partial"
      readonly migrated: number
      readonly remaining: number
      readonly cause: unknown
    }

let signal: MigrationSignal = { kind: "clear" }
const listeners = new Set<() => void>()

export function reportPartialMigration(
  migrated: number,
  remaining: number,
  cause: unknown
): void {
  signal = { kind: "partial", migrated, remaining, cause }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): MigrationSignal {
  return signal
}

/** Shaped for `AmbientIntentStatus` directly - the same renderer every
 * other ambient producer in the app uses, so this doesn't need a renderer
 * of its own (see `presentation.ts`'s "Ambient surface" section). */
export function useMigrationSignal(): Intent<void> {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  if (current.kind === "clear") return idle()
  return failed(
    {
      kind: "unknown",
      retryable: false,
      summary: `${current.remaining} session${current.remaining === 1 ? "" : "s"} haven't finished syncing to the server yet - they'll retry automatically next time you load the app.`,
      cause: current.cause,
    },
    () => undefined
  )
}
