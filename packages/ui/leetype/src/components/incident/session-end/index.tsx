import type { FC } from "react"
import type { EndLines } from "@leetype/lib/leetype/incident-play/words"

type SessionEndProps = {
  lines: EndLines
}

const SECTIONS: ReadonlyArray<{ key: keyof EndLines; heading: string }> = [
  { key: "walked", heading: "You played" },
  { key: "parked", heading: "Waiting on a reading" },
  { key: "saved", heading: "Saved for a Read session" },
  { key: "spoken", heading: "Your take" },
]

/**
 * The end screen (canon v1.2, Prop. 10.2): only what the session's events
 * say, in words. A section with nothing in it is left out.
 */
export const SessionEnd: FC<SessionEndProps> = ({ lines }) => (
  <article className="flex flex-col gap-4">
    <h2 className="text-base font-semibold text-foreground">
      This session has ended.
    </h2>
    {SECTIONS.map(({ key, heading }) =>
      lines[key].length === 0 ? null : (
        <section key={key} aria-label={heading} className="text-sm">
          <p className="font-medium text-foreground">{heading}</p>
          <ul className="mt-1 flex flex-col gap-1 text-muted-foreground">
            {lines[key].map(({ key: id, text }) => (
              <li key={id} className="text-pretty">
                {text}
              </li>
            ))}
          </ul>
        </section>
      )
    )}
  </article>
)
