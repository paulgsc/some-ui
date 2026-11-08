import type { JSX } from "react"
import { useEffect } from "react"
import { keptIdeasForHome, phoneStudioKeeping } from "@some-ui/soundbites"
import { createFileRoute, Link } from "@tanstack/react-router"

import { keepIdeas } from "@/lib/idea-keeping"
import {
  KIND_WORDS,
  kindPath,
  STUDIO_INDEX_WORDS,
  STUDIO_KINDS,
} from "@/lib/studio-index"
import { keepStudio } from "@/lib/studio-keeping"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"

const WORDS = STUDIO_INDEX_WORDS

/**
 * The Studio wing's Home (lib/wings), Studio's index (SFEED1, #2731; #2670's
 * decision 1): the eight kinds of thing Studio keeps, each a tile the size
 * of the others, A to Z so the order ranks nothing, each opening its own
 * list. Deleting any of it stays in Settings › My data.
 *
 * In the Android app, Studio's store, log and rules go to the home link, and
 * the ideas sent whole go home (ST26), once this page has loaded
 * (`lib/studio-keeping`), as Studio's Home handed them in before the index.
 */
const StudioIndex = (): JSX.Element => {
  useEffect(() => {
    if (import.meta.env.VITE_DEVICE_BACKEND !== "true") return
    keepStudio(phoneStudioKeeping())
    keepIdeas({ forHome: keptIdeasForHome() })
  }, [])
  return (
    <StudioPage heading={WORDS.heading} intro={WORDS.aToZ}>
      <ul className="grid grid-cols-2 gap-2">
        {STUDIO_KINDS.map((kind) => (
          <li key={kind}>
            <Link to={kindPath(kind)} className={TILE}>
              <TileBody
                title={KIND_WORDS[kind].name}
                line={KIND_WORDS[kind].line}
              />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        {WORDS.deleting}{" "}
        <Link to="/settings/data" className="underline underline-offset-4">
          {WORDS.myData}
        </Link>
      </p>
    </StudioPage>
  )
}

export const Route = createFileRoute("/_dashboard/_apk/journal/")({
  component: StudioIndex,
})
