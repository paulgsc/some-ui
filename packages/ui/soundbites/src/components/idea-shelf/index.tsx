/**
 * The idea shelf (STUDIO ST19): every idea kept, newest first, each showing
 * its first answer and where it is; one idea at a time, with the one step
 * that moves it on in front. Renders `lib/idea/shelf.ts`'s state and forwards
 * taps; the stores and the picked file are `lib/idea/shelf-runtime.ts`, and
 * every word is Studio's (`shelf`). Claude's questions are asked by
 * `IdeaCapture`, opened on the idea.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever, cn } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"
import { FilePick } from "@soundbites/components/file-pick"
import { IdeaCapture } from "@soundbites/components/idea"
import { Notice } from "@soundbites/components/notice"
import type { Idea, IdeaStage } from "@soundbites/lib/idea/model"
import {
  firstWords,
  isFollowUp,
  latestDraft,
  skippedAsks,
  stageOf,
  waiting,
  wordsFor,
} from "@soundbites/lib/idea/model"
import { ideaFile } from "@soundbites/lib/idea/reply"
import type { IdeaPorts } from "@soundbites/lib/idea/runtime"
import type { ShelfIntent, ShelfState } from "@soundbites/lib/idea/shelf"
import {
  answeredSinceClaude,
  ideaOnScreen,
  ideasWithVideos,
  shelved,
  videoOf,
} from "@soundbites/lib/idea/shelf"
import type { ShelfPorts } from "@soundbites/lib/idea/shelf-runtime"
import { createIdeaShelf } from "@soundbites/lib/idea/shelf-runtime"
import { phoneShelfPorts } from "@soundbites/lib/phone"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"

const WORDS = STUDIO_WORDS.shelf

/** Sending an idea to Claude, where this build can (the share sheet). */
export type IdeaShare = (props: {
  /** The idea as text, named for the session that reads it. */
  file: { readonly name: string; readonly data: string }
}) => ReactNode

export type IdeaShelfProps = {
  /** The phone's ports unless a test says otherwise. Read once, on mount. */
  ports?: Partial<ShelfPorts>
  /** What answering Claude's questions listens with (the recognizer). */
  capture?: Partial<IdeaPorts>
  share?: IdeaShare
  /** The way to the video an idea became (`project`), as the app links it. */
  studio?: (project: string) => ReactNode
  /** The way to New idea, as the app links it, while no idea is kept. */
  newIdea?: ReactNode
}

type Dispatch = (intent: ShelfIntent) => void

const ShelfLine = ({ state }: { state: ShelfState }): JSX.Element => (
  <Notice text={state.notice === null ? "" : WORDS.notice[state.notice]} />
)

/** Where an idea is, and whether Claude's questions wait on it. */
function stageLine(idea: Idea, stage: IdeaStage): string {
  const asks = waiting(idea)
  return asks === 0
    ? WORDS.stage[stage]
    : `${WORDS.stage[stage]} · ${WORDS.waiting(asks)}`
}

const List = ({
  state,
  aside,
  dispatch,
  newIdea,
}: {
  state: ShelfState
  aside: boolean
  dispatch: Dispatch
  newIdea: ReactNode
}): JSX.Element => {
  const ideas = shelved(state, aside)
  const setAside = shelved(state, true).length
  const videos = ideasWithVideos(state)
  return (
    <div className="flex flex-col gap-3">
      {ideas.length === 0 && !aside && (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">{WORDS.none}</p>
          {newIdea}
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {ideas.map((idea) => (
          <li key={idea.id}>
            <button
              type="button"
              onClick={() => dispatch({ type: "opened", id: idea.id })}
              className="bg-card border-border/60 focus-visible:ring-ring flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
            >
              <span className="line-clamp-2 text-base font-bold">
                {firstWords(idea)}
              </span>
              <span className="text-muted-foreground text-xs font-semibold">
                {stageLine(idea, stageOf(idea, videos))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!aside && setAside > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "asideShown", shown: true })}
        >
          {WORDS.asideCount(setAside)}
        </Button>
      )}
      {aside && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "asideShown", shown: false })}
        >
          {WORDS.showAll}
        </Button>
      )}
      <ShelfLine state={state} />
    </div>
  )
}

/** The idea's answers, and Claude's questions with theirs. */
const Answers = ({ idea }: { idea: Idea }): JSX.Element => (
  <section className="space-y-2">
    <h3 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
      {WORDS.yourAnswers}
    </h3>
    <dl className="flex flex-col gap-2">
      {idea.answers.flatMap(({ question, versions }) =>
        isFollowUp(question)
          ? []
          : [
              <div key={question}>
                <dt className="text-muted-foreground text-xs">
                  {STUDIO_WORDS.idea.questions[question].ask}
                </dt>
                <dd className="text-sm">{versions.at(-1)?.words}</dd>
              </div>,
            ]
      )}
    </dl>
    {(idea.asked ?? []).length > 0 && (
      <>
        <h3 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
          {WORDS.claudeAsked}
        </h3>
        <dl className="flex flex-col gap-2">
          {(idea.asked ?? []).map((asked) => {
            const words = wordsFor(idea, asked.id)
            return (
              <div key={asked.id}>
                <dt className="text-muted-foreground text-xs">{asked.words}</dt>
                <dd
                  className={cn(
                    "text-sm",
                    words === null && "text-muted-foreground"
                  )}
                >
                  {words ??
                    (idea.passed.includes(asked.id)
                      ? WORDS.skipped
                      : WORDS.notAnswered)}
                </dd>
              </div>
            )
          })}
        </dl>
      </>
    )}
  </section>
)

/** Claude's latest scenes for the idea, each saying whose idea it is. */
const Scenes = ({ idea }: { idea: Idea }): JSX.Element | null => {
  const draft = latestDraft(idea)
  if (draft === null) return null
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
        {WORDS.scenes(draft.primer.cuts.length)}
      </h3>
      <ol className="flex flex-col gap-1.5">
        {draft.primer.cuts.map((cut) => (
          <li key={cut.id} className="text-sm">
            <span className="block">{cut.point}</span>
            <span className="text-muted-foreground block text-xs">
              {(cut.from ?? []).length > 0 ? WORDS.fromYou : WORDS.fromClaude}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

const OneIdea = ({
  state,
  idea,
  dispatch,
  share,
  studio,
}: {
  state: ShelfState
  idea: Idea
  dispatch: Dispatch
  share: IdeaShare | undefined
  studio: IdeaShelfProps["studio"]
}): JSX.Element => {
  const stage = stageOf(idea, ideasWithVideos(state))
  const asks = waiting(idea)
  const skipped = skippedAsks(idea).length
  const video = videoOf(state, idea.id)
  const moving = stage === "idea" || stage === "fleshed"
  const shareBox =
    share === undefined ? null : (
      <div className="border-border/60 space-y-2 rounded-2xl border p-3">
        <p className="text-muted-foreground text-sm">
          {answeredSinceClaude(idea) ? WORDS.shareAgainLine : WORDS.shareLine}
        </p>
        {share({ file: ideaFile(idea) })}
      </div>
    )
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <p className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
          {stageLine(idea, stage)}
        </p>
        <h2 className="text-2xl font-extrabold text-balance">
          {firstWords(idea)}
        </h2>
      </header>

      {stage === "aside" && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">{WORDS.setAsideLine}</p>
          <Button size="lg" onClick={() => dispatch({ type: "backChosen" })}>
            {WORDS.bringBack}
          </Button>
        </div>
      )}
      {stage === "video" && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">{WORDS.videoLine}</p>
          {video !== null && studio?.(video)}
        </div>
      )}
      {moving && asks > 0 && (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => dispatch({ type: "answerChosen" })}>
            {WORDS.answer(asks)}
          </Button>
          <p className="text-muted-foreground text-xs">{WORDS.answerLine}</p>
        </div>
      )}
      {moving && asks === 0 && skipped > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => dispatch({ type: "answerChosen" })}
        >
          {STUDIO_WORDS.idea.answerSkipped(skipped)}
        </Button>
      )}
      {stage === "fleshed" && asks === 0 && state.videosUnread && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm">{WORDS.videosUnread}</p>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => dispatch({ type: "videosAgain" })}
          >
            {STUDIO_WORDS.readAgain}
          </Button>
        </div>
      )}
      {stage === "fleshed" && asks === 0 && !state.videosUnread && (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            disabled={state.making !== null}
            onClick={() => dispatch({ type: "makeChosen" })}
          >
            {state.making === null ? WORDS.make : WORDS.making}
          </Button>
          <p className="text-muted-foreground text-xs">{WORDS.makeLine}</p>
        </div>
      )}
      {moving && shareBox}
      {moving && (
        <FilePick
          label={WORDS.openReply}
          hint={WORDS.openReplyHint}
          onPick={(file) => dispatch({ type: "replyPicked", file })}
        />
      )}
      <ShelfLine state={state} />

      <Scenes idea={idea} />
      <Answers idea={idea} />

      <nav className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => dispatch({ type: "back" })}
        >
          {WORDS.back}
        </Button>
        {stage !== "aside" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "asideChosen" })}
          >
            {WORDS.setAside}
          </Button>
        )}
      </nav>
    </div>
  )
}

export const IdeaShelf = ({
  ports,
  capture,
  share,
  studio,
  newIdea,
}: IdeaShelfProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime is created once per mount, as Studio's is */
  const [resolved] = useState(() => ({ ...phoneShelfPorts(), ...ports }))
  const [runtime] = useState(() => createIdeaShelf(resolved))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { dispatch } = runtime
  const { screen } = state

  switch (screen.kind) {
    case "loading": {
      return (
        <p className="text-muted-foreground text-sm">
          {STUDIO_WORDS.idea.reading}
        </p>
      )
    }
    case "unreadable": {
      return (
        <div role="alert" className="space-y-2 text-sm">
          <p>{WORDS.unreadable}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dispatch({ type: "readAgain" })}
          >
            {STUDIO_WORDS.readAgain}
          </Button>
        </div>
      )
    }
    case "list": {
      return (
        <List
          state={state}
          aside={screen.aside}
          dispatch={dispatch}
          newIdea={newIdea}
        />
      )
    }
    case "idea": {
      const idea = ideaOnScreen(state)
      return idea === null ? (
        <List
          state={state}
          aside={false}
          dispatch={dispatch}
          newIdea={newIdea}
        />
      ) : (
        <OneIdea
          state={state}
          idea={idea}
          dispatch={dispatch}
          share={share}
          studio={studio}
        />
      )
    }
    case "answering": {
      return (
        <IdeaCapture
          ports={{ store: resolved.ideas, ...capture }}
          answering={screen.id}
          back={
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "back" })}
            >
              {WORDS.backToIdea}
            </Button>
          }
        />
      )
    }
    default: {
      return assertNever(screen)
    }
  }
}
