/**
 * Home, as Studio's Finish hands it an episode to make and reads where each
 * stands (ST33): `@some-ui/soundbites`' `VideosHome` over the voice lane,
 * which carries the videos (`./videos`). Where home is, is what a new idea's
 * screen and Studio's takes hear (`lib/idea-hearing`'s `ideaHome`): unknown
 * while the phone reads its pairing, not paired, away while the voice lane's
 * last run found home out of reach, near otherwise. It sends nothing itself.
 * Phone-only (`build.paths.ts`, under `lib/home-link`).
 */
import { localStorageOrNull } from "@some-ui/core-utils"
import type { HomeVideos, VideosHome } from "@some-ui/soundbites"

import { ideaHome } from "@/lib/idea-hearing"

import { pairingOf } from "./index"
import { videoAnswers, videoHanded, videosListed, videosMoved } from "./videos"

let last: HomeVideos | null = null

/** Whether `a` and `b` say the same, so a snapshot stays while nothing moved. */
const same = (a: HomeVideos, b: HomeVideos): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

export const studioVideos: VideosHome = {
  handed: videoHanded,
  getSnapshot(): HomeVideos {
    const pairing = pairingOf()
    const next: HomeVideos = {
      reach: ideaHome.reach(),
      answers: videoAnswers(localStorageOrNull(), pairing),
      listed: videosListed(pairing),
    }
    if (last === null || !same(last, next)) last = next
    return last
  },
  subscribe(listener): () => void {
    const stops = [
      ideaHome.subscribe(listener),
      videosMoved.subscribe(listener),
    ]
    return (): void => {
      for (const stop of stops) stop()
    }
  },
}
