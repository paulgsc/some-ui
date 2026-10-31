/**
 * "Archive finished sessions": a copy of the finished sessions
 * (`mayLeavePhone`) through Android's share sheet, as one file of their full
 * records, wherever the person picks (Drive, say); nothing here sends
 * anything anywhere. An archive is a copy and lets nothing go (LG1, HF2
 * #2177): a finished session leaves the phone only once home has read it
 * back (`letGoUnchanged`, which only `lib/home-link/clear` calls, LA8).
 *
 * Only session records go, as a copy home carries them; reflections, stops
 * and soundbites have their own share (`lib/agent-export`, LA7).
 *
 * Phone-only (`build.paths.ts`).
 */
import { dayOf } from "@some-ui/core-utils"

import { deviceBackend } from "@/lib/device-backend/boot"
import {
  mayLeavePhone,
  removeUnchanged,
} from "@/lib/device-backend/handlers/sessions"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import { foreignValue } from "@/lib/intent/foreign"
import { shareFiles } from "@/lib/share-files"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

const ABOUT =
  "Finished study sessions archived from the some-ui app on the learner's phone, as the phone stored them: each session's plan (`activities`, `scenes`, `layout`), status and times. A copy: the sessions stay on the phone, which lets one go only once the learner's home server holds it."

/** A session as home read it back: what `letGoUnchanged` checks. */
export type SessionAsOf = { readonly id: string; readonly updatedAt: string }

/** The sessions an archive would carry. Reads only this phone. */
async function finishedOnPhone(
  now = new Date()
): Promise<Array<SessionRecord>> {
  return (await sessionsRepository.list()).filter((s) => mayLeavePhone(s, now))
}

/** The archive's file: findable by day in a folder of them. */
function archiveFile(
  sessions: ReadonlyArray<SessionRecord>,
  at: Date
): { name: string; data: string } {
  return {
    name: `sessions-${dayOf(at)}.json`,
    data: JSON.stringify(
      {
        about: ABOUT,
        exportedAt: at.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        sessions,
      },
      null,
      2
    ),
  }
}

/**
 * Opens the share sheet with a copy of the finished sessions, oldest first.
 */
export async function shareArchive(
  now: () => Date = () => new Date()
): Promise<"shared" | "cancelled"> {
  const at = now()
  const sessions = (await finishedOnPhone(at)).sort((a, b) =>
    (a.completedAt ?? a.updatedAt).localeCompare(b.completedAt ?? b.updatedAt)
  )
  if (sessions.length === 0) return "cancelled"
  return foreignValue({
    outcome: shareFiles("session-archive", "Finished study sessions", [
      archiveFile(sessions, at),
    ]),
  })
}

/**
 * Lets go of the phone's copy of each of `held`, which home has read back
 * (`lib/home-link/clear`), only if it is unchanged since home read it.
 * Returns how many left.
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
