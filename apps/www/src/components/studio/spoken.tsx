/**
 * Studio's Spoken on the phone (W5, run #3311), built to the owner's
 * approved prototype of 2026-11-20
 * (https://claude.ai/artifact/R4t2EfwmGu2dGWpDk2Fxyr), renamed "spoken" the
 * same day: the spoken cards this phone keeps, pasting one, a card in its
 * parts, and a part read on the shared teleprompter (`Teleprompter`) or said
 * in your own words, with every take of it kept. It renders the runtime's snapshots and forwards taps
 * (`lib/studio-spoken`, which owns every wait); every word is its
 * `SPOKEN_WORDS`.
 */
import type { JSX } from "react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { cn } from "@some-ui/core-utils"
import {
  bandOf,
  Button,
  Notice,
  TakeList,
  Teleprompter,
  useTakePattern,
} from "@some-ui/shared"
import type { HeardAnswer } from "@some-ui/voice-capture"
import { Link, useNavigate } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { PartKind, SpokenCard, SpokenRuntime } from "@/lib/studio-spoken"
import {
  essayBlock,
  essayParts,
  lineOf,
  parseCard,
  phoneSpoken,
  phrasesOf,
  SPOKEN_WORDS,
} from "@/lib/studio-spoken"
import { CardRoute } from "@/components/card-route"
import { CopyButton } from "@/components/copy-button"

import { StudioPage, TileBody } from "./layout"

const WORDS = SPOKEN_WORDS

const useScripts = (runtime: SpokenRuntime): ReadonlyArray<SpokenCard> =>
  useSyncExternalStore(runtime.scripts.subscribe, runtime.scripts.getSnapshot)

/** The runtime's takes seen while a script's page shows. */
const useAttached = (runtime: SpokenRuntime): void => {
  useEffect(() => runtime.attach(), [runtime])
}

const titleOf = (script: SpokenCard): string =>
  script.title === "" ? WORDS.untitled : script.title

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

/** Spoken: Paste a spoken card, and each card this phone keeps, newest first. */
const SpokenListBody = ({
  runtime = phoneSpoken(),
}: {
  runtime?: SpokenRuntime
}): JSX.Element => {
  const scripts = useScripts(runtime)
  return (
    <StudioPage heading={WORDS.heading} intro={WORDS.intro} back="index">
      <Button asChild>
        <Link to="/journal/spoken/paste">{WORDS.paste.open}</Link>
      </Button>
      {scripts.length === 0 ? (
        <p className="text-muted-foreground text-sm">{WORDS.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {scripts.map((script) => (
            <li key={script.id}>
              <CardRoute
                to="/journal/spoken/$card"
                params={{ card: script.id }}
              >
                <TileBody
                  title={titleOf(script)}
                  line={`${WORDS.category[script.category]} · ${WORDS.pasted(script.pastedAt)} · ${WORDS.summary(
                    script.parts.length,
                    script.parts.reduce((n, part) => n + part.takes.length, 0)
                  )}`}
                />
              </CardRoute>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground border-border border-t pt-3 text-xs">
        {WORDS.kept}
      </p>
    </StudioPage>
  )
}

/** Paste a spoken card: the words, how they split, and Keep. */
const PasteSpokenBody = ({
  runtime = phoneSpoken(),
}: {
  runtime?: SpokenRuntime
}): JSX.Element => {
  const navigate = useNavigate()
  const [text, setText] = useState("")
  const [notKept, setNotKept] = useState(false)
  const pasted = parseCard(text)
  const count = (kind: PartKind): number =>
    pasted?.parts.filter((part) => part.kind === kind).length ?? 0
  const asks = pasted?.parts.filter((part) => part.ask !== null).length ?? 0
  return (
    <StudioPage heading={WORDS.paste.heading}>
      <label htmlFor="script-paste" className="text-sm">
        {WORDS.paste.how}
      </label>
      <textarea
        id="script-paste"
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label={WORDS.paste.label}
        className="border-border bg-card min-h-56 w-full rounded-xl border p-3 font-mono text-sm"
      />
      <p className="text-sm font-semibold" data-testid="script-split">
        {pasted === null
          ? WORDS.paste.nothing
          : WORDS.paste.split(count("read"), count("own"), asks)}
      </p>
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
            void navigate({
              to: "/journal/spoken/$card",
              params: { card: id },
            })
          }}
        >
          {WORDS.paste.keep}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/journal/spoken">{WORDS.paste.cancel}</Link>
        </Button>
      </div>
      {notKept && (
        // Said over the screen, so the page holds still (HS1).
        <Notice onDismiss={() => setNotKept(false)}>
          {WORDS.paste.notKept}
        </Notice>
      )}
    </StudioPage>
  )
}

const BackToSpoken = (): JSX.Element => (
  <Link
    to="/journal/spoken"
    className="text-muted-foreground self-start text-sm underline underline-offset-4"
  >
    {WORDS.back}
  </Link>
)

const Lost = (): JSX.Element => (
  <StudioPage heading={WORDS.heading}>
    <p className="text-sm">{WORDS.lost}</p>
    <BackToSpoken />
  </StudioPage>
)

/** A spoken card in its parts, and the essay's copy. */
const SpokenPartsBody = ({
  id,
  runtime = phoneSpoken(),
}: {
  id: string
  runtime?: SpokenRuntime
}): JSX.Element => {
  useAttached(runtime)
  const script = useScripts(runtime).find((each) => each.id === id)
  if (script === undefined) return <Lost />
  return (
    <StudioPage
      heading={titleOf(script)}
      intro={`${WORDS.category[script.category]} · ${WORDS.pasted(script.pastedAt)}`}
    >
      <ol className="flex flex-col gap-2">
        {script.parts.map((part, n) => {
          const pick = part.using === null ? -1 : part.takes.indexOf(part.using)
          return (
            // A part is its place in the script, which never changes.
            // eslint-disable-next-line react/no-array-index-key -- a part has no id but its place
            <li key={n}>
              <CardRoute
                to="/journal/spoken/$card/$part"
                params={{ card: script.id, part: String(n + 1) }}
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
          {essayBlock(script, essayParts(script))}
        </pre>
        <CopyButton
          text={essayBlock(script, essayParts(script))}
          what={WORDS.copy.what}
        />
      </section>
      <p className="text-muted-foreground border-border border-t pt-3 text-xs">
        {WORDS.kept}
      </p>
      <BackToSpoken />
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
  script,
  n,
}: {
  runtime: SpokenRuntime
  script: SpokenCard
  n: number
}): JSX.Element | null => {
  const part = script.parts.at(n)
  const takes = part?.takes ?? []
  const heard = useSyncExternalStore(
    runtime.heard.subscribe,
    runtime.heard.getSnapshot
  )
  const playing = useSyncExternalStore(
    runtime.playing.subscribe,
    runtime.playing.getSnapshot
  )
  const key = takes.join(",")
  useEffect(() => {
    runtime.askHeard(key === "" ? [] : key.split(","))
  }, [runtime, key])
  if (part === undefined || takes.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{WORDS.takes(takes.length)}</h2>
      <ol className="flex flex-col gap-2">
        {takes
          .map((take, at) => ({ take, at }))
          .reverse()
          .map(({ take, at }) => {
            const answer = heard[take]
            const unheard = answer?.kind === "heard" && answer.text === ""
            const using = part.using === take
            const mine = playing.kind !== "quiet" && playing.id === take
            const where = whereLine(answer)
            return (
              <li
                key={take}
                data-script-take={take}
                className={cn(
                  "bg-card flex items-start gap-3 rounded-2xl border p-3",
                  using ? "border-brand border-2" : "border-border"
                )}
              >
                <Button
                  variant="outline"
                  size="sm"
                  aria-pressed={mine && playing.kind === "playing"}
                  onClick={() => runtime.play(take)}
                >
                  {mine && playing.kind !== "missed" ? WORDS.stop : WORDS.play}
                </Button>
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <span className="font-semibold">
                    {[
                      WORDS.take(at + 1),
                      ...(where === null ? [] : [where]),
                      ...(using ? [WORDS.using] : []),
                    ].join(" · ")}
                  </span>
                  {heardLine(answer) !== null && (
                    <span className="text-muted-foreground text-xs italic [overflow-wrap:anywhere]">
                      {heardLine(answer)}
                    </span>
                  )}
                  <span className="flex flex-wrap gap-2">
                    {!using && !unheard && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runtime.use(script.id, n, take)}
                      >
                        {WORDS.useThis}
                      </Button>
                    )}
                  </span>
                </div>
              </li>
            )
          })}
      </ol>
      {playing.kind === "missed" && takes.includes(playing.id) && (
        // Said over the screen, so the page holds still (HS1).
        <Notice
          action={{
            label: WORDS.play,
            onClick: () => runtime.play(playing.id),
          }}
        >
          {WORDS.notPlayed}
        </Notice>
      )}
    </section>
  )
}

/** A read part's band: the question above, the words on the teleprompter. */
const ReadPart = ({
  runtime,
  line,
  text,
  ask,
}: {
  runtime: SpokenRuntime
  line: string
  text: string
  ask: string | null
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
    <>
      {ask !== null && (
        <section className="bg-muted flex flex-col gap-0.5 rounded-2xl px-3 py-2">
          <p className="text-muted-foreground text-xs">{WORDS.theyAsk}</p>
          <p className="font-semibold [overflow-wrap:anywhere]">{ask}</p>
        </section>
      )}
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
    </>
  )
}

/** An own-words part: the prompt, and nothing that scrolls. */
const OwnPart = ({
  text,
  ask,
}: {
  text: string
  ask: string | null
}): JSX.Element => (
  <>
    {ask !== null && (
      <section className="bg-muted flex flex-col gap-0.5 rounded-2xl px-3 py-2">
        <p className="text-muted-foreground text-xs">{WORDS.theyAsk}</p>
        <p className="font-semibold [overflow-wrap:anywhere]">{ask}</p>
      </section>
    )}
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

/** A part of a spoken card: read on the band or said, recorded, and its takes. */
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
  const script = useScripts(runtime).find((each) => each.id === id)
  const part = script?.parts.at(n)
  if (script === undefined || part === undefined) return <Lost />
  const line = lineOf(script.id, n)
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <p className="text-muted-foreground text-xs font-semibold">
        {`${WORDS.part(n, script.parts.length)} · ${WORDS.kind[part.kind]}`}
      </p>
      {part.kind === "read" ? (
        <ReadPart
          runtime={runtime}
          line={line}
          text={part.text}
          ask={part.ask}
        />
      ) : (
        <OwnPart text={part.text} ask={part.ask} />
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
          onClick={() => runtime.flip(script.id, n)}
        >
          {WORDS.flip(part.kind === "read" ? "own" : "read")}
        </Button>
      )}
      <PartTakes runtime={runtime} script={script} n={n} />
      <Link
        to="/journal/spoken/$card"
        params={{ card: script.id }}
        className="text-muted-foreground self-start text-sm underline underline-offset-4"
      >
        {titleOf(script)}
      </Link>
    </div>
  )
}

/**
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
