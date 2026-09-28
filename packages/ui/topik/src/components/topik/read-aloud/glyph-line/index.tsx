import type { JSX } from "react"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import type { GlyphCell, GlyphMode } from "@topik/lib/topik/read-aloud/glyphs"
import { glyphCells, isMarked } from "@topik/lib/topik/read-aloud/glyphs"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"
import { cn } from "some-ui-utils"

type GlyphLineProps = {
  deck: ReadAloudDeck
  item: SetItem
  mode: GlyphMode
  /** The block being read or heard: a word's syllable, a sentence's word. */
  mark: number | null
  short: boolean
}

type Block = { key: string; cells: Array<GlyphCell> }

/**
 * The blocks the mark steps through: each syllable of a word, or each word
 * of a sentence with its syllables together. A gap is a block of its own.
 */
function blocksOf(cells: Array<GlyphCell>, word: boolean): Array<Block> {
  const blocks: Array<Block> = []
  for (const cell of cells) {
    const last = blocks.at(-1)
    const first = last?.cells[0]
    const sameWord =
      !word &&
      cell.kind === "syllable" &&
      first?.kind === "syllable" &&
      first.word === cell.word
    if (last && sameWord) last.cells.push(cell)
    else blocks.push({ key: cell.key, cells: [cell] })
  }
  return blocks
}

/**
 * An item's Hangul, block by block (adaptive-learning canon Cor. 4.6 (iv)).
 *
 * The block being read or heard is marked; a syllable shown as said rather
 * than as spelled is underlined, so the change is visible; at the gloss, a
 * word's ending is dimmed against its stem.
 */
export const GlyphLine = ({
  deck,
  item,
  mode,
  mark,
  short,
}: GlyphLineProps): JSX.Element => {
  const cells = glyphCells(deck, item, mode)
  const word = item.kind === "word"
  return (
    <p
      lang="ko"
      data-slot="read-aloud-glyphs"
      data-mode={mode}
      aria-label={item.text}
      className={cn(
        "text-foreground text-center font-semibold break-keep",
        word
          ? short
            ? "text-4xl leading-tight"
            : "text-5xl leading-tight"
          : short
            ? "text-xl leading-snug"
            : "text-2xl leading-relaxed"
      )}
    >
      {blocksOf(cells, word).map((block) => {
        const marked = block.cells.some((cell) => isMarked(item, cell, mark))
        return (
          <span
            key={block.key}
            aria-hidden="true"
            data-marked={marked || undefined}
            className={cn(
              "rounded-md whitespace-pre-wrap transition-colors duration-150",
              marked && "bg-primary/15 text-primary"
            )}
          >
            {block.cells.map((cell) =>
              cell.kind === "gap" ? (
                cell.text
              ) : (
                <span
                  key={cell.key}
                  data-said={cell.spelled !== undefined || undefined}
                  data-ending={cell.ending || undefined}
                  className={cn(
                    cell.spelled !== undefined &&
                      "decoration-primary/60 underline decoration-dotted underline-offset-8",
                    cell.ending && "text-muted-foreground"
                  )}
                >
                  {cell.text}
                </span>
              )
            )}
          </span>
        )
      })}
    </p>
  )
}
