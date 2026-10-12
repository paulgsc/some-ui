import { useSyncExternalStore } from "react"
import type {
  SceneVoice,
  SceneVoiceSnapshot,
} from "@topik/lib/topik/adapter/scene-voice"

const none = (): null => null
const quiet = (): (() => void) => () => undefined

/** The scene voice's snapshot; `null` where the host offers none. */
export function useSceneVoice(
  voice: SceneVoice | undefined
): SceneVoiceSnapshot | null {
  return useSyncExternalStore(
    voice?.subscribe ?? quiet,
    voice?.getSnapshot ?? none,
    none
  )
}
