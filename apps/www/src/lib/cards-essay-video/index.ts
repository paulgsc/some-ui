/**
 * A cards essay's video (CARDS7, #2979), wired: one runtime (`./runtime`)
 * per essay over the link's asks (`lib/home-link/cards-essays`) and the
 * phone's cache (`lib/call-videos/files`, under the essays' own names). Each
 * is made once per page load, so a video still coming in keeps coming when
 * the page is left. Phone-only (`build.paths.ts`).
 */
import { videoFiles } from "@/lib/call-videos/files"
import { readPart } from "@/lib/call-videos/model"
import { PART_BYTES } from "@/lib/call-videos/parts"
import { askCardsEssayPart } from "@/lib/home-link/cards-essays"
import { askWhileBusy } from "@/lib/home-link/while-busy"

import type { EssayVideo } from "./runtime"
import { createEssayVideo } from "./runtime"

export type { EssayVideo } from "./runtime"
export { essayOf } from "./model"
export { ESSAY_WORDS } from "./words"

const made = new Map<string, EssayVideo>()

/** Essay `key`'s video, made on first use. */
export function essayVideo(key: string): EssayVideo {
  const known = made.get(key)
  if (known !== undefined) return known
  const fresh = createEssayVideo(key, {
    async part(start, end) {
      const asked = await askWhileBusy(() => askCardsEssayPart(key, start, end))
      return asked.kind === "answered"
        ? readPart(asked.answer)
        : { kind: "away" }
    },
    files: videoFiles("cards-essay"),
    partBytes: PART_BYTES,
  })
  made.set(key, fresh)
  return fresh
}
