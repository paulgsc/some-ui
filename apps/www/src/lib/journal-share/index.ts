/**
 * A Build Journal episode's takes, out through Android's share sheet:
 * `takes.json` and each take's audio, in the primer's order, for the agent
 * that splices the video (`@some-ui/soundbites`, `journalFiles`). The person
 * picks where they go (Drive, say), and once they say the files arrived, the
 * episode leaves the phone. Phone-only
 * (`build.paths.ts`).
 */
import type { JournalSent, JournalStore } from "@some-ui/soundbites"

import { foreignValue } from "@/lib/intent/foreign"
import type { SharedFile } from "@/lib/share-files"
import { shareFiles } from "@/lib/share-files"

/**
 * `nothing`: no take to send, so the sheet never opened. `sent`: the episode and takes
 * that went out, the only ones `letGoJournal` may let go.
 */
export type JournalShare = {
  outcome: "shared" | "cancelled" | "nothing"
  sent: JournalSent | null
}

/**
 * `files` is soundbites' `journalFiles` over the phone's store, handed in by
 * the `_apk` route: only that directory may load the phone-only workspace
 * (`build-audience`).
 */
export async function shareJournal(
  files: (
    exportedAt: string,
    timeZone: string
  ) => Promise<{
    files: ReadonlyArray<SharedFile>
    sent: JournalSent
  } | null>,
  now: () => Date = () => new Date()
): Promise<JournalShare> {
  const written = await files(
    now().toISOString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  if (written === null) return { outcome: "nothing", sent: null }
  const outcome = await foreignValue({
    outcome: shareFiles("journal-takes", "Build Journal takes", written.files),
  })
  return { outcome, sent: written.sent }
}

/**
 * The person says the takes arrived: those that went out leave the phone,
 * and the episode with them unless a take was kept or a primer opened since
 * (`letGo`). The
 * Journal tab reads the store again on its own once that lands. Best effort:
 * one that fails leaves the episode on the tab, where "Discard this episode"
 * and the week's expiry still let it go.
 */
export function letGoJournal(
  store: Pick<JournalStore, "letGo">,
  sent: JournalSent
): void {
  // Ignored: one that fails leaves the episode on the tab (above).
  store.letGo(sent).catch(() => undefined)
}
