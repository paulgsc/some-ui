import { letGoReflections } from "@/lib/reflection-voice"
import { reflections } from "@/lib/session-reflection"

/**
 * Lets these reflections go for good: on the phone with their voice notes'
 * audio, elsewhere (no voice notes) just the list. The flag is read inline so
 * other builds drop the audio module (src/vite-env.d.ts).
 */
export function letGo(ids: ReadonlyArray<string>): void {
  if (import.meta.env.VITE_DEVICE_BACKEND === "true") letGoReflections(ids)
  else reflections.letGo(ids)
}
