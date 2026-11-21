import type { JSX } from "react"
import { assertNever } from "@some-ui/core-utils"
import {
  hasCaptions,
  interviewEssayFormat,
  markThemeOf,
  parseInterviewEssay,
  sampleInterviewEssay,
  silenceSaid,
} from "@some-ui/video-render"
import type {
  InterviewEssay,
  InterviewEssayScene,
  InterviewFault,
  Silence,
} from "@some-ui/video-render"

import { Call, CastProvider, Inline, MARK_CLASS } from "./essay-parts"
import type { EssayStageProps } from "./essay-stage"
import { essayStageOf } from "./essay-view"
import { ESSAY_WORDS as EW, leftOf, weekNumber } from "./essay-words"
import { interviewEssaySource } from "./feed"
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
import type { InterviewEssayAt } from "./interview-essay-view"
import { interviewEssayAt } from "./interview-essay-view"
import { INTERVIEW_ESSAY_WORDS as W } from "./interview-essay-words"

/**
 * The interview essay's stage (`@some-ui/video-render`'s
 * `interview-essay.ts`, IW6): one scene at a time in the stage's frame, the
 * Rust essay's template A (`./essay-parts`). `/essay?kind=interview` plays
 * it: the essay of the week `week` names, as home's render worker hands it
 * over (`./feed`'s `interviewEssaySource`), or with no week, or `sample`,
 * the template's sample.
 */

export type InterviewEssayStageProps = Omit<EssayStageProps, "kind">

const NAMES = sceneNames(interviewEssayFormat())

const SAMPLE = sampleInterviewEssay()

const labelOf = (scene: InterviewEssayScene): string => {
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
    case "opening":
    case "open":
    case "weeks":
    case "next": {
      return NAMES[scene.section] ?? ""
    }
    case "question":
    case "answer":
    case "faults":
    case "model":
    case "beside": {
      return `${scene.question ?? ""} · ${NAMES[scene.section] ?? ""}`
    }
    case "card":
    case "reading":
    case "heard": {
      return `${scene.read ?? ""} · ${NAMES[scene.section] ?? ""}`
    }
    default: {
      return assertNever(scene)
    }
  }
}

/** A take's faults: the counted apart from the judged, each said plainly. */
const Faults = ({
  faults,
}: {
  faults: ReadonlyArray<InterviewFault>
}): JSX.Element => {
  if (faults.length === 0) return <p className="text-[0.9em]">{W.noFaults}</p>
  const groups = [
    { label: W.counted, of: faults.filter((f) => f.by === "measured") },
    { label: W.judged, of: faults.filter((f) => f.by === "judged") },
  ].filter((group) => group.of.length > 0)
  return (
    <div className="space-y-[0.6em]">
      {groups.map((group) => (
        <Field key={group.label} label={group.label}>
          <ul className="space-y-[0.3em] text-[0.85em]">
            {group.of.map((fault) => (
              <li key={`${fault.what}-${fault.shows}`}>
                <span className="font-semibold">{fault.what}:</span>{" "}
                {fault.shows}
                {fault.by === "judged" && fault.quote !== undefined && (
                  <span className="text-muted-foreground block text-[0.85em]">
                    “{fault.quote}”
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Field>
      ))}
    </div>
  )
}

/**
 * An answer's or a read's take, played whole under its transcript, or the
 * silence and the guess at why: `took` and `left` name the two.
 */
const Played = ({
  speaker,
  answer,
  took,
  tag,
  left,
}: {
  speaker: InterviewEssayAt["speaker"]
  answer: { readonly kind: "take"; readonly transcript: string } | Silence
  took: string
  tag: string
  left: string
}): JSX.Element => (
  <Call
    speaker={speaker}
    tag={answer.kind === "take" ? tag : leftOf(answer, left)}
  >
    <Title>{answer.kind === "take" ? took : leftOf(answer, left)}</Title>
    <p className="text-[0.95em] leading-snug">
      {answer.kind === "take" ? answer.transcript : silenceSaid(answer)}
    </p>
  </Call>
)

const Screen = ({
  essay,
  at,
}: {
  essay: InterviewEssay
  at: InterviewEssayAt
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
          theme={markThemeOf(
            interviewEssayFormat(essay.template.version).shape
          )}
          line={view.section === "brand-in" ? W.title : SW.source}
        />
      )
    }
    case "chapter": {
      return <ChapterSlide title={view.title} holds={undefined} />
    }
    case "opening": {
      return (
        <Played
          speaker={at.speaker}
          answer={{ kind: "take", transcript: view.transcript }}
          took={W.yourOpening}
          tag={NAMES.opening}
          left=""
        />
      )
    }
    case "open": {
      return (
        <Call speaker={at.speaker} tag={EW.week(essay.week.id)}>
          <p className="text-muted-foreground text-[0.7em]">{W.invented}</p>
          <Title>{essay.company.name}</Title>
          <p className="text-[0.8em]">{essay.company.about}</p>
          <Field label={W.role}>
            <p className="text-[0.95em] font-semibold">{essay.role.title}</p>
            <p className="text-[0.8em]">{essay.role.about}</p>
          </Field>
        </Call>
      )
    }
    case "question": {
      const { question } = view
      return (
        <Call speaker={at.speaker} tag={NAMES.question}>
          <Title>{question.prompt}</Title>
          <Field label={W.guidelines}>
            <ol className="list-decimal space-y-[0.2em] pl-[1.2em] text-[0.85em]">
              {question.guidelines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </Field>
        </Call>
      )
    }
    case "answer": {
      return (
        <Played
          speaker={at.speaker}
          answer={view.question.answer}
          took={EW.youSaid}
          tag={NAMES.answer}
          left={EW.noAnswer}
        />
      )
    }
    case "faults": {
      const { answer } = view.question
      return (
        <Call speaker={at.speaker} tag={NAMES.faults}>
          <Faults faults={answer.kind === "take" ? answer.faults : []} />
        </Call>
      )
    }
    case "model": {
      return (
        <Call speaker={at.speaker} tag={NAMES.model}>
          <p className="text-muted-foreground text-[0.7em]">{W.model}</p>
          <p className="text-[0.9em] leading-snug">
            {view.question.model.said}
          </p>
        </Call>
      )
    }
    case "beside": {
      const { question } = view
      const { answer } = question
      return (
        <Call speaker={at.speaker} tag={NAMES.beside}>
          <table className="w-full text-left text-[0.8em]">
            <thead className="text-muted-foreground text-[0.85em]">
              <tr>
                <th className="pr-[1em] font-normal">{W.guideline}</th>
                <th className="font-normal">{EW.yours}</th>
              </tr>
            </thead>
            <tbody>
              {question.guidelines.map((line, i) => {
                const mark =
                  answer.kind === "take" ? answer.marks[i] : undefined
                return (
                  <tr key={line} className="border-border border-t">
                    <td className="py-[0.3em] pr-[1em] align-top">{line}</td>
                    <td className="py-[0.3em] align-top">
                      {mark === undefined ? (
                        <span className="text-muted-foreground">
                          {EW.unanswered}
                        </span>
                      ) : (
                        <>
                          <span className={MARK_CLASS[mark.mark]}>
                            {EW.mark[mark.mark]}
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
        </Call>
      )
    }
    case "card": {
      const { read } = view
      return (
        <Call speaker={at.speaker} tag={NAMES.card}>
          <Field label={W.situation}>
            <p className="text-[0.9em]">{read.situation}</p>
          </Field>
          <Field label={W.script}>
            <p className="text-[0.85em] leading-snug whitespace-pre-line">
              {read.script}
            </p>
          </Field>
        </Call>
      )
    }
    case "reading": {
      return (
        <Played
          speaker={at.speaker}
          answer={view.read.answer}
          took={W.youRead}
          tag={NAMES.reading}
          left={W.noRead}
        />
      )
    }
    case "heard": {
      const { answer } = view.read
      return (
        <Call speaker={at.speaker} tag={NAMES.heard}>
          <Faults faults={answer.kind === "take" ? answer.faults : []} />
          {answer.kind === "take" && (
            <Field label={W.change}>
              <p className="text-[0.95em] font-semibold">{answer.change}</p>
            </Field>
          )}
        </Call>
      )
    }
    case "weeks": {
      const { weeks, rows } = essay.weeks
      return (
        <Call speaker={at.speaker} tag={NAMES.weeks}>
          <table className="w-full table-fixed text-[0.7em]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-[38%]" />
                {weeks.map((week) => (
                  <th key={week} className="font-normal">
                    w{weekNumber(week)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.of}-${row.name}`} className="h-[1.8em]">
                  <th className="pr-[0.6em] text-left font-normal">
                    {row.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {row.of === "answers" ? W.answers : W.reads}
                    </span>
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      // eslint-disable-next-line react/no-array-index-key
                      key={i}
                      className="border-border border text-center font-semibold"
                    >
                      {cell === null ? W.noTake : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground text-[0.6em]">{W.noScore}</p>
        </Call>
      )
    }
    case "next": {
      return (
        <Call speaker={at.speaker} tag={NAMES.next}>
          <Title>{EW.week(essay.next.week)}</Title>
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

export const InterviewEssayStagePage = ({
  week,
  scene,
  record = false,
  onScene,
}: InterviewEssayStageProps): JSX.Element | null => {
  const named = week !== undefined && week !== "sample"
  const read = interviewEssaySource.useResource(
    ["interview-essay", week],
    week ?? "",
    undefined,
    { enabled: named, retry: false }
  )
  const state = essayStageOf({
    week,
    read: { data: read.data, pending: read.isPending, failed: read.isError },
    sample: SAMPLE,
    parse: parseInterviewEssay,
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
  const at = interviewEssayAt(essay, scene, voicing)
  const format = interviewEssayFormat(essay.template.version)
  const where = whereOf(at, () => labelOf(at.scene))
  return (
    <StageFrame
      record={record}
      scene={at.scene.id}
      measureKey={`interview/${essay.week.id}/${at.scene.id}`}
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
              scenes: at.scenes.map((s) => ({ id: s.id, label: labelOf(s) })),
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
