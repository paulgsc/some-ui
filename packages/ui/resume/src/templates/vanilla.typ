// `vanilla` — the plainest layout this package renders: left-aligned header,
// no rule under section headings, no grid-based date alignment, and no
// italicized project premise. `classic` is already a safe single-column
// choice; `vanilla` exists for the posting that routes through a parser old
// or strict enough that even a thin horizontal rule or a two-cell alignment
// grid is a risk worth not taking. Every affordance here is the most
// conservative form a text-only extractor could ask for.
#import "../lib/parts.typ": HEADING-GAP, bullets, contact-line, project-entry-plain
#import "../lib/fit.typ": fit-scale, join-blocks, justify-blocks

#let PAGE-W = 8.5in
#let PAGE-H = 11in
#let PAD = (top: 0.6in, bottom: 0.55in, left: 0.75in, right: 0.75in)

#let plain-head(theme, title) = block(
  above: 1.0em, below: 0.45em, breakable: false,
)[
  #text(size: 1.05em, weight: "bold", fill: theme.ink)[#upper(title)]
]

// Role/org/dates as three plain lines rather than a two-column grid — the
// same facts `engagement-head` (lib/parts.typ) renders, laid out so a
// parser never has to reconstruct a row from two cells.
#let plain-engagement(theme, engagement) = block(below: 0.7em, breakable: false)[
  #text(size: 1.04em, weight: "bold", fill: theme.ink)[#engagement.role]
  #linebreak()
  #text(size: 0.92em, fill: theme.muted)[#engagement.org, #engagement.dates]
  #linebreak()
  #text(size: 0.86em, fill: theme.muted)[#engagement.note]
]

#let plain-entry(theme, title, org, dates, detail: none, bullets-list: none) = block(
  below: 0.5em, breakable: false,
)[
  #text(size: 1.0em, weight: "bold")[#title]
  #linebreak()
  #text(size: 0.92em, fill: theme.muted)[#org, #dates]
  #if detail != none [
    #linebreak()
    #text(size: 0.88em, fill: theme.muted)[#detail]
  ]
  #if bullets-list != none {
    bullets(bullets-list)
  }
]

#let render(ctx) = {
  let theme = ctx.theme
  let profile = ctx.profile
  let personal = ctx.personal
  let comp = ctx.composition

  let body-w = PAGE-W - PAD.left - PAD.right
  let body-h = PAGE-H - PAD.top - PAD.bottom

  set page(paper: "us-letter", margin: 0pt, fill: theme.page-fill)
  set text(font: ctx.font, fill: theme.ink, lang: "en")
  set par(justify: false, leading: 0.68em)
  set list(indent: 0.1em, body-indent: 0.6em, spacing: 0.7em, marker: [-])

  let bullet-budget(s) = if s > 0.92 { 4 } else { 3 }
  let practice-budget(s) = if s > 0.92 { 5 } else { 4 }

  let blocks(s) = {
    let out = (
      stack(
        dir: ttb,
        spacing: HEADING-GAP,
        text(size: 1.9em, weight: "bold", fill: theme.ink)[#profile.name],
        text(size: 1.0em, fill: theme.muted)[#profile.title — #comp.label],
        contact-line(theme, profile, sep: "-", phone: personal.phone),
      ),
      [
        #plain-head(theme, "Summary")
        #comp.summary
      ],
      [
        #plain-head(theme, "Skills")
        #comp.skills
      ],
      [
        #plain-head(theme, "Experience")
        #plain-engagement(theme, ctx.engagement)
        #for item in comp.projects {
          project-entry-plain(theme, item, bullet-count: bullet-budget(s))
        }
      ],
      [
        #plain-head(theme, "Engineering practice")
        #bullets(comp.platform.slice(0, practice-budget(s)))
      ],
    )
    if personal.education.len() > 0 {
      out.push([
        #plain-head(theme, "Education")
        #for entry in personal.education {
          plain-entry(
            theme, entry.credential, entry.institution, entry.dates,
            detail: entry.detail,
          )
        }
      ])
    }
    if personal.additional-experience.len() > 0 {
      out.push([
        #plain-head(theme, "Additional experience")
        #for role in personal.additional-experience {
          plain-entry(
            theme, role.role, role.org, role.dates,
            detail: role.detail, bullets-list: role.bullets,
          )
        }
      ])
    }
    if personal.certifications.len() > 0 {
      out.push([
        #plain-head(theme, "Training / courses")
        #bullets(personal.certifications.map(c =>
          c.name + ", " + c.issuer + ", " + c.year))
      ])
    }
    if personal.languages.len() > 0 {
      out.push([
        #plain-head(theme, "Languages")
        #personal.languages.map(l => l.name + " (" + l.note + ")").join(", ")
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
