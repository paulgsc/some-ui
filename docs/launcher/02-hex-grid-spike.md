# Should the launcher be a honeycomb?

> Story #857, epic #852. **Decision: no.** Recorded with the reasoning so it
> is not re-proposed every quarter on brand grounds alone.

The brand is a comb. It is the favicon, the landing hero, and `HexCombMark`
in the sidebar. `@some-ui/honeycomb` ships a real `HexGrid`. And the mark is
a seven-cell comb — one core ringed by six — which is almost exactly the "`k`
recommended" shape #854 arrived at independently, from a completely different
direction. Rendering the launcher as a comb is available, on-brand, and
tempting, which is why it got a story of its own rather than being drifted
into or dismissed in a review comment.

Three things decided it, in descending order of how much they mattered.

## 1. The vertical footprint, which is the currency this epic trades in

A regular hexagon is a poor container for a rectangle of text. The largest
axis-aligned rectangle that fits inside one occupies exactly **two thirds** of
its area, and it is a wide, short rectangle: for circumradius `R` it is
`√3·R` wide by `R` tall.

Sizing a comb so each cell gives a card's text the same width it has today:

- The shipped launcher at `lg` is four cards across `max-w-5xl`: each card is
  247px wide, with a 199px text box inside `p-6`.
- A hexagon whose inscribed rectangle is 199px wide needs `R = 115`, so each
  cell is 199 × 230px and its usable text box is **199 × 115px**.
- A radius-1 comb (core + ring of six) of those cells is **398 × 574px**.

So the comb is 574px tall. The shortest viewport the fit sweep tests is
560px. **The launcher alone would be taller than the first screen, at N = 4,
before the profile card above it.** That is the exact failure this epic
exists to remove, arrived at from the other side.

Capping the comb at the row's height budget instead (200px) inverts the
problem: `R = 40`, and each cell's text box is 69 × 40px. That is not a
container for a name, a description, a maturity badge and an audio hint. It
is a container for a letter, which is what `HangulHexGrid` uses it for, and
that is not a coincidence.

The row of four cards delivers the same four text boxes in 1024 × 200px. The
comb wants roughly a third of the width and nearly three times the height,
and height is the scarce axis on every viewport in this epic.

## 2. Reading order, which a launcher cannot be vague about

A comb has no unambiguous linear order. A grid does: left to right, top to
bottom, and the DOM order matches what the eye does. In a comb, "the one
after the core" is a choice — clockwise from twelve? from the top-left? — and
whatever is chosen, the visual arrangement will contradict it for some
readers, because a ring genuinely has no first element.

That is survivable for a game board, where cells are addressed by pointing at
them. It is not survivable for a navigation surface, where the tab order and
the screen-reader order _are_ the interface for anyone not using a mouse.
#855's acceptance criterion is that the launcher is fully operable by
keyboard; a surface whose reading order has to be explained is one that has
already failed it.

## 3. `HexGrid` is not a layout primitive, and reaching for it costs a wasm module

`HexGrid` is not exported from `@some-ui/honeycomb`'s index — only
`HangulHexGrid` is. Internally it depends on `useHexgridWasm`: hex geometry
comes from a WebAssembly module, and the component renders its own loading
and error states for it.

Putting that on `/app` means a wasm module in the dashboard's critical path,
for a layout. This repo has a lint rule (`lazyRegistryConfig`) whose entire
job is to keep applet-sized dependencies out of the eager bundle, and the
activity catalogue is deliberately written so that `toSceneProps` never
imports from an applet package for exactly this reason. Making the front door
the one place that violates it, in exchange for a shape, is not a trade worth
proposing.

## What would change this

Not brand enthusiasm; the mark already carries the brand and carries it
better at 16px than a layout can at 400px. What would change it:

- A `HexGrid` variant with no wasm dependency and a declared linear cell
  order, existing for its own reasons rather than for this.
- A launcher card that has genuinely shrunk to a glyph and a word — no
  description, no badges. If a card ever becomes that small, the geometry
  above stops being an argument, and this note should be re-read rather than
  cited.

## What was built

Nothing. The prototype the story called for would have been a story around a
component that is not exported, pulling in a wasm module, to render text into
a 69 × 40px box — and the three numbers above were available without writing
it. The deliverable of a spike is the decision; this is it.

**The brand belongs in the mark, not in the layout.**
