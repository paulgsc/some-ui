import type { JSX } from "react"
import { essayFit, parseEssay } from "@some-ui/video-render"
import type { Essay } from "@some-ui/video-render"

import { EssaySceneFrame } from "@/lib/web-surface/call/essay-stage"
import { essayAt } from "@/lib/web-surface/call/essay-view"

import { atTheLimit, sample } from "./essays"

/**
 * Every best, beside and deep dive scene of one Rust Rounds essay, each in
 * the stage's frame as the recorder draws it (`record`), one under another,
 * for `../essay-fit.spec.ts` (EF1). `?essay=` names it: `sample` or
 * `limit-<n>` (`./essays`). Beside each frame the page
 * publishes what the model says of it (`data-model`, its card's content
 * height in px), and whether the model accepts the essay.
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
    <div
      data-essay-fit={
        parseEssay(essay).ok && fit.problems.length === 0
          ? "accepted"
          : "refused"
      }
    >
      {fit.scenes.map((scene) => (
        <div key={scene.id} data-model={scene.h}>
          <EssaySceneFrame
            essay={essay}
            at={essayAt(essay, scene.id)}
            voicing="owner"
            record
          />
        </div>
      ))}
    </div>
  )
}
