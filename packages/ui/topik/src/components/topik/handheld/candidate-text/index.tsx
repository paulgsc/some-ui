import type { JSX } from "react"
import { DiffText } from "@topik/components/topik/handheld/diff-text"
import type { ProbeOption } from "@topik/lib/topik"
import { relationLabel } from "@topik/lib/topik/core/probe"

/** A candidate as it reads in a list: its relation, then the text itself. */
export const CandidateText = ({
  option,
  source,
  withRelation,
}: {
  option: ProbeOption
  source: string
  withRelation: boolean
}): JSX.Element => (
  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
    {withRelation && (
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {relationLabel(option.relation, option.label)}
      </span>
    )}
    {option.lang === "en" ? (
      <span>{option.text}</span>
    ) : (
      <DiffText source={source} candidate={option.text} />
    )}
  </span>
)
