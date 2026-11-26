/**
 * Studio's Previews (HOST16), as the phone draws them, for
 * `../previews-fit.spec.ts`: the transitions preview with one clip playing
 * and one not made yet, unpicked, and after a pick, each under a router of
 * its own.
 */
import type { JSX } from "react"
import type { KeyedStorage } from "@some-ui/core-utils"
import { approveEvent, sampleTransitionsOffer } from "@some-ui/video-render"

import { phonePicks, PICK_WORDS } from "@/lib/preview-pick"
import { KIND_WORDS } from "@/lib/studio-index"
import { Part, StudioPage } from "@/components/studio/layout"
import { PreviewPick } from "@/components/studio/preview-pick"

import { routed } from "./my-data"

const OFFER = sampleTransitionsOffer()

/** A store held in memory, with `picked` kept in it already. */
const held = (picked: string | null): KeyedStorage => {
  const kept = new Map<string, string>()
  const storage: KeyedStorage = {
    getItem: (k) => kept.get(k) ?? null,
    setItem: (k, v): void => {
      kept.set(k, v)
    },
    removeItem: (k): void => {
      kept.delete(k)
    },
  }
  const event =
    picked === null
      ? null
      : approveEvent(
          OFFER,
          { kind: "variant", variant: picked },
          "2026-11-26T10:00:00.000Z"
        )
  if (event !== null)
    phonePicks(() => storage).keep({ conversation: "sample", event })
  return storage
}

const screen = (picked: string | null): (() => JSX.Element) => {
  const storage = held(picked)
  const Screen = (): JSX.Element => (
    <StudioPage
      heading={KIND_WORDS.previews.name}
      intro={PICK_WORDS.intro}
      back="index"
    >
      <Part label={OFFER.about}>
        <PreviewPick
          offer={OFFER}
          conversation="sample"
          picks={phonePicks(() => storage)}
          clipSrc={(v) =>
            v.variant === OFFER.recommended ? "/sample-clip.mp4" : null
          }
          now={() => "2026-11-26T10:00:00.000Z"}
        />
      </Part>
    </StudioPage>
  )
  return Screen
}

export const PREVIEWS_FIXTURES = {
  "previews-unpicked": routed(screen(null), "/journal/previews"),
  "previews-picked": routed(screen("dip-to-black"), "/journal/previews"),
}

export type PreviewsId = keyof typeof PREVIEWS_FIXTURES
