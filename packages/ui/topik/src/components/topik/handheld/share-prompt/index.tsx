/**
 * "Share the next scene's prompt" (docs/makjang/README.md, "Sharing the next
 * scene"); withdrawn if this build turns out to have no share sheet.
 */

import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import { useShare } from "@topik/lib/topik/adapter/hooks/use-share"
import type { FileShare } from "@topik/lib/topik/adapter/next-scene-share"
import type { SceneNote } from "@topik/lib/topik/adapter/scene-voice"
import { nextSceneFile, voiceNoteName } from "@topik/lib/topik/generation"
import { Check, Share2 } from "lucide-react"

export const SharePrompt = ({
  share,
  prompt,
  notes = [],
  onShared,
  label = "Share the next scene's prompt",
  labelLang = "en",
  disabled = false,
}: {
  share: FileShare
  /** Not yet: a voice note is still being taken. */
  disabled?: boolean
  /** The button's words: at a drama's ending, the next episode's. */
  label?: string
  labelLang?: "ko" | "en"
  /**
   * Built at the tap, so it carries the record as it is then, naming the
   * voice notes shared beside it.
   */
  prompt: (voiceNotes: ReadonlyArray<string>) => string
  /** The scene's voice notes, shared with the prompt. */
  notes?: ReadonlyArray<SceneNote>
  /**
   * The prompt, and the notes by id, reached somewhere the learner chose
   * (canon Rem. 7.4).
   */
  onShared: (prompt: string, notes: ReadonlyArray<string>) => void
}): JSX.Element | null => {
  const { state, start } = useShare(share)
  if (state.kind === "withdrawn") return null
  const tap = (): void => {
    const at = new Date()
    const named = notes.map(({ id, mimeType }, index) => ({
      id,
      name: voiceNoteName(at, index, mimeType),
    }))
    const text = prompt(named.map(({ name }) => name))
    start({ ...nextSceneFile(text, at, named), notes: named }, () =>
      onShared(
        text,
        named.map(({ id }) => id)
      )
    )
  }
  return (
    <div data-slot="topik-share-prompt" className="flex flex-col gap-1">
      <Button
        variant="outline"
        className="h-12 w-full gap-2 rounded-2xl"
        disabled={disabled || state.kind === "sharing"}
        onClick={tap}
      >
        {state.kind === "shared" ? (
          <Check className="size-5" />
        ) : (
          <Share2 className="size-5" />
        )}
        <span lang={labelLang}>{label}</span>
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
