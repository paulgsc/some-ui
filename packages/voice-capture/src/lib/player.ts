/**
 * Plays a recording's audio, one `Audio` element a playback. VC4
 * (`./take-pattern`): a playback ends when the page is hidden.
 */
import { onPageVisibility } from "./page"

/** One playback of a recording's audio. */
export type Playback = {
  /** Settles when the playback ends, fails or is stopped. */
  ended: Promise<void>
  /** Stops it and releases what it holds. Safe to call twice. */
  stop: () => void
}

export type Player = { play: (audio: Blob) => Playback }

/**
 * Whether the page is hidden, now and on each change; returns the
 * unsubscribe.
 */
export type WatchPage = (listener: (hidden: boolean) => void) => () => void

/**
 * Plays through an `Audio` element. `ended` settles once, whichever comes
 * first: the audio ending, `play()` or the media failing, `stop()`, or the
 * page being hidden (VC4). The object URL is released then too, and the
 * page is no longer watched.
 */
export function elementPlayer(watchPage: WatchPage = onPageVisibility): Player {
  return {
    play(audio): Playback {
      const url = URL.createObjectURL(audio)
      const element = new Audio(url)
      let settle: () => void = () => undefined
      const ended = new Promise<void>((resolve) => {
        settle = resolve
      })
      let done = false
      // Read through a call: the watch below may set `done` before it returns.
      const stopped = (): boolean => done
      let unwatch: (() => void) | null = null
      const stop = (): void => {
        if (done) return
        done = true
        unwatch?.()
        unwatch = null
        element.pause()
        URL.revokeObjectURL(url)
        settle()
      }
      element.onended = stop
      element.onerror = stop
      // Answers at once: a page already hidden plays nothing.
      const watching = watchPage((hidden) => {
        if (hidden) stop()
      })
      if (stopped()) {
        watching()
        return { ended, stop }
      }
      unwatch = watching
      element.play().catch(stop)
      return { ended, stop }
    },
  }
}

/** The phone's player: the page's own visibility. */
export const audioPlayer: Player = elementPlayer()
