// The two-column engine shared by the `rail` and `compact` templates. The main
// column carries the narrative the résumé is arguing; the rail carries the same
// evidence in scannable form.
//
// Both columns are built as arrays of section blocks rather than as one run of
// content, so lib/fit.typ can measure them, solve a type scale for each, and
// spend whatever slack is left on the gaps between sections. That is the whole
// of the "one page, and a full one" behaviour — see lib/fit.typ.
//
// Templates supply `opts`; they do not re-implement any of this. Adding a
// layout that is a rearrangement rather than a different document should mean
// adding an options record, not another copy of the code below.
#import "parts.typ": avatar, bullets, engagement-head, name-block, project-entry, rail-entry, rail-pair, rail-rated, section-head
#import "fit.typ": fit-scale, fit-secondary, join-blocks, justify-blocks

// Geometry in absolute units: the fitting pass has to know the box it is
// solving for before anything is laid out.
#let PAGE-W = 8.5in
#let PAGE-H = 11in
#let DEFAULTS = (
  rail-frac: 0.34,
  rail-side: right,
  avatar: true,
  main-pad: (top: 0.40in, bottom: 0.34in, left: 0.46in, right: 0.30in),
  rail-pad: (top: 0.38in, bottom: 0.34in, left: 0.28in, right: 0.28in),
  // Bullets kept per project at a comfortable scale, and at a tight one.
  bullets: (3, 2),
  practice: (4, 3),
  rail-max-ratio: 1.18,
)

#let render(ctx, opts: (:)) = {
  let o = DEFAULTS + opts
  let RAIL-FRAC = o.rail-frac
  let MAIN-PAD = o.main-pad
  let RAIL-PAD = o.rail-pad
  let theme = ctx.theme
  let profile = ctx.profile
  let personal = ctx.personal
  let comp = ctx.composition

  let main-w = PAGE-W * (1 - RAIL-FRAC) - MAIN-PAD.left - MAIN-PAD.right
  let rail-w = PAGE-W * RAIL-FRAC - RAIL-PAD.left - RAIL-PAD.right
  let main-h = PAGE-H - MAIN-PAD.top - MAIN-PAD.bottom
  let rail-h = PAGE-H - RAIL-PAD.top - RAIL-PAD.bottom

  set page(
    paper: "us-letter",
    margin: 0pt,
    fill: theme.page-fill,
    background: place(
      o.rail-side + top,
      rect(width: RAIL-FRAC * 100%, height: 100%, fill: theme.rail-fill),
    ),
  )
  set text(font: ctx.font, fill: theme.ink, lang: "en")
  set par(justify: false, leading: 0.52em)
  set list(indent: 0.1em, body-indent: 0.6em, spacing: 0.34em, marker: [•])

  // The one place content volume responds to the solved scale: when a
  // composition is close to fitting, dropping the least load-bearing bullet
  // buys more page than another half point of type does.
  let bullet-budget(s) = if s > 0.9 { o.bullets.at(0) } else { o.bullets.at(1) }
  let practice-budget(s) = if s > 0.9 { o.practice.at(0) } else { o.practice.at(1) }

  let main-blocks(s) = {
    let out = (
      name-block(theme, profile, comp.label),
      [
        #section-head(theme)[Summary]
        #comp.summary
      ],
      [
        #section-head(theme)[Skills]
        #comp.skills
      ],
      [
        #section-head(theme)[Experience]
        #engagement-head(theme, ctx.engagement)
        #for item in comp.projects {
          project-entry(theme, item, bullet-count: bullet-budget(s))
        }
      ],
      [
        #section-head(theme)[Engineering practice]
        #bullets(comp.platform.slice(0, practice-budget(s)))
      ],
    )
    if personal.additional-experience.len() > 0 {
      out.push([
        #section-head(theme)[Additional experience]
        #for role in personal.additional-experience [
          #block(below: 0.5em, breakable: false)[
            #grid(
              columns: (1fr, auto),
              text(size: 1.02em, weight: "bold")[#role.role],
              text(size: 0.88em, fill: theme.muted)[#role.dates],
            )
            #text(size: 0.9em, weight: "bold", fill: theme.accent)[#role.org]
            #if role.detail != none [
              #text(size: 0.88em, fill: theme.muted)[ — #role.detail]
            ]
            #bullets(role.bullets)
          ]
        ]
      ])
    }
    if personal.education.len() > 0 {
      out.push([
        #section-head(theme)[Education]
        #for entry in personal.education [
          #block(below: 0.4em, breakable: false)[
            #grid(
              columns: (1fr, auto),
              text(size: 1.02em, weight: "bold")[#entry.credential],
              text(size: 0.88em, fill: theme.muted)[#entry.dates],
            )
            #text(size: 0.9em, weight: "bold", fill: theme.accent)[#entry.institution]
            #if entry.detail != none [
              #text(size: 0.88em, fill: theme.muted)[ — #entry.detail]
            ]
          ]
        ]
      ])
    }
    out
  }

  let rail-blocks(s) = {
    let out = if o.avatar { (avatar(theme, profile),) } else { () }
    out += (
      [
        #section-head(theme, on-rail: true)[Key achievements]
        #for item in ctx.highlights.slice(0, if s > 0.9 { 4 } else { 3 }) {
          rail-entry(theme, item.title, item.body)
        }
      ],
      [
        #section-head(theme, on-rail: true)[Technical toolbox]
        #for group in ctx.toolbox {
          rail-pair(theme, group.label, group.items, gap: 0.2em, below: 0.36em)
        }
      ],
      [
        #section-head(theme, on-rail: true)[Repositories]
        #for repo in ctx.repositories {
          rail-pair(theme, repo.name, repo.body, gap: 0.24em, below: 0.5em)
        }
      ],
    )
    if personal.languages.len() > 0 {
      out.push([
        #section-head(theme, on-rail: true)[Languages]
        #for lang in personal.languages {
          rail-rated(theme, lang.name, lang.note, lang.level)
        }
      ])
    }
    if personal.certifications.len() > 0 {
      out.push([
        #section-head(theme, on-rail: true)[Training / courses]
        #for cert in personal.certifications {
          rail-pair(theme, cert.name, cert.issuer + ", " + cert.year, below: 0.38em)
        }
      ])
    }
    if personal.interests.len() > 0 {
      out.push([
        #section-head(theme, on-rail: true)[Interests]
        #for topic in personal.interests {
          rail-entry(theme, topic.title, topic.body)
        }
      ])
    }
    out
  }

  context {
    let s = fit-scale(main-w, main-h, ctx.base-size, s => join-blocks(main-blocks(s)))
    let rail-s = fit-secondary(
      ctx.base-size,
      (width: rail-w, height: rail-h, render: s => join-blocks(rail-blocks(s))),
      s,
      max-ratio: o.rail-max-ratio,
    )
    let main-cell = pad(..MAIN-PAD, {
      set text(size: ctx.base-size * s)
      justify-blocks(main-blocks(s), main-w, main-h, max-gap: 14pt)
    })
    let rail-cell = pad(..RAIL-PAD, {
      set text(size: ctx.base-size * rail-s)
      justify-blocks(rail-blocks(rail-s), rail-w, rail-h, max-gap: 20pt)
    })
    if o.rail-side == left {
      grid(
        columns: (RAIL-FRAC * 100%, (1 - RAIL-FRAC) * 100%),
        column-gutter: 0pt,
        rail-cell,
        main-cell,
      )
    } else {
      grid(
        columns: ((1 - RAIL-FRAC) * 100%, RAIL-FRAC * 100%),
        column-gutter: 0pt,
        main-cell,
        rail-cell,
      )
    }
  }
}
