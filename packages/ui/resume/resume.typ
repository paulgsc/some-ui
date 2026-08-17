// One-page résumé renderer. The durable evidence and coherent alternative
// compositions live in resume.meta.typ; `variant` selects one whole composition
// at compile time. Individual bullets are never shuffled independently.
#import "resume.meta.typ": resume-compositions

#let variant = sys.inputs.at("variant", default: "backend")
#let selected = resume-compositions.at(variant, default: resume-compositions.backend)
#let ats-terms = (
  "TypeScript",
  "data modeling",
  "production",
  "distributed",
  "asynchronous",
  "event-driven",
  "Docker/cloud infrastructure",
  "testing",
)
#let ats-text = (
  selected.tagline
  + " "
  + selected.summary
  + " "
  + selected.skills
)
#for term in ats-terms {
  assert(
    ats-text.contains(term),
    message: variant + " composition is missing ATS qualification: " + term,
  )
}
#let evidence-count = selected.projects.fold(
  0,
  (total, project) => total + project.bullets.len(),
) + selected.platform.len()
#assert(
  evidence-count >= 15,
  message: variant + " composition is too sparse for the 95% page-density target",
)

#set document(title: "Paul Gathondu — Résumé", author: "Paul Gathondu")
#set page(paper: "us-letter", margin: (x: 1.15cm, y: 1.05cm))
#set text(font: "Libertinus Serif", size: 8.2pt, lang: "en")
#set par(justify: true, leading: 0.42em)
#set list(indent: 0.14em, spacing: 0.2em, marker: [•])

#let sectionhead(title) = block(sticky: true, above: 0.36em, below: 0.2em)[
  #text(size: 9.5pt, weight: "bold", tracking: 0.3pt)[#upper(title)]
  #line(length: 100%, stroke: 0.45pt + rgb("#bbbbbb"))
]

#let project-entry(item) = [
  #block(sticky: true, above: 0.4em, below: 0.16em)[
    #text(size: 9pt, weight: "bold")[#item.name]
    #h(0.4em)
    #text(size: 7.8pt, fill: rgb("#555555"))[#item.kind]
    #linebreak()
    #text(size: 8pt, style: "italic", fill: rgb("#3f3f3f"))[#item.premise]
  ]
  #for bullet in item.bullets [
    - #bullet
  ]
]

// The catalogue supplies the meat; this fixed-height composition frame spends
// exactly 95% of the printable column on it. Fractional gaps distribute only
// the space left after layout, so dense variants collapse to their minimum
// rhythm while shorter variants cannot leave an accidental half-page void.
#block(height: 95%)[
  #align(center)[
    #text(size: 17pt, weight: "bold")[Paul Gathondu]
    #v(0.08em)
    #text(size: 8.5pt, fill: rgb("#4a4a4a"))[#selected.tagline]
    #v(0.13em)
    #text(size: 7.7pt)[
      paulgathondudev\@gmail.com #h(0.45em)·#h(0.45em)
      github.com/paulgsc #h(0.45em)·#h(0.45em)
      paulgsc.github.io/some-ui #h(0.45em)·#h(0.45em)
      github.com/paulgsc/some-ui
    ]
  ]

  #v(1fr)
  #sectionhead[Summary]
  #selected.summary

  #v(1fr)
  #text(size: 8pt, weight: "bold")[Core capabilities:] #selected.skills

  #v(1fr)
  #sectionhead[Selected Work — some-ui, sole engineer (2024 — Present)]
  #for item in selected.projects {
    project-entry(item)
    v(1fr)
  }

  #sectionhead[Platform, Release, and Engineering Practice]
  #for bullet in selected.platform [
    - #bullet
  ]
]

// The page budget is a build invariant, not a visual-review suggestion. Typst
// aborts every variant whose laid-out document spills onto a second page.
#context assert(
  counter(page).final().first() == 1,
  message: variant + " résumé composition exceeds one page",
)
