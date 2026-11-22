import type { JSX } from "react"
import { callParts, CallWeekSchema, parseCallWeek } from "@some-ui/video-render"
import type { CallWeek } from "@some-ui/video-render"

import { CallSceneFrame } from "@/lib/web-surface/call/stage"
import { callAt } from "@/lib/web-surface/call/view"

import { atTheLimit, longest, sample } from "./call-weeks"

/**
 * Every scene of every part of one week of the weekly call, each in the stage's frame as
 * the recorder draws it (`record`), one under another, for
 * `../call-fit.spec.ts` (CF1). `?week=` names it: `sample`, `longest`,
 * `limit-<n>` (`./call-weeks`), or `given`, the one the spec hands the page
 * before it loads (`window.__CALL_FIT_WEEK__`), read against the schema
 * alone, so a week `call-check` refuses is drawn too. Beside each frame the
 * page publishes what the model says of it (`data-model`, its picture's
 * height in px), and whether the model accepts the week.
 */

function weekNamed(name: string | null): CallWeek | null {
  if (name === "sample") return sample()
  if (name === "longest") return longest()
  if (name === "given")
    return CallWeekSchema.parse(Reflect.get(window, "__CALL_FIT_WEEK__"))
  const limit = /^limit-(\d+)$/.exec(name ?? "")
  return limit ? (atTheLimit()[Number(limit[1]) - 1] ?? null) : null
}

export const CallStageFixture = (): JSX.Element => {
  const name = new URLSearchParams(window.location.search).get("week")
  const week = weekNamed(name)
  if (week === null)
    return <p data-call-fit-limits={atTheLimit().length}>no such week</p>
  return (
    <div data-call-fit={parseCallWeek(week).ok ? "accepted" : "refused"}>
      {callParts(week).flatMap((part) =>
        part.scenes.map((scene) => (
          <div
            key={`${part.n}/${scene.id}`}
            data-model={"page" in scene ? scene.page?.h : undefined}
          >
            <CallSceneFrame
              week={week}
              at={callAt(week, scene.id, part.n)}
              record
            />
          </div>
        ))
      )}
    </div>
  )
}
