/**
 * Studio's Episodes, by week (EPISODES2, #3067; design A of #3030): every
 * feed's episodes in one feed, the newest week first, under a bar of genre
 * chips with counts, each a link that filters it. Each episode is a compact
 * row with its genre's stock thumbnail (`GenreThumb`), its status dot
 * (`DOTS`, one meaning on every screen), and a week's parts inline, each
 * opening its own page. What it shows is `lib/episodes-feed`'s `feedView`;
 * every word is `EPISODES_FEED_WORDS`. The chip bar scrolls sideways on its
 * own and carries no touch code. Phone build only.
 */
import type { JSX, ReactNode } from "react"
import { useEffect, useSyncExternalStore } from "react"
import { cn, dayOf, weekOf } from "@some-ui/core-utils"
import { Button, DOTS } from "@some-ui/shared"
import type { DotMeaning } from "@some-ui/shared"
import { Link } from "@tanstack/react-router"

import { hasAudience } from "@/lib/build-profile"
import {
  episodeName,
  everyFeed,
  feedVideos,
  videosRefresher,
} from "@/lib/call-videos"
import type { Feed } from "@/lib/call-videos/model"
import { FEEDS } from "@/lib/call-videos/model"
import { FEED_WORDS } from "@/lib/call-videos/words"
import { useMinuteClock } from "@/lib/clock"
import type { Chip, FeedView, Row, Trouble } from "@/lib/episodes-feed"
import { feedView, partStatus, rowLength, rowStatus } from "@/lib/episodes-feed"
import { EPISODES_FEED_WORDS } from "@/lib/episodes-feed/words"
import { screenRefreshers } from "@/lib/pull-refresh/refreshers"
import { GenreThumb } from "@/components/studio/genre-thumbs"

const WORDS = EPISODES_FEED_WORDS

const Dot = ({ meaning }: { meaning: DotMeaning }): JSX.Element => (
  <span
    aria-hidden
    className={cn(
      "inline-block size-1.5 shrink-0 rounded-full",
      DOTS[meaning].className
    )}
  />
)

/** The chip bar: All, then each genre A to Z, each with its count. */
const ChipBar = ({
  chip,
  counts,
}: {
  chip: Chip
  counts: Readonly<Record<Chip, number>>
}): JSX.Element => {
  const chips: ReadonlyArray<{ id: Chip; name: string }> = [
    { id: "all", name: WORDS.all },
    // A to Z by what each chip says, so the bar's order ranks nothing.
    ...FEEDS.map((feed) => ({ id: feed, name: WORDS.genre[feed] })).sort(
      (a, b) => a.name.localeCompare(b.name, "en")
    ),
  ]
  return (
    <nav
      aria-label={WORDS.chips}
      // The bar scrolls sideways when the chips are wider than the phone.
      data-scroll-intent=""
      className="flex gap-2 overflow-x-auto py-1 [scrollbar-width:none]"
    >
      {chips.map(({ id, name }) => (
        <Link
          key={id}
          to="/journal/episodes"
          search={id === "all" ? {} : { genre: id }}
          replace
          aria-current={chip === id ? "page" : undefined}
          aria-label={WORDS.chipLabel(name, counts[id])}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm whitespace-nowrap",
            chip === id
              ? "bg-foreground text-background"
              : "bg-card text-foreground"
          )}
        >
          {name}
          <span className="tabular-nums opacity-70">{counts[id]}</span>
        </Link>
      ))}
    </nav>
  )
}

/** A row's thumbnail, with its parts or its length over it. */
const Thumb = ({ row }: { row: Row }): JSX.Element => {
  const length = rowLength(row)
  const badge =
    row.parts.length > 1
      ? WORDS.partsBadge(row.parts.length)
      : length === null
        ? null
        : WORDS.length(length)
  return (
    // The genre is said under the row's name, so the drawing isn't read out.
    <div
      aria-hidden
      className="relative aspect-video overflow-hidden rounded-md"
    >
      <GenreThumb feed={row.feed} />
      {badge !== null && (
        <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-[10px] font-bold text-white tabular-nums">
          {badge}
        </span>
      )}
    </div>
  )
}

/** What a row's dot says: its standing, or how many of its parts are up. */
function statusWords(row: Row): string {
  if (row.parts.length === 1) return WORDS.status[rowStatus(row)]
  const out = row.parts.filter((part) => partStatus(part) === "out").length
  return WORDS.parts(row.parts.length, out)
}

const EpisodeRow = ({ row }: { row: Row }): JSX.Element => {
  const [first] = row.parts
  const { feed } = row
  const name = episodeName(feed, { ...first, part: 1, of: 1 })
  return (
    <li className="flex flex-col gap-2">
      <Link
        to="/journal/episodes/$feed/$key"
        params={{ feed, key: first.key }}
        className="focus-visible:ring-ring grid grid-cols-[9rem_minmax(0,1fr)] items-start gap-3 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      >
        <Thumb row={row} />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="line-clamp-2 text-sm leading-snug font-bold">
            {name}
          </span>
          <span className="text-muted-foreground text-xs">
            {WORDS.genre[feed]}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <span className="bg-card inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
              <Dot meaning={rowStatus(row)} />
              {statusWords(row)}
            </span>
            {FEED_WORDS[feed].voice !== null && (
              <span className="bg-card inline-flex items-center rounded-full px-2 py-0.5 text-xs">
                {WORDS.voice}
              </span>
            )}
          </span>
        </span>
      </Link>
      {row.parts.length > 1 && (
        <ul className="flex flex-wrap gap-1.5 pl-39">
          {row.parts.map((part, index) => {
            const status = partStatus(part)
            return (
              <li key={part.key}>
                <Link
                  to="/journal/episodes/$feed/$key"
                  params={{ feed, key: part.key }}
                  aria-label={WORDS.partLabel(index + 1, WORDS.status[status])}
                  className="bg-card inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs"
                >
                  <Dot meaning={status} />
                  {WORDS.part(index + 1)}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

const TroubleCard = ({
  trouble,
  onTryAgain,
}: {
  trouble: Trouble
  onTryAgain: () => void
}): JSX.Element => (
  <div className="bg-card flex flex-col gap-2 rounded-lg p-3">
    <p className="text-sm">{WORDS.trouble(trouble)}</p>
    <Button
      size="sm"
      variant="outline"
      className="self-start"
      onClick={onTryAgain}
    >
      {WORDS.tryAgain}
    </Button>
  </div>
)

const Rows = ({ rows }: { rows: ReadonlyArray<Row> }): JSX.Element => (
  <ul className="flex flex-col gap-3">
    {rows.map((row) => (
      <EpisodeRow key={`${row.feed}/${row.week}`} row={row} />
    ))}
  </ul>
)

const Section = ({
  heading,
  line,
  children,
}: {
  heading: string
  line: string
  children: ReactNode
}): JSX.Element => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-col">
      <h2 className="text-base font-semibold">{heading}</h2>
      <p className="text-muted-foreground text-xs">{line}</p>
    </div>
    {children}
  </section>
)

type Shared = {
  chip: Chip
  /** Whether the genre chips lead it (Episodes), or not (a feed's page). */
  chips: boolean
  /** The way to pairing, for a phone that isn't paired. */
  pair: JSX.Element
  /** What leads the feed under All (the videos being made). */
  top?: ReactNode
}

/**
 * What `feedView` says, drawn: the chip bar, a feed that couldn't be read,
 * then each week, then what nothing dates. Reads no store, so the phone's fit
 * page draws it from sample lists (`tests/ui-fit/phone-page/episodes.tsx`).
 */
export const EpisodesView = ({
  view,
  chip,
  chips,
  pair,
  top,
  thisMonday,
  onTryAgain,
}: Shared & {
  view: FeedView
  /** The Monday this week starts on. */
  thisMonday: string
  onTryAgain: (feed: Feed) => void
}): JSX.Element => {
  if (view.kind === "unpaired") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">{WORDS.unpaired}</p>
        {pair}
      </div>
    )
  }
  const { weeks, undated, trouble, reading, counts } = view
  const empty = weeks.length === 0 && undated.length === 0
  return (
    <div className="flex flex-col gap-4">
      {chips && <ChipBar chip={chip} counts={counts} />}
      {chip === "all" && top}
      {trouble.map((one) => (
        <TroubleCard
          key={one.feed}
          trouble={one}
          onTryAgain={() => onTryAgain(one.feed)}
        />
      ))}
      {empty && reading && (
        <p className="text-muted-foreground text-sm">{WORDS.reading}</p>
      )}
      {empty && !reading && trouble.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {chip === "all" ? WORDS.noneAtAll : WORDS.none(chip)}
        </p>
      )}
      {weeks.map(({ monday, rows }) => (
        <Section
          key={monday}
          heading={WORDS.week(monday, thisMonday)}
          line={WORDS.weekLine(monday, rows.length)}
        >
          <Rows rows={rows} />
        </Section>
      ))}
      {undated.length > 0 && (
        <Section heading={WORDS.undated} line={WORDS.undatedLine}>
          <Rows rows={undated} />
        </Section>
      )}
    </div>
  )
}

/**
 * Every feed's episodes by week, filtered to `chip`, as home holds them now:
 * read on mount, and again on a drag down while on screen.
 */
export const EpisodesByWeek = (props: Shared): JSX.Element | null => {
  const { chip, chips } = props
  const lists = useSyncExternalStore(everyFeed.subscribe, everyFeed.getSnapshot)
  // Episodes reads every feed, for its counts; a feed's own page, its own.
  const only = chips || chip === "all" ? null : chip
  useEffect(() => {
    const feeds = only === null ? FEEDS : [only]
    for (const feed of feeds) void feedVideos(feed).open()
    const offs = feeds.map((feed) =>
      screenRefreshers.register(videosRefresher(feed))
    )
    return (): void => {
      for (const off of offs) off()
    }
  }, [only])
  const thisMonday = weekOf(dayOf(useMinuteClock()))
  // An episode's page is the phone's ("apk"), as this list is (A3).
  if (!hasAudience("apk")) return null
  return (
    <EpisodesView
      {...props}
      view={feedView(lists, chip)}
      thisMonday={thisMonday}
      onTryAgain={(feed) => void feedVideos(feed).open()}
    />
  )
}
