/**
 * Studio's asks (SFEED1, #2731): what waits on the owner to decide, read
 * from the open `ask` issues of both repositories (`lib/studio-asks`). The
 * list shows each by what it asks, A to Z, and an ask's page shows why it's
 * the owner's, the options with what each unblocks, and the way to its page
 * on GitHub. Where the phone records, its route hands in the way to answer
 * it by voice (SFEED5, `./ask-answer`).
 * The read is the query's (`studioAsksQuery`); this only draws its outcome.
 */
import type { JSX, ReactNode } from "react"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { StudioAsk } from "@/lib/studio-asks"
import { questionOf, studioAsksQuery } from "@/lib/studio-asks"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { OutLink, Part, ReadList, TILE } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.asks

const Read = ({
  children,
}: {
  children: (items: ReadonlyArray<StudioAsk>) => ReactNode
}): JSX.Element => (
  <ReadList query={studioAsksQuery} words={WORDS}>
    {children}
  </ReadList>
)

/** The list: each ask a link to its page, A to Z. */
export const AsksList = (): JSX.Element => (
  <Read>
    {(asks) =>
      // An ask's page is the phone's ("apk"), as this list is (A3).
      asks.length === 0 || !hasAudience("apk") ? (
        <p className="text-muted-foreground text-sm">{WORDS.none}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {asks.map((ask) => (
            <li key={ask.id}>
              <Link
                to="/journal/asks/$ask"
                params={{ ask: ask.id }}
                className={TILE}
              >
                <span className="text-base font-bold">{questionOf(ask)}</span>
                <span className="text-muted-foreground text-sm">
                  {WORDS.from[ask.repo]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )
    }
  </Read>
)

/** One ask's page, by its id, or that it no longer waits. */
export const AskScreen = ({
  id,
  answer,
}: {
  id: string
  /** The way to answer it by voice, where the phone records. */
  answer?: ((ask: StudioAsk) => ReactNode) | undefined
}): JSX.Element => (
  <Read>
    {(asks) => {
      const one = asks.find((ask) => ask.id === id)
      if (one === undefined)
        return <p className="text-muted-foreground text-sm">{WORDS.gone}</p>
      return <AskParts ask={one} answer={answer?.(one)} />
    }}
  </Read>
)

const AskParts = ({
  ask,
  answer,
}: {
  ask: StudioAsk
  answer: ReactNode
}): JSX.Element => (
  <>
    <h2 className="text-lg leading-snug font-bold">{questionOf(ask)}</h2>
    <p className="text-muted-foreground text-sm">{WORDS.from[ask.repo]}</p>
    {ask.ask === null ? (
      <p className="text-sm">{WORDS.unread}</p>
    ) : (
      <>
        <Part label={WORDS.whyYours}>
          <p className="text-sm">{ask.ask.whyYours}</p>
        </Part>
        <Part label={WORDS.options}>
          <ul className="flex flex-col gap-2">
            {ask.ask.options.map((option, i) => (
              <li key={option.says} className="flex flex-col">
                <span className="text-sm font-semibold">
                  {option.says}
                  {ask.ask?.recommended === i && (
                    <span className="text-brand ml-2 text-xs font-bold">
                      {WORDS.recommended}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {WORDS.unblocks(option.unblocks)}
                </span>
              </li>
            ))}
          </ul>
        </Part>
      </>
    )}
    {answer}
    <OutLink href={ask.url}>{WORDS.open}</OutLink>
  </>
)
