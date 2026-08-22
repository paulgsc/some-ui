// `compact` — the same evidence with the rail moved left, the portrait
// dropped, and a denser main column. Useful where a photograph is a liability
// rather than an asset (many jurisdictions and most large-employer pipelines)
// but a two-column document is still wanted.
#import "../lib/two-column.typ"

#let render(ctx) = two-column.render(
  ctx,
  opts: (
    rail-frac: 0.31,
    rail-side: left,
    avatar: false,
    main-pad: (top: 0.38in, bottom: 0.32in, left: 0.30in, right: 0.42in),
    rail-pad: (top: 0.42in, bottom: 0.32in, left: 0.30in, right: 0.26in),
    bullets: (4, 3),
    practice: (5, 4),
  ),
)
