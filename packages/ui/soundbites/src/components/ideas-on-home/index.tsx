/**
 * Ideas on home, and the lists they pick from (STUDIO ST26 (c), #2453):
 * every idea sent whole as home keeps it, grouped and sorted by what it is,
 * one idea at a time with home's words for each answer and its still
 * furnishing mark, and the subjects and keywords every new idea picks from.
 * Renders `lib/idea/on-home.ts`'s state and forwards taps; its words are
 * Studio's (`onHome`, `lists`).
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import {
  Button,
  ConfirmSheet,
  Input,
  Reserved,
  SameWidth,
  useTakePattern,
} from "@some-ui/shared"
import type { TakePattern } from "@some-ui/voice-capture"
import { TAKE_WORDS } from "@some-ui/voice-capture"
import { Notice } from "@soundbites/components/notice"
import { Unpaired } from "@soundbites/components/unpaired"
import type { BundleTakes } from "@soundbites/lib/idea/bundle-runtime"
import { keptIdeaLists } from "@soundbites/lib/idea/draft"
import type { QuestionId } from "@soundbites/lib/idea/model"
import { IDEA_QUESTIONS } from "@soundbites/lib/idea/model"
import type {
  HomeAnswer,
  HomeIdea,
  HomeRead,
  ListName,
  OnHomeIntent,
  OnHomeState,
} from "@soundbites/lib/idea/on-home"
import {
  dayBegun,
  GROUP_BY,
  groupsOf,
  isEntry,
  openIdea,
  SORT_BY,
} from "@soundbites/lib/idea/on-home"
import type { IdeasHome } from "@soundbites/lib/idea/on-home-runtime"
import { createIdeasOnHome } from "@soundbites/lib/idea/on-home-runtime"
import { keptIdeaStore } from "@soundbites/lib/idea/store"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { ChevronLeft, Pause, Play, X } from "lucide-react"

const WORDS = STUDIO_WORDS.onHome
const LISTS = STUDIO_WORDS.lists
const ASK = STUDIO_WORDS.idea.questions

type Dispatch = (intent: OnHomeIntent) => void

export type IdeasOnHomeProps = {
  /** Home, as the build reaches it. Read once. */
  home: IdeasHome
  /** The phone's desk of a new idea's takes, to play one still on it. Read once. */
  takes?: BundleTakes | undefined
  /** Opens on the lists rather than the ideas. Read once. */
  initialLists?: boolean
  /**
   * Opens My data on a said answer's recording, where deleting it for good
   * is asked (#2579, MD4's rule: Delete… never deletes in place). Without
   * it, no answer offers Delete….
   */
  openInMyData?: ((note: string) => void) | undefined
  /** The app's way to pairing, shown while this phone isn't paired (ST34). */
  pair: ReactNode
}

const Tab = ({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}): JSX.Element => (
  <Button
    type="button"
    size="sm"
    variant={on ? "default" : "outline"}
    aria-pressed={on}
    className="rounded-full"
    onClick={onClick}
  >
    {children}
  </Button>
)

/** What a read that didn't give anything says, and Try again. */
const Unread = ({
  read,
  dispatch,
  pair,
}: {
  read: Exclude<HomeRead<unknown>, { kind: "read" }> | { kind: "reading" }
  dispatch: Dispatch
  pair: ReactNode
}): JSX.Element => {
  if (read.kind === "reading") {
    return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
  }
  if (read.kind === "unpaired") {
    return <Unpaired line={WORDS.unpaired} pair={pair} />
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{WORDS[read.kind]}</p>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => dispatch({ type: "readAgain" })}
      >
        {WORDS.readAgain}
      </Button>
    </div>
  )
}

function groupName(state: OnHomeState, key: string | null): string {
  if (key === null) return WORDS.noKeyword
  switch (state.groupBy) {
    case "format": {
      return key === "short" || key === "video" ? WORDS.formats[key] : key
    }
    case "date": {
      return WORDS.day(key)
    }
    case "topic":
    case "keyword": {
      return key
    }
    default: {
      return assertNever(state.groupBy)
    }
  }
}

/** An idea's line under its title: when, what for, its subject and answers. */
function metaOf(idea: HomeIdea): string {
  return [
    WORDS.day(dayBegun(idea)),
    WORDS.formats[idea.format],
    idea.topic,
    WORDS.answers(idea.answers.length),
  ].join(" · ")
}

const IdeaList = ({
  state,
  ideas,
  more,
  dispatch,
}: {
  state: OnHomeState
  ideas: ReadonlyArray<HomeIdea>
  more: boolean
  dispatch: Dispatch
}): JSX.Element => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        {WORDS.groupBy}
      </p>
      <div className="flex flex-wrap gap-2">
        {GROUP_BY.map((groupBy) => (
          <Tab
            key={groupBy}
            on={state.groupBy === groupBy}
            onClick={() => dispatch({ type: "groupBy", groupBy })}
          >
            {WORDS.groups[groupBy]}
          </Tab>
        ))}
      </div>
      <p className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
        {WORDS.sortBy}
      </p>
      <div className="flex flex-wrap gap-2">
        {SORT_BY.map((sortBy) => (
          <Tab
            key={sortBy}
            on={state.sortBy === sortBy}
            onClick={() => dispatch({ type: "sortBy", sortBy })}
          >
            {WORDS.sorts[sortBy]}
          </Tab>
        ))}
      </div>
    </div>
    {ideas.length === 0 ? (
      <p className="text-muted-foreground text-sm">{WORDS.none}</p>
    ) : (
      groupsOf(ideas, state.groupBy, state.sortBy).map((group) => (
        <section key={group.key ?? ""} className="flex flex-col gap-2">
          <h2 className="text-sm font-bold">
            {groupName(state, group.key)}
            <span className="text-muted-foreground font-normal">
              {" · "}
              {group.ideas.length}
            </span>
          </h2>
          <ul className="flex flex-col gap-2">
            {group.ideas.map((idea) => (
              <li key={idea.id}>
                <button
                  type="button"
                  className="bg-card border-border/60 focus-visible:ring-ring flex w-full flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => dispatch({ type: "open", id: idea.id })}
                >
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    {idea.title}
                    {idea.furnishing && (
                      <span className="text-muted-foreground border-border rounded-full border px-2 text-xs font-medium">
                        {WORDS.furnishingMark}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {metaOf(idea)}
                  </span>
                  {idea.keywords.length > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {idea.keywords.join(" · ")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))
    )}
    {more && <p className="text-muted-foreground text-xs">{WORDS.more}</p>}
  </div>
)

/** Play and Stop for a take still on this phone's desk. */
const AnswerPlay = ({
  pattern,
  take,
}: {
  pattern: TakePattern
  take: string
}): JSX.Element => {
  const snapshot = useTakePattern(pattern)
  const playing =
    snapshot.playback.kind !== "quiet" && snapshot.playback.id === take
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => pattern.play(take)}
    >
      {playing ? (
        <Pause className="size-4" aria-hidden="true" />
      ) : (
        <Play className="size-4" aria-hidden="true" />
      )}
      <SameWidth every={[TAKE_WORDS.play, TAKE_WORDS.stop]}>
        {playing ? TAKE_WORDS.stop : TAKE_WORDS.play}
      </SameWidth>
    </Button>
  )
}

/** What one answer says: home's words, typed words, or why there are none. */
function wordsOf(answer: HomeAnswer): string {
  if (typeof answer.deletedAt === "string") {
    return WORDS.answerDeleted(WORDS.day(answer.deletedAt))
  }
  if (answer.setAside) return WORDS.answerAside
  if (answer.typed !== null) return answer.typed
  if (answer.heard === null) return WORDS.hearing
  return answer.heard.text.trim() === "" ? WORDS.silent : answer.heard.text
}

function askOf(question: string): string {
  const known = IDEA_QUESTIONS.find(
    (each): each is QuestionId => each === question
  )
  return known === undefined ? question : ASK[known].ask
}

/**
 * A said answer's recording: Play while it is on this phone, and Delete…,
 * set aside or not (My data deletes either).
 */
const AnswerRecording = ({
  note,
  ask,
  setAside,
  takes,
  openInMyData,
}: {
  note: string
  ask: string
  setAside: boolean
  takes: BundleTakes | undefined
  openInMyData: ((note: string) => void) | undefined
}): JSX.Element => (
  <div className="flex flex-wrap items-center gap-2">
    {setAside ? null : takes !== undefined ? (
      <AnswerPlay pattern={takes.pattern} take={note} />
    ) : (
      <p className="text-muted-foreground text-xs">{WORDS.onlyOnHome}</p>
    )}
    {openInMyData !== undefined && (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        aria-label={WORDS.deleteAnswerName(ask)}
        onClick={() => openInMyData(note)}
      >
        {WORDS.deleteAnswer}
      </Button>
    )}
  </div>
)

const OneIdea = ({
  idea,
  state,
  takes,
  dispatch,
  openInMyData,
}: {
  idea: HomeIdea
  state: OnHomeState
  takes: BundleTakes | undefined
  dispatch: Dispatch
  openInMyData: ((note: string) => void) | undefined
}): JSX.Element => {
  const onPhone = useSyncExternalStore(
    takes?.takes.subscribe ?? noSubscribe,
    takes?.takes.getSnapshot ?? noTakes
  )
  const playable = new Set(onPhone.map((take) => take.id))
  // Leaving the idea (back, set aside, or the page) stops what it played,
  // or was loading to play: the desk is the phone's one, and outlives it.
  useEffect(
    () => (): void => {
      takes?.pattern.stopPlaying()
    },
    [takes]
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">{idea.title}</h2>
        <p className="text-muted-foreground text-sm">
          {[metaOf(idea), ...idea.keywords].join(" · ")}
        </p>
      </div>
      <Button
        type="button"
        variant={idea.furnishing ? "default" : "outline"}
        aria-pressed={idea.furnishing}
        className="self-start"
        disabled={state.writing}
        onClick={() =>
          dispatch({ type: "furnish", furnishing: !idea.furnishing })
        }
      >
        {idea.furnishing ? WORDS.furnishing : WORDS.furnish}
      </Button>
      <ul className="flex flex-col gap-3">
        {idea.answers.map((answer) => (
          <li
            key={answer.question}
            className="bg-card border-border/60 flex flex-col gap-2 rounded-2xl border p-3"
          >
            <p className="text-sm font-bold">{askOf(answer.question)}</p>
            <p className="text-sm">
              {answer.typed !== null && (
                <span className="text-muted-foreground block text-xs">
                  {WORDS.typed}
                </span>
              )}
              {wordsOf(answer)}
            </p>
            {answer.note !== null && typeof answer.deletedAt !== "string" && (
              <AnswerRecording
                note={answer.note}
                ask={askOf(answer.question)}
                setAside={answer.setAside}
                takes={
                  takes !== undefined && playable.has(answer.note)
                    ? takes
                    : undefined
                }
                openInMyData={openInMyData}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground self-start"
          disabled={state.writing}
          onClick={() => dispatch({ type: "askSetAside" })}
        >
          {WORDS.setAside}
        </Button>
        <p className="text-muted-foreground text-xs">{WORDS.setAsideLine}</p>
      </div>
    </div>
  )
}

const noSubscribe = (): (() => void) => () => undefined
const NONE: ReadonlyArray<never> = []
const noTakes = (): ReadonlyArray<never> => NONE

const ListEditor = ({
  list,
  entries,
  state,
  dispatch,
}: {
  list: ListName
  entries: ReadonlyArray<string>
  state: OnHomeState
  dispatch: Dispatch
}): JSX.Element => {
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const label = list === "topics" ? LISTS.newTopic : LISTS.newKeyword
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold">
        {list === "topics" ? LISTS.topics : LISTS.keywords}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li
            key={entry}
            className="border-border flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm"
          >
            {entry}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 rounded-full"
              aria-label={LISTS.remove(entry)}
              disabled={state.writing}
              onClick={() =>
                dispatch({ type: "entry", list, name: entry, listed: false })
              }
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (!isEntry(trimmed)) return
          dispatch({ type: "entry", list, name: trimmed, listed: true })
          setName("")
        }}
      >
        <Input
          aria-label={label}
          placeholder={label}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={state.writing || !isEntry(trimmed)}
        >
          {LISTS.add}
        </Button>
      </form>
      <Reserved className="text-muted-foreground text-xs">
        {trimmed !== "" && !isEntry(trimmed) && LISTS.tooLong}
      </Reserved>
    </section>
  )
}

const Lists = ({
  state,
  dispatch,
  pair,
}: {
  state: OnHomeState
  dispatch: Dispatch
  pair: ReactNode
}): JSX.Element => {
  const { lists } = state
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">{LISTS.heading}</h2>
      <p className="text-muted-foreground text-sm">{LISTS.line}</p>
      {lists.kind === "read" ? (
        <>
          <ListEditor
            list="topics"
            entries={lists.value.topics}
            state={state}
            dispatch={dispatch}
          />
          <ListEditor
            list="keywords"
            entries={lists.value.keywords}
            state={state}
            dispatch={dispatch}
          />
        </>
      ) : (
        <Unread read={lists} dispatch={dispatch} pair={pair} />
      )}
    </div>
  )
}

const Screen = ({
  state,
  takes,
  dispatch,
  openInMyData,
  pair,
}: {
  state: OnHomeState
  takes: BundleTakes | undefined
  dispatch: Dispatch
  openInMyData: ((note: string) => void) | undefined
  pair: ReactNode
}): JSX.Element => {
  const { screen, ideas } = state
  switch (screen.kind) {
    case "lists": {
      return <Lists state={state} dispatch={dispatch} pair={pair} />
    }
    case "idea": {
      const idea = openIdea(state)
      return idea === null ? (
        <Unread read={{ kind: "reading" }} dispatch={dispatch} pair={pair} />
      ) : (
        <OneIdea
          idea={idea}
          state={state}
          takes={takes}
          dispatch={dispatch}
          openInMyData={openInMyData}
        />
      )
    }
    case "list": {
      return ideas.kind === "read" ? (
        <>
          <IdeaList
            state={state}
            ideas={ideas.value.ideas}
            more={ideas.value.more}
            dispatch={dispatch}
          />
          <Button
            type="button"
            variant="ghost"
            className="self-start underline underline-offset-4"
            onClick={() => dispatch({ type: "openLists" })}
          >
            {WORDS.lists}
          </Button>
        </>
      ) : (
        <Unread read={ideas} dispatch={dispatch} pair={pair} />
      )
    }
    default: {
      return assertNever(screen)
    }
  }
}

export const IdeasOnHome = ({
  home,
  takes,
  initialLists = false,
  openInMyData,
  pair,
}: IdeasOnHomeProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime, and what it runs on, are taken once per mount, as the idea screens' are */
  const [runtime] = useState(() =>
    createIdeasOnHome({ home, ideas: keptIdeaStore(), lists: keptIdeaLists() })
  )
  const [lists] = useState(initialLists)
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(lists), [runtime, lists])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const { dispatch } = runtime
  const idea = openIdea(state)
  return (
    <div className="flex flex-col gap-4">
      {state.screen.kind !== "list" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => dispatch({ type: "back" })}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {state.screen.kind === "lists" ? LISTS.done : WORDS.back}
        </Button>
      )}
      <Screen
        state={state}
        takes={takes}
        dispatch={dispatch}
        openInMyData={openInMyData}
        pair={pair}
      />
      <Notice text={state.notice === null ? "" : WORDS.notice[state.notice]} />
      <ConfirmSheet
        request={
          state.confirm === null || idea === null
            ? null
            : {
                title: WORDS.confirm.title,
                description: WORDS.confirm.line,
                confirm: WORDS.confirm.yes,
                keep: WORDS.confirm.keep,
                onConfirm: () => dispatch({ type: "confirmed" }),
              }
        }
        open={state.confirm !== null}
        onOpenChange={(open) => {
          if (!open && state.confirm !== null) dispatch({ type: "keepIt" })
        }}
      />
    </div>
  )
}
