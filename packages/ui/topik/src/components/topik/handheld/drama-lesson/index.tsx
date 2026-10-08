/**
 * The phone's drama: a pasted scene tree played as a vertical webtoon
 * (docs/makjang/README.md, "The webtoon: one feeling per scene").
 *
 * The component reads the runtime's snapshot and dispatches; the runtime
 * (`core/drama-runtime`, through `useDrama`) owns the voice and the resume
 * point, and the engine decides where the learner is. The current scene is
 * one strip of panels; its choice is asked in the dock, under the thumb, as
 * large Korean targets with no English gloss (Rem. 4.12).
 */

import type { JSX } from "react"
import { useEffect, useMemo, useRef } from "react"
import type { VoicePort } from "@some-ui/makjang"
import { Button } from "@some-ui/shared"
import { LadderDock } from "@topik/components/topik/handheld/ladder-dock"
import { CandidateText } from "@topik/components/topik/handheld/probe-card"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import { WebtoonPanel } from "@topik/components/topik/handheld/webtoon-panel"
import { useDrama } from "@topik/lib/topik/adapter/hooks/use-drama"
import type { DramaLesson as Lesson } from "@topik/lib/topik/core/drama"
import {
  canGoBack,
  panelsOf,
  rungOf,
  sceneOf,
} from "@topik/lib/topik/core/drama"
import type { DramaPointStore } from "@topik/lib/topik/core/drama-runtime"
import { orderedOptions, showsRelations } from "@topik/lib/topik/core/probe"
import { ChevronLeft, RotateCcw } from "lucide-react"

type DramaLessonProps = {
  /** A `checked` `TreeIntake`'s lesson (MK4). Remount with a new `key`. */
  lesson: Lesson
  voice: VoicePort | null
  points: DramaPointStore
  short: boolean
  onLeave: () => void
}

export const DramaLesson = ({
  lesson,
  voice,
  points,
  short,
  onLeave,
}: DramaLessonProps): JSX.Element => {
  const { session, speaking, dispatch, replay } = useDrama(lesson, {
    voice,
    points,
  })
  const panels = panelsOf(lesson, session)
  const scene = sceneOf(lesson, session)
  const { at } = session.drama
  const rung = (id: string): ReturnType<typeof rungOf> =>
    rungOf(lesson, session, id)
  const reveal = (id: string): void => dispatch({ type: "reveal", id })

  // Keep the newest panel in view, as a webtoon scrolls.
  const last = panels[panels.length - 1]?.id
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = end.current
    if (node && typeof node.scrollIntoView === "function") {
      const still =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      node.scrollIntoView({ block: "end", behavior: still ? "auto" : "smooth" })
    }
  }, [last])

  const options = useMemo(
    () =>
      scene.choice
        ? orderedOptions(scene.choice.check, `${lesson.id}:${scene.choice.id}`)
        : [],
    [lesson.id, scene.choice]
  )

  const stage = (
    <div
      data-slot="topik-drama"
      // A cover's motion shakes it sideways while it plays; that must not
      // widen the strip. The padding keeps a jagged edge's outline inside.
      className="mx-auto flex w-full max-w-md flex-col gap-3 overflow-x-clip px-1"
    >
      {panels.map((panel) => (
        <WebtoonPanel
          key={panel.id}
          panel={panel}
          lesson={lesson}
          rungOf={rung}
          onReveal={reveal}
          audio={session.audio}
          speaking={speaking}
          onReplay={replay}
        />
      ))}
      <div ref={end} />
    </div>
  )

  const back = (
    <Button
      variant="ghost"
      className="h-12 rounded-2xl px-3"
      onClick={() => dispatch({ type: "back" })}
      disabled={!canGoBack(lesson, session)}
      aria-label="Previous beat"
    >
      <ChevronLeft className="size-5" />
    </Button>
  )

  const dock = ((): JSX.Element => {
    if (at.kind === "choice") {
      // The engine opens a choice only on a scene that has one.
      const check = scene.choice?.check
      if (check === undefined) return back
      return (
        <>
          <div
            role="group"
            aria-label="Choose"
            data-scroll-intent="long-form"
            className={
              // scroll-intent: long-form — up to four candidates, each as
              // long as its author wrote it; on a phone held sideways the
              // dock is 390px tall, and every option must stay reachable.
              "flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain"
            }
          >
            {options.map((option) => (
              <Button
                key={option.id}
                variant="outline"
                className="h-auto min-h-14 w-full shrink-0 justify-start rounded-2xl px-4 py-3 text-left text-lg whitespace-normal"
                onClick={() =>
                  dispatch({ type: "choose", option: option.id ?? "" })
                }
              >
                <CandidateText
                  option={option}
                  source={check.source ?? ""}
                  withRelation={showsRelations(check)}
                />
              </Button>
            ))}
          </div>
          {back}
        </>
      )
    }
    if (at.kind === "end") {
      return (
        <>
          <Button
            className="h-12 w-full gap-2 rounded-2xl"
            onClick={() => dispatch({ type: "restart" })}
          >
            <RotateCcw className="size-5" /> Play it again
          </Button>
          <div className="flex gap-2">
            {back}
            <Button
              variant="outline"
              className="h-12 min-w-0 flex-1 rounded-2xl"
              onClick={onLeave}
            >
              Back to lessons
            </Button>
          </div>
        </>
      )
    }
    const beat = at.id
    const current = rung(beat)
    return (
      <LadderDock
        rung={current}
        canReveal={current < 2}
        audio={session.audio}
        speaking={speaking === beat}
        canGoBack={canGoBack(lesson, session)}
        previousLabel="Previous beat"
        onReplay={() => replay(beat)}
        onReveal={() => reveal(beat)}
        onPrev={() => dispatch({ type: "back" })}
        onNext={() => dispatch({ type: "advance" })}
      />
    )
  })()

  return (
    <StepLayout
      short={short}
      stage={stage}
      dock={dock}
      longForm
      dockScrolls={at.kind === "choice"}
    />
  )
}
