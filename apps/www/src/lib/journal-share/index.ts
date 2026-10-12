/**
 * A Build Journal episode's takes, out through Android's share sheet:
 * `takes.json` and each take's audio, in the primer's order, for the agent
 * that splices the video (`@some-ui/soundbites`, `journalFiles`). The person
 * picks where they go (Drive's `Build Journal/voice/takes`). Once they say
 * the files arrived, the episode leaves the phone: it is a draft on its way
 * to Drive, not an archive. Phone-only (`build.paths.ts`).
 */
import { journalFiles, phoneJournalStore } from "@some-ui/soundbites"

import { foreignValue } from "@/lib/intent/foreign"
import { shareFiles } from "@/lib/share-files"

/** `nothing`: no take to send, so the sheet never opened. */
export type JournalShare = "shared" | "cancelled" | "nothing"

export async function shareJournal(
  now: () => Date = () => new Date()
): Promise<JournalShare> {
  const files = await journalFiles(
    phoneJournalStore(),
    now().toISOString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  if (files === null) return "nothing"
  return foreignValue({
    outcome: shareFiles("journal-takes", "Build Journal takes", files),
  })
}

/**
 * The person says the takes arrived: the episode leaves the phone. The
 * Journal tab reads the store again on its own once the clear lands. Best
 * effort: a clear that fails leaves the episode on the tab, where "Discard
 * this episode" and the week's expiry still let it go.
 */
export function letGoJournal(): void {
  phoneJournalStore()
    .clear()
    .catch(() => undefined)
}
