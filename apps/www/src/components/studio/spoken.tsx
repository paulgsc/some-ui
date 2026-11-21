/**
 * Studio's Spoken on the phone (W5, C805): the spoken cards this phone
 * keeps, pasting one, a card in its parts, and a part read on the shared
 * teleprompter (`Teleprompter`) or said in your own words, with every take of
 * it kept. It renders the runtime's snapshots and forwards taps
 * (`lib/studio-spoken`, which owns every wait); every word is its
 * `SPOKEN_WORDS`.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import {
  bandOf,
  Button,
  Notice,
  phrasesOf,
  TakeList,
  Teleprompter,
  useTakePattern,
} from "@some-ui/shared"
import type { HeardAnswer } from "@some-ui/voice-capture"
import { Link, useNavigate } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type {
  PartKind,
  SpokenCard,
  SpokenPart,
  SpokenRuntime,
} from "@/lib/studio-spoken"
import {
  essayBlock,
  lineOf,
  parseCard,
  partAt,
  PARTS_MOST,
  phoneSpoken,
  SPOKEN_WORDS,
  titleOf,
} from "@/lib/studio-spoken"
import { CardRoute } from "@/components/card-route"
import { CopyButton } from "@/components/copy-button"

import { StudioPage, TileBody } from "./layout"

const WORDS = SPOKEN_WORDS

const useCards = (runtime: SpokenRuntime): ReadonlyArray<SpokenCard> =>
  useSyncExternalStore(runtime.cards.subscribe, runtime.cards.getSnapshot)

/** A Spoken page is showing (`SpokenRuntime.attach`). */
const useAttached = (runtime: SpokenRuntime): void => {
  useEffect(() => runtime.attach(), [runtime])
}

const KindChip = ({ kind }: { kind: PartKind }): JSX.Element => (
  <span
    className={cn(
      "rounded-full px-2 py-0.5 text-xs font-bold",
      kind === "read"
        ? "bg-brand text-brand-foreground"
        : "bg-muted text-foreground"
    )}
  >
    {WORDS.kind[kind]}
  </span>
)

/** The quiet way back, to Spoken or to a card. */
const QuietLink = ({
  card,
  children,
}: {
  card?: string
  children: ReactNode
}): JSX.Element => (
  <Link
    {...(card === undefined
      ? { to: "/journal/spoken" }
      : { to: "/journal/spoken/$card", params: { card } })}
    className="text-muted-foreground self-start text-sm underline underline-offset-4"
  >
    {children}
  </Link>
)

const KeptLine = (): JSX.Element => (
  <p className="text-muted-foreground border-border border-t pt-3 text-xs">
    {WORDS.kept}
  </p>
)

const SpokenListBody = ({
  runtime = phoneSpoken(),
}: {
  runtime?: SpokenRuntime
}): JSX.Element => {
  const cards = useCards(runtime)
  return (
    <StudioPage heading={WORDS.heading} intro={WORDS.intro} back="index">
      <Button asChild>
        <Link to="/journal/spoken/paste">{WORDS.paste.open}</Link>
      </Button>
      {cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">{WORDS.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <li key={card.id}>
              <CardRoute to="/journal/spoken/$card" params={{ card: card.id }}>
                <TileBody
                  title={titleOf(card)}
                  line={`${WORDS.category[card.category]} · ${WORDS.pasted(card.pastedAt)} · ${WORDS.summary(
                    card.parts.length,
                    card.parts.reduce((n, part) => n + part.takes.length, 0)
                  )}`}
                />
              </CardRoute>
            </li>
          ))}
        </ul>
      )}
      <KeptLine />
    </StudioPage>
  )
}

const PasteSpokenBody = ({
  runtime = phoneSpoken(),
}: {
  runtime?: SpokenRuntime
}): JSX.Element => {
  const navigate = useNavigate()
  const [text, setText] = useState("")
  const [notKept, setNotKept] = useState(false)
  const pasted = parseCard(text)
  // What Keep keeps: the first PARTS_MOST parts.
  const kept = pasted?.parts.slice(0, PARTS_MOST) ?? []
  const count = (kind: PartKind): number =>
    kept.filter((part) => part.kind === kind).length
  const asks = kept.filter((part) => part.ask !== null).length
  return (
    <StudioPage heading={WORDS.paste.heading}>
      <label htmlFor="spoken-paste" className="text-sm">
        {WORDS.paste.how}
      </label>
      <textarea
        id="spoken-paste"
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label={WORDS.paste.label}
        className="border-border bg-card min-h-56 w-full rounded-xl border p-3 font-mono text-sm"
      />
      <p className="text-sm font-semibold" data-testid="spoken-split">
        {pasted === null
          ? WORDS.paste.nothing
          : WORDS.paste.split(count("read"), count("own"), asks)}
      </p>
      {pasted !== null && pasted.parts.length > PARTS_MOST && (
        <p className="text-sm">{WORDS.paste.most(PARTS_MOST)}</p>
      )}
      <p className="text-muted-foreground text-sm">{WORDS.paste.plain}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pasted === null}
          onClick={() => {
            if (pasted === null) return
            const id = runtime.keep(pasted)
            if (id === null) {
              setNotKept(true)
              return
            }
            void navigate({ to: "/journal/spoken/$card", params: { card: id } })
          }}
        >
          {WORDS.paste.keep}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/journal/spoken">{WORDS.paste.cancel}</Link>
        </Button>
      </div>
      {notKept && (
        <Notice onDismiss={() => setNotKept(false)}>
          {WORDS.paste.notKept}
        </Notice>
      )}
    </StudioPage>
  )
}

const Lost = (): JSX.Element => (
  <StudioPage heading={WORDS.heading}>
    <p className="text-sm">{WORDS.lost}</p>
    <QuietLink>{WORDS.back}</QuietLink>
  </StudioPage>
)

const SpokenPartsBody = ({
  id,
  runtime = phoneSpoken(),
}: {
  id: string
  runtime?: SpokenRuntime
}): JSX.Element => {
  useAttached(runtime)
  const card = useCards(runtime).find((each) => each.id === id)
  if (card === undefined) return <Lost />
  const block = essayBlock(card)
  return (
    <StudioPage
      heading={titleOf(card)}
      intro={`${WORDS.category[card.category]} · ${WORDS.pasted(card.pastedAt)}`}
    >
      <ol className="flex flex-col gap-2">
        {card.parts.map((part, n) => {
          const pick = part.using === null ? -1 : part.takes.indexOf(part.using)
          return (
            // eslint-disable-next-line react/no-array-index-key -- a part has no id but its place in the card, which never changes
            <li key={n}>
              <CardRoute
                to="/journal/spoken/$card/$part"
                params={{ card: card.id, part: String(n + 1) }}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs font-bold">
                    {WORDS.partShort(n)}
                  </span>
                  <KindChip kind={part.kind} />
                </span>
                {part.ask !== null && (
                  <span className="text-muted-foreground text-xs">
                    {WORDS.asks(part.ask)}
                  </span>
                )}
                <span className="line-clamp-2 text-sm">{part.text}</span>
                <span className="text-muted-foreground text-xs">
                  {WORDS.partTakes(
                    part.takes.length,
                    pick === -1 ? null : pick + 1
                  )}
                </span>
              </CardRoute>
            </li>
          )
        })}
      </ol>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{WORDS.copy.heading}</h2>
        <p className="text-muted-foreground text-sm">{WORDS.copy.line}</p>
        <pre className="bg-card border-border rounded-xl border p-3 text-xs break-words whitespace-pre-wrap">
          {block}
        </pre>
        <CopyButton text={block} what={WORDS.copy.what} />
      </section>
      <KeptLine />
      <QuietLink>{WORDS.back}</QuietLink>
    </StudioPage>
  )
}

/** What home said of a take, in the person's words; null to say nothing. */
const heardLine = (answer: HeardAnswer | undefined): string | null => {
  if (answer?.kind === "heard") {
    return answer.text === "" ? WORDS.heard.none : `“${answer.text}”`
  }
  if (answer?.kind === "notYet" || answer?.kind === "notHeld") {
    return WORDS.heard.waiting
  }
  return null
}

const whereLine = (answer: HeardAnswer | undefined): string | null => {
  if (answer?.kind === "heard" || answer?.kind === "notYet")
    return WORDS.where.home
  if (answer?.kind === "notHeld") return WORDS.where.phone
  return null
}

/** One part's takes, newest first: play and use; none ever let go here. */
const PartTakes = ({
  runtime,
  card,
  n,
  part,
}: {
  runtime: SpokenRuntime
  card: string
  n: number
  part: SpokenPart
}): JSX.Element | null => {
  const { takes } = part
  const heard = useSyncExternalStore(
    runtime.heard.subscribe,
    runtime.heard.getSnapshot
  )
  const { playback, unplayable } = useSyncExternalStore(
    runtime.play.subscribe,
    runtime.play.getSnapshot
  )
  const key = takes.join(",")
  useEffect(() => {
    runtime.askHeard(key === "" ? [] : key.split(","))
  }, [runtime, key])
  if (takes.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{WORDS.takes(takes.length)}</h2>
      <ol className="flex flex-col gap-2">
        {takes
          .map((take, at) => ({ take, at }))
          .reverse()
          .map(({ take, at }) => {
            const answer = heard[take]
            const said = heardLine(answer)
            const where = whereLine(answer)
            const unheard = answer?.kind === "heard" && answer.text === ""
            const using = part.using === take
            const mine = playback.kind !== "quiet" && playback.id === take
            return (
              <li
                key={take}
                data-spoken-take={take}
                className={cn(
                  "bg-card flex items-start gap-3 rounded-2xl border p-3",
                  using ? "border-brand border-2" : "border-border"
                )}
              >
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={mine && playback.kind === "playing"}
                  onClick={() => runtime.toggle(take)}
                >
                  {mine ? WORDS.stop : WORDS.play}
                </Button>
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <span className="font-semibold">
                    {[
                      WORDS.take(at + 1),
                      ...(where === null ? [] : [where]),
                      ...(using ? [WORDS.using] : []),
                    ].join(" · ")}
                  </span>
                  {said !== null && (
                    <span className="text-muted-foreground text-xs italic [overflow-wrap:anywhere]">
                      {said}
                    </span>
                  )}
                  {!using && !unheard && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-start"
                      onClick={() => runtime.use(card, n, take)}
                    >
                      {WORDS.useThis}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
      </ol>
      {unplayable !== null && takes.includes(unplayable) && (
        <Notice
          action={{
            label: WORDS.play,
            onClick: () => runtime.toggle(unplayable),
          }}
        >
          {WORDS.notPlayed}
        </Notice>
      )}
    </section>
  )
}

/** A read part's words on the teleprompter band. */
const ReadPart = ({
  runtime,
  line,
  text,
}: {
  runtime: SpokenRuntime
  line: string
  text: string
}): JSX.Element => {
  const lines = phrasesOf(text)
  const prompter = useSyncExternalStore(
    runtime.prompter.subscribe,
    runtime.prompter.getSnapshot
  )
  const pace = useSyncExternalStore(
    runtime.pace.subscribe,
    runtime.pace.getSnapshot
  )
  const snapshot = useTakePattern(runtime.pattern)
  const { take } = snapshot
  const reading = take.kind === "recording" && snapshot.answers === line
  return (
    <Teleprompter
      lines={lines}
      band={bandOf(prompter, line, lines)}
      reading={reading}
      level={reading ? take.level : 0}
      time={reading ? WORDS.band.time(take.elapsedMs) : null}
      pace={pace}
      words={WORDS.band}
      dataScript={line}
      onPause={runtime.pause}
      onPace={runtime.setPace}
    />
  )
}

/** An own-words part: the prompt, and nothing that scrolls. */
const OwnPart = ({ text }: { text: string }): JSX.Element => (
  <>
    <section className="bg-card border-border rounded-2xl border-2 p-4">
      <p className="text-xl leading-snug font-extrabold [overflow-wrap:anywhere]">
        {text}
      </p>
    </section>
    <ul className="text-muted-foreground list-disc pl-5 text-sm">
      <li>{WORDS.own.hint}</li>
      <li>{WORDS.own.cap}</li>
    </ul>
  </>
)

const SpokenPartPageBody = ({
  id,
  n,
  runtime = phoneSpoken(),
}: {
  id: string
  /** The part, from 0. */
  n: number
  runtime?: SpokenRuntime
}): JSX.Element => {
  useAttached(runtime)
  const card = useCards(runtime).find((each) => each.id === id)
  const part = card === undefined ? undefined : partAt(card, n)
  if (card === undefined || part === undefined) return <Lost />
  const line = lineOf(card.id, n)
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <p className="text-muted-foreground text-xs font-semibold">
        {`${WORDS.part(n, card.parts.length)} · ${WORDS.kind[part.kind]}`}
      </p>
      {part.ask !== null && (
        <section className="bg-muted flex flex-col gap-0.5 rounded-2xl px-3 py-2">
          <p className="text-muted-foreground text-xs">{WORDS.theyAsk}</p>
          <p className="font-semibold [overflow-wrap:anywhere]">{part.ask}</p>
        </section>
      )}
      {part.kind === "read" ? (
        <ReadPart runtime={runtime} line={line} text={part.text} />
      ) : (
        <OwnPart text={part.text} />
      )}
      <TakeList
        pattern={runtime.pattern}
        answers={line}
        takes={[]}
        label={part.takes.length === 0 ? WORDS.record : WORDS.recordAgain}
      />
      <p className="text-muted-foreground text-sm">{WORDS.recordLine}</p>
      {part.takes.length === 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => runtime.flip(card.id, n)}
        >
          {WORDS.flip(part.kind === "read" ? "own" : "read")}
        </Button>
      )}
      <PartTakes runtime={runtime} card={card.id} n={n} part={part} />
      <QuietLink card={card.id}>{titleOf(card)}</QuietLink>
    </div>
  )
}

/*
 * Spoken's pages are the phone's ("apk"): a build without them draws
 * nothing, so no link here reaches a page it doesn't ship (A3).
 */
export const SpokenList = (props: {
  runtime?: SpokenRuntime
}): JSX.Element | null =>
  hasAudience("apk") ? <SpokenListBody {...props} /> : null

export const PasteSpoken = (props: {
  runtime?: SpokenRuntime
}): JSX.Element | null =>
  hasAudience("apk") ? <PasteSpokenBody {...props} /> : null

export const SpokenParts = (props: {
  id: string
  runtime?: SpokenRuntime
}): JSX.Element | null =>
  hasAudience("apk") ? <SpokenPartsBody {...props} /> : null

export const SpokenPartPage = (props: {
  id: string
  n: number
  runtime?: SpokenRuntime
}): JSX.Element | null =>
  hasAudience("apk") ? <SpokenPartPageBody {...props} /> : null
