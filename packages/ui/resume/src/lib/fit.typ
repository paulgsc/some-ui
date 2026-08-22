// One-page fitting.
//
// Two things are wanted at once: the résumé must never spill onto a second
// page, and it must not leave the bottom third of the first page empty. A
// fixed type size can only satisfy one of those for a given body of content,
// so the size is solved for instead of chosen.
//
// Every length in the templates is expressed in `em`, which means a single
// `text.size` determines the height of the whole document. `fit-scale` walks a
// ladder of scales from most generous to tightest and returns the first one
// whose laid-out height fits the column — the largest type the content admits,
// which is the same thing as the fullest page.
//
// Note what this deliberately does *not* do: it never clips. If even the
// tightest scale overflows, the chosen scale is returned anyway, the content
// runs onto a second page, and the page-count assertion in `assert-one-page`
// fails the build. Silently swallowing the overflow inside a fixed-height box
// would let a broken résumé pass as a one-page document.

#let scale-ladder(lo: 0.82, hi: 1.14, steps: 17) = {
  range(steps).map(i => hi - (hi - lo) * i / (steps - 1))
}

// `render` is a function of the scale returning the column's content. Must be
// called from a `context` block — it measures.
#let fit-scale(width, height, base, render, ladder: none) = {
  let steps = if ladder == none { scale-ladder() } else { ladder }
  let chosen = steps.last()
  for s in steps {
    let probe = measure(block(width: width, {
      set text(size: base * s)
      render(s)
    }))
    if probe.height <= height {
      chosen = s
      break
    }
  }
  chosen
}

// The build's real one-page guarantee. Evaluated after layout, so it sees the
// document that was actually produced rather than an estimate of it.
#let assert-one-page(label) = context assert(
  counter(page).final().first() == 1,
  message: label + " exceeds one page — tighten the composition in src/data/, "
    + "or widen the scale ladder in src/lib/fit.typ if the type may go smaller.",
)

// A secondary column solved on its own terms. The rail carries less text than
// the main column, so forcing both to one scale leaves the rail visibly short
// of the bottom of the page — the exact emptiness the fitting pass exists to
// remove. It is only ever clamped *down* toward the reference scale (never up,
// which could overflow a column that had already been solved to fit), so the
// two columns stay within sight of each other typographically.
#let fit-secondary(base, column, reference, max-ratio: 1.12, ladder: none) = {
  let solo = fit-scale(column.width, column.height, base, column.render, ladder: ladder)
  calc.min(solo, reference * max-ratio)
}

// Solving for type size gets a column close to full, but never exactly: the
// scale ladder is discrete, and the last step that fits usually leaves a
// centimetre or two of slack at the bottom. `justify-blocks` spends that slack
// as extra space between sections, which is where a reader expects to find it,
// instead of leaving it pooled under the final bullet.
//
// `max-gap` keeps the mechanism honest when a column is genuinely short — a
// half-empty rail should look like a half-empty rail rather than a set of
// sections floating an inch apart. Slack beyond the cap simply stays at the
// bottom.
// Sections are joined in normal block flow rather than with `stack`: a stack
// discards the `above`/`below` spacing the section blocks carry, which closes
// the gap a heading needs and lets a heading collide with the paragraph above
// it. Spacers go *between* the blocks instead, leaving each block's own
// spacing intact.
#let join-blocks(blocks) = blocks.join()

#let justify-blocks(blocks, width, height, max-gap: 22pt) = {
  if blocks.len() < 2 {
    return join-blocks(blocks)
  }
  let natural = measure(block(width: width, join-blocks(blocks)))
  let slack = height - natural.height
  let gap = if slack <= 0pt {
    0pt
  } else {
    calc.min(slack / (blocks.len() - 1), max-gap)
  }
  blocks.intersperse(v(gap)).join()
}
