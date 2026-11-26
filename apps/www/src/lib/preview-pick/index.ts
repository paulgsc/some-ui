/**
 * The owner's picks on the agent's previews (HOST16, #3558; the owner's
 * guard on #3521: the owner never sets a value, only approves a preview,
 * which becomes a rule). A pick is conversation/2's `approve` event, made
 * whole by `approveEvent`, and kept through a port (`PreviewPicks`).
 *
 * Today's port is the phone's own store (`phonePicks`): home keeps no
 * conversation yet (paulgsc/server#1243), so a pick stays on this phone,
 * and the screen says so. Home's port takes its place, one swap, once its
 * routes land. Either keeps every pick: a pick that changes an earlier one
 * on the same preview `moves` it (C1581), and the latest stands, so the
 * record only grows (CLAUDE.md, "Never lose the record"). A sample's picks
 * (`samplePicks`) are held in memory and never kept.
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
  /** Where a pick is kept, for the screen to say; a sample's are never kept. */
  readonly where: "phone" | "home" | "sample"
}

export const PICKS_KEY = "some-ui:studio:preview-picks"

const KeptPickSchema = z.object({
  conversation: z.string().min(1),
  event: ConversationEventSchema,
})

const isKeptPick = (value: unknown): value is KeptPick => {
  const parsed = KeptPickSchema.safeParse(value)
  return (
    parsed.success &&
    parsed.data.event.event === "approve" &&
    parsed.data.event.by === "owner"
  )
}

/** Why `pick` can't follow `kept`, the picks on its conversation; null when it can. */
const notAfter = (
  kept: ReadonlyArray<KeptPick>,
  pick: KeptPick
): Keeping | null => {
  const standing = pickOn(kept, pick.event.preview)
  if (standing === undefined)
    return pick.event.moves === undefined ? null : "refused"
  if (pick.event.moves !== pick.event.preview) return "already"
  return JSON.stringify(standing.event.chose) ===
    JSON.stringify(pick.event.chose)
    ? "already"
    : null
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
      const not = notAfter(
        opened.value.filter((p) => p.conversation === pick.conversation),
        pick
      )
      if (not !== null) return not
      return writeKept(storage(), PICKS_KEY, [...opened.value, pick], readPicks)
        ? "kept"
        : "refused"
    },
  }
}

/**
 * A sample's picks, held in memory for as long as the screen is open and
 * never kept: a pick on a fixture is no approval.
 */
export function samplePicks(): PreviewPicks {
  const held: Array<KeptPick> = []
  return {
    where: "sample",
    list: (conversation) => held.filter((p) => p.conversation === conversation),
    keep: (pick): Keeping => {
      const not = notAfter(
        held.filter((p) => p.conversation === pick.conversation),
        pick
      )
      if (not !== null) return not
      held.push(pick)
      return "kept"
    },
  }
}

/** The pick standing on `preview`: the latest kept, if one is. */
export function pickOn(
  picks: ReadonlyArray<KeptPick>,
  preview: string
): KeptPick | undefined {
  return picks.filter((p) => p.event.preview === preview).at(-1)
}
