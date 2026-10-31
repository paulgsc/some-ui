/**
 * "Ask for the next scene" (docs/makjang/README.md, "Asking home for the next
 * scene"): the prompt, with the scene's voice notes named by id, kept by the
 * host to go home, and what the host says of it since.
 */

import type { JSX } from "react"
import { useState, useSyncExternalStore } from "react"
import { Button } from "@some-ui/shared"
import type { SceneAsk } from "@topik/lib/topik/adapter/next-scene-ask"
import type { SceneNote } from "@topik/lib/topik/adapter/scene-voice"
import {
  nextSceneFile,
  sceneStamp,
  voiceNoteName,
} from "@topik/lib/topik/generation"
import { Check, Send } from "lucide-react"

/** Said when the device could not keep the ask. */
const ASK_NOT_KEPT =
  "This phone couldn't keep your ask. Make some room on it, then ask again."

export const AskScene = ({
  asks,
  prompt,
  notes = [],
  onAsked,
  label = "Ask for the next scene",
  labelLang = "en",
  disabled = false,
}: {
  asks: SceneAsk
  /** Not yet: a voice note is still being taken. */
  disabled?: boolean
  /** The button's words: at a drama's ending, the next episode's. */
  label?: string
  labelLang?: "ko" | "en"
  /**
   * Built at the tap, so it carries the record as it is then, naming the
   * voice notes it asks with.
   */
  prompt: (voiceNotes: ReadonlyArray<string>) => string
  /** The scene's voice notes, named in the ask by id. */
  notes?: ReadonlyArray<SceneNote>
  /** The prompt, and the notes by id, are kept to go home (canon Rem. 7.4). */
  onAsked: (prompt: string, notes: ReadonlyArray<string>) => void
}): JSX.Element => {
  const snapshot = useSyncExternalStore(
    asks.subscribe,
    asks.getSnapshot,
    asks.getSnapshot
  )
  // Whether the last tap's ask was refused by the device; a later tap that
  // keeps one clears it.
  const [refused, setRefused] = useState(false)
  const tap = (): void => {
    const at = new Date()
    const named = notes.map(({ id, mimeType }, index) => ({
      id,
      name: voiceNoteName(at, index, mimeType),
    }))
    const text = prompt(named.map(({ name }) => name))
    const ids = named.map(({ id }) => id)
    const kept = asks.ask({
      stamp: sceneStamp(at),
      at: at.toISOString(),
      text: nextSceneFile(text, at, named).text,
      notes: ids,
    })
    setRefused(!kept)
    if (kept) onAsked(text, ids)
  }
  return (
    <div data-slot="topik-ask-scene" className="flex flex-col gap-1">
      <Button
        variant="outline"
        className="h-12 w-full gap-2 rounded-2xl"
        disabled={disabled}
        onClick={tap}
      >
        {snapshot.held ? (
          <Check className="size-5" />
        ) : (
          <Send className="size-5" />
        )}
        <span lang={labelLang}>{label}</span>
      </Button>
      {refused ? (
        <p role="alert" className="text-destructive text-sm">
          {ASK_NOT_KEPT}
        </p>
      ) : (
        <p role="status" className="text-muted-foreground text-xs">
          {snapshot.said}
        </p>
      )}
    </div>
  )
}
