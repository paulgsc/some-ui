import type { JSX } from "react"
import { TextLayer } from "@burn-ins/components/stage/text"
import { cq, placed } from "@burn-ins/components/stage/units"
import type { AuthorshipFrame, Cell } from "@burn-ins/lib/authorship"
import { INK } from "@burn-ins/lib/journal"

/** A cell's fill: whole for the idea's origin, its lower half for its wording. */
const fillOf = (c: Cell): string =>
  c.idea === "origin"
    ? c.colour
    : c.idea === "wording"
      ? `linear-gradient(to top, ${c.colour} 50%, transparent 50%)`
      : "transparent"

/**
 * The authorship mark's part on screen: its panel and words, then its cells.
 * A cell's edge is a ring in its actor's colour for a hand, else faint, and
 * its fill sits inset inside the ring, so a filled cell shows its hand too.
 */
export const AuthorshipLayer = ({
  frame,
}: {
  frame: AuthorshipFrame
}): JSX.Element => (
  <>
    <TextLayer frame={frame} />
    {frame.cells.map((c) => {
      const edge = c.hand ? Math.max(3, c.box.width / 10) : 2
      const inset = c.box.width / 5
      return (
        <div
          key={`${c.box.x},${c.box.y}`}
          className="bi-cell"
          data-actor={c.actor}
          data-role={c.role}
          data-idea={c.idea ?? "none"}
          data-hand={c.hand}
          style={{
            ...placed(c.box),
            background: fillOf(c),
            backgroundClip: "content-box",
            padding: cq(inset - edge),
            border: `${cq(edge)} solid ${c.hand ? c.colour : INK.edge}`,
            borderRadius: cq(c.box.width / 5),
          }}
        />
      )
    })}
  </>
)
