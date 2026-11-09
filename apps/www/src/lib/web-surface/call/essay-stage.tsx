import type { JSX, ReactNode } from "react"
import { assertNever } from "@some-ui/core-utils"
import {
  essayFormat,
  hasCaptions,
  markThemeOf,
  sampleEssay,
  SOLO_LEVELS,
  SOLO_SOURCE,
} from "@some-ui/video-render"
import type {
  CellView,
  Essay,
  EssayScene,
  EssayTicket,
  Speaker,
} from "@some-ui/video-render"

import type { EssayAt, EssayView } from "./essay-view"
import { essayAt } from "./essay-view"
import { ESSAY_WORDS as W, weekNumber } from "./essay-words"
import {
  BrandSlide,
  ChapterSlide,
  Field,
  LockedIntro,
  StageFrame,
  StageRefused,
} from "./frame"
import { STAGE_WORDS as SW } from "./frame-words"

/**
 * The Rust Rounds essay's stage (`@some-ui/video-render`'s `essay.ts`, RR15):
 * one scene of an essay at a time, in the stage's frame (`./frame`),
 * which refuses a scene it can't hold, as the call's does. It draws template
 * A: two bubbles, the tutor and the owner, the one speaking lit, the scene's
 * content beside them, and the caption underneath.
 *
 * It plays the template's sample essay (`essay.ts` says where an owner's
 * essay will come from).
 */

export type EssayStageProps = {
  /** The scene shown, by its id; the first when absent or unknown. */
  scene?: string
  record?: boolean
  onScene?: (scene: string) => void
}

const NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  essayFormat().scenes.map((scene) => [scene.id, scene.name])
)

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
    case "open":
    case "weeks":
    case "next": {
      return NAMES[scene.section] ?? ""
    }
    case "question":
    case "answer":
    case "best":
    case "beside":
    case "dive": {
      const ticket = essay.tickets.find((t) => t.id === scene.ticket)
      const name =
        scene.section === "answer" && ticket?.answer.kind === "silence"
          ? W.noAnswer
          : scene.section === "dive"
            ? W.dive((scene.dive ?? 0) + 1)
            : (NAMES[scene.section] ?? "")
      return `${scene.ticket ?? ""} · ${name}`
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** What the frame's header calls the scene. */
const whereOf = (at: EssayAt, essay: Essay): string => {
  const scene = at.scene
  const name =
    scene.section === "brand-in" || scene.section === "brand-out"
      ? ""
      : scene.section === "chapter"
        ? scene.title
        : labelOf(scene, essay)
  return [name, `${at.index + 1}/${at.scenes.length}`]
    .filter(Boolean)
    .join(" · ")
}

/** The tutor's icon: neutral, never any company's mark. */
const TutorIcon = (): JSX.Element => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="size-full">
    <rect width="48" height="48" className="fill-muted" />
    <path
      d="M24 9 37 16.5v15L24 39 11 31.5v-15Z"
      fill="none"
      strokeWidth="2.5"
      className="stroke-foreground"
    />
    <circle cx="24" cy="24" r="4.5" className="fill-foreground" />
  </svg>
)

/** The owner's icon. */
const YouIcon = (): JSX.Element => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="size-full">
    <rect width="48" height="48" className="fill-muted" />
    <circle cx="24" cy="19" r="7" className="fill-foreground" />
    <path d="M10 40c2-8 8-12 14-12s12 4 14 12" className="fill-foreground" />
  </svg>
)

const Bubble = ({ who, lit }: { who: Speaker; lit: boolean }): JSX.Element => (
  <div
    data-speaker={who}
    data-lit={lit ? "true" : undefined}
    className={
      lit
        ? "text-foreground flex flex-col items-center gap-[0.4em]"
        : "text-muted-foreground flex flex-col items-center gap-[0.4em] opacity-50"
    }
  >
    <div
      className={
        lit
          ? "ring-primary size-[7em] overflow-hidden rounded-full ring-[0.3em]"
          : "size-[7em] overflow-hidden rounded-full"
      }
    >
      {who === "tutor" ? <TutorIcon /> : <YouIcon />}
    </div>
    <p className="text-[0.9em] font-semibold">
      {who === "tutor" ? W.tutor : W.you}
    </p>
  </div>
)

/** Template A: the two bubbles, the one speaking lit, and the content beside them. */
const Call = ({
  speaker,
  tag,
  children,
}: {
  speaker: Speaker
  tag: string
  children: ReactNode
}): JSX.Element => (
  <div className="grid min-h-full grid-cols-[16%_1fr] gap-[1.2em]">
    <div className="flex flex-col items-center justify-center gap-[2em]">
      <Bubble who="tutor" lit={speaker === "tutor"} />
      <Bubble who="you" lit={speaker === "you"} />
    </div>
    <div className="border-border bg-background/60 space-y-[0.6em] rounded-[0.6em] border px-[1.4em] py-[1em]">
      <p className="text-primary text-[0.7em] tracking-wide uppercase">{tag}</p>
      {children}
    </div>
  </div>
)

/** Text with `code` spans drawn as code. */
const Inline = ({ text }: { text: string }): JSX.Element => (
  <>
    {text.split(/(`[^`]+`)/).map((part, i) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
        // eslint-disable-next-line react/no-array-index-key
        <code key={i} className="font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      ) : (
        // eslint-disable-next-line react/no-array-index-key
        <span key={i}>{part}</span>
      )
    )}
  </>
)

const Code = ({ code }: { code: string }): JSX.Element => (
  <pre className="bg-background border-border overflow-hidden rounded-[0.4em] border px-[0.8em] py-[0.5em] font-mono text-[0.62em] leading-snug [overflow-wrap:normal] whitespace-pre">
    {code.trimEnd()}
  </pre>
)

const Title = ({ children }: { children: ReactNode }): JSX.Element => (
  <p className="text-[1.4em] leading-tight font-bold">{children}</p>
)

const MARK_CLASS: Readonly<Record<string, string>> = {
  covered: "text-primary font-semibold",
  partly: "text-foreground font-semibold",
  missing: "text-destructive font-semibold",
}

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
          title={W.cell.unmet}
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
    case "level": {
      return (
        <td
          title={`${SOLO_LEVELS[cell.level - 1] ?? ""}${cell.decayed ? `: ${W.cell.decayed}` : ""}`}
          className={`border-border text-primary-foreground border text-center font-bold ${LEVEL_CLASS[cell.level] ?? ""}`}
        >
          {cell.decayed ? "↓" : ""}
        </td>
      )
    }
    default: {
      return assertNever(cell)
    }
  }
}

const QuestionPanel = ({ ticket }: { ticket: EssayTicket }): JSX.Element => (
  <div className="grid grid-cols-[1fr_1fr] gap-[1em]">
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
    <Code code={ticket.program} />
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
      const answer = view.ticket.answer
      return (
        <Call
          speaker={at.speaker}
          tag={`${view.ticket.id} · ${answer.kind === "take" ? NAMES.answer : W.noAnswer}`}
        >
          {answer.kind === "take" ? (
            <>
              <Title>{W.youSaid}</Title>
              <p className="text-[1em] leading-snug">{answer.transcript}</p>
            </>
          ) : (
            <>
              <Title>{W.noAnswer}</Title>
              <p className="text-muted-foreground text-[0.8em]">
                {W.opened(answer.opened)}
              </p>
              <p className="text-[1em] leading-snug">{answer.guess}</p>
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
      return (
        <Call speaker={at.speaker} tag={`${view.ticket.id} · ${NAMES.beside}`}>
          <table className="w-full text-left text-[0.8em]">
            <thead className="text-muted-foreground text-[0.85em]">
              <tr>
                <th className="pr-[1em] font-normal">{W.point}</th>
                <th className="font-normal">{W.yours}</th>
              </tr>
            </thead>
            <tbody>
              {view.ticket.points.map((point, i) => {
                const mark =
                  answer.kind === "take" ? answer.marks[i] : undefined
                return (
                  <tr key={point.to} className="border-border border-t">
                    <td className="py-[0.3em] pr-[1em] align-top">
                      <Inline text={point.to} />
                    </td>
                    <td className="py-[0.3em] align-top">
                      {mark === undefined ? (
                        <span className="text-muted-foreground">
                          {W.unanswered}
                        </span>
                      ) : (
                        <>
                          <span className={MARK_CLASS[mark.mark]}>
                            {W.mark[mark.mark]}
                          </span>
                          {mark.note !== undefined && (
                            <span className="text-muted-foreground block text-[0.9em]">
                              <Inline text={mark.note} />
                            </span>
                          )}
                        </>
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
            ) : (
              W.notJudged
            )}
          </p>
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
                <tr key={row.name} className="h-[1.8em]">
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
          <p className="text-muted-foreground flex flex-wrap gap-x-[1.2em] text-[0.6em]">
            <span>{W.legendLevel}</span>
            <span>↓ {W.cell.decayed}</span>
            <span>○ {W.cell.silent}</span>
            <span>┆ {W.cell.unmet}</span>
          </p>
          <Field label={W.role}>
            <p className="text-[0.9em] font-semibold">{role.fits}</p>
            <p className="text-[0.75em]">{W.roleNext(role.next, role.gap)}</p>
            <p className="text-muted-foreground text-[0.6em]">
              {W.roleSource(role.ladder, role.source)}
            </p>
          </Field>
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

export const EssayStagePage = ({
  scene,
  record = false,
  onScene,
}: EssayStageProps): JSX.Element => {
  if (!SAMPLE.ok)
    return (
      <StageRefused
        reason={SAMPLE.problems.join("\n")}
        problems={SAMPLE.problems}
      />
    )
  const essay = SAMPLE.value
  const at = essayAt(essay, scene)
  const format = essayFormat(essay.template.version)
  return (
    <StageFrame
      record={record}
      scene={at.scene.id}
      measureKey={`${essay.week.id}/${at.scene.id}`}
      data={{ "data-essay": record ? JSON.stringify(essay) : undefined }}
      theme={format.shape?.theme}
      title={W.title}
      where={`${whereOf(at, essay)} · ${W.sample}`}
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
      <Screen essay={essay} at={at} />
    </StageFrame>
  )
}
