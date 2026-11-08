/**
 * A template's preview on home (SFEED12, #2757; paulgsc/server
 * `routes::previews`), through the link (LA8):
 *
 * - `POST /previews/:template` asks home to make one, each time Preview is
 *   pressed; home makes none while one is still being made;
 * - `GET /previews/:template` reads the newest, on open, a drag down, Try
 *   again, and once after Preview;
 * - `GET /previews/:template/:id/video`, a range of at most `PART_BYTES`
 *   per part, while Watch brings preview `id` to the phone; naming it means a
 *   newer preview can't be sent in its place.
 *
 * Nothing of the phone's is sent. What the screen makes of each answer is
 * `lib/template-preview`'s, its one caller.
 */
import type { TemplateId } from "@some-ui/video-render"

import type { CallAsked } from "./asked"
import { asked } from "./asked"
import { homeLink } from "./index"

export { PART_BYTES } from "./asked"

const previewPath = (template: TemplateId): string => `/previews/${template}`

/** Asks home once to make a preview of `template`; never rejects. */
export function askMakePreview(template: TemplateId): Promise<CallAsked> {
  return asked(() =>
    homeLink().keep((send) => send("POST", previewPath(template)))
  )
}

/** Asks home once for `template`'s newest preview; never rejects. */
export function askPreview(template: TemplateId): Promise<CallAsked> {
  return asked(() =>
    homeLink().keep((send) => send("GET", previewPath(template)))
  )
}

/** Asks home once for bytes `start` to `end` of preview `id`'s video; never rejects. */
export function askPreviewPart(
  template: TemplateId,
  id: string,
  start: number,
  end: number
): Promise<CallAsked> {
  return asked(() =>
    homeLink().keep((send) =>
      send(
        "GET",
        `${previewPath(template)}/${encodeURIComponent(id)}/video`,
        undefined,
        { start, end }
      )
    )
  )
}
