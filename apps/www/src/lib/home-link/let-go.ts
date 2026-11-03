/**
 * How a session leaves this phone on home's word: once home has read it back
 * as the phone holds it (LA8, LG1). Its two callers are the
 * clear of finished sessions home holds (`./clear`) and the study list's
 * "Let it go" of one session (`./study-let-go`).
 */
import { deviceBackend } from "@/lib/device-backend/boot"
import { removeUnchanged } from "@/lib/device-backend/handlers/sessions"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import { clearDurableFailure } from "@/lib/intent/durable-failure"
import { forgetCopies } from "@/lib/tenant/sessions-copy"

/** A session as home read it back: what `letGoUnchanged` checks. */
export type SessionAsOf = { readonly id: string; readonly updatedAt: string }

/**
 * Lets go of the phone's copy of each of `held`, which home has read back,
 * only if it is unchanged since home read it, and of what the phone kept
 * about each one that left: its autosave failure and its copy receipt
 * (STORAGE's SL1, #2268). Returns how many left.
 */
export async function letGoUnchanged(
  held: ReadonlyArray<SessionAsOf>
): Promise<number> {
  if (held.length === 0) return 0
  const { context } = await deviceBackend()
  const left = await removeUnchanged(context.db, held)
  for (const id of left) clearDurableFailure(id)
  forgetCopies(left)
  if (left.length > 0) void deviceStorage.refresh()
  return left.length
}
