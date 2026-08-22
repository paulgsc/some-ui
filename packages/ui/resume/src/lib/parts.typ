// Rendering atoms shared by the templates. Everything is sized in `em` so the
// scale solved by lib/fit.typ governs the whole document (see that file).

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
  #text(size: 1.02em, weight: "bold", fill: theme.ink)[#item.name]
  #linebreak()
  #text(size: 0.85em, fill: theme.muted)[#item.kind]
  #v(0.12em, weak: true)
  #text(size: 0.94em, style: "italic", fill: theme.accent)[#item.premise]
  #v(0.1em, weak: true)
  #bullets(item.bullets.slice(0, calc.min(bullet-count, item.bullets.len())))
]

// Rail entry: a bold line plus a supporting sentence, matching the reference
// layout's achievement blocks.
#let rail-entry(theme, title, body) = block(below: 0.6em, breakable: false, stack(
  dir: ttb,
  spacing: 0.24em,
  text(size: 0.98em, weight: "bold", fill: theme.rail-ink)[#title],
  text(size: 0.88em, fill: theme.rail-muted)[#body],
))

// Bold label over a supporting line, at the tighter spacing the toolbox and
// repository blocks want.
#let rail-pair(theme, label, body, gap: 0.16em, below: 0.4em) = block(
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

#let contact-line(theme, profile, sep: "·") = text(
  size: 0.86em, fill: theme.muted,
)[
  #profile.email
  #h(0.4em)#sep#h(0.4em) #profile.github
  #h(0.4em)#sep#h(0.4em) #profile.portfolio
  #if profile.location != none [
    #h(0.4em)#sep#h(0.4em) #profile.location
  ]
]

#let name-block(theme, profile, focus, size: 2.1em) = [
  #text(size: size, weight: "black", fill: theme.ink)[#upper(profile.name)]
  #v(0.08em, weak: true)
  #text(size: 1.05em, fill: theme.accent-soft)[
    #profile.title #h(0.4em)|#h(0.4em) #focus
  ]
  #v(0.22em, weak: true)
  #contact-line(theme, profile)
]

// The role line beneath an EXPERIENCE heading. Title left, dates right, and
// the organisation on its own line — the shape a résumé parser expects to find
// and the shape the reference layout uses.
#let engagement-head(theme, engagement) = block(below: 0.5em, breakable: false)[
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    text(size: 1.06em, weight: "bold", fill: theme.ink)[#engagement.role],
    text(size: 0.9em, fill: theme.muted)[#engagement.dates],
  )
  #v(0.08em)
  #grid(
    columns: (1fr, auto),
    align: (left + horizon, right + horizon),
    text(size: 0.94em, weight: "bold", fill: theme.accent)[#engagement.org],
    text(size: 0.86em, fill: theme.muted)[#engagement.note],
  )
]
