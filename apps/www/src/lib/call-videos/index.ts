/**
 * Studio's Calls (ST38, #2661), wired: the runtime (`./runtime`) over the
 * link's reads and sends (`lib/home-link/call-videos`, LA8), the phone's
 * cache (`./files`) and the share sheet (`lib/share-files`). One runtime per
 * page load, so a video still coming in keeps coming when the screen is left.
 * Phone-only (`build.paths.ts`).
 */
import {
  askCallVideos,
  askVideoPart,
  PART_BYTES,
  sendLink,
} from "@/lib/home-link/call-videos"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import { shareUris } from "@/lib/share-files"

import { DIR, videoFiles } from "./files"
import type { ListState } from "./model"
import { readLinkSaved, readPart, readWeeks } from "./model"
import type { CallVideos } from "./runtime"
import { createCallVideos } from "./runtime"
import { CALLS_WORDS } from "./words"

export type { CallVideos } from "./runtime"
export { CALLS_WORDS } from "./words"

let runtime: CallVideos | null = null

export function callVideos(): CallVideos {
  if (runtime !== null) return runtime
  runtime = createCallVideos({
    async list(): Promise<ListState> {
      const asked = await askWhileBusy(() => askCallVideos())
      if (asked.kind === "unpaired") return asked
      if (asked.kind === "unreachable") return { kind: "away" }
      return readWeeks(asked.answer)
    },
    async part(from, start, end) {
      const asked = await askWhileBusy(() => askVideoPart(from, start, end))
      return asked.kind === "answered"
        ? readPart(asked.answer)
        : { kind: "away" }
    },
    files: videoFiles,
    async share(uri, from) {
      const shared = await shareUris(DIR, CALLS_WORDS.shareTitle(from), [uri])
      return shared.status === "succeeded" ? shared.value : "failed"
    },
    async saveLink(from, link) {
      const asked = await sendLink(from, link)
      return asked.kind === "answered"
        ? readLinkSaved(asked.answer)
        : { kind: "away" }
    },
    partBytes: PART_BYTES,
  })
  return runtime
}

/**
 * A drag down on Calls reads the list again, and says it couldn't when home
 * didn't answer.
 */
export const callsRefresher = {
  what: "the call's videos",
  async checkAgain(): Promise<void> {
    await callVideos().open()
    const { list } = callVideos().getSnapshot()
    if (list.kind === "away" || list.kind === "unreadable") {
      throw new Error("home didn't answer")
    }
  },
}
