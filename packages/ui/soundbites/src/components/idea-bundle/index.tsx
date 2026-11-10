/**
 * A new idea as one bundle (STUDIO ST26, #2453): what it is, then its
 * questions, one card each, swiped between with the thumb, each answer said
 * and heard back on the take pattern's parts, then the whole idea looked
 * over and sent together. Renders `lib/idea/bundle.ts`'s state and forwards
 * taps; its words are Studio's (`bundle`), and the take's are the pattern's.
 * The cards and the look over are the shared bundle's parts
 * (`@some-ui/shared`'s `BundleCards` and `BundleReview`); what an idea is,
 * and what was sent, are this screen's own.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useId, useState, useSyncExternalStore } from "react"
import { assertNever } from "@some-ui/core-utils"
import {
  BundleCards,
  bundleConfirm,
  BundleNoticeLine,
  BundleReview,
  Button,
  ConfirmSheet,
  Notice,
  useTakePattern,
} from "@some-ui/shared"
import type { BundleTakes, TakePatternSnapshot } from "@some-ui/voice-capture"
import { PairWay } from "@soundbites/components/unpaired"
import type {
  BundleIntent,
  BundleState,
  IdeaEdit,
} from "@soundbites/lib/idea/bundle"
import {
  answeredCount,
  IDEA_BUNDLE,
  missing,
} from "@soundbites/lib/idea/bundle"
import type { BundlePorts } from "@soundbites/lib/idea/bundle-runtime"
import { createIdeaBundle } from "@soundbites/lib/idea/bundle-runtime"
import {
  IDEA_FORMATS,
  IDEA_QUESTIONS,
  isRequired,
  TITLE_MAX,
} from "@soundbites/lib/idea/model"
import { phoneBundlePorts } from "@soundbites/lib/phone"
import { STUDIO_WORDS } from "@soundbites/lib/studio/words"
import { ChevronLeft } from "lucide-react"

const WORDS = STUDIO_WORDS.bundle
const ASK = STUDIO_WORDS.idea.questions

export type IdeaBundleProps = {
  /** The phone's desk of idea takes, as a new idea uses it. Read once. */
  takes: BundleTakes
  /** The phone's other ports unless a test says otherwise. Read once. */
  ports?: Partial<Omit<BundlePorts, "takes">>
  /** The way back to Studio, from the first screen. */
  back?: ReactNode
  /** The app's way to pairing, shown while this phone isn't paired (ST34). */
  pair: ReactNode
}

type Dispatch = (intent: BundleIntent) => void

const Chip = ({
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

const About = ({
  state,
  dispatch,
}: {
  state: BundleState
  dispatch: Dispatch
}): JSX.Element => {
  const titleId = useId()
  const { about } = state.draft
  const edit = (change: IdeaEdit): void =>
    dispatch({ type: "edit", edit: change })
  const left = TITLE_MAX - about.title.length
  return (
    <div className="flex flex-col gap-5">
      <header className="space-y-1">
        <h2 className="text-3xl font-extrabold">{WORDS.about.heading}</h2>
        <p className="text-muted-foreground text-sm">
          {WORDS.about.dated(state.draft.at)}
        </p>
      </header>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {WORDS.about.madeFor}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {IDEA_FORMATS.map((format) => (
            <Button
              key={format}
              type="button"
              variant={about.format === format ? "default" : "outline"}
              aria-pressed={about.format === format}
              className="h-16 rounded-2xl"
              onClick={() => edit({ type: "format", format })}
            >
              {WORDS.about.formats[format]}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-sm font-semibold">
          {WORDS.about.title}
        </label>
        <input
          id={titleId}
          value={about.title}
          maxLength={TITLE_MAX}
          placeholder={WORDS.about.titleHint}
          onChange={(event) =>
            edit({ type: "title", text: event.currentTarget.value })
          }
          className="bg-background border-border focus-visible:ring-ring h-12 rounded-2xl border px-3 text-base focus-visible:ring-2 focus-visible:outline-none"
        />
        <p className="text-muted-foreground text-xs">
          {WORDS.about.titleLeft(left)}
        </p>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {WORDS.about.topic}
        </legend>
        <div className="flex flex-wrap gap-2">
          {state.context.topics.map((topic) => (
            <Chip
              key={topic}
              on={about.topic === topic}
              onClick={() => edit({ type: "topic", topic })}
            >
              {topic}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">
          {WORDS.about.keywords}{" "}
          <span className="text-muted-foreground font-normal">
            · {WORDS.about.pickAny}
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {state.context.keywords.map((keyword) => (
            <Chip
              key={keyword}
              on={about.keywords.includes(keyword)}
              onClick={() => edit({ type: "keyword", keyword })}
            >
              {keyword}
            </Chip>
          ))}
        </div>
      </fieldset>
      <Button size="lg" onClick={() => dispatch({ type: "start" })}>
        {WORDS.about.start}
      </Button>
    </div>
  )
}

const Review = ({
  state,
  takes,
  snapshot,
  dispatch,
  pair,
}: {
  state: BundleState
  takes: BundleTakes
  snapshot: TakePatternSnapshot
  dispatch: Dispatch
  pair: ReactNode
}): JSX.Element => {
  const { about } = state.draft
  const needs = missing(state)
  const n = answeredCount(state)
  const near = state.reach === "near"
  const notNear = near ? null : WORDS.review.notNear[state.reach]
  return (
    <BundleReview
      machine={IDEA_BUNDLE}
      state={state}
      takes={takes}
      snapshot={snapshot}
      dispatch={dispatch}
      words={WORDS}
      header={
        <header className="space-y-2">
          <h2 className="text-2xl font-extrabold">
            {about.title.trim() === "" ? WORDS.review.noTitle : about.title}
          </h2>
          <ul className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            {[
              WORDS.about.formats[about.format],
              ...(about.topic === null ? [] : [about.topic]),
              ...about.keywords,
            ].map((chip) => (
              <li key={chip} className="bg-muted rounded-full px-2.5 py-1">
                {chip}
              </li>
            ))}
            <li>
              <Button
                variant="link"
                size="sm"
                onClick={() => dispatch({ type: "change" })}
              >
                {WORDS.review.change}
              </Button>
            </li>
          </ul>
          <p className="text-muted-foreground text-sm">{WORDS.review.kept}</p>
        </header>
      }
      label={(question) => ASK[question].ask}
      beforeSend={
        <>
          {notNear !== null && (
            <p className="text-muted-foreground text-center text-sm">
              {notNear}
            </p>
          )}
          {state.reach === "unpaired" && (
            <PairWay pair={pair} className="self-center text-center" />
          )}
        </>
      }
      send={near ? WORDS.review.send(n) : WORDS.review.keep(n)}
      needs={
        needs === "title"
          ? WORDS.review.needsTitle
          : needs === "required"
            ? WORDS.review.needsFirst
            : // Nothing, or "unchanged", which an idea, sent once, never needs.
              null
      }
    />
  )
}

const Sent = ({
  state,
  dispatch,
  back,
  pair,
}: {
  state: BundleState
  dispatch: Dispatch
  back: ReactNode
  pair: ReactNode
}): JSX.Element => {
  const about = state.sent?.about
  const said =
    state.reach === "near"
      ? { title: WORDS.sent.title, line: WORDS.sent.near }
      : WORDS.sent.notNear[state.reach]
  return (
    <div className="flex flex-col gap-3">
      <h2 aria-live="polite" className="text-3xl font-extrabold">
        {said.title}
      </h2>
      <p className="text-muted-foreground">{said.line}</p>
      {state.reach === "unpaired" && (
        <PairWay pair={pair} className="self-center text-center" />
      )}
      {about !== undefined && (
        <div className="bg-card rounded-2xl p-4">
          <p className="font-semibold">{about.title}</p>
          <p className="text-muted-foreground text-sm">
            {[WORDS.about.formats[about.format], about.topic]
              .filter((part) => part !== null)
              .join(" · ")}
          </p>
        </div>
      )}
      <Button size="lg" onClick={() => dispatch({ type: "another" })}>
        {WORDS.sent.another}
      </Button>
      {back}
    </div>
  )
}

const Screen = ({
  state,
  takes,
  snapshot,
  dispatch,
  back,
  pair,
}: {
  state: BundleState
  takes: BundleTakes
  snapshot: TakePatternSnapshot
  dispatch: Dispatch
  back: ReactNode
  pair: ReactNode
}): JSX.Element => {
  switch (state.screen) {
    case "loading": {
      return <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    }
    case "unreadable": {
      return (
        <>
          <Notice
            tone="danger"
            action={{
              label: WORDS.readAgain,
              onClick: () => dispatch({ type: "readAgain" }),
            }}
          >
            {WORDS.unreadable}
          </Notice>
          {back}
        </>
      )
    }
    case "intro": {
      return (
        <>
          <About state={state} dispatch={dispatch} />
          {back}
          <BundleNoticeLine
            notice={state.notice}
            onDismiss={() => dispatch({ type: "noticeDismissed" })}
            words={WORDS}
          />
        </>
      )
    }
    case "cards": {
      return (
        <BundleCards
          machine={IDEA_BUNDLE}
          state={state}
          takes={takes}
          snapshot={snapshot}
          dispatch={dispatch}
          words={WORDS}
          renderHead={(question, n) => (
            <>
              <p className="text-muted-foreground text-xs font-semibold">
                {WORDS.cardOf(n, IDEA_QUESTIONS.length)}
                {isRequired(question) ? "" : ` · ${WORDS.canWait}`}
              </p>
              <h2 className="text-3xl font-extrabold text-balance">
                {ASK[question].ask}
              </h2>
              <p className="text-muted-foreground">{ASK[question].hint}</p>
            </>
          )}
        />
      )
    }
    case "review": {
      return (
        <Review
          state={state}
          takes={takes}
          snapshot={snapshot}
          dispatch={dispatch}
          pair={pair}
        />
      )
    }
    case "sent": {
      return <Sent state={state} dispatch={dispatch} back={back} pair={pair} />
    }
    default: {
      return assertNever(state.screen)
    }
  }
}

export const IdeaBundle = ({
  takes,
  ports,
  back,
  pair,
}: IdeaBundleProps): JSX.Element => {
  /* eslint-disable owner-guard/no-mount-snapshot -- the runtime, and the takes it runs on, are taken once per mount, as the idea capture's are */
  const [{ runtime, desk }] = useState(() => ({
    runtime: createIdeaBundle({ ...phoneBundlePorts(), ...ports, takes }),
    desk: takes,
  }))
  /* eslint-enable owner-guard/no-mount-snapshot */
  useEffect(() => runtime.attach(), [runtime])
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot)
  const snapshot = useTakePattern(desk.pattern)
  const { dispatch } = runtime
  const backable = state.screen === "cards" || state.screen === "review"
  return (
    <div className="flex flex-col gap-4">
      {backable && (
        // Held while a take is under way (HS1).
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={state.busy}
          onClick={() => dispatch({ type: "back" })}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {WORDS.backLabel}
        </Button>
      )}
      <Screen
        state={state}
        takes={desk}
        snapshot={snapshot}
        dispatch={dispatch}
        back={back}
        pair={pair}
      />
      <ConfirmSheet
        request={bundleConfirm(
          { machine: IDEA_BUNDLE, state, dispatch, words: WORDS },
          (question) => ASK[question].ask
        )}
        open={state.confirm !== null}
        onOpenChange={(open) => {
          if (!open && state.confirm !== null) dispatch({ type: "keepIt" })
        }}
      />
    </div>
  )
}
