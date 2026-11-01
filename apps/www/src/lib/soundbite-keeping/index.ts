/**
 * What the soundbites page hands to the home link (HF5, #2180), as Studio's
 * route does (`lib/studio-keeping`): `@some-ui/soundbites` is the phone's
 * alone, so only its `_apk` routes load it (packages/some-vite-config/
 * AUDIENCES.md). The page hands its store in (`keepSoundbites`), and the
 * voice lane and the drain (`lib/home-link`) read it, naming soundbites'
 * types alone. This module calls nothing of the link and sends nothing: it
 * only holds what was handed in. Until the page has loaded in this run of
 * the app, the lanes carry no soundbite, and each waits on the phone for
 * the next send after it has.
 */
import type { SoundbiteStore } from "@some-ui/soundbites"

import { handedIn } from "@/lib/handed-in"

/** What the lanes need of the soundbites, handed in by their page. */
type SoundbiteKeeping = {
  /** What the lanes read of the kept soundbites. */
  readonly store: Pick<SoundbiteStore, "list" | "audio" | "subscribe">
  /**
   * How to read what home holds of them, audio and record both, once per
   * look: those may make room for a new one at the cap (soundbites'
   * `soundbitesHeldByHome`).
   */
  readonly heldByHome: (next: () => (id: string) => boolean) => void
}

const soundbites = handedIn<SoundbiteKeeping>()

/** The soundbites page hands its pieces in; the lanes then carry them. */
export const keepSoundbites = soundbites.keep

/** The soundbites' pieces, once their page has handed them in; null until then. */
export const soundbiteKeeping = soundbites.kept

/** Calls `listener` once the soundbites' pieces are handed in. */
export const onSoundbitesKept = soundbites.onKept
