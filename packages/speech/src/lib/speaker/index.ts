/**
 * @module speaker
 *
 * The only way a page's applets speak: through the speech session, never
 * through an adapter.
 *
 * The session owns everything a person decides about speech - which voice,
 * whether it is muted - and everything they are told about it (the notices).
 * An applet that held the adapter itself could step around all three, and
 * did: TOPIK named its own voice on every line, so the one chosen in
 * Settings never spoke, and called the adapter directly, so muting stopped
 * only the line already playing. A `Speaker` has no voice to name and no
 * adapter to reach; it says a line in a language, and the session does the
 * rest.
 */

import type { SpeakOptions, VoiceReport } from "@speech/lib/adapters/types"

export type SayOptions = Pick<
  SpeakOptions,
  "signal" | "onStart" | "onBoundary" | "volume" | "playbackRate"
> & {
  /** BCP-47 tag of the text. The session picks the voice for it. */
  lang: string
}

export type Speaker = {
  /** False when nothing here can speak at all; muting does not change it. */
  readonly available: boolean
  /**
   * Speaks `text` and resolves when it has been heard. Rejects with an
   * `AbortError` when the line is cancelled (`stop`, the signal, a newer
   * line) or the session is muted - the line was not heard, and nothing
   * failed - and with the backend's error when speech failed.
   */
  say: (text: string, options: SayOptions) => Promise<void>
  /** Stops whatever this page is saying. */
  stop: () => void
  /**
   * Who would speak a line in `lang`: the platform and the voice, by name.
   * For showing a person, not for choosing - an applet still cannot pick.
   */
  describe: (lang: string) => VoiceReport
  /** Whether the person has muted voice output; `say` refuses meanwhile. */
  readonly muted: boolean
  /**
   * Calls `listener` when `muted` or `describe` may have changed. Returns
   * the unsubscribe. A caller that held a line back while muted replays it
   * from here, and a display of `describe` refreshes from here.
   */
  subscribe: (listener: () => void) => () => void
}
