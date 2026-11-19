/**
 * The interview week's layers under its first page (IW15, paulgsc/some-ui#3224):
 * the week's questions, today's first, and how a week goes. Each is one
 * concern on a page of its own; the first page (`./week`) only links here.
 */
import type { JSX } from "react"
import { pacificDay } from "@some-ui/core-utils"
import { questionOfDay } from "@some-ui/interview-week"

import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

import { BackTo } from "./ladder"
import type { Interview } from "./run"
import { useInterview } from "./run"
import { CardTo } from "./to"
import { doneLine, Opening, TakesLink } from "./week"

const Questions = ({ held }: { held: Interview }): JSX.Element => {
  const { week, state } = held
  const today = questionOfDay(week, pacificDay(new Date(state.at)))
  const others = week.questions.filter(({ id }) => id !== today?.id)
  return (
    <div className="flex flex-col gap-4">
      <BackTo to={{ page: "interview" }}>{WORDS.toInterview}</BackTo>
      <header className="space-y-1">
        <p className="text-muted-foreground text-xs font-semibold">
          {WORDS.heading(week)}
        </p>
        <h2 className="text-3xl font-extrabold text-balance">
          {WORDS.questions}
        </h2>
        <p className="text-muted-foreground text-sm">{WORDS.questionsLine}</p>
      </header>
      {today !== null && (
        <CardTo to={{ page: "question", question: today.id }} tone="brand">
          <span className="text-xs font-semibold opacity-85">
            {WORDS.today}
          </span>
          <span className="text-xl leading-tight font-extrabold text-balance">
            {today.prompt}
          </span>
          <span className="text-xs font-semibold opacity-85">
            {doneLine(held, today.id) ?? WORDS.todayLine}
          </span>
        </CardTo>
      )}
      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          {today !== null && (
            <h3 className="text-sm font-semibold">{WORDS.others}</h3>
          )}
          {others.map(({ id, prompt }) => {
            const done = doneLine(held, id)
            return (
              <CardTo key={id} to={{ page: "question", question: id }}>
                <span className="font-semibold">{prompt}</span>
                {done !== null && (
                  <span className="text-muted-foreground text-xs">{done}</span>
                )}
              </CardTo>
            )
          })}
        </section>
      )}
    </div>
  )
}

/** The week's questions, today's first. */
export const QuestionsPage = (): JSX.Element => {
  const held = useInterview()
  return (
    <Opening held={held}>
      <Questions held={held} />
    </Opening>
  )
}

/** How a week goes: what happens to what you say, home named once. */
export const HowPage = (): JSX.Element => {
  const { week } = useInterview()
  return (
    <div className="flex flex-col gap-4">
      <BackTo to={{ page: "interview" }}>{WORDS.toInterview}</BackTo>
      <h2 className="text-3xl font-extrabold text-balance">
        {WORDS.how.title}
      </h2>
      <ol className="flex flex-col gap-4">
        {WORDS.how.steps.map(({ name, line }, i) => (
          <li key={name} className="grid grid-cols-[2rem_1fr] gap-3">
            <span
              aria-hidden="true"
              className="bg-muted grid size-7 place-items-center rounded-full text-sm font-extrabold"
            >
              {i + 1}
            </span>
            <p className="text-sm">
              <span className="block font-bold">{name}</span>
              {line}
            </p>
          </li>
        ))}
      </ol>
      <TakesLink week={week} />
    </div>
  )
}
