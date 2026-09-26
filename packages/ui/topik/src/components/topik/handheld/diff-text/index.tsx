import type { JSX } from "react"
import { highlightFor } from "@topik/lib/topik/core/morph-diff"
import { cn } from "some-ui-utils"

type DiffTextProps = {
  /** The utterance the candidate is judged against. */
  source: string
  candidate: string
  className?: string
}

/**
 * A candidate, read as a diff against its source: what a relation added is
 * marked, what it took away is struck through, and what it kept is plain.
 * That points at *where* a transformation acts without saying *whether* it
 * holds (adaptive-learning canon Cor. 4.5 (i)). A candidate that is simply a
 * different sentence - a reply - renders as itself.
 */
export const DiffText = ({
  source,
  candidate,
  className,
}: DiffTextProps): JSX.Element => {
  const segments = highlightFor(source, candidate)

  if (segments === null) {
    return (
      <span lang="ko" className={cn("break-keep", className)}>
        {candidate}
      </span>
    )
  }

  // The marks are for the eye. Read aloud, struck-through syllables would
  // interleave with the candidate ("주세요 부탁해요"), so assistive tech gets
  // the candidate as written and the diff is hidden from it.
  return (
    <span lang="ko" className={cn("break-keep", className)}>
      <span className="sr-only">{candidate}</span>
      <span aria-hidden="true">
        {segments.map((segment, index) =>
          segment.kind === "same" ? (
            // Segments are positional by nature: the same text can repeat,
            // and the list never reorders, so the index is the identity.
            // eslint-disable-next-line react/no-array-index-key
            <span key={index}>{segment.text}</span>
          ) : segment.kind === "added" ? (
            <mark
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              data-diff="added"
              className="bg-primary/15 text-primary rounded px-0.5 font-semibold"
            >
              {segment.text}
            </mark>
          ) : (
            <del
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              data-diff="removed"
              className="text-muted-foreground/70 decoration-muted-foreground/70 text-[0.85em] line-through"
            >
              {segment.text}
            </del>
          )
        )}
      </span>
    </span>
  )
}
