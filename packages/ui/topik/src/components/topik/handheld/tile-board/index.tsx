import type { JSX } from "react"
import { cn } from "some-ui-utils"

/** A tile with a stable identity, since the same text may appear twice. */
export type Tile = { id: string; text: string }

export const toTiles = (texts: Array<string>): Array<Tile> =>
  texts.map((text, index) => ({ id: `tile-${index}`, text }))

type AnswerTrayProps = {
  placed: Array<Tile>
  joiner: "" | " "
  onRemove: (id: string) => void
  disabled?: boolean
}

/**
 * The answer being built. Tapping a placed tile sends it back to the pool.
 * Syllable tiles sit flush so the word reads as a word; word tiles are spaced.
 */
export const AnswerTray = ({
  placed,
  joiner,
  onRemove,
  disabled = false,
}: AnswerTrayProps): JSX.Element => (
  <div
    data-slot="topik-answer-tray"
    aria-label="Your answer"
    className={cn(
      "border-primary/40 bg-muted/40 flex min-h-14 w-full flex-wrap items-center justify-center rounded-2xl border-2 border-dashed p-2",
      joiner === "" ? "gap-0.5" : "gap-2"
    )}
  >
    {placed.length === 0 ? (
      <span className="text-muted-foreground text-sm">
        Tap the pieces below in order
      </span>
    ) : (
      placed.map((tile) => (
        <button
          key={tile.id}
          type="button"
          lang="ko"
          disabled={disabled}
          onClick={() => onRemove(tile.id)}
          className="bg-primary text-primary-foreground h-11 min-w-11 rounded-xl px-3 text-lg font-semibold break-keep"
        >
          {tile.text}
        </button>
      ))
    )}
  </div>
)

type TilePoolProps = {
  tiles: Array<Tile>
  placedIds: ReadonlySet<string>
  onPlace: (id: string) => void
  disabled?: boolean
}

/** The pieces still available. A placed tile leaves a gap, so nothing jumps. */
export const TilePool = ({
  tiles,
  placedIds,
  onPlace,
  disabled = false,
}: TilePoolProps): JSX.Element => (
  <div
    data-slot="topik-tile-pool"
    className="flex flex-wrap justify-center gap-2"
  >
    {tiles.map((tile) => {
      const used = placedIds.has(tile.id)
      return (
        <button
          key={tile.id}
          type="button"
          lang="ko"
          aria-hidden={used}
          tabIndex={used ? -1 : 0}
          disabled={disabled || used}
          onClick={() => onPlace(tile.id)}
          className={cn(
            "bg-card border-border h-11 min-w-11 rounded-xl border px-3 text-lg font-semibold break-keep transition-opacity",
            used && "opacity-0"
          )}
        >
          {tile.text}
        </button>
      )
    })}
  </div>
)
