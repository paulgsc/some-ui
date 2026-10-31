/**
 * The one way a finished session leaves this phone: on home's word, once
 * home has read it back as the phone holds it (`./clear`, LA8, LG1). The
 * clear is its one caller.
 */
import { deviceBackend } from "@/lib/device-backend/boot"
import { removeUnchanged } from "@/lib/device-backend/handlers/sessions"
import { deviceStorage } from "@/lib/device-backend/storage-view"

/** A session as home read it back: what `letGoUnchanged` checks. */
export type SessionAsOf = { readonly id: string; readonly updatedAt: string }

/**
 * Lets go of the phone's copy of each of `held`, which home has read back,
 * only if it is unchanged since home read it. Returns how many left.
 */
export async function letGoUnchanged(
  held: ReadonlyArray<SessionAsOf>
): Promise<number> {
  if (held.length === 0) return 0
  const { context } = await deviceBackend()
  const left = await removeUnchanged(context.db, held)
  if (left > 0) void deviceStorage.refresh()
  return left
}
