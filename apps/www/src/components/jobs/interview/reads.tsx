/**
 * Scripts, a section of its own (IW8, paulgsc/some-ui#3175): the week's
 * short scripts, each opening its own reading page, which counts down and
 * records while the script stays on screen (IW5's read). A read's take
 * waits on this phone until the week is sent.
 */
import type { JSX } from "react"

import { readItem } from "@/lib/interview-week/spec"
import { INTERVIEW_WORDS as WORDS } from "@/lib/interview-week/words"

import { BackTo, CueLine, Script, TakeOn, useFocus } from "./ladder"
import type { Interview } from "./run"
import { useInterview } from "./run"
import { CardTo } from "./to"
import { doneLine, Opening } from "./week"

/** The week's reads, each a link to its page. */
export const ReadsPage = (): JSX.Element => {
  const held = useInterview()
  const { week } = held
  return (
    <div className="flex flex-col gap-4">
      <BackTo to={{ page: "interview" }}>{WORDS.toInterview}</BackTo>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-3xl font-extrabold">{WORDS.reads}</h2>
        <p className="text-muted-foreground text-sm">{WORDS.readsLine}</p>
      </div>
      {week.cards.map((card) => {
        const done = doneLine(held, readItem(card.id))
        return (
          <CardTo key={card.id} to={{ page: "read", card: card.id }}>
            <span className="font-semibold">{card.situation}</span>
            <span className="text-muted-foreground text-xs">
              {done ?? WORDS.aim(card.targetSeconds)}
            </span>
          </CardTo>
        )
      })}
    </div>
  )
}

const ReadTake = ({
  held,
  card,
}: {
  held: Interview
  card: Interview["week"]["cards"][number]
}): JSX.Element => {
  const item = readItem(card.id)
  useFocus(held, item)
  return (
    <TakeOn
      held={held}
      item={item}
      rung={null}
      head={
        <>
          <p className="text-muted-foreground text-xs font-semibold">
            {WORDS.situation} · {WORDS.aim(card.targetSeconds)}
          </p>
          <p className="text-sm">{card.situation}</p>
          <Script lines={card.script.split("\n")} id={card.id} />
          <CueLine held={held} item={item} />
        </>
      }
    />
  )
}

/** One read's page: its script, a cue, and its take. */
export const ReadPage = ({ id }: { id: string }): JSX.Element => {
  const held = useInterview()
  const card = held.week.cards.find((read) => read.id === id)
  return (
    <div className="flex flex-col gap-4">
      <BackTo to={{ page: "reads" }}>{WORDS.reads}</BackTo>
      {card === undefined ? (
        <p className="text-muted-foreground">{WORDS.notInWeek}</p>
      ) : (
        <Opening held={held}>
          <ReadTake held={held} card={card} />
        </Opening>
      )}
    </div>
  )
}
