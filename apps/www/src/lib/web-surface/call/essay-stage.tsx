import type { JSX } from "react"
import { assertNever } from "@some-ui/core-utils"
import {
  ESSAY_POINT_COLUMN,
  essayFormat,
  FORK_PLACEMENTS,
  hasCaptions,
  hasPointAnswers,
  LEITNER,
  markOf,
  markThemeOf,
  parseEssay,
  pickedOf,
  pointAnsweredBy,
  pointCite,
  questionCodeEm,
  sampleEssay,
  silenceSaid,
  SOLO_LEVELS,
  SOLO_SOURCE,
} from "@some-ui/video-render"
import type {
  CellView,
  Essay,
  EssayFork,
  EssayPointAnswer,
  EssayScene,
  EssayTicket,
  Voicing,
} from "@some-ui/video-render"

import { Call, CastProvider, Inline, MARK_CLASS } from "./essay-parts"
import type { EssayAt, EssayView } from "./essay-view"
import { essayAt, essayStageOf } from "./essay-view"
import { leftOf, ESSAY_WORDS as W, weekNumber } from "./essay-words"
import { essaySource } from "./feed"
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
import { InterviewEssayStagePage } from "./interview-essay-stage"
import { SpokenCardStagePage } from "./spoken-card-stage"

/**
 * The Rust Rounds essay's stage (`@some-ui/video-render`'s `essay.ts`, RR15):
 * one scene of an essay at a time, in the stage's frame (`./frame`),
 * which refuses a scene it can't hold, as the call's does. It draws template
 * A: two bubbles, the tutor and the owner, the one speaking lit, the scene's
 * content beside them, and the caption underneath.
 *
 * It plays the essay of the week `week` names, as home's render worker hands
 * it over (`./feed`'s `essaySource`, RR16), or with no week, or `sample`,
 * the template's sample essay, voiced as a sample.
 */

export type EssayStageProps = {
  /**
   * Which essay: `interview` for the interview essay's (IW6), `spoken` for a
   * cards essay's spoken card (WALK7), the Rust Rounds essay's otherwise.
   */
  kind?: string
  /** The essay shown, by its week's id ("2026-w46"), or "sample". */
  week?: string
  /** The scene shown, by its id; the first when absent or unknown. */
  scene?: string
  record?: boolean
  onScene?: (scene: string) => void
}

const NAMES = sceneNames(essayFormat())

const SAMPLE = sampleEssay()

/** What a scene is called: its section's name, and which ticket's it is. */
const labelOf = (scene: EssayScene, essay: Essay): string => {
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
      return W.chapter(scene.title)
    }
    case "ask":
    case "opening":
    case "open":
    case "weeks":
    case "next": {
      return NAMES[scene.section] ?? ""
    }
    case "question":
    case "answer":
    case "best":
    case "beside":
    case "fork":
    case "dive": {
      const ticket = essay.tickets.find((t) => t.id === scene.ticket)
      const answer =
        ticket === undefined ? undefined : answerAt(ticket, scene.point)
      const name =
        scene.section === "answer" && answer?.kind === "silence"
          ? leftOf(answer)
          : scene.section === "dive"
            ? W.dive((scene.dive ?? 0) + 1)
            : (NAMES[scene.section] ?? "")
      return `${scene.ticket ?? ""}${pointTag(scene.point)} · ${name}`
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** What an answer scene plays: the ticket's answer, or point `point`'s (from 0, RR24). */
const answerAt = (
  ticket: EssayTicket,
  point: number | undefined
): EssayTicket["answer"] | EssayPointAnswer =>
  point === undefined ? ticket.answer : pointAnsweredBy(ticket, point).answer

/** A point answer scene's place in its tag: " · Point 2". */
const pointTag = (point: number | undefined): string =>
  point === undefined ? "" : ` · ${W.pointN(point + 1)}`

/** A cell of the fork's table: whether a decision meets or breaks one stated constraint. */
const TradeCell = ({
  trade,
  id,
}: {
  trade: { meets: ReadonlyArray<string>; breaks: ReadonlyArray<string> }
  id: string
}): JSX.Element =>
  trade.meets.includes(id) ? (
    <td className="text-primary py-[0.12em] text-center" title={W.fork.meets}>
      ✓
    </td>
  ) : trade.breaks.includes(id) ? (
    <td
      className="text-destructive py-[0.12em] text-center"
      title={W.fork.breaks}
    >
      ✗
    </td>
  ) : (
    <td className="py-[0.12em]" />
  )

/**
 * The fork (RR29, C697): every option an agent listed, and the best one if
 * it wasn't listed, against each stated constraint by id; the owner's
 * decision, and its place between A and A′ once it is on record.
 */
const ForkPanel = ({
  fork,
  stated,
}: {
  fork: EssayFork
  stated: ReadonlyArray<{ id: string; says: string }>
}): JSX.Element => {
  const judged = fork.judged
  const picked = pickedOf(fork)?.id
  const recommended = fork.options.find((option) => option.recommended)?.id
  const rows = [
    ...fork.options.map((option) => ({
      ...option,
      label: option.id,
      tags: [
        ...(option.recommended ? [W.fork.recommended] : []),
        ...(fork.best.kind === "option" && fork.best.option === option.id
          ? [W.fork.best]
          : []),
        ...(picked === option.id ? [W.fork.yours] : []),
      ],
    })),
    ...(fork.best.kind === "hidden"
      ? [
          {
            ...fork.best,
            label: "★",
            tags: [W.fork.hidden, W.fork.best],
          },
        ]
      : []),
  ]
  return (
    <div className="space-y-[0.35em]">
      {judged !== undefined && (
        <p className="text-[0.7em]">
          {W.fork.summary(
            judged.decision,
            recommended ?? "",
            fork.best.kind === "hidden" ? null : fork.best.option
          )}
        </p>
      )}
      <table className="w-full text-left text-[0.7em]">
        <thead className="text-muted-foreground">
          <tr>
            <th className="w-[4em] font-normal">{W.fork.option}</th>
            <th className="font-normal">{W.fork.decision}</th>
            {stated.map((row) => (
              <th
                key={row.id}
                title={row.says}
                className="w-[3em] text-center font-normal"
              >
                {row.id}
              </th>
            ))}
            <th className="w-[30%] pl-[1em] font-normal">{W.fork.why}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-border border-t">
              <td className="py-[0.12em] align-top font-semibold">
                {row.label}
              </td>
              <td className="py-[0.12em] pr-[1em] align-top">
                <Inline text={row.decision} />
                {row.tags.length > 0 && (
                  <span className="text-muted-foreground text-[0.85em]">
                    {` · ${row.tags.join(" · ")}`}
                  </span>
                )}
              </td>
              {stated.map((col) => (
                <TradeCell key={col.id} trade={row} id={col.id} />
              ))}
              <td
                className={`py-[0.12em] pl-[1em] align-top text-[0.85em] ${row.refused === undefined ? "text-muted-foreground" : "text-destructive"}`}
              >
                {row.refused === undefined ? (
                  <Inline text={row.because ?? ""} />
                ) : (
                  W.fork.refused(row.refused.code, row.refused.why)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-muted-foreground text-[0.55em]">
        {stated.map((row) => `${row.id}: ${row.says}`).join(" · ")}
      </p>
      {fork.best.kind === "hidden" && (
        <p className="text-[0.65em]">
          <span className="font-semibold">{W.fork.astute}</span>{" "}
          <Inline text={fork.best.why} />
        </p>
      )}
      {judged !== undefined && (
        <Field label={W.fork.axis}>
          {judged.decision.kind === "own" && (
            <p className="text-[0.7em]">
              <Inline text={W.fork.own(judged.decision.decision)} />
            </p>
          )}
          <ol className="flex gap-[0.4em] text-[0.55em] whitespace-nowrap">
            {FORK_PLACEMENTS.map((place) => (
              <li
                key={place}
                aria-current={place === judged.placement ? "true" : undefined}
                className={
                  place === judged.placement
                    ? "bg-primary text-primary-foreground min-w-0 flex-1 rounded-[0.3em] px-[0.5em] py-[0.2em] font-semibold"
                    : "border-border text-muted-foreground min-w-0 flex-1 rounded-[0.3em] border px-[0.5em] py-[0.2em]"
                }
              >
                {W.fork.place[place]}
              </li>
            ))}
          </ol>
          <p className="mt-[0.3em] text-[0.7em]">
            <span className="font-semibold">
              {W.fork.verdict[judged.verdict.kind]}
            </span>
            {": "}
            <Inline text={judged.verdict.why} />
          </p>
        </Field>
      )}
    </div>
  )
}

const Code = ({ code, em }: { code: string; em?: number }): JSX.Element => (
  <pre
    className="bg-background border-border overflow-hidden rounded-[0.4em] border px-[0.8em] py-[0.5em] font-mono text-[0.62em] leading-snug [overflow-wrap:normal] whitespace-pre"
    style={em === undefined ? undefined : { fontSize: `${String(em)}em` }}
  >
    {code.trimEnd()}
  </pre>
)

/** The whole SOLO scale, the answer's level marked when there is one. */
const Solo = ({ level }: { level: number | undefined }): JSX.Element => (
  <Field label={W.solo}>
    <ol className="flex gap-[0.4em] text-[0.7em]">
      {SOLO_LEVELS.map((name, i) => (
        <li
          key={name}
          data-level={i + 1}
          aria-current={i + 1 === level ? "true" : undefined}
          className={
            i + 1 === level
              ? "bg-primary text-primary-foreground min-w-0 flex-1 rounded-[0.3em] px-[0.5em] py-[0.3em] font-semibold"
              : "border-border text-muted-foreground min-w-0 flex-1 rounded-[0.3em] border px-[0.5em] py-[0.3em]"
          }
        >
          {W.level(i + 1, name)}
        </li>
      ))}
    </ol>
    <p className="text-muted-foreground mt-[0.3em] text-[0.6em]">
      {SOLO_SOURCE}
    </p>
  </Field>
)

const LEVEL_CLASS: ReadonlyArray<string> = [
  "",
  "bg-primary/20",
  "bg-primary/40",
  "bg-primary/60",
  "bg-primary/80",
  "bg-primary",
]

const Cell = ({ cell }: { cell: CellView }): JSX.Element => {
  switch (cell.kind) {
    case "unmet": {
      return (
        <td
          title={cell.since ? W.cell.unchecked : W.cell.unmet}
          className="border-border border border-dashed"
        />
      )
    }
    case "silent": {
      return (
        <td
          title={W.cell.silent}
          className="border-border text-muted-foreground border text-center"
        >
          ○
        </td>
      )
    }
    case "faded": {
      return (
        <td
          title={W.cell.faded}
          className="border-border text-muted-foreground border border-dotted text-center"
        >
          ~
        </td>
      )
    }
    case "level": {
      const notes = [
        ...(cell.known ? [] : [W.cell.notKnown]),
        ...(cell.decayed === null ? [] : [W.cell.decayed]),
      ]
      return (
        <td
          title={[SOLO_LEVELS[cell.level - 1] ?? "", ...notes].join(": ")}
          className={`border-border border text-center font-bold ${cell.level >= 3 ? "text-primary-foreground" : "text-foreground"} ${LEVEL_CLASS[cell.level] ?? ""}`}
        >
          {/* A recording has no tooltips: the level is drawn. */}
          {cell.level}
          {cell.decayed === null ? "" : " ↓"}
        </td>
      )
    }
    default: {
      return assertNever(cell)
    }
  }
}

const QuestionPanel = ({ ticket }: { ticket: EssayTicket }): JSX.Element => (
  <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-[1em]">
    <div className="space-y-[0.5em]">
      <p className="text-[1.15em] leading-tight font-bold">{ticket.title}</p>
      <p className="text-[0.8em]">
        <Inline text={ticket.spec} />
      </p>
      {ticket.figures.length > 0 && (
        <Field label={W.figures}>
          <ul className="text-[0.75em]">
            {ticket.figures.map((figure) => (
              <li key={figure}>{figure}</li>
            ))}
          </ul>
        </Field>
      )}
      <Field label={W.speakTo}>
        <ol className="list-decimal space-y-[0.2em] pl-[1.2em] text-[0.8em]">
          {ticket.points.map((point) => (
            <li key={point.to}>
              <Inline text={point.to} />
            </li>
          ))}
        </ol>
      </Field>
    </div>
    <Code code={ticket.program} em={questionCodeEm(ticket.program)} />
  </div>
)

const Screen = ({
  essay,
  at,
}: {
  essay: Essay
  at: EssayAt & { view: EssayView }
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
          theme={markThemeOf(essayFormat(essay.template.version).shape)}
          line={view.section === "brand-in" ? W.title : SW.source}
        />
      )
    }
    case "chapter": {
      return (
        <ChapterSlide
          title={view.title}
          holds={
            view.ticket === undefined
              ? undefined
              : W.ticketOf(view.ticket.n, view.ticket.of)
          }
        />
      )
    }
    case "ask": {
      return (
        <Call speaker={at.speaker} tag={W.question(view.n)} other="asker">
          <p className="text-muted-foreground text-[0.8em]">{W.theyAsk}</p>
          <Title>{view.ask}</Title>
        </Call>
      )
    }
    case "opening": {
      return (
        <Call speaker={at.speaker} tag={W.question(view.n)} other="asker">
          <p className="text-muted-foreground text-[0.8em]">{view.ask}</p>
          <p className="text-[0.8em] font-semibold">{W.yourAnswer}</p>
          <p className="text-[1em] leading-snug">{view.transcript}</p>
        </Call>
      )
    }
    case "open": {
      return (
        <Call speaker={at.speaker} tag={W.week(essay.week.id)}>
          <Title>{essay.company.name}</Title>
          <p className="text-[0.8em]">{essay.company.about}</p>
          <Field label={W.story}>
            <p className="text-[0.85em]">{essay.story}</p>
          </Field>
          <Field label={W.sla}>
            <ul className="space-y-[0.2em] text-[0.85em]">
              {essay.sla.map((row) => (
                <li key={row.what}>
                  {row.what}:{" "}
                  <span className="font-semibold">{row.target}</span>
                </li>
              ))}
            </ul>
          </Field>
        </Call>
      )
    }
    case "question": {
      return (
        <Call
          speaker={at.speaker}
          tag={`${view.ticket.id} · ${NAMES.question}`}
        >
          <QuestionPanel ticket={view.ticket} />
        </Call>
      )
    }
    case "answer": {
      const point =
        view.point === undefined ? undefined : view.ticket.points[view.point]
      const answer = answerAt(view.ticket, view.point)
      return (
        <Call
          speaker={at.speaker}
          tag={`${view.ticket.id}${pointTag(view.point)} · ${answer.kind === "take" ? NAMES.answer : leftOf(answer)}`}
        >
          {point !== undefined && (
            <p className="text-muted-foreground text-[0.75em]">
              <Inline text={point.to} />
            </p>
          )}
          {answer.kind === "take" ? (
            <>
              <Title>{W.youSaid}</Title>
              <p className="text-[1em] leading-snug">{answer.transcript}</p>
            </>
          ) : (
            <>
              <Title>{leftOf(answer)}</Title>
              {answer.unheard === true ? null : (
                <p className="text-muted-foreground text-[0.8em]">
                  {W.opened(answer.opened)}
                </p>
              )}
              <p className="text-[1em] leading-snug">{silenceSaid(answer)}</p>
            </>
          )}
        </Call>
      )
    }
    case "best": {
      return (
        <Call speaker={at.speaker} tag={`${view.ticket.id} · ${NAMES.best}`}>
          <ol className="list-decimal space-y-[0.5em] pl-[1.2em] text-[0.85em]">
            {view.ticket.points.map((point) => (
              <li key={point.to}>
                <span className="font-semibold">
                  <Inline text={point.to} />.
                </span>{" "}
                <Inline text={point.best} />
              </li>
            ))}
          </ol>
        </Call>
      )
    }
    case "beside": {
      const answer = view.ticket.answer
      const byPoint = hasPointAnswers(view.ticket)
      return (
        <Call speaker={at.speaker} tag={`${view.ticket.id} · ${NAMES.beside}`}>
          <table className="w-full table-fixed text-left text-[0.8em]">
            <colgroup>
              <col style={{ width: `${String(100 * ESSAY_POINT_COLUMN)}%` }} />
              <col />
            </colgroup>
            <thead className="text-muted-foreground text-[0.85em]">
              <tr>
                <th className="pr-[1em] font-normal">{W.point}</th>
                <th className="font-normal">{W.yours}</th>
              </tr>
            </thead>
            <tbody>
              {view.ticket.points.map((point, i) => {
                const mark = markOf(view.ticket, i)
                const answered = pointAnsweredBy(view.ticket, i)
                const cite = pointCite(view.ticket, i)
                return (
                  <tr key={point.to} className="border-border border-t">
                    <td className="py-[0.3em] pr-[1em] align-top">
                      <Inline text={point.to} />
                    </td>
                    <td className="py-[0.3em] align-top">
                      {mark === undefined ? (
                        <span className="text-muted-foreground">
                          {answered.by === "own" &&
                          answered.answer.kind === "silence"
                            ? leftOf(answered.answer, W.unanswered)
                            : W.unanswered}
                        </span>
                      ) : (
                        <span className={MARK_CLASS[mark.mark]}>
                          {W.mark[mark.mark]}
                        </span>
                      )}
                      {cite !== null && (
                        <span data-cite className="text-muted-foreground">
                          {` · ${cite}`}
                        </span>
                      )}
                      {mark?.note !== undefined && (
                        <span className="text-muted-foreground block text-[0.9em]">
                          <Inline text={mark.note} />
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Solo
            level={answer.kind === "take" ? answer.solo.level : undefined}
          />
          <p className="text-[0.8em]">
            {answer.kind === "take" ? (
              <Inline text={answer.solo.why} />
            ) : byPoint ? (
              W.perPoint
            ) : (
              W.notJudged
            )}
          </p>
        </Call>
      )
    }
    case "fork": {
      return (
        <Call
          speaker={at.speaker}
          tag={`${view.ticket.id}${pointTag(view.point)} · ${NAMES.fork}`}
        >
          <p className="text-[0.85em] font-semibold">
            <Inline text={view.ticket.points[view.point]?.to ?? ""} />
          </p>
          <ForkPanel fork={view.fork} stated={view.ticket.stated ?? []} />
        </Call>
      )
    }
    case "dive": {
      const point = view.ticket.points.at(view.dive.point)
      return (
        <Call
          speaker={at.speaker}
          tag={`${view.ticket.id} · ${W.dive(view.n)}${view.past ? ` · ${W.past}` : ""}`}
        >
          <Title>
            <Inline text={view.dive.title} />
          </Title>
          {point !== undefined && (
            <p className="text-muted-foreground text-[0.75em]">
              {W.into}: <Inline text={point.to} />
            </p>
          )}
          <ul className="list-disc space-y-[0.3em] pl-[1.2em] text-[0.85em]">
            {view.dive.shows.map((line) => (
              <li key={line}>
                <Inline text={line} />
              </li>
            ))}
          </ul>
          {view.dive.code !== undefined && <Code code={view.dive.code} />}
        </Call>
      )
    }
    case "weeks": {
      const { weeks, role } = essay.weeks
      return (
        <Call speaker={at.speaker} tag={NAMES.weeks}>
          <table className="w-full table-fixed text-[0.65em]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-[34%]" />
                {weeks.map((week) => (
                  <th key={week} className="font-normal">
                    w{weekNumber(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <tr key={row.name} className="h-[1.6em]">
                  <th className="pr-[0.6em] text-left font-normal">
                    {row.name}
                  </th>
                  {row.cells.map((cell, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Cell key={i} cell={cell} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground flex flex-wrap gap-x-[1em] text-[0.55em]">
            <span>{W.legendLevel}</span>
            <span>1–3: {W.cell.notKnown}</span>
            <span>↓ {W.cell.decayed}</span>
            {view.recheck && <span>~ {W.cell.faded}</span>}
            <span>○ {W.cell.silent}</span>
            <span>┆ {W.cell.unmet}</span>
          </p>
          <div className="grid grid-cols-[3fr_2fr] gap-[1.5em]">
            <div className="space-y-[0.4em]">
              {view.notes.length > 0 && (
                <ul className="text-[0.6em]">
                  {view.notes.map((note) => (
                    <li key={`${note.kind}-${note.name}`}>
                      {note.kind === "decayed"
                        ? W.noteDecayed(note.name, note.week, note.below)
                        : W.noteFaded(note.name, note.since)}
                    </li>
                  ))}
                </ul>
              )}
              {view.recheck && (
                <p className="text-muted-foreground text-[0.55em]">
                  {W.recheckSource(
                    LEITNER.name,
                    LEITNER.source,
                    LEITNER.weeks.join(", ")
                  )}
                </p>
              )}
            </div>
            <Field label={W.role}>
              <p className="text-[0.8em] font-semibold">{role.fits}</p>
              <p className="text-[0.65em]">{W.roleNext(role.next, role.gap)}</p>
              <p className="text-muted-foreground text-[0.6em]">
                {W.roleSource(role.ladder, role.source)}
              </p>
            </Field>
          </div>
        </Call>
      )
    }
    case "next": {
      return (
        <Call speaker={at.speaker} tag={NAMES.next}>
          <Title>{W.week(essay.next.week)}</Title>
          {essay.next.topics.length > 0 && (
            <Field label={W.comesBackTo}>
              <ul className="list-disc pl-[1.2em] text-[0.9em]">
                {essay.next.topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            </Field>
          )}
        </Call>
      )
    }
    default: {
      return assertNever(view)
    }
  }
}

const RustEssayStage = ({
  week,
  scene,
  record = false,
  onScene,
}: EssayStageProps): JSX.Element | null => {
  const named = week !== undefined && week !== "sample"
  const read = essaySource.useResource(["essay", week], week ?? "", undefined, {
    enabled: named,
    retry: false,
  })
  const state = essayStageOf({
    week,
    read: {
      data: read.data,
      pending: read.isPending,
      failed: read.isError,
    },
    sample: SAMPLE,
    parse: parseEssay,
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
  return (
    <EssaySceneFrame
      essay={essay}
      scene={scene}
      voicing={voicing}
      record={record}
      onScene={onScene}
    />
  )
}

export type EssaySceneFrameProps = {
  essay: Essay
  /** The scene's id; the essay's first scene when it has none by that id. */
  scene?: string | undefined
  voicing?: Voicing
  record: boolean
  onScene?: ((scene: string) => void) | undefined
}

/** One scene of `essay` in the stage's frame. */
export const EssaySceneFrame = ({
  essay,
  scene,
  voicing = "owner",
  record,
  onScene,
}: EssaySceneFrameProps): JSX.Element => {
  const at = essayAt(essay, scene, voicing)
  const format = essayFormat(essay.template.version)
  return (
    <StageFrame
      record={record}
      scene={at.scene.id}
      measureKey={`${essay.week.id}/${at.scene.id}`}
      data={{ "data-essay": record ? JSON.stringify(essay) : undefined }}
      theme={format.shape?.theme}
      title={W.title}
      where={
        voicing === "sample"
          ? `${whereOf(at, () => labelOf(at.scene, essay))} · ${W.sample}`
          : whereOf(at, () => labelOf(at.scene, essay))
      }
      captioned={record && hasCaptions(format)}
      said={at.scene.said}
      nav={
        onScene === undefined
          ? undefined
          : {
              scenes: at.scenes.map((s) => ({
                id: s.id,
                label: labelOf(s, essay),
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

/**
 * The stage of the essay `kind` names: the interview essay's, a cards
 * essay's spoken card (`spoken`, WALK7: `week` names the card), or the Rust
 * Rounds essay's.
 */
export const EssayStagePage = ({
  kind,
  ...props
}: EssayStageProps): JSX.Element | null =>
  kind === "interview" ? (
    <InterviewEssayStagePage {...props} />
  ) : kind === "spoken" ? (
    <SpokenCardStagePage
      card={props.week}
      scene={props.scene}
      record={props.record}
      onScene={props.onScene}
    />
  ) : (
    <RustEssayStage {...props} />
  )
