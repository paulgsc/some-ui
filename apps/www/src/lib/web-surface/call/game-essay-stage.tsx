import type { JSX } from "react"
import { assertNever, pacificClock } from "@some-ui/core-utils"
import {
  gameEssayFormat,
  gameScenarioName,
  hasCaptions,
  markThemeOf,
  parseGameEssay,
  sampleGameEssay,
} from "@some-ui/video-render"
import type { GameEssay, GameEssayScene } from "@some-ui/video-render"

import { Call, CastProvider } from "./essay-parts"
import type { EssayStageProps } from "./essay-stage"
import { essayStageOf } from "./essay-view"
import { ESSAY_WORDS as EW } from "./essay-words"
import { gameEssaySource } from "./feed"
import {
  BrandSlide,
  ChapterSlide,
  Field,
  LockedIntro,
  sceneNames,
  StageFrame,
  StageRefused,
  Title,
  whereOf,
} from "./frame"
import { STAGE_WORDS as SW } from "./frame-words"
import type { GameEssayAt } from "./game-essay-view"
import { fieldOf, gameEssayAt } from "./game-essay-view"
import { GAME_ESSAY_WORDS as W } from "./game-essay-words"

/**
 * The Game Week essay's stage (`@some-ui/video-render`'s `game-essay.ts`):
 * one scene at a time in the stage's frame, the essays' template A
 * (`./essay-parts`). `/essay?kind=game` plays it: the essay of the week
 * `week` names, as home's render worker hands it over (`./feed`'s
 * `gameEssaySource`), or with no week, or `sample`, the template's sample.
 * A game is drawn only as the still of a bite's matched play (section 0):
 * the field, the down and distance, the score and the clock, from numbers
 * alone; the play's own text is never shown.
 */

export type GameEssayStageProps = Omit<EssayStageProps, "kind">

const NAMES = sceneNames(gameEssayFormat())

const SAMPLE = sampleGameEssay()

type Game = GameEssay["games"][number]
type Bite = Game["halves"][number]["bites"][number]

const labelOf = (essay: GameEssay, scene: GameEssayScene): string => {
  switch (scene.section) {
    case "intro": {
      return SW.whoMadeThis
    }
    case "brand-in": {
      return SW.brandIn
    }
    case "brand-out": {
      return SW.brandOut
    }
    case "chapter": {
      return EW.chapter(scene.title)
    }
    case "open":
    case "close": {
      return NAMES[scene.section] ?? ""
    }
    case "game":
    case "halftime":
    case "setup":
    case "bite":
    case "happened":
    case "answer": {
      const game = essay.games.find((g) => g.id === scene.game)
      return `${game === undefined ? "" : W.game(game.away, game.home)} · ${NAMES[scene.section] ?? ""}`
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** A bite's scenario as the catalog names it, or "Said first". */
const scenarioName = (bite: Bite): string =>
  gameScenarioName(bite.scenario) ?? W.saidFirst

/** The score and the clock at a still's snap, the visitors first. */
const ScoreBug = ({
  game,
  still,
}: {
  game: Game
  still: NonNullable<Bite["play"]>["still"]
}): JSX.Element => (
  <p className="text-[0.9em] font-semibold tabular-nums">
    {game.away} {still.score.away} · {game.home} {still.score.home}
    <span className="text-muted-foreground">
      {" "}
      · {W.quarter(still.period)} {still.clock}
    </span>
  </p>
)

/**
 * The field at a still's snap (D13), the offense going left to right: the
 * line of scrimmage, and the line to gain where there is one. Drawn from
 * the still's numbers alone.
 */
const FieldStill = ({
  still,
}: {
  still: NonNullable<Bite["play"]>["still"]
}): JSX.Element | null => {
  const at = fieldOf(still)
  if (at === null) return null
  const x = (yards: number): number => 10 + yards
  return (
    <svg
      data-field="true"
      viewBox="0 0 120 30"
      className="text-muted-foreground w-full"
      role="img"
      aria-label={W.ball(at.team, W.at(at.side, at.yard))}
    >
      <rect
        x="0"
        y="2"
        width="120"
        height="26"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
      />
      {Array.from({ length: 11 }, (_, i) => (
        <line
          key={i}
          x1={x(i * 10)}
          x2={x(i * 10)}
          y1="2"
          y2="28"
          stroke="currentColor"
          strokeWidth={i === 0 || i === 10 ? "0.75" : "0.25"}
        />
      ))}
      <line
        x1={x(at.ball)}
        x2={x(at.ball)}
        y1="2"
        y2="28"
        className="text-primary"
        stroke="currentColor"
        strokeWidth="1"
      />
      {at.gain !== null && (
        <line
          x1={x(at.gain)}
          x2={x(at.gain)}
          y1="2"
          y2="28"
          className="text-foreground"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="1.5 1"
        />
      )}
    </svg>
  )
}

/** A bite's one still (section 0, D12): its play's moment, or none. */
const Still = ({ game, bite }: { game: Game; bite: Bite }): JSX.Element => {
  if (bite.play === null)
    return (
      <p className="text-muted-foreground text-[0.8em]">
        {W.saidAt(pacificClock(bite.saidAt))} · {W.noPlay}
      </p>
    )
  const { still } = bite.play
  return (
    <div className="space-y-[0.4em]">
      <ScoreBug game={game} still={still} />
      {still.down !== undefined && still.distance !== undefined && (
        <p className="text-[0.85em]">
          {W.downs(still.down, still.distance, fieldOf(still)?.gain === 100)}
          {still.spot !== undefined &&
            ` · ${W.at(still.spot.side, still.spot.yard)}`}
        </p>
      )}
      <FieldStill still={still} />
    </div>
  )
}

/** One scene's picture, as the frame draws it: exported for its tests. */
export const Screen = ({
  essay,
  at,
}: {
  essay: GameEssay
  at: GameEssayAt
}): JSX.Element => {
  const view = at.view
  switch (view.section) {
    case "intro": {
      return (
        <LockedIntro
          heading={`${W.title} · ${essay.week.id} · ${essay.week.from} – ${essay.week.to}`}
          rows={view.rows}
        />
      )
    }
    case "brand-in":
    case "brand-out": {
      return (
        <BrandSlide
          theme={markThemeOf(gameEssayFormat(essay.template.version).shape)}
          line={view.section === "brand-in" ? W.title : SW.source}
        />
      )
    }
    case "chapter": {
      return <ChapterSlide title={view.title} holds={undefined} />
    }
    case "open":
    case "close": {
      return (
        <Call speaker={at.speaker} tag={EW.week(essay.week.id)}>
          <Title>{NAMES[view.section] ?? ""}</Title>
          <p className="text-[0.9em] leading-snug">{at.scene.said}</p>
        </Call>
      )
    }
    case "game": {
      const { game } = view
      return (
        <Call speaker={at.speaker} tag={NAMES.game}>
          <Title>{W.game(game.away, game.home)}</Title>
          <p className="text-[0.9em] leading-snug">{game.game.said}</p>
        </Call>
      )
    }
    case "halftime": {
      return (
        <Call speaker={at.speaker} tag={NAMES.halftime}>
          <Title>{W.game(view.game.away, view.game.home)}</Title>
          <p className="text-[0.9em] leading-snug">{at.scene.said}</p>
        </Call>
      )
    }
    case "setup":
    case "happened":
    case "answer": {
      const { game, bite } = view
      return (
        <Call
          speaker={at.speaker}
          tag={`${scenarioName(bite)} · ${W.stance[bite.stance]}`}
        >
          {view.section === "answer" ? (
            <Field label={NAMES.answer}>
              <p className="text-[0.9em] leading-snug">{at.scene.said}</p>
            </Field>
          ) : (
            <Still game={game} bite={bite} />
          )}
        </Call>
      )
    }
    case "bite": {
      const { game, bite } = view
      return (
        <Call
          speaker={at.speaker}
          tag={bite.voice === "owner" ? W.yourVoice : W.readAloud}
        >
          <Title>{scenarioName(bite)}</Title>
          <p className="text-[0.95em] leading-snug">{bite.transcript}</p>
          <Still game={game} bite={bite} />
        </Call>
      )
    }
    default: {
      return assertNever(view)
    }
  }
}

export const GameEssayStagePage = ({
  week,
  scene,
  record = false,
  onScene,
}: GameEssayStageProps): JSX.Element | null => {
  const named = week !== undefined && week !== "sample"
  const read = gameEssaySource.useResource(
    ["game-essay", week],
    week ?? "",
    undefined,
    { enabled: named, retry: false }
  )
  const state = essayStageOf({
    week,
    read: { data: read.data, pending: read.isPending, failed: read.isError },
    sample: SAMPLE,
    parse: parseGameEssay,
  })
  if (state.kind === "waiting") return null
  if (state.kind === "none")
    return (
      <StageRefused
        reason={state.problems.join("\n")}
        problems={state.problems}
      />
    )
  const { essay, voicing } = state
  const at = gameEssayAt(essay, scene, voicing)
  const format = gameEssayFormat(essay.template.version)
  const where = whereOf(at, () => labelOf(essay, at.scene))
  return (
    <StageFrame
      record={record}
      scene={at.scene.id}
      measureKey={`game/${essay.week.id}/${at.scene.id}`}
      data={{ "data-essay": record ? JSON.stringify(essay) : undefined }}
      theme={format.shape?.theme}
      title={W.title}
      where={voicing === "sample" ? `${where} · ${EW.sample}` : where}
      captioned={record && hasCaptions(format)}
      said={at.scene.said}
      nav={
        onScene === undefined
          ? undefined
          : {
              scenes: at.scenes.map((s) => ({
                id: s.id,
                label: labelOf(essay, s),
              })),
              onScene,
            }
      }
    >
      <CastProvider cast={format.shape?.cast}>
        <Screen essay={essay} at={at} />
      </CastProvider>
    </StageFrame>
  )
}
