import { Suspense } from "react"
import type { JSX } from "react"
import { essayFit } from "@some-ui/video-render"
import type { Essay } from "@some-ui/video-render"

import { EssaySceneFrame } from "@/lib/web-surface"

import { accepted, atTheLimit, sample } from "./essays"

/**
 * Every best, beside and deep dive scene of the essay `?essay=` names
 * (`./essays`), each in the stage's frame as the recorder draws it, with
 * what the model says of it (`data-model`, its card's content height in px)
 * and whether the model accepts the essay (`data-essay-fit`).
 */

function essayNamed(name: string | null): Essay | null {
  if (name === "sample") return sample()
  const limit = /^limit-(\d+)$/.exec(name ?? "")
  return limit ? (atTheLimit()[Number(limit[1]) - 1] ?? null) : null
}

export const EssayStageFixture = (): JSX.Element => {
  const essay = essayNamed(
    new URLSearchParams(window.location.search).get("essay")
  )
  if (essay === null)
    return <p data-essay-fit-limits={atTheLimit().length}>no such essay</p>
  const fit = essayFit(essay)
  return (
    <Suspense fallback={null}>
      <div data-essay-fit={accepted(essay) ? "accepted" : "refused"}>
        {fit.scenes.map((scene) => (
          <div key={scene.id} data-model={scene.h}>
            <EssaySceneFrame essay={essay} scene={scene.id} record />
          </div>
        ))}
      </div>
    </Suspense>
  )
}
