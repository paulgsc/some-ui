/**
 * Studio's Previews (HOST16), as the phone draws them, for
 * `../previews-fit.spec.ts`: the transitions preview with one clip playing
 * and one not on this phone yet, as the runtime reads it (a sample, its
 * picks held in memory), unpicked and after a pick, and home out of reach,
 * each under a router of its own.
 */
import type { JSX } from "react"
import { useEffect, useState } from "react"
import type { KeptChoice } from "@some-ui/video-render"
import { sampleTransitionsOffer } from "@some-ui/video-render"

import { PICK_WORDS, previewsRuntime, sampleSource } from "@/lib/preview-pick"
import type { PreviewSource } from "@/lib/preview-pick"
import { KIND_WORDS } from "@/lib/studio-index"
import { StudioPage } from "@/components/studio/layout"
import { Previews } from "@/components/studio/preview-pick"

import { routed } from "./my-data"

const OFFER = sampleTransitionsOffer()

/** The sample as the route reads it, one clip playing, with `standing` picked already. */
const sampled = (standing: KeptChoice | null): PreviewSource => ({
  ...sampleSource(OFFER),
  read: () =>
    Promise.resolve({
      kind: "read",
      value: [
        {
          id: "sample",
          topic: OFFER.about,
          previews: [
            {
              ...OFFER,
              clips: { [OFFER.recommended]: "/sample-clip.mp4" },
              standing,
            },
          ],
          unshown: 0,
        },
      ],
    }),
})

/** Home out of reach. */
const away: PreviewSource = {
  where: "home",
  read: () => Promise.resolve({ kind: "away" }),
  reread: () => Promise.resolve({ kind: "away" }),
  approve: () => Promise.resolve({ kind: "away" }),
}

const screen = (source: PreviewSource): (() => JSX.Element) => {
  const Screen = (): JSX.Element => {
    const [runtime] = useState(() =>
      previewsRuntime(source, () => "2026-11-26T10:00:00.000Z")
    )
    useEffect(() => {
      runtime.open()
    }, [runtime])
    return (
      <StudioPage
        heading={KIND_WORDS.previews.name}
        intro={PICK_WORDS.intro}
        back="index"
      >
        <Previews previews={runtime} />
      </StudioPage>
    )
  }
  return Screen
}

export const PREVIEWS_FIXTURES = {
  "previews-unpicked": routed(screen(sampled(null)), "/journal/previews"),
  "previews-picked": routed(
    screen(
      sampled({
        kind: "variant",
        variant: "dip-to-black",
        rule: "joins-dip-at-chapters",
      })
    ),
    "/journal/previews"
  ),
  "previews-away": routed(screen(away), "/journal/previews"),
}

export type PreviewsId = keyof typeof PREVIEWS_FIXTURES
