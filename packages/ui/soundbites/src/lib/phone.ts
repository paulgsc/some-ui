/**
 * The ports as the phone provides them: IndexedDB, the microphone, an
 * `Audio` element, the clock and the page's visibility. The one place the
 * runtime meets the browser's own machines, each wrapped so that what comes
 * back is a result, never a state we then claim to know.
 */
import { startMicRecording } from "./recorder"
import type { Playback, Player, SoundbitesPorts } from "./runtime"
import type { SoundbiteStore } from "./store"
import { indexedDbSoundbiteStore } from "./store"

/**
 * Plays through an `Audio` element. `ended` settles once, whichever comes
 * first: the audio ending, `play()` failing, or `stop()`. The object URL is
 * released then too.
 */
const audioPlayer: Player = {
  play(audio): Playback {
    const url = URL.createObjectURL(audio)
    const element = new Audio(url)
    let settle: () => void = () => undefined
    const ended = new Promise<void>((resolve) => {
      settle = resolve
    })
    let done = false
    const stop = (): void => {
      if (done) return
      done = true
      element.pause()
      URL.revokeObjectURL(url)
      settle()
    }
    element.onended = stop
    element.play().catch(stop)
    return { ended, stop }
  },
}

function onPageHidden(listener: () => void): () => void {
  const onChange = (): void => {
    if (document.visibilityState === "hidden") listener()
  }
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}

/** One store per page load, so the database opens once. */
let store: SoundbiteStore | null = null

export function phonePorts(): SoundbitesPorts {
  store ??= indexedDbSoundbiteStore()
  return {
    store,
    startRecording: startMicRecording,
    player: audioPlayer,
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
    onHidden: onPageHidden,
  }
}
