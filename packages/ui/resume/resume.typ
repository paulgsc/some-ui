// Presentation-only résumé template. All candidate facts and variant-specific
// content live in resume.data.typ.
#import "resume.data.typ": resume-profile, resume-compositions

#let variant = sys.inputs.at("variant", default: "backend")
#let selected = resume-compositions.at(variant, default: resume-compositions.backend)
#let teal = rgb("#006f70")
#let cyan = rgb("#00a8ad")
#let ink = rgb("#3d3d3d")
#let muted = rgb("#5c5c5c")
#let ats-terms = (
  "TypeScript", "data modeling", "production", "distributed", "asynchronous",
  "event-driven", "Docker/cloud infrastructure", "testing",
)
#let ats-text = selected.tagline + " " + selected.summary + " " + selected.skills
#for term in ats-terms {
  assert(ats-text.contains(term), message: variant + " composition is missing ATS qualification: " + term)
}

#set document(title: resume-profile.name + " — Résumé", author: resume-profile.name)
#set page(paper: "us-letter", margin: 0pt, fill: white)
#set text(font: "Libertinus Sans", size: 7.15pt, fill: ink, lang: "en")
#set par(justify: false, leading: 0.38em)
#set list(indent: 0.12em, body-indent: 0.65em, spacing: 0.08em, marker: [•])

#let section-head(title, light: false) = block(above: 0.55em, below: 0.24em)[
  #text(size: 10.5pt, weight: "regular", fill: if light { white } else { ink })[#upper(title)]
  #v(0.11em)
  #line(length: 100%, stroke: 0.55pt + if light { white } else { rgb("#b7b7b7") })
]

#let project-entry(item) = block(below: 0.26em)[
  #text(size: 8.2pt, weight: "bold")[#item.name]
  #h(0.35em)#text(size: 6.8pt, fill: muted)[#item.kind]
  #linebreak()
  #text(size: 7.1pt, style: "italic", fill: teal)[#item.premise]
  #for bullet in item.bullets.slice(0, 3) [
    - #bullet
  ]
]

#let sidebar-item(title, detail, symbol: [◇]) = block(below: 0.55em)[
  #grid(columns: (1.2em, 1fr), column-gutter: 0.25em,
    text(size: 8pt, weight: "bold", fill: white)[#symbol],
    [#text(size: 7.7pt, weight: "bold", fill: white)[#title]
     #v(0.12em)
     #text(size: 6.6pt, fill: rgb("#d6eeee"))[#detail]],
  )
]

#grid(
  columns: (66%, 34%),
  column-gutter: 0pt,
  // Main document column.
  box(height: 11in, inset: (top: 0.38in, right: 0.24in, bottom: 0.28in, left: 0.42in))[
    #block(height: 10.34in)[
      #text(size: 19pt, weight: "bold", fill: ink)[#upper(resume-profile.name)]
      #v(0.04em)
      #text(size: 9.2pt, fill: cyan)[#resume-profile.title #h(0.35em)|#h(0.35em) #selected.label]
      #v(0.18em)
      #text(size: 6.7pt, fill: muted)[
        #resume-profile.email #h(0.35em)·#h(0.35em) #resume-profile.github
        #h(0.35em)·#h(0.35em) #resume-profile.portfolio
        #h(0.35em)·#h(0.35em) #resume-profile.location
      ]

      #section-head[Summary]
      #selected.summary

      #section-head[Core capabilities]
      #selected.skills

      #section-head[Selected work — some-ui, sole engineer (2024 — Present)]
      #for item in selected.projects { project-entry(item) }

      #section-head[Platform, release, and engineering practice]
      #for bullet in selected.platform.slice(0, 3) [
        - #bullet
      ]
    ]
  ],
  // Teal information rail, inspired by the supplied two-column reference.
  box(height: 11in, fill: teal, inset: (top: 0.34in, right: 0.32in, bottom: 0.3in, left: 0.32in))[
    #align(center)[
      #box(
        width: 1.22in,
        height: 1.22in,
        fill: rgb("#00595a"),
        stroke: 1.2pt + rgb("#8ac6c7"),
        clip: true,
        radius: 50%,
        align(center + horizon,
          if resume-profile.photo == none {
            text(size: 20pt, weight: "bold", fill: white)[#resume-profile.photo-placeholder]
          } else {
            image(resume-profile.photo, width: 1.22in, height: 1.22in, fit: "cover")
          }
        ),
      )
      #v(0.18em)
      #text(size: 7pt, fill: rgb("#d6eeee"))[PROFILE]
    ]

    #section-head(light: true)[Languages]
    #for language in resume-profile.languages [
      #grid(columns: (1fr, auto),
        text(size: 7.2pt, fill: white)[#language.name],
        text(size: 6.8pt, fill: rgb("#d6eeee"))[#language.level],
      )
      #v(0.25em)
    ]

    #section-head(light: true)[Key achievements]
    #for achievement in resume-profile.achievements {
      sidebar-item(achievement.title, achievement.detail, symbol: [✦])
    }

    #section-head(light: true)[Interests]
    #for interest in resume-profile.interests {
      sidebar-item(interest.title, interest.detail)
    }
  ],
)

#context assert(counter(page).final().first() == 1, message: variant + " résumé composition exceeds one page")
