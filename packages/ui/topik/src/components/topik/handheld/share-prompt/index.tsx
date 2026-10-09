/**
 * "Share the next scene's prompt": the tree prompt, carrying the last drama,
 * out through the phone's share sheet as one file for the learner's drive,
 * where their own agent can answer it (docs/makjang/README.md, "Sharing the
 * next scene"). Offered only where the host has a share sheet; withdrawn if
 * this build turns out to have none.
 */

import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import { useShare } from "@topik/lib/topik/adapter/hooks/use-share"
import type { FileShare } from "@topik/lib/topik/adapter/next-scene-share"
import { nextSceneFile } from "@topik/lib/topik/generation"
import { Check, Share2 } from "lucide-react"

export const SharePrompt = ({
  share,
  prompt,
  onShared,
}: {
  share: FileShare
  /** Built at the tap, so it carries the record as it is then. */
  prompt: () => string
  /** The prompt reached somewhere the learner chose (canon Rem. 7.4). */
  onShared: (prompt: string) => void
}): JSX.Element | null => {
  const { state, start } = useShare(share)
  if (state.kind === "withdrawn") return null
  const tap = (): void => {
    const text = prompt()
    start(nextSceneFile(text, new Date()), () => onShared(text))
  }
  return (
    <div data-slot="topik-share-prompt" className="flex flex-col gap-1">
      <Button
        variant="outline"
        className="h-12 w-full gap-2 rounded-2xl"
        disabled={state.kind === "sharing"}
        onClick={tap}
      >
        {state.kind === "shared" ? (
          <Check className="size-5" />
        ) : (
          <Share2 className="size-5" />
        )}
        Share the next scene&apos;s prompt
      </Button>
      {state.kind === "failed" ? (
        <p className="text-destructive text-sm">{state.summary}</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          A file for your own model or agent: it writes your next drama.
        </p>
      )}
    </div>
  )
}
