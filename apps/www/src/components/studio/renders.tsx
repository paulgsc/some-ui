/**
 * Studio › Renders (SFEED13, #2761): what home is making for the feeds, with
 * a rough bar while it renders, what waits its turn and why, what couldn't
 * finish, what finished lately, and what's coming. The read is the query's
 * (`rendersQuery`), which reads again on its own while home is making
 * something; a drag down reads again too (PULL). Every word is `lib/renders`'s.
 */
import type { JSX, ReactNode } from "react"
import { Button } from "@some-ui/shared"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { matchQueryOutcome, queryOutcome } from "@/lib/query-outcome"
import type { Board, RendersOutcome } from "@/lib/renders"
import {
  episodeName,
  failedLine,
  feedName,
  liveLine,
  nowLines,
  RENDERS_WORDS,
  rendersQuery,
} from "@/lib/renders"

import { Part, TILE } from "./layout"

const WORDS = RENDERS_WORDS

const Muted = ({ children }: { children: ReactNode }): JSX.Element => (
  <p className="text-muted-foreground text-sm">{children}</p>
)

/** A bar that moves: a share when home has one, a sweep when it doesn't. */
const Bar = ({ percent }: { percent: number | null }): JSX.Element => (
  <div
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent ?? undefined}
    className="bg-muted h-2 w-full overflow-hidden rounded-full"
  >
    {percent === null ? (
      <div className="bg-primary h-full w-1/3 animate-pulse rounded-full" />
    ) : (
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-700"
        style={{ width: `${String(percent)}%` }}
      />
    )}
  </div>
)

const BoardView = ({ board }: { board: Board }): JSX.Element => {
  const now = board.now === null ? null : nowLines(board.now)
  return (
    <>
      <Part label={WORDS.now}>
        {now === null || board.now === null ? (
          <Muted>{WORDS.nothingNow}</Muted>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold">{now.title}</span>
            <span className="text-sm">{now.line}</span>
            <Bar percent={now.percent} />
            {now.left !== null && <Muted>{now.left}</Muted>}
            {board.now.gaveWay > 0 && (
              <Muted>{WORDS.gaveWay(board.now.gaveWay)}</Muted>
            )}
          </div>
        )}
      </Part>
      <Part label={WORDS.waiting}>
        {board.waiting.length === 0 ? (
          <Muted>{WORDS.nothingWaiting}</Muted>
        ) : (
          <ul className="flex flex-col gap-1">
            {board.waiting.map((episode) => (
              <li key={`${episode.feed}/${episode.key}`} className="text-sm">
                {feedName(episode.feed)}:{" "}
                {episodeName(episode.feed, episode.key)}
              </li>
            ))}
          </ul>
        )}
      </Part>
      {board.failed.length > 0 && (
        <Part label={WORDS.failed}>
          <ul className="flex flex-col gap-2">
            {board.failed.map((failed) => (
              <li key={`${failed.feed}/${failed.key}`} className="text-sm">
                <span className="block font-medium">
                  {feedName(failed.feed)}:{" "}
                  {episodeName(failed.feed, failed.key)}
                </span>
                <span className="text-muted-foreground block">
                  {failedLine(failed)}
                </span>
              </li>
            ))}
          </ul>
        </Part>
      )}
      {board.done.length > 0 && (
        <Part label={WORDS.done}>
          <ul className="flex flex-col gap-1">
            {board.done.map((episode) => (
              <li key={`${episode.feed}/${episode.key}`} className="text-sm">
                {feedName(episode.feed)}:{" "}
                {episodeName(episode.feed, episode.key)}
              </li>
            ))}
          </ul>
        </Part>
      )}
      <Part label={WORDS.coming}>
        {board.coming.length === 0 ? (
          <Muted>{WORDS.nothingComing}</Muted>
        ) : (
          <ul className="flex flex-col gap-1">
            {board.coming.map((coming) => (
              <li key={coming.feed} className="text-sm">
                {feedName(coming.feed)}. {WORDS.expected(coming.on)}
              </li>
            ))}
          </ul>
        )}
      </Part>
    </>
  )
}

/** What a read came to, other than a board. */
const notRead = (
  outcome: Exclude<RendersOutcome, { kind: "read" }>
): string => {
  switch (outcome.kind) {
    case "unpaired":
      return WORDS.unpaired
    case "away":
      return WORDS.away
    case "older":
      return WORDS.older
    case "unreadable":
      return WORDS.unreadable
  }
}

/** The page's body. */
export const RendersBoard = (): JSX.Element =>
  matchQueryOutcome(queryOutcome(useQuery(rendersQuery)), {
    pending: () => <Muted>{WORDS.reading}</Muted>,
    failed: (_error, retry) => (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{WORDS.away}</p>
        <Button size="sm" variant="outline" onClick={retry}>
          {WORDS.tryAgain}
        </Button>
      </div>
    ),
    ready: (outcome) =>
      outcome.kind === "read" ? (
        <BoardView board={outcome.board} />
      ) : (
        <Muted>{notRead(outcome)}</Muted>
      ),
  })

/** Studio's one live line above its tiles: shown only when home has something to say. */
export const RendersLine = (): JSX.Element | null => {
  const read = useQuery(rendersQuery).data
  const line = read?.kind === "read" ? liveLine(read.board) : null
  return line === null ? null : (
    <Link to="/journal/renders" className={TILE}>
      <span className="text-sm font-medium">{line}</span>
      <span className="text-muted-foreground text-sm">{WORDS.open}</span>
    </Link>
  )
}
