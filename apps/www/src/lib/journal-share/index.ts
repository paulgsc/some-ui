/**
 * A Studio video's files out through Android's share sheet, for Claude:
 * `project.json`, `takes.json` and each take's audio still on the phone
 * (`@some-ui/soundbites`, `studioFiles`). The person picks where they go
 * (Drive, say), and once they say the files arrived, the takes that went out
 * are kept by Drive and leave the phone. An idea goes out the same way, as
 * its text alone (`shareIdea`, ST19). Phone-only (`build.paths.ts`).
 */
import { foreignValue } from "@/lib/intent/foreign"
import type { SharedFile } from "@/lib/share-files"
import { shareFiles } from "@/lib/share-files"

/** `sent`: the takes that went out, the only ones the person may say arrived. */
export type StudioShare = {
  outcome: "shared" | "cancelled"
  sent: ReadonlyArray<string>
}

/**
 * `files` is soundbites' `studioFiles` over the phone's store and the
 * project on screen, handed in by the `_apk` route: only that directory may
 * load the phone-only workspace (`build-audience`).
 */
export async function shareStudio(
  files: (
    exportedAt: string,
    timeZone: string
  ) => Promise<{
    files: ReadonlyArray<SharedFile>
    sent: ReadonlyArray<string>
  }>,
  title: string,
  now: () => Date = () => new Date()
): Promise<StudioShare> {
  const written = await files(
    now().toISOString(),
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )
  const outcome = await foreignValue({
    outcome: shareFiles("journal-takes", title, written.files),
  })
  return { outcome, sent: written.sent }
}

/**
 * One idea out through the share sheet, for Claude to flesh out (ST19): its
 * answers as text (soundbites' `ideaFile`), and nothing else.
 */
export function shareIdea(
  file: SharedFile,
  title: string
): Promise<"shared" | "cancelled"> {
  return foreignValue({ outcome: shareFiles("studio-idea", title, [file]) })
}
