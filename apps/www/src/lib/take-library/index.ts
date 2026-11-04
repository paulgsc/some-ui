/**
 * Home, as Studio's Takes on home reads it (ST32): `@some-ui/soundbites`'
 * `TakesHome` port over the link's one request per read
 * (`lib/home-link/takes-read`, LA8), its answer read by `./model`, and a
 * take's audio for Play (`lib/home-link/voice-audio`). Every call resolves.
 * A busy link is asked again (`askWhileBusy`), but not once the screen no
 * longer wants the read (a newer one, or the screen left). Phone-only
 * (`build.paths.ts`).
 */
import type { TakesHome } from "@some-ui/soundbites"

import { askTakes } from "@/lib/home-link/takes-read"
import { askAudio } from "@/lib/home-link/voice-audio"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import { readTakes } from "./model"

export const takesHome: TakesHome = {
  async takes(q, wanted) {
    const asked = await askWhileBusy(() => askTakes(q), wanted)
    if (asked.kind === "answered") return readTakes(asked.answer)
    return asked.kind === "unpaired" ? asked : { kind: "away" }
  },
  audio: (id) => askAudio(id),
}
