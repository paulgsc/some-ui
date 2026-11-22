/**
 * Asking home to hear a take again (#3339), as Takes and Needs your
 * attention both reach it: `@some-ui/soundbites`' `hearAgain` port over the
 * link's one request per ask (`lib/home-link/attention`, LA8), the answer
 * read by `./model`. Every call resolves. A busy link is asked again
 * (`askWhileBusy`) until it frees, so a tap is never dropped for a drain
 * under way. Phone-only (`build.paths.ts`).
 */
import type { HearAgainAnswer } from "@some-ui/soundbites"

import { askHearAgain } from "@/lib/home-link/attention"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import { readHearAgain } from "./model"

export async function hearAgainHome(id: string): Promise<HearAgainAnswer> {
  const asked = await askWhileBusy(() => askHearAgain(id))
  if (asked.kind === "answered") return readHearAgain(asked.answer)
  return { kind: asked.kind === "busy" ? "busy" : "notTaken" }
}
