/**
 * Past weeks (IW17, paulgsc/some-ui#3226): each closed week on this phone,
 * newest first, with what was sent from here and where its essay is: ready
 * to watch in Studio's Episodes, being made, couldn't finish, or expected.
 * It draws `lib/interview-week/past`'s rows; the route reads the weeks, the
 * feed and the board and hands them in.
 */
import type { JSX } from "react"
import { assertNever } from "@some-ui/core-utils"
import { Button } from "@some-ui/shared"

import type { EssayStatus, PastWeek } from "@/lib/interview-week/past"
import { takesOf } from "@/lib/interview-week/spec"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

import { BackTo } from "./ladder"
import { CardTo } from "./to"

const Essay = ({ essay }: { essay: EssayStatus }): JSX.Element => {
  switch (essay.kind) {
    case "ready": {
      return (
        <CardTo to={{ page: "essay", key: essay.key }} tone="brand">
          <span className="font-semibold">{WORDS.weeks.essay.watch}</span>
          <span className="text-xs opacity-85">{WORDS.weeks.essay.ready}</span>
        </CardTo>
      )
    }
    case "failed": {
      return (
        <CardTo to={{ page: "renders" }}>
          <span className="font-semibold">{WORDS.weeks.essay.renders}</span>
          <span className="text-muted-foreground text-xs">
            {WORDS.weeks.essay.failed}
          </span>
        </CardTo>
      )
    }
    case "making":
    case "waiting":
    case "written":
    case "expected":
    case "asking":
    case "unpaired":
    case "older":
    case "unknown": {
      return <p className="text-sm">{WORDS.weeks.essay[essay.kind]}</p>
    }
    default: {
      return assertNever(essay)
    }
  }
}

const Week = ({ past }: { past: PastWeek }): JSX.Element => {
  const { week, sent, essay } = past
  return (
    <section
      data-past-week={week.id}
      className="bg-card flex flex-col gap-2 rounded-2xl p-3"
    >
      <p className="text-muted-foreground text-xs font-semibold">
        {WORDS.wayIn.weekName(week)}
      </p>
      <h3 className="font-semibold text-balance">
        {WORDS.role(week.role.title, week.company.name)}
      </h3>
      <p className="text-muted-foreground text-sm">
        {sent === null
          ? WORDS.weeks.noSend
          : WORDS.weeks.sent(takesOf(sent).length, sent.at)}
      </p>
      <Essay essay={essay} />
      <CardTo
        to={{
          page: "takes",
          week: week.id,
          name: WORDS.wayIn.weekName(week),
        }}
      >
        <span className="font-semibold">{WORDS.wayIn.takes}</span>
        <span className="text-muted-foreground text-xs">
          {WORDS.wayIn.takesLine}
        </span>
      </CardTo>
    </section>
  )
}

export type PastWeeksProps = {
  weeks: ReadonlyArray<PastWeek>
  /** Whether a week's essay couldn't be read from home; then the page offers to ask again. */
  askAgain: (() => void) | null
}

/** The page: each closed week, or that none has closed yet. */
export const PastWeeks = ({ weeks, askAgain }: PastWeeksProps): JSX.Element => (
  <div className="flex flex-col gap-4">
    <BackTo to={{ page: "interview" }}>{WORDS.toInterview}</BackTo>
    <header className="space-y-1">
      <h2 className="text-3xl font-extrabold">{WORDS.weeks.title}</h2>
      <p className="text-muted-foreground text-sm">{WORDS.weeks.line}</p>
    </header>
    {weeks.length === 0 ? (
      <p className="text-muted-foreground text-sm">{WORDS.weeks.none}</p>
    ) : (
      weeks.map((past) => <Week key={past.week.id} past={past} />)
    )}
    {askAgain !== null && (
      <Button variant="outline" onClick={askAgain}>
        {WORDS.weeks.tryAgain}
      </Button>
    )}
  </div>
)
