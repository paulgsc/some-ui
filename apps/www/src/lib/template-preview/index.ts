/**
 * A template's preview (SFEED12, #2757), wired: one runtime (`./runtime`)
 * per template over the link's asks (`lib/home-link/previews`, LA8) and the
 * phone's cache (`lib/call-videos/files`, under the previews' own names).
 * Each is made once per page load, so a preview still coming in keeps coming
 * when the page is left. Phone-only (`build.paths.ts`).
 */
import type { TemplateId } from "@some-ui/video-render"

import { videoFiles } from "@/lib/call-videos/files"
import { readPart } from "@/lib/call-videos/model"
import {
  askMakePreview,
  askPreview,
  askPreviewPart,
  PART_BYTES,
} from "@/lib/home-link/previews"
import { askWhileBusy } from "@/lib/home-link/while-busy"
import type { Refresher } from "@/lib/pull-refresh/refreshers"

import type { HomeState } from "./model"
import { readMade, readPreview } from "./model"
import type { TemplatePreview } from "./runtime"
import { createTemplatePreview } from "./runtime"
import { PREVIEW_WORDS } from "./words"

export type { TemplatePreview } from "./runtime"
export { PREVIEW_WORDS } from "./words"

const made = new Map<TemplateId, TemplatePreview>()

function create(template: TemplateId): TemplatePreview {
  return createTemplatePreview({
    async read(): Promise<HomeState> {
      const asked = await askWhileBusy(() => askPreview(template))
      if (asked.kind === "unpaired") return asked
      if (asked.kind === "unreachable") return { kind: "away" }
      return readPreview(asked.answer)
    },
    async make() {
      const asked = await askWhileBusy(() => askMakePreview(template))
      if (asked.kind === "unpaired") return asked
      if (asked.kind === "answered") return readMade(asked.answer)
      return { kind: "away" }
    },
    async part(id, start, end) {
      const asked = await askWhileBusy(() =>
        askPreviewPart(template, id, start, end)
      )
      return asked.kind === "answered"
        ? readPart(asked.answer)
        : { kind: "away" }
    },
    files: videoFiles("preview"),
    partBytes: PART_BYTES,
  })
}

/** `template`'s preview, made on first use. */
export function templatePreview(template: TemplateId): TemplatePreview {
  const known = made.get(template)
  if (known !== undefined) return known
  const fresh = create(template)
  made.set(template, fresh)
  return fresh
}

/** A drag down on `template`'s preview: reads it again, and says when home didn't answer. */
export function previewRefresher(template: TemplateId): Refresher {
  const preview = templatePreview(template)
  return {
    what: PREVIEW_WORDS.what,
    async checkAgain(): Promise<void> {
      await preview.open()
      const { home } = preview.getSnapshot()
      if (home.kind === "away" || home.kind === "unreadable") {
        throw new Error("home didn't answer")
      }
    },
  }
}
