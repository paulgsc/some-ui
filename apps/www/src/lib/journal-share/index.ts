/**
 * A Build Journal episode's takes, out through Android's share sheet:
 * `takes.json` and each take's audio, in the primer's order, for the agent
 * that splices the video (`@some-ui/soundbites`, `journalFiles`). The person
 * picks where they go (Drive's `Build Journal/voice/takes`), and once they
 * say the files arrived, the episode leaves the phone. Phone-only
 * (`build.paths.ts`).
 */
import type { JournalStore } from "@some-ui/soundbites"

import { foreignValue } from "@/lib/intent/foreign"
import type { SharedFile } from "@/lib/share-files"
import { shareFiles } from "@/lib/share-files"

/** `nothing`: no take to send, so the sheet never opened. */
export type JournalShare = "shared" | "cancelled" | "nothing"

/**
 * `files` is soundbites' `journalFiles` over the phone's store, handed in by
 * the `_apk` route: only that directory may load the phone-only workspace
 * (`build-audience`).
 */
export async function shareJournal(
  files: (
    exportedAt: string,
    timeZone: string
  ) => Promise<ReadonlyArray<SharedFile> | null>,
  now: () => Date = () => new Date()
): Promise<JournalShare> {
  const written = await files(
    now().toISOString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  if (written === null) return "nothing"
  return foreignValue({
    outcome: shareFiles("journal-takes", "Build Journal takes", written),
  })
}

/**
 * The person says the takes arrived: the episode leaves the phone. The
 * Journal tab reads the store again on its own once the clear lands. Best
 * effort: a clear that fails leaves the episode on the tab, where "Discard
 * this episode" and the week's expiry still let it go.
 */
export function letGoJournal(store: Pick<JournalStore, "clear">): void {
  store.clear().catch(() => undefined)
}
