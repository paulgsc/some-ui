/**
 * "Archive finished sessions": the phone's other way to make room, for
 * someone who keeps no home server. The finished sessions (`mayLeavePhone`)
 * go out through Android's share sheet as one file of their full records,
 * and the person picks where (Drive, say); nothing here sends anything
 * anywhere. Android says "shared" once an app is picked, even if the person
 * then backs out, and the phone cannot look inside Drive, so the sessions
 * leave the phone only once the person says the file arrived
 * (`letGoUnchanged`), and only those unchanged since they went out.
 *
 * Only session records go, as a copy home carries them; reflections, stops
 * and soundbites have their own share (`lib/agent-export`, LA7).
 *
 * Phone-only (`build.paths.ts`).
 */
import { dayOf } from "@some-ui/core-utils"

import { mayLeavePhone } from "@/lib/device-backend/handlers/sessions"
import { deviceStorage } from "@/lib/device-backend/storage-view"
import { foreignValue } from "@/lib/intent/foreign"
import { shareFiles } from "@/lib/share-files"
import { sessionsRepository } from "@/lib/tenant/queries"
import type { SessionRecord } from "@/lib/tenant/types"

const ABOUT =
  "Finished study sessions archived from the some-ui app on the learner's phone, as the phone stored them: each session's plan (`activities`, `scenes`, `layout`), status and times. Once the learner confirmed this file arrived, these sessions left the phone: this file is their only copy unless they were also copied to a home server."

/** A session as a destination got it: what `letGoUnchanged` checks. */
export type SessionAsOf = { readonly id: string; readonly updatedAt: string }

export type ArchiveResult = {
  readonly outcome: "shared" | "cancelled"
  readonly sent: ReadonlyArray<SessionAsOf>
}

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

/** Opens the share sheet with the finished sessions, oldest first. */
export async function shareArchive(
  now: () => Date = () => new Date()
): Promise<ArchiveResult> {
  const at = now()
  const sessions = (await finishedOnPhone(at)).sort((a, b) =>
    (a.completedAt ?? a.updatedAt).localeCompare(b.completedAt ?? b.updatedAt)
  )
  if (sessions.length === 0) return { outcome: "cancelled", sent: [] }
  const outcome = await foreignValue({
    outcome: shareFiles("session-archive", "Finished study sessions", [
      archiveFile(sessions, at),
    ]),
  })
  return {
    outcome,
    sent: sessions.map(({ id, updatedAt }) => ({ id, updatedAt })),
  }
}

/**
 * Lets go of the phone's copy of each of `held`, a destination (home, or an
 * archive the person says arrived) now holds, only if it is unchanged since
 * the destination got it. Returns how many left.
 */
export async function letGoUnchanged(
  held: ReadonlyArray<SessionAsOf>
): Promise<number> {
  const asOf = new Map(held.map((s) => [s.id, s.updatedAt]))
  const unchanged = (await sessionsRepository.list())
    .filter((s) => asOf.get(s.id) === s.updatedAt)
    .map((s) => s.id)
  if (unchanged.length > 0) {
    await sessionsRepository.removeMany(unchanged)
    void deviceStorage.refresh()
  }
  return unchanged.length
}
