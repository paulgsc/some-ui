import type { JSX } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import {
  KIND_WORDS,
  kindPath,
  STUDIO_INDEX_WORDS,
  STUDIO_KINDS,
} from "@/lib/studio-index"
import { StudioPage, TILE, TileBody } from "@/components/studio/layout"
import { RendersLine } from "@/components/studio/renders"

const WORDS = STUDIO_INDEX_WORDS

/**
 * The Studio wing's Home (lib/wings), Studio's index (SFEED1, #2731; #2670's
 * decision 1): the eight kinds of thing Studio keeps, each a tile the size
 * of the others, A to Z so the order ranks nothing, each opening its own
 * list. Deleting any of it stays in Settings › My data. One live line above
 * the tiles says what home is making, when it is making anything (SFEED13).
 */
const StudioIndex = (): JSX.Element => (
  <StudioPage heading={WORDS.heading} intro={WORDS.aToZ}>
    {/* What home is making, above the tiles and not one of them (SFEED13). */}
    {import.meta.env.VITE_DEVICE_BACKEND === "true" ? <RendersLine /> : null}
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

export const Route = createFileRoute("/_dashboard/_apk/journal/")({
  component: StudioIndex,
})
