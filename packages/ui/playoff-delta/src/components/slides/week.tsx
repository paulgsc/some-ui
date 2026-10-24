import type { JSX } from "react"
import { PathGrid } from "@playoff-delta/components/path-grid"
import { SymbolGlyph } from "@playoff-delta/components/symbol"
import { HOW, weeklyVerdict, WHO } from "@playoff-delta/lib/slides"
import {
  blewIt,
  cellChanges,
  claimOf,
  floorRecord,
  isOpen,
  nameOf,
  SEEDS,
  sinceLabel,
  type StoryClaim,
  type StoryResult,
  type TemplateKey,
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
    </>
  )
}

export const Game = ({ season, week }: SlideProps): JSX.Element => {
  const g = week.game
  const s = symbolFor("game")
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
      <Reveal
        at={0.1}
        className={`pd-card ${g.won ? "pd-card--all" : "pd-card--zero"}`}
      >
        <div className="flex items-center gap-[2.5cqw]">
          <SymbolGlyph
            parts={g.won ? s.parts : GAME_LOST}
            hue={s.hue}
            delay={0.1}
            className="size-[10cqw]"
          />
          <b className="text-[4cqw]">Your game</b>
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
      <Reveal at={1.5} className="pd-say text-muted-foreground">
        {g.won
          ? g.relation === "division"
            ? "And a division rival takes the loss. Two swings in one game."
            : "A win moves every path one win closer."
          : g.relation === "division"
            ? "Worse: a division rival banks the win."
            : "A loss can't open a path. The league can only keep them open, or close them."}
      </Reveal>
      <span className="sr-only">{nameOf(season, season.team)}</span>
    </>
  )
}

function chipClass(r: StoryResult): string {
  if (r.yourWay === true) return "pd-chip--hit"
  if (r.yourWay === false) return "pd-chip--miss"
  return ""
}

const Chip = ({
  k,
  r,
  at,
  you,
}: {
  k: TemplateKey
  r: StoryResult
  at: number
  you: string
}): JSX.Element => {
  const verb = r.won ? "beat" : "lost to"
  const opponent = r.opponent === you ? "you" : r.opponent
  return (
    <span className={`pd-chip ${chipClass(r)}`} style={delay(at)}>
      <b>{r.team}</b>
      {k === "spoilers" ? <small className="uppercase">out</small> : null}
      {verb} {opponent}
      {blewIt(r) ? <span title="lost from ahead">↯ blew it</span> : null}
      {r.moved ? <span title="moved the paths">★</span> : null}
    </span>
  )
}

const TemplateCard = ({
  k,
  results,
  at,
  you,
}: {
  k: TemplateKey
  results: ReadonlyArray<StoryResult>
  at: number
  you: string
}): JSX.Element => {
  const s = symbolFor(k)
  const scored = results.filter((r) => r.yourWay !== null)
  const hits = scored.filter((r) => r.yourWay).length
  const tone = !results.length
    ? "pd-card--none"
    : scored.length && hits === scored.length
      ? "pd-card--all"
      : scored.length && hits === 0
        ? "pd-card--zero"
        : ""
  const count = !results.length
    ? "none this week"
    : k === "forced"
      ? `${counted(results.length, "game")}${scored.length ? ` · ${hits} of ${scored.length} that mattered ${s.verb}` : ""}`
      : `${hits} of ${scored.length} ${s.verb}`
  return (
    <Reveal at={at} className={`pd-card ${tone}`}>
      <div className="flex items-center gap-[2.5cqw]">
        <SymbolGlyph
          parts={s.parts}
          hue={s.hue}
          delay={at}
          className="size-[10cqw] shrink-0"
        />
        <b className="text-[4cqw]">{s.name}</b>
        <span className="pd-mono pd-small text-muted-foreground ml-auto text-right">
          {count}
        </span>
      </div>
      {results.length ? (
        <div className="flex flex-wrap gap-[1.5cqw]">
          {results.map((r, i) => (
            <Chip
              key={`${r.team}-${r.opponent}`}
              k={k}
              r={r}
              at={at + 0.3 + i * 0.12}
              you={you}
            />
          ))}
        </div>
      ) : null}
    </Reveal>
  )
}

const Family = ({
  keys,
  kicker,
  title,
  season,
  week,
}: SlideProps & {
  keys: ReadonlyArray<TemplateKey>
  kicker: string
  title: string
}): JSX.Element => {
  return (
    <>
      <Kicker>{kicker}</Kicker>
      <h2 className="pd-q">{title}</h2>
      <div className="flex flex-col gap-[3cqw]">
        {keys.map((k, i) => (
          <TemplateCard
            key={k}
            k={k}
            results={week.templates[k]}
            at={0.2 + i * 0.6}
            you={season.team}
          />
        ))}
      </div>
      <Reveal
        at={2.4}
        className="pd-small text-muted-foreground flex flex-wrap gap-x-[3cqw]"
      >
        <span className="text-success font-bold">● went your way</span>
        <span className="text-destructive font-bold">● didn&apos;t</span>
        <span>★ moved the paths</span>
      </Reveal>
    </>
  )
}

export const Who = (p: SlideProps): JSX.Element => (
  <Family {...p} keys={WHO} kicker="Who fell" title="The usual suspects." />
)
export const How = (p: SlideProps): JSX.Element => (
  <Family
    {...p}
    keys={HOW}
    kicker="How they fell"
    title="The rest of the league."
  />
)

export const After = ({ season, week }: SlideProps): JSX.Element => {
  const a = claimOf(week.paths.after, week.paths.winsAfter)
  const b = claimOf(week.paths.before, week.paths.winsBefore)
  const changes = cellChanges(week).flat()
  const pruned = changes.filter((c) => c === "pruned").length
  const opened = changes.filter((c) => c === "opened").length
  const open = changes.filter((c) => c === "open" || c === "opened").length
  const result = weeklyVerdict(season, week)
  return (
    <>
      <Kicker>After week {week.week}</Kicker>
      <div className="pd-verdict" data-tone={result.tone}>
        <h2 className="pd-q">{result.headline}</h2>
        <Reveal at={0.4} className="pd-survival">
          <b className="pd-mono">{open}</b>
          <span>
            open {open === 1 ? "path" : "paths"}
            <small>ways into the playoffs</small>
          </span>
        </Reveal>
        <span className="pd-say text-muted-foreground">
          {a.in
            ? a.extraWins === 0
              ? `Even with no more wins, a #${a.seed} seed is still possible.`
              : `${counted(a.extraWins, "more win")} could still get us in as high as #${a.seed}.`
            : "No remaining scenario gets us in."}
        </span>
      </div>
      <PathGrid paths={week.paths.after} week={week} />
      <Reveal at={1.2} className="pd-say text-muted-foreground flex gap-[3cqw]">
        {opened ? (
          <span className="text-success font-bold">{opened} opened</span>
        ) : null}
        {pruned ? (
          <span className="text-destructive font-bold">{pruned} pruned</span>
        ) : null}
        <span className="pd-small">Possible scenarios, not playoff odds.</span>
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
    </>
  )
}

export const Path = ({ season, week }: SlideProps): JSX.Element => {
  const p = week.path
  if (!p)
    return (
      <>
        <Kicker>The path</Kicker>
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
      <Kicker>The path</Kicker>
      <h2 className="pd-q">
        {nameOf(season, season.team)} {lead}, and still get in as #{p.seed}. If:
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
          </Reveal>
        ))}
      </div>
      <Reveal
        at={0.6 + p.needs.length * 0.35}
        className="pd-say text-muted-foreground"
      >
        the rest of the way. Everyone else, as bad as they could be.
      </Reveal>
    </>
  )
}
