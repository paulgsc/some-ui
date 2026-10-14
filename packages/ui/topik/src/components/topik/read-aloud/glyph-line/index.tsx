import type { JSX } from "react"
import { cn } from "@some-ui/core-utils"
import type { ReadAloudDeck } from "@topik/lib/topik/read-aloud/content"
import type { GlyphCell, GlyphMode } from "@topik/lib/topik/read-aloud/glyphs"
import { glyphCells, isMarked } from "@topik/lib/topik/read-aloud/glyphs"
import type { SetItem } from "@topik/lib/topik/read-aloud/set-builder"

/**
 * A sentence carrying a grammar lens: its words are framed, so marking one
 * never moves the line. Before the gloss a role lens makes each word a
 * button that answers it; at the gloss the answer is shown on its words,
 * and a wrong pick is struck through.
 */
export type GlyphLens = {
  pick?: { picked: number | null; onPick: (word: number) => void }
  shown?: {
    words: ReadonlyArray<number>
    /** The answer's look: the word's frame, and its ending's colour. */
    frame: string
    ending: string
    missed: number | null
  }
}

type GlyphLineProps = {
  deck: ReadAloudDeck
  item: SetItem
  mode: GlyphMode
  /** The block being read or heard: a word's syllable, a sentence's word. */
  mark: number | null
  short: boolean
  lens?: GlyphLens
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
 * word's ending is dimmed against its stem, or, on a word showing a lens's
 * answer, coloured as the lens is (`GlyphLens`).
 */
export const GlyphLine = ({
  deck,
  item,
  mode,
  mark,
  short,
  lens,
}: GlyphLineProps): JSX.Element => {
  const cells = glyphCells(deck, item, mode, lens?.shown?.words)
  const word = item.kind === "word"
  const pick = lens?.pick
  const shown = lens?.shown
  const blocks = blocksOf(cells, word).map((block) => {
    const marked = block.cells.some((cell) => isMarked(item, cell, mark))
    const [first] = block.cells
    // A sentence's word, by its place among the line's written words.
    const at = !word && first?.kind === "syllable" ? first.word : null
    const answer = at !== null && (shown?.words.includes(at) ?? false)
    const missed = at !== null && shown?.missed === at
    const picked = at !== null && pick?.picked === at
    const className = cn(
      "rounded-md whitespace-pre-wrap transition-colors duration-150",
      at !== null &&
        lens &&
        "inline-block rounded-lg border-2 border-transparent",
      marked && "bg-primary/15 text-primary",
      picked && "border-foreground/70 border-dashed",
      answer && shown?.frame,
      missed &&
        "text-muted-foreground border-muted-foreground/50 border-dashed line-through"
    )
    const content = block.cells.map((cell) =>
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
            cell.ending && (answer ? shown?.ending : "text-muted-foreground")
          )}
        >
          {cell.text}
        </span>
      )
    )
    if (pick && at !== null) {
      const spelled = block.cells
        .map((cell) =>
          cell.kind === "syllable" ? (cell.spelled ?? cell.text) : ""
        )
        .join("")
      return (
        <button
          key={block.key}
          type="button"
          aria-pressed={picked}
          aria-label={spelled}
          data-marked={marked || undefined}
          data-word={at}
          onClick={() => pick.onPick(at)}
          className={cn(className, "active:scale-95")}
        >
          {content}
        </button>
      )
    }
    return (
      <span
        key={block.key}
        aria-hidden="true"
        data-marked={marked || undefined}
        data-word={at ?? undefined}
        data-answer={answer || undefined}
        data-missed={missed || undefined}
        className={className}
      >
        {content}
      </span>
    )
  })
  const lineClass = cn(
    "text-foreground text-center font-semibold break-keep",
    word
      ? short
        ? "text-4xl leading-tight"
        : "text-5xl leading-tight"
      : short
        ? "text-xl leading-snug"
        : "text-2xl leading-relaxed",
    lens && !short && "text-3xl leading-loose"
  )
  // Buttons are each their own target, so the line is a labelled group.
  return pick ? (
    <div
      role="group"
      lang="ko"
      data-slot="read-aloud-glyphs"
      data-mode={mode}
      aria-label={item.text}
      className={lineClass}
    >
      {blocks}
    </div>
  ) : (
    <p
      lang="ko"
      data-slot="read-aloud-glyphs"
      data-mode={mode}
      aria-label={item.text}
      className={lineClass}
    >
      {blocks}
    </p>
  )
}
