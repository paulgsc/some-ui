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
#for term in ats-terms {
  assert(
    selected.skills.contains(term),
    message: variant + " composition is missing ATS qualification: " + term,
  )
}

#set document(title: "Paul Gathondu — Résumé", author: "Paul Gathondu")
#set page(paper: "us-letter", margin: (x: 1.65cm, y: 1.4cm))
#set text(font: "Libertinus Serif", size: 9.5pt, lang: "en")
#set par(justify: true, leading: 0.58em)
#set list(indent: 0.18em, spacing: 0.5em, marker: [•])

#let sectionhead(title) = block(sticky: true, above: 0.55em, below: 0.36em)[
  #text(size: 10.5pt, weight: "bold", tracking: 0.35pt)[#upper(title)]
  #line(length: 100%, stroke: 0.45pt + rgb("#bbbbbb"))
]

#let project-entry(item) = [
  #block(sticky: true, above: 0.7em, below: 0.28em)[
    #text(size: 10pt, weight: "bold")[#item.name]
    #h(0.4em)
    #text(size: 8.8pt, fill: rgb("#555555"))[#item.kind]
    #linebreak()
    #text(size: 9.1pt, style: "italic", fill: rgb("#3f3f3f"))[#item.premise]
  ]
  #for bullet in item.bullets [
    - #bullet
  ]
]

#align(center)[
  #text(size: 18.5pt, weight: "bold")[Paul Gathondu]
  #v(0.08em)
  #text(size: 9.3pt, fill: rgb("#4a4a4a"))[#selected.tagline]
  #v(0.13em)
  #text(size: 8.4pt)[
    paulgathondudev\@gmail.com #h(0.45em)·#h(0.45em)
    github.com/paulgsc #h(0.45em)·#h(0.45em)
    paulgsc.github.io/some-ui #h(0.45em)·#h(0.45em)
    github.com/paulgsc/some-ui
  ]
]

#sectionhead[Summary]
#selected.summary

#text(size: 9pt, weight: "bold")[Core capabilities:] #selected.skills

#sectionhead[Selected Work — some-ui, sole engineer (2024 — Present)]
#for item in selected.projects {
  project-entry(item)
}

#sectionhead[Platform, Release, and Engineering Practice]
#for bullet in selected.platform [
  - #bullet
]

// The page budget is a build invariant, not a visual-review suggestion. Typst
// aborts every variant whose laid-out document spills onto a second page.
#context assert(
  counter(page).final().first() == 1,
  message: variant + " résumé composition exceeds one page",
)
