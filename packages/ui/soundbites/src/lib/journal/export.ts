/**
 * An episode as files for the agent that splices it: `takes.json`, the
 * primer's cuts in order, each with the file of its take (or null), and the
 * takes' audio named for their place and cut (`01-gap.webm`). The order is
 * the primer's, never the recording's, so a redo lands on its own cut.
 */
import { extensionOf } from "@some-ui/core-utils"

import type { JournalPlan, JournalTake } from "./plan"
import { targetOf } from "./plan"
import type { JournalSent, JournalStore } from "./store"

type JournalFile = {
  readonly name: string
  readonly data: string | Blob
}

/** A take's file: its cut's place in the primer, its cut's id, its type. */
function fileNameOf(plan: JournalPlan, take: JournalTake): string {
  const place = plan.primer.cuts.findIndex((cut) => cut.id === take.cutId) + 1
  return `${String(place).padStart(2, "0")}-${take.cutId}.${extensionOf(take.mimeType)}`
}

/** `takes.json`'s text. */
export function journalManifest(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>,
  exportedAt: string,
  timeZone: string
): string {
  return JSON.stringify(
    {
      kind: "build-journal-takes",
      version: 1,
      about:
        "Voice takes for one Build Journal episode, recorded on the phone against a primer. Cuts play in this order; each take's audio is the file named in `take.file`, and a cut with `take: null` was not recorded.",
      title: plan.primer.title,
      exportedAt,
      timeZone,
      budgetMs: plan.primer.budgetMs,
      voice: plan.primer.voice,
      cuts: plan.primer.cuts.map((cut) => {
        const take = takes.find((each) => each.cutId === cut.id)
        return {
          id: cut.id,
          artifact: cut.artifact,
          prompt: cut.prompt,
          point: cut.point,
          line: cut.line,
          keep: cut.keep,
          voice: cut.voice,
          targetMs: targetOf(plan, cut),
          take:
            take === undefined
              ? null
              : {
                  file: fileNameOf(plan, take),
                  recordedAt: take.recordedAt,
                  durationMs: Math.round(take.durationMs),
                  mimeType: take.mimeType,
                },
        }
      }),
    },
    null,
    2
  )
}

/**
 * The episode on the phone as files, and the takes they carry (for
 * `JournalStore.letGo` once they arrive), or null with no take to send. A
 * take whose audio has gone is listed with `take: null`, not sent half.
 */
export async function journalFiles(
  store: Pick<JournalStore, "snapshot">,
  exportedAt: string,
  timeZone: string
): Promise<{
  files: Array<JournalFile>
  sent: JournalSent
} | null> {
  const { plan, takes: sent } = await store.snapshot()
  if (plan === null || sent.length === 0) return null
  const kept = sent.map((each) => each.take)
  return {
    files: [
      {
        name: "takes.json",
        data: journalManifest(plan, kept, exportedAt, timeZone),
      },
      ...sent.map((each) => ({
        name: fileNameOf(plan, each.take),
        data: each.audio,
      })),
    ],
    sent: { openedAt: plan.openedAt, takes: kept },
  }
}
