/**
 * Studio › Renders (SFEED13, #2761): what home is making for the feeds and
 * templates, with a rough bar while it renders, what waits its turn and why,
 * what couldn't finish, what finished lately, and what's coming. Each row
 * names its kind and the thing, and opens its own page (#2899). The read is the query's
 * (`rendersQuery`), which reads again on its own while home has something
 * under way; a drag down reads again too (PULL). Every word is `lib/renders`'s.
 */
import type { JSX, ReactNode } from "react"
import { assertNever } from "@some-ui/core-utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import type { Board, RendersOutcome, Row, Subject } from "@/lib/renders"
import {
  doneLine,
  failedLine,
  feedName,
  kindName,
  liveLine,
  nowLines,
  openWords,
  RENDERS_WORDS,
  rendersQuery,
  subjectOf,
  thingName,
} from "@/lib/renders"

import { Part, ReadList, StudioPage, TILE } from "./layout"

const WORDS = RENDERS_WORDS

/** A quiet link, as Studio's pages draw one. */
const LINK =
  "text-brand self-start text-sm font-semibold underline underline-offset-4"

const Muted = ({ children }: { children: ReactNode }): JSX.Element => (
  <p className="text-muted-foreground text-sm">{children}</p>
)

/**
 * A bar: home's share when it has one, a sweep when it doesn't (a pulse, for
 * a person who asks for less motion).
 */
const Bar = ({ percent }: { percent: number | null }): JSX.Element => (
  <div
    role="progressbar"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent ?? undefined}
    className="bg-muted h-2 w-full overflow-hidden rounded-full"
  >
    {percent === null ? (
      <div className="bg-primary h-full w-1/3 animate-[renders-sweep_1.6s_ease-in-out_infinite] rounded-full motion-reduce:animate-pulse" />
    ) : (
      <div
        className="bg-primary h-full rounded-full transition-[width] duration-700"
        style={{ width: `${String(percent)}%` }}
      />
    )}
  </div>
)

/** A link to `subject`'s own page, or none where it has none. */
const ToPage = ({
  subject,
  className,
  children,
}: {
  subject: Subject
  className: string
  children: ReactNode
}): JSX.Element | null => {
  switch (subject.kind) {
    case "episode": {
      return (
        <Link
          to="/journal/episodes/$feed/$key"
          params={{ feed: subject.feed, key: subject.key }}
          className={className}
        >
          {children}
        </Link>
      )
    }
    case "preview": {
      return subject.template === null ? null : (
        <Link
          to="/journal/templates/$template"
          params={{ template: subject.template }}
          className={className}
        >
          {children}
        </Link>
      )
    }
    case "walk": {
      return (
        <Link
          to="/journal/clips/$clip"
          params={{ clip: subject.clip }}
          className={className}
        >
          {children}
        </Link>
      )
    }
    case "other": {
      return null
    }
    default: {
      return assertNever(subject)
    }
  }
}

/**
 * One render as a tile (#2899): what kind it is, the thing by name, and a
 * line under it where it has one; the tile opens its page where it has one.
 */
const RowTile = ({
  row,
  line,
  tone = "muted",
}: {
  row: Row
  line: string | null
  tone?: "muted" | "plain"
}): JSX.Element => {
  const subject = subjectOf(row)
  const body = (
    <>
      <span className="text-muted-foreground text-xs">{kindName(subject)}</span>
      <span className="text-sm font-medium">{thingName(subject)}</span>
      {line !== null && (
        <span
          className={
            tone === "muted" ? "text-muted-foreground text-sm" : "text-sm"
          }
        >
          {line}
        </span>
      )}
    </>
  )
  return (
    <li>
      {openWords(subject) === null ? (
        <div className={TILE}>{body}</div>
      ) : (
        <ToPage subject={subject} className={TILE}>
          {body}
        </ToPage>
      )}
    </li>
  )
}

const BoardView = ({ board }: { board: Board }): JSX.Element => {
  const now = board.now === null ? null : nowLines(board.now)
  const nowSubject = board.now === null ? null : subjectOf(board.now)
  const open = nowSubject === null ? null : openWords(nowSubject)
  return (
    <>
      <Part label={WORDS.now}>
        {now === null || board.now === null || nowSubject === null ? (
          <Muted>{WORDS.nothingNow}</Muted>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs">
              {kindName(nowSubject)}
            </span>
            <span className="text-base font-bold">{thingName(nowSubject)}</span>
            <span className="text-sm">{now.line}</span>
            <Bar percent={now.percent} />
            {now.left !== null && <Muted>{now.left}</Muted>}
            {board.now.gaveWay > 0 && (
              <Muted>{WORDS.gaveWay(board.now.gaveWay)}</Muted>
            )}
            {open !== null && (
              <ToPage subject={nowSubject} className={LINK}>
                {open}
              </ToPage>
            )}
          </div>
        )}
      </Part>
      <Part label={WORDS.waiting}>
        {board.waiting.length === 0 ? (
          <Muted>{WORDS.nothingWaiting}</Muted>
        ) : (
          <ul className="flex flex-col gap-2">
            {board.waiting.map((episode) => (
              <RowTile
                key={`${episode.feed}/${episode.key}`}
                row={episode}
                line={null}
              />
            ))}
          </ul>
        )}
      </Part>
      {board.failed.length > 0 && (
        <Part label={WORDS.failed}>
          <ul className="flex flex-col gap-2">
            {board.failed.map((failed) => (
              <RowTile
                key={`${failed.feed}/${failed.key}`}
                row={failed}
                line={failedLine(failed)}
              />
            ))}
          </ul>
        </Part>
      )}
      {board.done.length > 0 && (
        <Part label={WORDS.done}>
          <ul className="flex flex-col gap-2">
            {board.done.map((episode) => (
              <RowTile
                key={`${episode.feed}/${episode.key}`}
                row={episode}
                line={doneLine(episode)}
              />
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
    case "unpaired": {
      return WORDS.unpaired
    }
    case "older": {
      return WORDS.older
    }
    default: {
      return assertNever(outcome)
    }
  }
}

/** The line for whatever the read came to, so it never comes and goes. */
const lineOf = (read: RendersOutcome | undefined): string => {
  if (read === undefined) return WORDS.lineUntilRead
  return read.kind === "read" ? liveLine(read.board) : notRead(read)
}

/**
 * Studio's one line above its tiles, there from the first paint and one line
 * tall whatever it says, so the tiles never move: what home is making once it
 * has answered, and the way to the page before then.
 */
export const RendersLine = (): JSX.Element | null => {
  const line = lineOf(useQuery(rendersQuery).data)
  // The page is the phone's ("apk"), as this line is (A3).
  return hasAudience("apk") ? (
    <Link to="/journal/renders" className={TILE}>
      <span className="truncate text-sm font-medium">{line}</span>
      <span className="text-muted-foreground truncate text-sm">
        {WORDS.open}
      </span>
    </Link>
  ) : null
}

/** The whole page, heading and all, so its words ship only where it does. */
export const RendersPage = (): JSX.Element => (
  <StudioPage heading={WORDS.heading} intro={WORDS.intro} back="index">
    <ReadList query={rendersQuery} words={WORDS}>
      {(outcome) =>
        outcome.kind === "read" ? (
          <BoardView board={outcome.board} />
        ) : (
          <Muted>{notRead(outcome)}</Muted>
        )
      }
    </ReadList>
  </StudioPage>
)
