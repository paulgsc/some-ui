// `conventional` — the traditional reverse-chronological format most
// recruiters and older parsers were built around: a left-aligned header (no
// centered name block), Education sitting with Experience rather than
// pulled into a separate section, and no "Key achievements" or "Engineering
// practice" section at all — a traditional résumé folds everything into
// Experience bullets and Skills, not a bespoke section a template author
// invented. Skills stays ahead of Experience regardless (see the comment at
// that block below — it's what scripts/check-ats.mjs checks across every
// template). Ruled section heads and grid-aligned dates are kept (see
// `safe.typ`'s comment: that pattern is not what trips up
// applicant-tracking parsers), but the project premise is dropped, same as
// `safe`.
#import "../lib/parts.typ": HEADING-GAP, bullets, contact-line, engagement-head, project-entry-plain, section-head
#import "../lib/fit.typ": fit-scale, join-blocks, justify-blocks

#let PAGE-W = 8.5in
#let PAGE-H = 11in
#let PAD = (top: 0.6in, bottom: 0.5in, left: 0.75in, right: 0.75in)

#let render(ctx) = {
  let theme = ctx.theme
  let profile = ctx.profile
  let personal = ctx.personal
  let comp = ctx.composition

  let body-w = PAGE-W - PAD.left - PAD.right
  let body-h = PAGE-H - PAD.top - PAD.bottom

  set page(paper: "us-letter", margin: 0pt, fill: theme.page-fill)
  set text(font: ctx.font, fill: theme.ink, lang: "en")
  // PT Serif carries taller ascent/descent than the sans families — see
  // classic.typ's identical note; this template pins the same font.
  set par(justify: false, leading: 0.68em)
  set list(indent: 0.1em, body-indent: 0.6em, spacing: 0.75em, marker: [•])

  let bullet-budget(s) = if s > 0.92 { 4 } else { 3 }

  let blocks(s) = {
    let out = (
      stack(
        dir: ttb,
        spacing: HEADING-GAP,
        text(size: 1.9em, weight: "bold", fill: theme.ink)[#profile.name],
        text(size: 1.0em, fill: theme.muted)[#profile.title — #comp.label],
        contact-line(theme, profile, sep: "·", phone: personal.phone),
      ),
      [
        #section-head(theme)[Summary]
        #comp.summary
      ],
      // Skills stays ahead of Experience even in this otherwise traditional
      // ordering: scripts/check-ats.mjs enforces Summary -> Skills ->
      // Experience as the reading order across every template, since that is
      // the order a parser is checked against regardless of how a given
      // template otherwise arranges Education or a platform-practice
      // section. What actually reads as "traditional" here is Education
      // sitting with Experience rather than off in a separate achievements
      // section — not a Skills/Experience swap that would just break parity
      // with the other five templates for no real ATS benefit.
      [
        #section-head(theme)[Skills]
        #comp.skills
      ],
      [
        #section-head(theme)[Experience]
        #engagement-head(theme, ctx.engagement)
        #for item in comp.projects {
          project-entry-plain(theme, item, bullet-count: bullet-budget(s))
        }
      ],
    )
    if personal.additional-experience.len() > 0 {
      out.push([
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
