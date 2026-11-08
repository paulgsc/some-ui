/**
 * A new idea's answers no idea on this phone names (ST26, #2483), on Your
 * ideas: how many wait, and the owner's two ways to let them go. Keeping
 * them lets them go home as every take does; deleting them is for good,
 * asked once, since they never left the phone. Nothing here lets one go
 * without the owner's tap. Which takes are unnamed is `unnamedTakes`.
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

type Said = "kept" | "deleted" | "refused"

/** What this reads and does of the desk. */
export type UnnamedDesk = Pick<BundleTakes, "takes" | "release" | "discard">

export const UnnamedIdeaTakes = ({
  takes,
  drafts,
  ideas,
}: {
  /** The phone's desk of a new idea's takes. */
  takes: UnnamedDesk
  drafts: DraftStore
  ideas: IdeaStore
}): JSX.Element | null => {
  const all = useSyncExternalStore(
    takes.takes.subscribe,
    takes.takes.getSnapshot
  )
  const [asking, setAsking] = useState(false)
  const [said, setSaid] = useState<{ said: Said; n: number } | null>(null)
  const unnamed = unnamedTakes(all, drafts.read(), ideas.list())
  const notice =
    said === null ? null : (
      <Notice
        key={said.n}
        tone={said.said === "refused" ? "danger" : "neutral"}
        onDismiss={() => setSaid(null)}
      >
        {WORDS[said.said]}
      </Notice>
    )
  if (unnamed.length === 0) return notice
  const ids = unnamed.map(({ id }) => id)
  const ended = (done: boolean, ok: "kept" | "deleted"): void => {
    setAsking(false)
    setSaid((last) => ({ said: done ? ok : "refused", n: (last?.n ?? 0) + 1 }))
  }
  return (
    <section className="flex flex-col gap-2 rounded-2xl border px-4 py-3">
      {notice}
      <h2 className="font-medium">{WORDS.heading}</h2>
      <p className="text-muted-foreground text-sm">
        {WORDS.line(unnamed.length)}
      </p>
      {asking ? (
        <>
          <p className="text-sm">{WORDS.ask}</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => ended(takes.discard(ids), "deleted")}
            >
              {WORDS.confirm}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              {WORDS.cancel}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Button size="sm" onClick={() => ended(takes.release(ids), "kept")}>
            {WORDS.keep}
          </Button>
          <p className="text-muted-foreground text-xs">{WORDS.keepLine}</p>
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
            {WORDS.delete}
          </Button>
        </>
      )}
    </section>
  )
}
