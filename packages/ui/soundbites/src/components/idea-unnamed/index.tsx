/**
 * A new idea's answers no idea on this phone names (`unnamedTakes`, ST26,
 * #2483), on Your ideas: how many wait, and the owner's way to send them
 * home, where My data deletes a take for good (CLAUDE.md, "Never lose the
 * record"). Nothing here lets one go without the owner's tap.
 */
import type { JSX } from "react"
import { useState, useSyncExternalStore } from "react"
import { Button, Notice } from "@some-ui/shared"
import type { BundleTakes } from "@some-ui/voice-capture"
import type { DraftStore } from "@soundbites/lib/idea/draft"
import type { IdeaStore } from "@soundbites/lib/idea/store"
import { unnamedTakes } from "@soundbites/lib/idea/unnamed"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"

const WORDS = STUDIO_WORDS.unnamed

/** What this reads and does of the desk. */
export type UnnamedDesk = Pick<BundleTakes, "takes" | "release">

export const UnnamedIdeaTakes = ({
  takes,
  drafts,
  ideas,
}: {
  /** The phone's desk of a new idea's takes. */
  takes: UnnamedDesk
  drafts: DraftStore
  ideas: IdeaStore
}): JSX.Element => {
  const all = useSyncExternalStore(
    takes.takes.subscribe,
    takes.takes.getSnapshot
  )
  const [said, setSaid] = useState<{
    kept: boolean
    n: number
  } | null>(null)
  const count = unnamedTakes(all, drafts.read(), ideas.list()).length
  const keep = (): void => {
    // Read again at the tap: only what is unnamed now goes.
    const ids = unnamedTakes(
      takes.takes.getSnapshot(),
      drafts.read(),
      ideas.list()
    ).map(({ id }) => id)
    if (ids.length === 0) return
    const kept = takes.release(ids)
    setSaid((last) => ({ kept, n: (last?.n ?? 0) + 1 }))
  }
  return (
    <>
      {said !== null && (
        <Notice
          key={said.n}
          dismissible
          tone={said.kept ? "neutral" : "danger"}
        >
          {said.kept ? WORDS.kept : WORDS.refused}
        </Notice>
      )}
      {count > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl border px-4 py-3">
          <h2 className="font-medium">{WORDS.heading}</h2>
          <p className="text-muted-foreground text-sm">{WORDS.line(count)}</p>
          <Button size="sm" onClick={keep}>
            {WORDS.keep}
          </Button>
          <p className="text-muted-foreground text-xs">{WORDS.keepLine}</p>
        </section>
      )}
    </>
  )
}
