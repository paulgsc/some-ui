/**
 * The owner's picks on the agent's previews (HOST16, #3558; the owner's
 * guard on #3521: the owner never sets a value, only approves a preview,
 * which becomes a rule). A pick is conversation/2's `approve` event, made
 * whole by `approveEvent`, and kept through a port (`PreviewPicks`).
 *
 * Today's port is the phone's own store (`phonePicks`): home keeps no
 * conversation yet (paulgsc/server#1243), so a pick stays on this phone,
 * and the screen says so. Home's port takes its place, one swap, once its
 * routes land. Either keeps every pick, and refuses a second pick on one
 * preview: the record only grows (CLAUDE.md, "Never lose the record").
 */
import type { KeyedStorage } from "@some-ui/core-utils"
import {
  localStorageOrNull,
  onJson,
  openKept,
  salvageList,
  writeKept,
} from "@some-ui/core-utils"
import type { ConversationEvent } from "@some-ui/video-render"
import { ConversationEventSchema } from "@some-ui/video-render"
import { z } from "zod"

export { PICK_WORDS } from "./words"

/** A pick as kept: the conversation it was made on, and its event. */
export type KeptPick = {
  readonly conversation: string
  readonly event: Extract<ConversationEvent, { event: "approve" }>
}

/** What keeping a pick came to. */
export type Keeping = "kept" | "already" | "refused"

/** Where picks are kept: the phone's store today, home's routes next. */
export type PreviewPicks = {
  /** Every pick kept on `conversation`, oldest first; null when they can't be read. */
  readonly list: (conversation: string) => ReadonlyArray<KeptPick> | null
  readonly keep: (pick: KeptPick) => Keeping
  /** Where a pick is kept, for the screen to say. */
  readonly where: "phone" | "home"
}

export const PICKS_KEY = "some-ui:studio:preview-picks"

const KeptPickSchema = z.object({
  conversation: z.string().min(1),
  event: ConversationEventSchema,
})

const isKeptPick = (value: unknown): value is KeptPick => {
  const parsed = KeptPickSchema.safeParse(value)
  return parsed.success && parsed.data.event.event === "approve"
}

const readPicks = onJson(salvageList(isKeptPick))

/** Picks kept in `storage` (the page's own, looked up on each call). */
export function phonePicks(
  storage: () => KeyedStorage | null = localStorageOrNull
): PreviewPicks {
  const open = (): { value: ReadonlyArray<KeptPick>; writable: boolean } =>
    openKept<ReadonlyArray<KeptPick>>(storage(), PICKS_KEY, readPicks, [])
  return {
    where: "phone",
    list: (conversation): ReadonlyArray<KeptPick> | null => {
      const opened = open()
      return opened.writable
        ? opened.value.filter((p) => p.conversation === conversation)
        : null
    },
    keep: (pick): Keeping => {
      const opened = open()
      if (!opened.writable) return "refused"
      if (
        opened.value.some(
          (p) =>
            p.conversation === pick.conversation &&
            p.event.preview === pick.event.preview
        )
      )
        return "already"
      return writeKept(storage(), PICKS_KEY, [...opened.value, pick], readPicks)
        ? "kept"
        : "refused"
    },
  }
}

/** The pick kept on `preview`, if one is. */
export const pickOn = (
  picks: ReadonlyArray<KeptPick>,
  preview: string
): KeptPick | undefined => picks.find((p) => p.event.preview === preview)
