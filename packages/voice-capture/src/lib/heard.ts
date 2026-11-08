/**
 * What home said of a voice note's words, once asked
 * (paulgsc/server `GET /voice-notes/:id/heard`, read by apps/www
 * `lib/home-link/heard`): Studio's idea answers (MIC10) and Rust Rounds'
 * week (RR13) read it alike.
 */
export type HeardAnswer =
  /** Home heard it: its words, empty when it heard none. */
  | { readonly kind: "heard"; readonly text: string }
  /** Home holds the take and hasn't heard it yet. */
  | { readonly kind: "notYet" }
  /**
   * Home doesn't know the take's words: it doesn't hold it yet, or (when
   * the phone has read back that it does) it can't give words back.
   */
  | { readonly kind: "notHeld" }
  /** The link was busy with another run: nothing was asked. */
  | { readonly kind: "busy" }
  /** Home couldn't be asked, or didn't answer as it should. */
  | { readonly kind: "unreachable" }
