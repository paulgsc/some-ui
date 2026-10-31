/**
 * Who holds the phone's microphone: one holder at a time, across every
 * screen. Every take opens the microphone through `takeRunner`, which claims
 * it here first, and the recognizer (www's `lib/device-listen`) borrows it
 * the same way, so a recorder and a recognizer never fight over it and two
 * screens never record at once (MIC1, #2371).
 *
 * A second claim while one is held is refused, never queued and never taken
 * from the holder: the take that asked ends `blocked` with the reason
 * `elsewhere` ("Another screen is recording."), the issue's recommended
 * answer.
 *
 * The phone runs one WebView, so one owner per page is one per phone. The
 * desktop web's tabs each have their own; no recording screen ships there.
 */

/** A claim on the microphone; `release` is safe to call twice. */
export type MicLease = { readonly release: () => void }

export type MicOwner = {
  /** The microphone for `holder`, or null while another holds it. */
  readonly claim: (holder: string) => MicLease | null
  /** Who holds it now, if anyone. */
  readonly holder: () => string | null
}

/** A fresh owner: the phone's is `phoneMicrophone`; tests make their own. */
export function microphoneOwner(): MicOwner {
  let held: { readonly holder: string } | null = null
  return {
    claim(holder): MicLease | null {
      if (held !== null) return null
      const claim = { holder }
      held = claim
      return {
        release: (): void => {
          // Only this claim's own release frees it: a stale lease released
          // late never frees a later holder's.
          if (held === claim) held = null
        },
      }
    },
    holder: () => held?.holder ?? null,
  }
}

/** The phone's one microphone. */
export const phoneMicrophone: MicOwner = microphoneOwner()
