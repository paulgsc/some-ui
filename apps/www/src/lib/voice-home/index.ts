/**
 * The phone's voice notes on their way home (`./runtime`): one store per
 * page load, its record in this device's storage, the copies' audio on a
 * shelf of their own. Phone-only (`build.paths.ts`). What copies a note and
 * when is the home link's voice lane (`lib/home-link/voice`).
 */
import { sha256Hex } from "@some-ui/core-utils"
import { SOUNDBITE_TAKE_MAX_BYTES } from "@some-ui/soundbites/contract"
import { savingShelf } from "@some-ui/voice-capture"

import { base64 } from "@/lib/share-files"
import { browserLocalStorage } from "@/lib/tenant/storage"

import type { VoiceHome } from "./runtime"
import { createVoiceHome } from "./runtime"

/**
 * Room for the copies home doesn't hold yet: a minute each, up to a hundred,
 * days of notes while the phone is away from home. Past it, a note waits on
 * its own screen's shelf until a copy fits.
 */
const VOICE_HOME_MAX_BYTES = 100 * SOUNDBITE_TAKE_MAX_BYTES

const shelf = savingShelf({
  dbName: "some-ui.voice-home",
  maxBytes: VOICE_HOME_MAX_BYTES,
})

let voiceHome: VoiceHome | null = null

/** Made on first use, so importing this module reads nothing. */
export function phoneVoiceHome(): VoiceHome {
  if (voiceHome === null) {
    voiceHome = createVoiceHome({
      storage: browserLocalStorage,
      shelf: shelf.shelf(),
      encode: async (blob) => ({
        base64: await base64(blob),
        sha256: await sha256Hex(await blob.arrayBuffer()),
      }),
      now: () => Date.now(),
    })
    voiceHome.sweep()
  }
  return voiceHome
}
