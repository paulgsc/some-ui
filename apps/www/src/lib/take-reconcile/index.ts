/**
 * Home, as Studio's Takes › Needs your attention reads it (HEARD3, #3075):
 * `@some-ui/soundbites`' `ReconcileHome` port over the link's one request
 * per read and per act (`lib/home-link/attention`, LA8), the answers read by
 * `./model`, and a take's audio for Play (`lib/home-link/voice-audio`).
 * Every call resolves. A busy link is asked again (`askWhileBusy`): a read
 * only while the page still wants it, an act until the link frees, so a tap
 * is never dropped for a drain under way. Phone-only (`build.paths.ts`).
 */
import type { ReconcileHome } from "@some-ui/soundbites"

import { askAct, askAttention } from "@/lib/home-link/attention"
import { askAudio } from "@/lib/home-link/voice-audio"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import { readAct, readAttention } from "./model"

export const reconcileHome: ReconcileHome = {
  async takes(wanted) {
    const asked = await askWhileBusy(askAttention, wanted)
    if (asked.kind === "answered") return readAttention(asked.answer)
    return asked.kind === "unreachable" ? { kind: "away" } : asked
  },
  audio: (id) => askAudio(id),
  async act(id, act) {
    const asked = await askWhileBusy(() => askAct(id, act))
    if (asked.kind === "answered") return readAct(asked.answer)
    return asked.kind === "busy" ? "busy" : "notTaken"
  },
}
