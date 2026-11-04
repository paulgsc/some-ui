/**
 * Home, as Studio's Takes on home reads it (STUDIO ST32, #2590):
 * `@some-ui/soundbites`' `TakesHome` port over the link's one request per
 * read (`lib/home-link/takes-read`, LA8), its answer read by `./model`, and
 * a take's audio for Play (`lib/home-link/voice-audio`, one request per
 * play). Every call resolves, and says in the screen's own terms why it has
 * nothing. A read that finds the link busy with another run asks again a
 * second later, at most ten times, as My data's and Ideas on home's do, and
 * not at all once the screen no longer wants it (a newer search, or the
 * screen left). Phone-only (`build.paths.ts`).
 */
import type { TakesHome } from "@some-ui/soundbites"

import { askTakes } from "@/lib/home-link/takes-read"
import { askAudio } from "@/lib/home-link/voice-audio"

import { readTakes } from "./model"

const TRIES = 10
const WAIT_MS = 1_000

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export const takesHome: TakesHome = {
  async takes(q, wanted) {
    for (let tried = 0; tried < TRIES && wanted(); tried += 1) {
      const asked = await askTakes(q)
      if (asked.kind === "answered") return readTakes(asked.answer)
      if (asked.kind === "unpaired") return { kind: "unpaired" }
      if (asked.kind === "unreachable") return { kind: "away" }
      await wait(WAIT_MS)
    }
    return { kind: "away" }
  },
  audio: (id) => askAudio(id),
}
