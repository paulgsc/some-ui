/**
 * Studio's asks (SFEED1, #2731): what waits on the owner to decide, read
 * from the open `ask` issues of both repositories (`lib/studio-asks`). The
 * list shows each by what it asks, A to Z, and an ask's page shows why it's
 * the owner's, the options with what each unblocks, and the way to its page
 * on GitHub, where it is answered until Studio answers by voice (SFEED5).
 * The read is the query's (`studioAsksQuery`); this only draws its outcome.
 */
import type { JSX, ReactNode } from "react"
import { Button } from "@some-ui/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { StudioAsk } from "@/lib/studio-asks"
import { questionOf, studioAsksQuery } from "@/lib/studio-asks"
import { STUDIO_INDEX_WORDS } from "@/lib/studio-index"

import { Part, TILE } from "./layout"

const WORDS = STUDIO_INDEX_WORDS.asks

/** The open asks once read, or what stands in for them until then. */
const Read = ({
  children,
}: {
  children: (asks: ReadonlyArray<StudioAsk>) => ReactNode
}): JSX.Element =>
  matchQueryOutcome(queryOutcome(useQuery(studioAsksQuery)), {
    pending: () => (
      <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
    ),
    failed: (_error, retry) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{WORDS.away}</p>
        <Button size="sm" variant="outline" onClick={retry}>
          {STUDIO_INDEX_WORDS.tryAgain}
        </Button>
      </div>
    ),
    ready: (asks) => <>{children(asks)}</>,
  })

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
export const AskScreen = ({ id }: { id: string }): JSX.Element => (
  <Read>
    {(asks) => {
      const one = asks.find((ask) => ask.id === id)
      if (one === undefined)
        return <p className="text-muted-foreground text-sm">{WORDS.gone}</p>
      return <AskParts ask={one} />
    }}
  </Read>
)

const AskParts = ({ ask }: { ask: StudioAsk }): JSX.Element => (
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
    <a
      href={ask.url}
      target="_blank"
      rel="noreferrer"
      className="text-brand self-start text-sm font-semibold underline underline-offset-4"
    >
      {WORDS.open}
    </a>
  </>
)
