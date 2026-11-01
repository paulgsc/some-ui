/**
 * Home's word that Drive holds a Studio take too (HF11, #2401; the owner's
 * route a): which of the takes home holds, still on this phone, home has
 * seen in a Build Journal session's list of Drive's takes (paulgsc/server
 * `GET /voice-notes/on-drive`, `voice_repo::on_drive`). Home never reaches
 * Drive; the session tells it, through the Jobs mailbox.
 *
 * One read only, over the voice lane's `send` (`./voice-copy`'s
 * `sendVoice`), so this module makes no request of its own and sends
 * nothing of the phone's but the takes' ids. What the phone then lets go is
 * the owner's choice's (soundbites' `lib/project/let-go`, LG1).
 */
import type { HomeCall } from "@some-ui/core-utils"
import { readAs } from "@some-ui/core-utils"
import { z } from "zod"

/** Home's most ids in one read (`voice_repo::on_drive::MAX_IDS`). */
export const ON_DRIVE_MAX_IDS = 100

const OnDriveAnswer = z.object({
  onDrive: z.array(z.object({ note: z.string(), listedAt: z.string() })),
})

/** The read for `ids`, as home takes it: comma-separated, each encoded. */
export function onDrivePath(ids: ReadonlyArray<string>): string {
  return `/voice-notes/on-drive?ids=${ids.map(encodeURIComponent).join(",")}`
}

/**
 * Which of `ids` home knows Drive holds, asked at most
 * `ON_DRIVE_MAX_IDS` at a time; null when home did not answer as it should
 * (a home without the read yet, say), so nothing is let go on it.
 */
export async function askOnDrive(
  send: HomeCall,
  ids: ReadonlyArray<string>
): Promise<ReadonlySet<string> | null> {
  const found = new Set<string>()
  for (let at = 0; at < ids.length; at += ON_DRIVE_MAX_IDS) {
    const chunk = ids.slice(at, at + ON_DRIVE_MAX_IDS)
    const answer = await send("GET", onDrivePath(chunk))
    if (answer.status !== 200) return null
    const read = readAs(OnDriveAnswer, answer.body)
    if (read === null) return null
    const asked = new Set(chunk)
    for (const take of read.onDrive)
      if (asked.has(take.note)) found.add(take.note)
  }
  return found
}
