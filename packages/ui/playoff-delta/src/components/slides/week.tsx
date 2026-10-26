import type { JSX } from "react"
import { PathGrid } from "@playoff-delta/components/path-grid"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { LAWS } from "@playoff-delta/lib/laws"
import { MODEL, REST_OF_LEAGUE } from "@playoff-delta/lib/slides"
import {
  blewIt,
  calls,
  cellChanges,
  claimOf,
  floorRecord,
  isOpen,
  leagueResults,
  nameOf,
  percent,
  points,
  SEEDS,
  shareVerdict,
  sinceLabel,
  type StoryBucket,
  type StoryClaim,
  type StoryResult,
  type StorySeason,
  type StoryWeek,
} from "@playoff-delta/lib/story"
import { GAME_LOST, symbolFor } from "@playoff-delta/lib/symbols"
import { counted } from "@some-ui/core-utils"

import { delay, Kicker, Reveal, type SlideProps } from "./shared"

function verdict(c: StoryClaim): { big: string; line: string } {
  if (!c.in) return { big: "Out.", line: "every path is closed" }
  if (c.extraWins === 0)
    return { big: "Still in.", line: `Still in, as high as #${c.seed}` }
  const wins = counted(c.extraWins, "more win")
  return { big: `${wins}.`, line: `${wins}, then as high as #${c.seed}` }
}

const Floor = ({
  at,
  children,
}: {
  at: number
  children: React.ReactNode
}): JSX.Element => {
  return (
    <Reveal
      at={at}
      className="border-border flex items-baseline justify-between border-t pt-[2.5cqw]"
    >
      {children}
    </Reveal>
  )
}

/** "61.5% of the ways in", with how the share was counted. */
const ShareLine = ({
  share,
  exact,
}: {
  share: number
  exact: boolean
}): JSX.Element => (
  <span className="pd-mono pd-small text-muted-foreground">
    {percent(share)} of the ways {exact ? "" : "sampled "}get in
  </span>
)

export const Before = ({ season, week }: SlideProps): JSX.Element => {
  const c = claimOf(week.paths.before, week.paths.winsBefore)
  const open = week.paths.before.flatMap((_, x) =>
    SEEDS.filter((seed) => isOpen(week.paths.before, x, seed))
  ).length
  return (
    <>
      <Kicker>{sinceLabel(week.week)}</Kicker>
      <div>
        <b className="pd-big block">{verdict(c).big}</b>
        <span className="pd-say text-muted-foreground">
          {c.in && c.extraWins > 0
            ? `then as high as #${c.seed}`
            : verdict(c).line}
        </span>
      </div>
      <PathGrid paths={week.paths.before} />
      <Floor at={0.9}>
        <span className="pd-mono pd-small text-muted-foreground">
          {counted(open, "open path")}
        </span>
        <b className="pd-mono text-[5.5cqw]">
          floor {floorRecord(c, season.seasonLength)}
        </b>
      </Floor>
      <Reveal at={1.3}>
        <ShareLine share={week.share.before} exact={week.share.exact} />
      </Reveal>
    </>
  )
}

export const Game = ({ season, week }: SlideProps): JSX.Element => {
  const g = week.game
  const s = symbolFor("game")
  if (g === null)
    return (
      <>
        <Kicker>Week {week.week}</Kicker>
        <h2 className="pd-q">A bye.</h2>
        <p className="pd-say text-muted-foreground">
          The {nameOf(season, season.team)} don&apos;t play. Only the league
          moves this week.
        </p>
      </>
    )
  const wins = week.paths.winsBefore
  const tag = {
    division: " · division rival",
    rival: " · rival",
    conference: " · conference",
    other: "",
  }[g.relation]
  return (
    <>
      <Kicker>Week {week.week}</Kicker>
      <Reveal at={0.1} className="pd-card">
        <div className="flex items-center gap-[2.5cqw]">
          <SymbolGlyph
            parts={g.won ? s.parts : GAME_LOST}
            hue={s.hue}
            delay={0.1}
            className="size-[10cqw]"
          />
          <b className="text-[4cqw]">Our game</b>
        </div>
        <div className="flex items-baseline gap-[3cqw]">
          <span className="pd-big">{season.team}</span>
          <span
            className={`pd-mono rounded-md px-[2cqw] text-[4cqw] font-extrabold ${g.won ? "bg-success/20 text-success" : "bg-destructive/15 text-destructive"}`}
          >
            {g.won ? "W" : "L"}
          </span>
          <span className="pd-say text-muted-foreground">
            vs {g.opponent}
            {tag}
          </span>
        </div>
      </Reveal>
      <Reveal at={0.8} className="pd-say">
        {g.won ? (
          <>
            The cap moves:{" "}
            <b>
              {wins} → {counted(wins + 1, "win")}
            </b>
          </>
        ) : (
          <>
            The cap stays at <b>{counted(wins, "win")}</b>
          </>
        )}
      </Reveal>
      <Reveal at={1.5} className="pd-say">
        That alone:{" "}
        <b
          className={week.share.own >= 0 ? "text-success" : "text-destructive"}
        >
          {points(week.share.own)} points
        </b>{" "}
        of the ways in.
      </Reveal>
    </>
  )
}

/** One result: who beat whom, its kind, and its leverage as a bar. */
const ResultRow = ({
  r,
  scale,
  at,
}: {
  r: StoryResult
  scale: number
  at: number
}): JSX.Element => {
  const width = scale > 0 ? (Math.abs(r.leverage) / scale) * 100 : 0
  return (
    <Reveal at={at} className="flex flex-col gap-[0.8cqw]">
      <div className="flex items-baseline justify-between gap-[2cqw]">
        <span className="pd-say">
          <b>{r.winner}</b> beat {r.loser}
          {blewIt(r) ? <span title="lost from ahead"> ↯</span> : null}
          {r.moved ? <span title="decided a path"> ★</span> : null}
        </span>
        <span className="pd-mono pd-small text-muted-foreground whitespace-nowrap">
          {r.kind === "exported" ? "other conference" : "inside"} ·{" "}
          <b
            className={
              r.leverage > 0
                ? "text-success"
                : r.leverage < 0
                  ? "text-destructive"
                  : ""
            }
          >
            {points(r.leverage)}
          </b>
        </span>
      </div>
      <div
        className={`pd-lev ${r.leverage >= 0 ? "pd-lev--up" : "pd-lev--down"}`}
      >
        <i style={{ ...delay(at + 0.2), width: `${width}%` }} />
      </div>
    </Reveal>
  )
}

/** Results the league slide shows: the biggest by leverage. */
const SHOWN = 6

export const League = ({ season, week }: SlideProps): JSX.Element => {
  const shown = leagueResults(week).slice(0, SHOWN)
  const scale = Math.max(...shown.map((r) => Math.abs(r.leverage)), 0)
  const settled = calls(season, week).filter((c) => c.result)
  return (
    <>
      <Kicker>The rest of the league</Kicker>
      <h2 className="pd-q">
        <span
          className={
            week.share.league >= 0 ? "text-success" : "text-destructive"
          }
        >
          {points(week.share.league)} points
        </span>{" "}
        from everyone else.
      </h2>
      <div className="flex flex-col gap-[2.2cqw]">
        {shown.map((r, i) => (
          <ResultRow
            key={`${r.winner}-${r.loser}`}
            r={r}
            scale={scale}
            at={0.4 + i * 0.25}
          />
        ))}
      </div>
      {settled.length ? (
        <Reveal at={2.2} className="pd-card">
          <span className="pd-mono pd-small text-muted-foreground">
            last week we rooted for
          </span>
          {settled.map((c) => (
            <span key={`${c.home}-${c.away}`} className="pd-say">
              {c.result?.winner === c.rootFor ? "✓" : "✗"} <b>{c.rootFor}</b>{" "}
              over {c.rootFor === c.home ? c.away : c.home}
              <span className="text-muted-foreground">
                {" "}
                · {c.result?.winner} won, {points(c.result?.leverage ?? 0)}
              </span>
            </span>
          ))}
        </Reveal>
      ) : null}
      <Reveal
        at={2.6}
        className="pd-small text-muted-foreground flex flex-wrap gap-x-[3cqw]"
      >
        <span>points: how much of the share of ways in each result moved</span>
        <span>★ decided a path</span>
      </Reveal>
    </>
  )
}

export const After = ({ season, week }: SlideProps): JSX.Element => {
  const a = claimOf(week.paths.after, week.paths.winsAfter)
  const b = claimOf(week.paths.before, week.paths.winsBefore)
  const changes = cellChanges(week).flat()
  const pruned = changes.filter((c) => c === "pruned").length
  const opened = changes.filter((c) => c === "opened").length
  const open = changes.filter((c) => c === "open" || c === "opened").length
  const { share } = week
  return (
    <>
      <Kicker>After week {week.week}</Kicker>
      <div>
        <b className="pd-big block">{shareVerdict(week)}</b>
        <span className="pd-say">
          {percent(share.before)} → <b>{percent(share.after)}</b> of the ways in
        </span>
      </div>
      <Reveal at={0.6} className="pd-mono pd-small flex gap-[3cqw]">
        <span>
          {week.game ? "our game" : "our bye"} {points(share.own)}
        </span>
        <span>the league {points(share.league)}</span>
      </Reveal>
      <PathGrid paths={week.paths.after} week={week} />
      <Reveal at={1.2} className="pd-say text-muted-foreground flex gap-[3cqw]">
        {opened ? (
          <span className="text-success font-bold">{opened} opened</span>
        ) : null}
        {pruned ? (
          <span className="text-destructive font-bold">{pruned} closed</span>
        ) : null}
        <span>{open} open</span>
      </Reveal>
      <Reveal at={1.3} className="pd-say text-muted-foreground">
        {verdict(a).line}
      </Reveal>
      <Floor at={1.5}>
        <span className="pd-mono pd-small text-muted-foreground">
          the floor
        </span>
        <b className="pd-mono text-[5.5cqw]">
          <s className="text-muted-foreground">
            {floorRecord(b, season.seasonLength)}
          </s>{" "}
          → {floorRecord(a, season.seasonLength)}
        </b>
      </Floor>
      <Reveal at={2} className="pd-small text-muted-foreground">
        {MODEL}
        {share.exact
          ? " Every way was counted."
          : ` ${season.ways.toLocaleString("en-US")} ways sampled.`}
      </Reveal>
    </>
  )
}

export const Path = ({ season, week }: SlideProps): JSX.Element => {
  const p = week.path
  if (!p)
    return (
      <>
        <Kicker>One way in</Kicker>
        <h2 className="pd-q">No path left.</h2>
        <p className="pd-say text-muted-foreground">
          From here, no way the season plays out gets the{" "}
          {nameOf(season, season.team)} in.
        </p>
      </>
    )
  const lead = p.extraWins === 0 ? "never win again" : `win ${p.extraWins} more`
  return (
    <>
      <Kicker>One way in</Kicker>
      <h2 className="pd-q">
        {nameOf(season, season.team)} {lead}, and still get in as #{p.seed}. One
        way:
      </h2>
      <div className="flex flex-col gap-[2cqw]">
        {p.needs.map((n, i) => (
          <Reveal
            key={n.team}
            at={0.5 + i * 0.35}
            className="grid grid-cols-[16cqw_minmax(0,1fr)_auto] items-center gap-[2.5cqw]"
          >
            <span className="text-[4.4cqw] font-extrabold">
              {n.team}
              {n.rival ? (
                <small className="text-muted-foreground ml-[1cqw] text-[2.6cqw] font-medium">
                  rival
                </small>
              ) : null}
            </span>
            {n.free ? (
              <span className="pd-say text-muted-foreground col-span-2">
                can finish above us: any record
              </span>
            ) : (
              <>
                <span className="flex flex-wrap gap-[0.7cqw]">
                  {Array.from({ length: n.rest.w }, (_, j) => (
                    <i
                      key={`w${j}`}
                      className="border-destructive size-[3cqw] rounded-[0.6cqw] border-2"
                    />
                  ))}
                  {Array.from({ length: n.rest.l }, (_, j) => (
                    <i
                      key={`l${j}`}
                      className="bg-success size-[3cqw] rounded-[0.6cqw]"
                    />
                  ))}
                </span>
                <span className="pd-mono text-[3.6cqw] font-bold">
                  {n.rest.w}–{n.rest.l}
                </span>
              </>
            )}
          </Reveal>
        ))}
      </div>
      <Reveal
        at={0.6 + p.needs.length * 0.35}
        className="pd-say text-muted-foreground"
      >
        the rest of the way, {REST_OF_LEAGUE}
      </Reveal>
    </>
  )
}

/**
 * The pigeonhole as buckets: each team's wins and its room under the line,
 * and above them the wins still to share out, as many as fit and the rest.
 */
const Buckets = ({
  teams,
  line,
  games,
}: {
  teams: ReadonlyArray<StoryBucket>
  line: number
  games: number
}): JSX.Element => {
  const top = Math.max(line, ...teams.map((t) => t.wins + t.room)) + 1
  const pct = (wins: number): string => `${(wins / top) * 100}%`
  const room = teams.reduce((sum, t) => sum + t.room, 0)
  return (
    <div className="flex flex-col gap-[1.5cqw]">
      <div
        className="flex flex-wrap gap-[1cqw]"
        aria-label={`${games} wins to share, room for ${room}`}
      >
        {Array.from({ length: games }, (_, i) => (
          <i
            key={i}
            className={`pd-in size-[3.4cqw] rounded-full ${i < room ? "bg-success" : "bg-destructive"}`}
            style={delay(0.3 + i * 0.06)}
          />
        ))}
      </div>
      <div className="pd-buckets">
        {teams.map((t, i) => (
          <div key={t.team} className="pd-bucket">
            <i style={{ ...delay(0.4 + i * 0.15), height: pct(t.wins) }} />
            <i
              className="pd-bucket__room"
              style={{ ...delay(0.9 + i * 0.15), height: pct(t.room) }}
            />
          </div>
        ))}
        <span className="pd-buckets__line" style={{ bottom: pct(line) }} />
      </div>
      <div className="flex gap-[2.4cqw]">
        {teams.map((t) => (
          <span
            key={t.team}
            className="pd-mono pd-small min-w-0 flex-1 text-center"
          >
            <b>{t.team}</b>
            <br />
            {t.wins} + {t.room}
          </span>
        ))}
      </div>
    </div>
  )
}

type WildCard = NonNullable<StoryWeek["boundary"]>["wildCard"]

/** Why no wild card is left at `wins`, from the search's own proof. */
function wildCardLine(season: StorySeason, wc: WildCard, wins: number): string {
  const others = (wc.pigeonhole?.teams ?? [])
    .map((t) => t.team)
    .filter((t) => t !== season.team)
  const among =
    others.length > 5 ? "across the conference" : `of ${others.join(", ")}`
  return [
    "A wild card:",
    wc.above.length ? `${wc.above.join(", ")} already past ${wins}.` : "",
    wc.pigeonhole
      ? `Besides the division winners, ${among}, at least ${counted(wc.mustPass, "more team")} must finish above us.`
      : "",
    wc.seedAtBest > 7
      ? "No wild card is left."
      : `The engine checked ${wc.cases.toLocaleString("en-US")} ways of choosing who else finishes above us; none fits.`,
  ]
    .filter(Boolean)
    .join(" ")
}

export const Boundary = ({ season, week }: SlideProps): JSX.Element => {
  const b = week.boundary
  if (!b) return <Kicker>Why one fewer win can&apos;t work</Kicker>
  const room =
    b.division.kind === "pigeonhole"
      ? b.division.teams.reduce((sum, t) => sum + t.room, 0)
      : 0
  return (
    <>
      <Kicker>Why {b.wins} wins can&apos;t work</Kicker>
      <h2 className="pd-q">{LAWS.pigeonhole.name}</h2>
      <Reveal at={0.2} className="pd-say">
        {LAWS.pigeonhole.rule}
      </Reveal>
      {b.division.kind === "above" ? (
        <Reveal at={0.5} className="pd-say">
          The division: the {nameOf(season, b.division.team)} are already past{" "}
          {counted(b.wins, "win")}.
        </Reveal>
      ) : (
        <>
          <Buckets
            teams={b.division.teams}
            line={b.wins}
            games={b.division.games}
          />
          <Reveal at={1.6} className="pd-say">
            The division: they still play{" "}
            <b>{counted(b.division.games, "game")}</b> among themselves, with
            room for <b>{counted(room, "win")}</b> under the line. Someone
            passes us.
          </Reveal>
        </>
      )}
      <Reveal at={2.2} className="pd-say text-muted-foreground">
        {wildCardLine(season, b.wildCard, b.wins)}
      </Reveal>
    </>
  )
}
