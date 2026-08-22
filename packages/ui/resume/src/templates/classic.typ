// `classic` — one column, one colour, no rail, no portrait.
//
// The two-column templates are better documents to read; this one is the
// better document to be *parsed*. Multi-column PDFs are where applicant
// tracking systems most often interleave the columns and destroy reading
// order, and a photograph is a liability in several hiring pipelines. When the
// posting routes through an unknown ATS, send this one.
#import "../lib/parts.typ": bullets, contact-line, engagement-head, project-entry, section-head
#import "../lib/fit.typ": fit-scale, join-blocks, justify-blocks

#let PAGE-W = 8.5in
#let PAGE-H = 11in
#let PAD = (top: 0.55in, bottom: 0.5in, left: 0.72in, right: 0.72in)

#let render(ctx) = {
  let theme = ctx.theme
  let profile = ctx.profile
  let personal = ctx.personal
  let comp = ctx.composition

  let body-w = PAGE-W - PAD.left - PAD.right
  let body-h = PAGE-H - PAD.top - PAD.bottom

  set page(paper: "us-letter", margin: 0pt, fill: theme.page-fill)
  set text(font: ctx.font, fill: theme.ink, lang: "en")
  set par(justify: false, leading: 0.5em)
  set list(indent: 0.1em, body-indent: 0.6em, spacing: 0.3em, marker: [•])

  let bullet-budget(s) = if s > 0.92 { 4 } else { 3 }
  let practice-budget(s) = if s > 0.92 { 5 } else { 4 }

  let blocks(s) = {
    let out = (
      align(center)[
        #text(size: 2.05em, weight: "bold", fill: theme.ink)[#upper(profile.name)]
        #v(0.16em, weak: true)
        #text(size: 1.02em, fill: theme.muted)[
          #profile.title #h(0.4em)|#h(0.4em) #comp.label
        ]
        #v(0.2em, weak: true)
        #contact-line(theme, profile, sep: "|")
      ],
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
        #section-head(theme)[Key achievements]
        #bullets(ctx.highlights.map(a => a.title + " — " + a.body))
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
            #text(size: 0.94em, weight: "bold", fill: theme.accent)[#role.org]
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
            #text(size: 0.94em, weight: "bold", fill: theme.accent)[#entry.institution]
            #if entry.detail != none [
              #text(size: 0.88em, fill: theme.muted)[ — #entry.detail]
            ]
          ]
        ]
      ])
    }
    if personal.certifications.len() > 0 {
      out.push([
        #section-head(theme)[Training / courses]
        #bullets(personal.certifications.map(c =>
          c.name + " — " + c.issuer + ", " + c.year))
      ])
    }
    if personal.languages.len() > 0 {
      out.push([
        #section-head(theme)[Languages]
        #personal.languages.map(l => l.name + " (" + l.note + ")").join(" · ")
      ])
    }
    out
  }

  context {
    let s = fit-scale(body-w, body-h, ctx.base-size, s => join-blocks(blocks(s)))
    pad(..PAD, {
      set text(size: ctx.base-size * s)
      justify-blocks(blocks(s), body-w, body-h, max-gap: 12pt)
    })
  }
}
