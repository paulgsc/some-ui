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
 *
 * A pasted scene tree plays here as the drama instead (`DramaLesson`,
 * docs/makjang/README.md), with a toggle for its scenes' sound in the header.
 */

import type { JSX } from "react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import { Button, KeepOnShelf, KeptShelf } from "@some-ui/shared"
import { DramaLesson } from "@topik/components/topik/handheld/drama-lesson"
import { GenerateLesson } from "@topik/components/topik/handheld/generate-lesson"
import { LineCard } from "@topik/components/topik/handheld/line-card"
import { MaterialList } from "@topik/components/topik/handheld/material-list"
import { ProbeCard } from "@topik/components/topik/handheld/probe-card"
import { SurveyCard } from "@topik/components/topik/handheld/survey-card"
import { WrapCard } from "@topik/components/topik/handheld/wrap-card"
import { ReadAloudScreen } from "@topik/components/topik/read-aloud/read-aloud-screen"
import type { ConversationBatch, TopikMetadata } from "@topik/lib/topik"
import { useSessionConfig } from "@topik/lib/topik/adapter/context/session-config-context"
import type { UseHandheldLessonOptions } from "@topik/lib/topik/adapter/hooks/use-handheld-lesson"
import { useHandheldLesson } from "@topik/lib/topik/adapter/hooks/use-handheld-lesson"
import { usePastedTree } from "@topik/lib/topik/adapter/hooks/use-pasted-tree"
import { createPastedLessonStore } from "@topik/lib/topik/adapter/pasted-lesson"
import type { ReadAloudStore } from "@topik/lib/topik/adapter/read-aloud-store"
import {
  keptLessonOf,
  LESSON_SHELF_WORDS,
  shelfKeyOf,
} from "@topik/lib/topik/adapter/shelf"
import type {
  SoundControl,
  ToneContextFactory,
} from "@topik/lib/topik/adapter/sound-port"
import {
  createSoundControl,
  feelingSound,
} from "@topik/lib/topik/adapter/sound-port"
import { speakerVoice } from "@topik/lib/topik/adapter/voice-port"
import { TOPIK_LEVELS } from "@topik/lib/topik/generation"
import { ChevronLeft, Loader2, Music } from "lucide-react"

type HandheldLessonProps = UseHandheldLessonOptions & {
  /** Landscape phone: two columns, compact chrome. */
  short?: boolean
  /** Injected in tests and stories; defaults to `localStorage`. */
  readAloudStore?: ReadAloudStore
  /** Injected in tests; defaults to `localStorage`. */
  soundControl?: SoundControl
  /** Injected in tests; defaults to the browser's `AudioContext`. */
  tones?: ToneContextFactory | null
}

export const HandheldLesson = ({
  short = false,
  resumeStore,
  surveyStore,
  pastedStore,
  pastedResumeStore,
  readAloudStore,
  soundControl,
  tones,
}: HandheldLessonProps): JSX.Element => {
  const [held] = useState(() => pastedStore ?? createPastedLessonStore())
  const vm = useHandheldLesson({
    resumeStore,
    surveyStore,
    pastedStore: held,
    pastedResumeStore,
  })
  const { lesson, audio, dispatch, generator } = vm
  const drama = usePastedTree(held)
  const { speaker, shelf } = useSessionConfig()
  const voice = useMemo(() => speakerVoice(speaker), [speaker])
  const [control] = useState(() => soundControl ?? createSoundControl())
  const sound = useMemo(
    () => feelingSound({ control, speaker, tones }),
    [control, speaker, tones]
  )
  const soundState = useSyncExternalStore(
    control.subscribe,
    control.state,
    control.state
  )
  const startConversation = (
    meta: TopikMetadata,
    batches: Array<ConversationBatch>
  ): void => {
    drama.replaced()
    generator.start(meta, batches)
  }
  // The read-aloud drill takes the whole screen, header included; leaving it
  // returns to the material list it was opened from.
  const [reading, setReading] = useState(false)

  if (reading) {
    return (
      <div
        data-slot="topik-handheld"
        data-short={short || undefined}
        className="flex size-full min-h-0 flex-col"
      >
        <ReadAloudScreen
          topikLevel={vm.selection.level}
          speech={speaker}
          store={readAloudStore}
          short={short}
          onExit={() => setReading(false)}
        />
      </div>
    )
  }

  const playing = drama.playing ? drama.tree : null

  const title = playing
    ? playing.root.place
    : lesson
      ? lesson.displayName
      : vm.loading
        ? "Loading..."
        : generator.active
          ? "New lesson"
          : "Korean listening"

  const header = (
    <header className="shrink-0">
      <div
        className={cn("flex items-center gap-2 px-2", short ? "h-11" : "h-14")}
      >
        {playing || vm.lesson || vm.loading || generator.active ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={
              playing
                ? drama.leave
                : generator.active
                  ? generator.close
                  : vm.leave
            }
            aria-label="Back to materials"
          >
            <ChevronLeft className="size-6" />
          </Button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1
            lang={playing ? "ko" : undefined}
            className="truncate text-base font-semibold"
          >
            {title}
          </h1>
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
        {playing && sound && soundState !== "withdrawn" && (
          <Button
            variant={soundState === "on" ? "secondary" : "ghost"}
            size="icon"
            className={cn(
              "size-11 shrink-0",
              soundState === "off" && "text-muted-foreground"
            )}
            aria-pressed={soundState === "on"}
            aria-label="Scene sound"
            onClick={() => control.set(soundState !== "on")}
          >
            <Music className="size-5" />
          </Button>
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
    if (playing) {
      return (
        <DramaLesson
          key={playing.id}
          lesson={playing}
          voice={voice}
          sound={sound}
          points={held.points}
          short={short}
          onLeave={drama.leave}
        />
      )
    }
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

    if (!lesson && generator.active) {
      // The level the learner holds on the list, for a prompt at that level.
      const held = vm.selection.level
      return (
        <GenerateLesson
          defaultLevel={TOPIK_LEVELS.find((level) => level === held) ?? 1}
          buildPrompt={generator.prompt}
          onPromptHandedOff={generator.handedOff}
          onStart={startConversation}
          onStartTree={(tree) => {
            generator.forget()
            generator.close()
            drama.start(tree)
          }}
          short={short}
          kept={
            shelf ? (
              <KeptShelf
                shelf={shelf}
                words={LESSON_SHELF_WORDS}
                replay={{
                  read: keptLessonOf,
                  play: (kept) => startConversation(kept.meta, kept.batches),
                }}
              />
            ) : undefined
          }
        />
      )
    }
    if (!lesson) {
      return (
        <MaterialList
          order={vm.selection.order}
          others={vm.selection.others}
          level={vm.selection.level}
          onLevel={vm.selection.chooseLevel}
          pasted={generator.pasted}
          pastedTree={
            drama.tree
              ? {
                  lesson: drama.tree,
                  onPlay: drama.play,
                  onForget: drama.forget,
                }
              : null
          }
          onCreate={generator.open}
          onForget={generator.forget}
          keep={
            shelf &&
            generator.pasted &&
            generator.pastedDocument !== null &&
            generator.keptBodyFor !== null ? (
              <KeepOnShelf
                // A newly pasted lesson is a new question: back to "Keep".
                key={generator.pastedDocument}
                shelf={shelf}
                words={LESSON_SHELF_WORDS}
                shelfKey={shelfKeyOf(generator.pasted.key)}
                body={generator.keptBodyFor}
              />
            ) : undefined
          }
          // Read-aloud's audio is the rep: with no voice here it is not
          // offered at all (canon Cor. 4.6).
          onReadAloud={
            audio.available ? (): void => setReading(true) : undefined
          }
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
      const probe = batch.probes?.[step.probe]
      const anchor = batch.messages[step.anchor]
      if (probe) {
        return (
          <ProbeCard
            key={key}
            probe={probe}
            source={probe.source ?? anchor?.korean ?? anchor?.content ?? ""}
            seedKey={`${lesson.topikKey}:${batch.id}:${step.id}`}
            anchor={anchor}
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
            flag={vm.flag ?? undefined}
          />
        )
      }
    }

    // A completed lesson asks for the learner's verdict before its recap
    // (canon Cor. 3.4). Skippable; it gates nothing.
    if (state.finished && vm.survey?.pending) {
      return (
        <SurveyCard
          key={`${key}:survey`}
          candidates={vm.survey.candidates}
          short={short}
          onSubmit={vm.survey.submit}
          onSkip={vm.survey.skip}
        />
      )
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
