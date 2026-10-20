/** One playback of a recording's audio. */
export type Playback = {
  /** Settles when the playback ends, fails or is stopped. */
  ended: Promise<void>
  /** Stops it and releases what it holds. Safe to call twice. */
  stop: () => void
}

export type Player = { play: (audio: Blob) => Playback }

/**
 * Plays through an `Audio` element. `ended` settles once, whichever comes
 * first: the audio ending, `play()` failing, or `stop()`. The object URL is
 * released then too.
 */
export const audioPlayer: Player = {
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
