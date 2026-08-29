// Rendering atoms shared by the templates. Everything is sized in `em` so the
// scale solved by lib/fit.typ governs the whole document (see that file).
//
// Stacked title/subtitle groups go through `stack` with an explicit gap rather
// than `#v(.., weak: true)`. Weak spacing collapses against an adjoining block,
// which let a subtitle's line box ride up into the line above it — invisible in
// the source, obvious on the page. scripts/check-layout.mjs asserts against
// that geometry now, so these two constants are the knobs it holds.

// Gaps are set for the loosest-metric family in the pinned set (PT Serif,
// whose ascent/descent boxes run taller than Lato's at the same nominal size).
// Sizing them for the sans and letting the serif ride tight is how the header
// and the project subtitles ended up overlapping in the first place.
//
// Gap between the lines of a title/subtitle group.
#let STACK-GAP = 0.72em
// Gap under an oversized heading line, which needs to clear a much taller box.
#let HEADING-GAP = 1.1em

// A section rule. `on-rail` flips the palette for the coloured column.
#let section-head(theme, title, on-rail: false) = block(
  above: 1.05em, below: 0.5em, breakable: false,
)[
  #text(
    size: 1.12em,
    weight: "bold",
    tracking: 0.04em,
    fill: if on-rail { theme.rail-ink } else { theme.ink },
  )[#upper(title)]
  #v(0.2em, weak: true)
  #line(
    length: 100%,
    stroke: 0.06em + if on-rail { theme.rail-rule } else { theme.rule },
  )
]

#let bullets(items, fill: none) = {
  set text(fill: fill) if fill != none
  for item in items [ - #item ]
}

// One project. `premise` is the claim the entry exists to make; the bullets
// are the mechanism that cashes it out (see the workspace README).
#let project-entry(theme, item, bullet-count: 3) = block(
  below: 0.62em, breakable: false,
)[
  #stack(
    dir: ttb,
    spacing: STACK-GAP,
    text(size: 1.02em, weight: "bold", fill: theme.ink)[#item.name],
    text(size: 0.85em, fill: theme.muted)[#item.kind],
    text(size: 0.94em, style: "italic", fill: theme.accent)[#item.premise],
  )
  // Deliberately tighter than STACK-GAP: the bullets belong to the premise
  // above them, and a gap wider than the one *between* bullets reads as a
  // break rather than as continuation. The layout check enforces a floor, not
  // a ceiling — this one is a judgement call it cannot make.
  #v(0.3em)
  #bullets(item.bullets.slice(0, calc.min(bullet-count, item.bullets.len())))
]

// A plain project entry: name, kind, and bullets, with no italicized
// `premise` line. The premise is the architectural "why" — genuinely useful
// on the portfolio/rail templates, which have the room and audience for it,
// and dead weight on a plain ATS-submission template's tight word budget
// (the 2026-08-29 review named this specifically: "Remove the premise
// sentences ... from the submission version"). Everything else is identical
// to `project-entry` so the two stay visually consistent where they overlap.
#let project-entry-plain(theme, item, bullet-count: 3) = block(
  below: 0.62em, breakable: false,
)[
  #stack(
    dir: ttb,
    spacing: STACK-GAP,
    text(size: 1.02em, weight: "bold", fill: theme.ink)[#item.name],
    text(size: 0.85em, fill: theme.muted)[#item.kind],
  )
  #v(0.3em)
  #bullets(item.bullets.slice(0, calc.min(bullet-count, item.bullets.len())))
]

// Rail entry: a bold line plus a supporting sentence, matching the reference
// layout's achievement blocks.
#let rail-entry(theme, title, body) = block(below: 0.6em, breakable: false, stack(
  dir: ttb,
  spacing: STACK-GAP,
  text(size: 0.98em, weight: "bold", fill: theme.rail-ink)[#title],
  text(size: 0.88em, fill: theme.rail-muted)[#body],
))

// Bold label over a supporting line, at the tighter spacing the toolbox and
// repository blocks want.
#let rail-pair(theme, label, body, gap: STACK-GAP, below: 0.52em) = block(
  below: below, breakable: false, stack(
    dir: ttb,
    spacing: gap,
    text(size: 0.92em, weight: "bold", fill: theme.rail-ink)[#label],
    text(size: 0.86em, fill: theme.rail-muted)[#body],
  ),
)

// Proficiency dots, as in the reference's Languages block.
#let dots(theme, filled, total: 5) = {
  for i in range(total) {
    box(
      circle(
        radius: 0.16em,
        fill: if i < filled { theme.rail-ink } else { none },
        stroke: 0.05em + theme.rail-ink,
      ),
    )
    if i < total - 1 { h(0.16em) }
  }
}

#let rail-rated(theme, name, note, filled) = block(below: 0.34em)[
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    text(size: 0.92em, fill: theme.rail-ink)[#name],
    text(size: 0.8em, fill: theme.rail-muted)[#note],
  )
  #v(0.06em, weak: true)
  #dots(theme, filled)
]

// The avatar well. Falls back to initials so the document stays free of
// binary assets until a portrait is actually supplied.
#let avatar(theme, profile, size: 1.25in) = align(center)[
  #box(
    width: size,
    height: size,
    fill: theme.avatar-fill,
    stroke: 0.09em + theme.avatar-ring,
    radius: 50%,
    clip: true,
    align(
      center + horizon,
      if profile.photo == none {
        text(size: 2.2em, weight: "bold", fill: theme.rail-ink)[
          #profile.photo-placeholder
        ]
      } else {
        image(profile.photo, width: size, height: size, fit: "cover")
      },
    ),
  )
]

// `phone` defaults to `none` and is deliberately opt-in per call site,
// rather than read off `profile` the way email/github/portfolio are: it
// lives in src/data/personal.typ (not resume-profile) precisely so a
// caller can choose to include it. Only the ATS-submission templates
// (classic, safe, vanilla, conventional) pass it — the portfolio templates
// (rail, compact, via name-block below) do not, because their PDFs are the
// ones embedded and linked directly on the public website. See
// personal.typ's `phone` field comment for the public/submission split
// this implements.
#let contact-line(theme, profile, sep: "·", phone: none) = text(
  size: 0.86em, fill: theme.muted,
)[
  #profile.email
  #h(0.4em)#sep#h(0.4em) #profile.github
  #h(0.4em)#sep#h(0.4em) #profile.portfolio
  #if profile.location != none [
    #h(0.4em)#sep#h(0.4em) #profile.location
  ]
  #if phone != none [
    #h(0.4em)#sep#h(0.4em) #phone
  ]
]

#let name-block(theme, profile, focus, size: 2.1em) = stack(
  dir: ttb,
  // The name sets at 2.1em, so its line box is more than twice the height of
  // the two lines beneath it. A gap proportional to the *body* size is not
  // enough to clear it — this one is set against the name.
  spacing: HEADING-GAP,
  text(size: size, weight: "black", fill: theme.ink)[#upper(profile.name)],
  text(size: 1.05em, fill: theme.accent-soft)[
    #profile.title #h(0.4em)|#h(0.4em) #focus
  ],
  contact-line(theme, profile),
)

// The role line beneath an EXPERIENCE heading. Title left, dates right, and
// the organisation on its own line — the shape a résumé parser expects to find
// and the shape the reference layout uses.
#let engagement-head(theme, engagement) = block(below: 0.78em, breakable: false)[
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    text(size: 1.06em, weight: "bold", fill: theme.ink)[#engagement.role],
    text(size: 0.9em, fill: theme.muted)[#engagement.dates],
  )
  #v(STACK-GAP)
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    text(size: 0.94em, weight: "bold", fill: theme.accent)[#engagement.org],
    text(size: 0.86em, fill: theme.muted)[#engagement.note],
  )
]
