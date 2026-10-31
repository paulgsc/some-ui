/**
 * The phone's drama: a pasted scene tree played as a vertical webtoon
 * (docs/makjang/README.md, "The webtoon: one feeling per scene").
 *
 * The component reads the runtime's snapshot and dispatches; the runtime
 * (`core/drama-runtime`, through `useDrama`) owns the voice, the sound and
 * the resume point, and the engine decides where the learner is. The route
 * is one strip of panels, the scenes it passed above the current one; a
 * choice is asked in the dock, under the thumb, as the point of view's own
 * lines with no English gloss (Rem. 4.12). An ending offers the drama
 * review after the author's notes, and in the dock the next scene's way
 * out, then a crossroads to choose again from.
 */

import type { JSX } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@some-ui/core-utils"
import type { SoundPort, VoicePort } from "@some-ui/makjang"
import type { ActivityHost } from "@some-ui/react-hooks"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
} from "@some-ui/shared"
import { DramaReview } from "@topik/components/topik/handheld/drama-review"
import { LadderDock } from "@topik/components/topik/handheld/ladder-dock"
import { StepLayout } from "@topik/components/topik/handheld/step-layout"
import {
  SPEECH_BUBBLE,
  THOUGHT_BUBBLE,
  WebtoonPanel,
} from "@topik/components/topik/handheld/webtoon-panel"
import { useDrama } from "@topik/lib/topik/adapter/hooks/use-drama"
import { nameOf } from "@topik/lib/topik/core/cast"
import type { DramaLesson as Lesson, Panel } from "@topik/lib/topik/core/drama"
import {
  canGoBack,
  crossroadsOf,
  momentOf,
  panelsOf,
  rungOf,
  sceneOf,
  whyOpen,
} from "@topik/lib/topik/core/drama"
import type {
  DramaPointStore,
  LastDramaPort,
} from "@topik/lib/topik/core/drama-runtime"
import { bitesBack, orderedOptions } from "@topik/lib/topik/core/probe"
import { ChevronLeft, RotateCcw, Signpost } from "lucide-react"

type DramaLessonProps = {
  /** A `checked` `TreeIntake`'s lesson (MK4). Remount with a new `key`. */
  lesson: Lesson
  voice: VoicePort | null
  /** The scene's tone and cry; `null` where nothing can play them. */
  sound: SoundPort | null
  points: DramaPointStore
  last: LastDramaPort
  /** The session it plays in: nothing sounds while it waits (SS2). */
  host?: ActivityHost
  /** Shown at an ending, first in the dock: the next scene's way out. */
  ending?: JSX.Element
  short: boolean
  onLeave: () => void
}

export const DramaLesson = ({
  lesson,
  voice,
  sound,
  points,
  last,
  host,
  ending,
  short,
  onLeave,
}: DramaLessonProps): JSX.Element => {
  const {
    session,
    speaking,
    last: record,
    dispatch,
    replay,
    review,
  } = useDrama(lesson, { voice, sound, points, last }, host)
  const panels = panelsOf(lesson, session)
  const past = panels.filter(({ kind }) => kind === "past")
  const present = panels.filter(({ kind }) => kind !== "past")
  const [crossing, setCrossing] = useState(false)
  const scene = sceneOf(lesson, session)
  const { at } = session.drama
  const rung = (id: string): ReturnType<typeof rungOf> =>
    rungOf(lesson, session, id)
  const reveal = (id: string): void => dispatch({ type: "reveal", id })
  const povName = nameOf(lesson.cast, lesson.pov)

  // Keep the newest panel in view, as a webtoon scrolls.
  const newest = panels[panels.length - 1]?.id
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = end.current
    if (node && typeof node.scrollIntoView === "function") {
      const still =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      node.scrollIntoView({ block: "end", behavior: still ? "auto" : "smooth" })
    }
  }, [newest])

  const options = useMemo(
    () =>
      scene.choice
        ? orderedOptions(scene.choice.check, `${lesson.id}:${scene.choice.id}`)
        : [],
    [lesson.id, scene.choice]
  )

  const drawn = (panel: Panel): JSX.Element => (
    <WebtoonPanel
      key={panel.id}
      panel={panel}
      lesson={lesson}
      rungOf={rung}
      onReveal={reveal}
      whyOpen={(choice, option) => whyOpen(session, choice, option)}
      onWhy={(choice, option) => dispatch({ type: "why", choice, option })}
      audio={session.audio}
      speaking={speaking}
      onReplay={replay}
    />
  )

  const stage = (
    <div
      data-slot="topik-drama"
      // A cover's motion shakes it sideways while it plays; that must not
      // widen the strip. The padding keeps a jagged edge's outline inside.
      className="mx-auto flex w-full max-w-md flex-col gap-3 overflow-x-clip px-1"
    >
      {past.length > 0 && (
        <Accordion
          type="single"
          collapsible
          defaultValue="past"
          data-slot="topik-drama-past"
          className="bg-secondary text-secondary-foreground border-border rounded-2xl border px-3"
        >
          <AccordionItem value="past" className="border-none">
            <AccordionTrigger className="min-h-11 text-sm font-semibold hover:no-underline">
              <span lang="ko">지난 이야기</span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-col gap-3">
              {past.map(drawn)}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {present.map(drawn)}
      {at.kind === "end" && record && (
        <DramaReview
          record={record}
          onReview={review}
          nameOf={(id) => momentOf(lesson, id)}
        />
      )}
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
      const swallow = bitesBack(check)
      return (
        <>
          <div className="flex items-baseline justify-between gap-2 px-1">
            <span lang="ko" className="text-sm font-semibold">
              {`${povName} · ${swallow ? "삼킬 말" : "대답"}`}
            </span>
            <span className="text-muted-foreground text-xs">
              {swallow ? "Pick the line to bite back" : "Pick the line"}
            </span>
          </div>
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
                className={cn(
                  "h-auto min-h-14 w-full shrink-0 justify-end px-4 py-3 text-right text-lg whitespace-normal",
                  swallow ? THOUGHT_BUBBLE : SPEECH_BUBBLE
                )}
                onClick={() =>
                  dispatch({ type: "choose", option: option.id ?? "" })
                }
              >
                <span lang="ko" className="break-keep">
                  {option.text}
                </span>
              </Button>
            ))}
          </div>
          {back}
        </>
      )
    }
    if (at.kind === "end") {
      if (crossing) {
        return (
          <>
            <div
              role="group"
              aria-label="갈림길"
              data-scroll-intent="long-form"
              className={
                // scroll-intent: long-form — one crossroads per choice the
                // route made, and the dock is 390px tall held sideways.
                "flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain"
              }
            >
              {crossroadsOf(lesson, session).map(({ depth, place, prompt }) => (
                <Button
                  key={depth}
                  variant="outline"
                  className="h-auto min-h-14 w-full shrink-0 flex-col items-start gap-0.5 rounded-2xl px-4 py-3 text-left whitespace-normal"
                  onClick={() => {
                    setCrossing(false)
                    dispatch({ type: "rewind", depth })
                  }}
                >
                  <span lang="ko" className="text-muted-foreground text-xs">
                    {place}
                  </span>
                  <span lang="ko" className="break-keep italic">
                    {prompt}
                  </span>
                </Button>
              ))}
              <Button
                variant="secondary"
                className="h-12 w-full shrink-0 gap-2 rounded-2xl"
                onClick={() => {
                  setCrossing(false)
                  dispatch({ type: "restart" })
                }}
              >
                <RotateCcw className="size-5" />
                <span lang="ko">처음부터</span>
              </Button>
            </div>
            <Button
              variant="ghost"
              className="h-11 rounded-2xl"
              onClick={() => setCrossing(false)}
            >
              Close
            </Button>
          </>
        )
      }
      return (
        <>
          {ending}
          <div className="flex gap-2">
            {back}
            <Button
              variant={ending ? "outline" : "default"}
              className="h-12 min-w-0 flex-1 gap-2 rounded-2xl"
              onClick={() => setCrossing(true)}
            >
              <Signpost className="size-5" />
              <span lang="ko">갈림길</span>
            </Button>
          </div>
          <Button
            variant="outline"
            className="h-12 w-full rounded-2xl"
            onClick={onLeave}
          >
            Back to lessons
          </Button>
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
