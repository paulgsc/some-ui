/**
 * An episode as files for the agent that splices it: `takes.json`, the
 * primer's cuts in order, each with the file of its take (or null), and the
 * takes' audio named for their place and cut (`01-gap.webm`). The order is
 * the primer's, never the recording's, so a redo lands on its own cut.
 */
import type { JournalPlan, JournalTake } from "./plan"
import { targetOf } from "./plan"
import type { JournalStore } from "./store"

export type JournalFile = {
  readonly name: string
  readonly data: string | Blob
}

/** `audio/webm;codecs=opus` -> `webm`. */
function extensionOf(mimeType: string): string {
  return mimeType.split(/[/;]/)[1] ?? "bin"
}

/** Each kept take's file name, by cut id. */
export function takeFileNames(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>
): Map<string, string> {
  const names = new Map<string, string>()
  plan.primer.cuts.forEach((cut, i) => {
    const take = takes.find((each) => each.cutId === cut.id)
    if (take !== undefined)
      names.set(
        cut.id,
        `${String(i + 1).padStart(2, "0")}-${cut.id}.${extensionOf(take.mimeType)}`
      )
  })
  return names
}

/** `takes.json`'s text. */
export function journalManifest(
  plan: JournalPlan,
  takes: ReadonlyArray<JournalTake>,
  exportedAt: string,
  timeZone: string
): string {
  const names = takeFileNames(plan, takes)
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
      cuts: plan.primer.cuts.map((cut) => {
        const take = takes.find((each) => each.cutId === cut.id)
        return {
          id: cut.id,
          artifact: cut.artifact,
          prompt: cut.prompt,
          targetMs: targetOf(plan, cut),
          take:
            take === undefined
              ? null
              : {
                  file: names.get(cut.id),
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
 * The episode on the phone as files, or null with no take to send. A take
 * whose audio has gone is listed with `take: null`, not sent half.
 */
export async function journalFiles(
  store: JournalStore,
  exportedAt: string,
  timeZone: string
): Promise<Array<JournalFile> | null> {
  const { plan, takes } = await store.read()
  if (plan === null) return null
  const withAudio = await Promise.all(
    takes.map(async (take) => ({ take, audio: await store.audio(take.cutId) }))
  )
  const sent = withAudio.filter(
    (each): each is { take: JournalTake; audio: Blob } => each.audio !== null
  )
  if (sent.length === 0) return null
  const kept = sent.map((each) => each.take)
  const names = takeFileNames(plan, kept)
  return [
    {
      name: "takes.json",
      data: journalManifest(plan, kept, exportedAt, timeZone),
    },
    ...sent.map((each) => ({
      name: names.get(each.take.cutId) ?? `${each.take.cutId}.bin`,
      data: each.audio,
    })),
  ]
}
