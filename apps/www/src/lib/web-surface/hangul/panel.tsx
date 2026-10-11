import type { ComponentProps, JSX } from "react"
// This module is itself the lazy chunk: the door (`..`) reaches it only
// through `import()`, so this static edge costs no host anything eagerly.
// eslint-disable-next-line lazy-registry/no-eager-registry-import
import { HangulHexGrid } from "@some-ui/honeycomb"

import { useAudioPreferences } from "@/lib/audio-preferences/use-audio-preferences"
import { useSessionKey, useSuspended } from "@/lib/orchestrator"

import { useHangulVocab } from "./vocab"

/** What a saved scene carries (`toSceneProps` in the activity catalog). */
type HangulPanelProps = Pick<
  ComponentProps<typeof HangulHexGrid>,
  "mode" | "difficulty"
>

/**
 * Hangul Honeycomb as the web surface binds it: the game, with what this app
 * owns read here rather than injected by the player, so the player has no
 * Honeycomb knowledge to carry into the Android app's build.
 *
 * - `sessionKey` and `suspended`: the placing session, and whether the live
 *   layout editor holds the screen.
 * - `words`: the served vocab where there is one (`./vocab`).
 * - `audio`: the person's "Game sounds" choice.
 */
export const HangulPanel = ({
  mode,
  difficulty,
}: HangulPanelProps): JSX.Element => {
  const sessionKey = useSessionKey()
  const suspended = useSuspended()
  const words = useHangulVocab()
  const { preferences } = useAudioPreferences()

  return (
    <HangulHexGrid
      mode={mode}
      difficulty={difficulty}
      sessionKey={sessionKey ?? undefined}
      suspended={suspended}
      words={words}
      audio={preferences.effects}
    />
  )
}
