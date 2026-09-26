/**
 * The handheld Topik renderer.
 *
 * Not the desktop session made smaller. The desktop session plays a whole
 * conversation, then quizzes it against a countdown with the transcript
 * beside the questions; stacked onto a phone, that transcript scrolls away
 * and the quiz silently becomes a different exercise (adaptive-learning canon
 * Prop. 9.4). This renderer delivers a declared valuation instead
 * (Cor. 4.4): one line at a time, heard before it is read, each check right
 * after the line it is about, typed answers built from tiles, and a place
 * kept across interruptions.
 */

import type { JSX } from "react"
import { Button } from "@some-ui/shared"
import { CheckCard } from "@topik/components/topik/handheld/check-card"
import { LineCard } from "@topik/components/topik/handheld/line-card"
import { MaterialList } from "@topik/components/topik/handheld/material-list"
import { WrapCard } from "@topik/components/topik/handheld/wrap-card"
import type { UseHandheldLessonOptions } from "@topik/lib/topik/adapter/hooks/use-handheld-lesson"
import { useHandheldLesson } from "@topik/lib/topik/adapter/hooks/use-handheld-lesson"
import { ChevronLeft, Loader2 } from "lucide-react"
import { cn } from "some-ui-utils"

type HandheldLessonProps = UseHandheldLessonOptions & {
  /** Landscape phone: two columns, compact chrome. */
  short?: boolean
}

export const HandheldLesson = ({
  short = false,
  resumeStore,
}: HandheldLessonProps): JSX.Element => {
  const vm = useHandheldLesson({ resumeStore })
  const { lesson, audio, dispatch } = vm

  const title = lesson
    ? lesson.displayName
    : vm.loading
      ? "Loading..."
      : "Korean listening"

  const header = (
    <header className="shrink-0">
      <div
        className={cn("flex items-center gap-2 px-2", short ? "h-11" : "h-14")}
      >
        {vm.lesson || vm.loading ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={vm.leave}
            aria-label="Back to materials"
          >
            <ChevronLeft className="size-6" />
          </Button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {lesson && !short && (
            <p className="text-muted-foreground text-xs">
              Conversation {lesson.conversation + 1} of{" "}
              {lesson.conversationCount}
            </p>
          )}
        </div>
        {lesson && short && (
          <span className="text-muted-foreground shrink-0 pr-2 text-xs">
            {lesson.conversation + 1}/{lesson.conversationCount}
          </span>
        )}
      </div>
      {lesson && (
        <div
          role="progressbar"
          aria-label="Progress through this conversation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(lesson.progress * 100)}
          className="bg-muted h-1 w-full"
        >
          <div
            className="bg-primary h-full rounded-r-full transition-[width] duration-300"
            style={{ width: `${lesson.progress * 100}%` }}
          />
        </div>
      )}
    </header>
  )

  const body = ((): JSX.Element => {
    if (vm.loading) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          {vm.loading.error ? (
            <>
              <p className="text-destructive text-sm">{vm.loading.error}</p>
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={vm.leave}
              >
                Back to materials
              </Button>
            </>
          ) : (
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          )}
        </div>
      )
    }

    if (!lesson) {
      return (
        <MaterialList
          items={vm.catalog.items}
          loading={vm.catalog.loading}
          error={vm.catalog.error}
          resume={vm.resume}
          onSelect={vm.select}
          onReload={vm.catalog.reload}
        />
      )
    }

    const { batch, step, state } = lesson
    const key = `${lesson.topikKey}:${lesson.conversation}:${state.step}`

    if (step?.kind === "line") {
      const message = batch.messages[step.message]
      if (message) {
        return (
          <LineCard
            key={key}
            message={message}
            reveal={state.reveal}
            cap={lesson.cap}
            audio={audio.available}
            speaking={audio.speakingId === message.id}
            canGoBack={step.message > 0}
            short={short}
            onReveal={() => dispatch({ type: "REVEAL" })}
            onReplay={() => audio.speak(message)}
            onNext={() => dispatch({ type: "NEXT" })}
            onPrev={() => dispatch({ type: "PREV" })}
          />
        )
      }
    }

    if (step?.kind === "check") {
      const question = batch.questions[step.question]
      const anchor = batch.messages[step.anchor]
      if (question) {
        return (
          <CheckCard
            key={key}
            question={question}
            seedKey={`${lesson.topikKey}:${batch.id}:${step.question}`}
            anchor={anchor}
            siblings={batch.questions}
            lines={batch.messages}
            answered={state.answered}
            showGloss={lesson.anchorGloss}
            repeat={step.repeat}
            audio={audio.available}
            speaking={
              audio.speakingId !== null && audio.speakingId === anchor?.id
            }
            short={short}
            onReplayAnchor={() => anchor && audio.speak(anchor)}
            onAnswer={(correct, response, channel) =>
              dispatch({ type: "ANSWER", correct, response, channel })
            }
            onNext={() => dispatch({ type: "NEXT" })}
          />
        )
      }
    }

    return (
      <WrapCard
        key={key}
        conversation={lesson.conversation}
        conversationCount={lesson.conversationCount}
        tally={lesson.tally}
        lines={batch.messages}
        finished={state.finished}
        short={short}
        onNextConversation={() => dispatch({ type: "NEXT_CONVERSATION" })}
        onReplay={() => dispatch({ type: "RESTART_CONVERSATION" })}
        onStartOver={() =>
          dispatch({ type: "RESUME", conversation: 0, message: 0 })
        }
        onChooseMaterial={vm.leave}
      />
    )
  })()

  return (
    <div
      data-slot="topik-handheld"
      data-short={short || undefined}
      className="flex size-full min-h-0 flex-col"
    >
      {header}
      {body}
    </div>
  )
}
