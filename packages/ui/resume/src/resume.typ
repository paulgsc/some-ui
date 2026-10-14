// The résumé as one function of its inputs, so every entry point builds the
// same document:
//
//   src/main.typ         the public build: the four knobs as typst `--input`s
//                        and no PII.
//   a program on stdin   `compileWithPii` (scripts/typst.mjs), with PII (RP1).
//
// `args` is (variant, template, theme, font, pii), `pii` a dictionary of
// src/pii/envelope.json's fields or `none`.
#import "data/resume.typ": resume-compositions, resume-engagement, resume-highlights, resume-profile, resume-repositories, resume-toolbox
#import "data/personal.typ": personal
#import "theme/index.typ": resolve-font, resolve-theme
#import "lib/fit.typ": assert-one-page
#import "lib/pii.typ": read-pii
#import "templates/rail.typ"
#import "templates/classic.typ"
#import "templates/compact.typ"
#import "templates/vanilla.typ"
#import "templates/safe.typ"
#import "templates/conventional.typ"

#let templates = (
  rail: (render: rail.render, base: 8.9pt),
  classic: (render: classic.render, base: 9.6pt),
  compact: (render: compact.render, base: 8.7pt),
  vanilla: (render: vanilla.render, base: 9.4pt),
  safe: (render: safe.render, base: 9.5pt),
  conventional: (render: conventional.render, base: 9.5pt),
)

#let render-resume(args) = {
  let variant = args.variant
  let template-name = args.template
  let theme-name = args.theme
  let font-name = args.font
  // Never in `<resume-export>` below (src/lib/pii.typ).
  let pii = read-pii(args.at("pii", default: none), template-name)

  assert(
    variant in resume-compositions,
    message: "unknown variant '" + variant + "' — expected one of "
      + resume-compositions.keys().join(", "),
  )
  assert(
    template-name in templates,
    message: "unknown template '" + template-name + "' — expected one of "
      + templates.keys().join(", "),
  )

  let chosen = templates.at(template-name)

  set document(
    title: resume-profile.name + " — Résumé (" + variant + ")",
    author: resume-profile.name,
    keywords: ("software engineer", "Rust", "TypeScript", "backend", "full-stack", "developer platform"),
  )

  (chosen.render)((
    profile: resume-profile,
    personal: personal,
    pii: pii,
    composition: resume-compositions.at(variant),
    highlights: resume-highlights.at(variant),
    toolbox: resume-toolbox.at(variant),
    repositories: resume-repositories,
    engagement: resume-engagement,
    theme: resolve-theme(theme-name),
    font: resolve-font(font-name),
    base-size: chosen.base,
    variant: variant,
  ))

  assert-one-page(variant + "/" + template-name)

  // The same composition, exposed as data rather than as layout.
  //
  // `typst query` reads this back out, and scripts/export-data.mjs turns it into
  // the TypeScript the web reading view renders (src/react). That view exists
  // because a PDF does not render inline on mobile and the SVG export contains
  // no text at all — only glyph outlines — so neither can be read, selected, or
  // crawled on a phone. Deriving it from here is what keeps apps/www from
  // carrying its own hand-copied transcript of the résumé.
  //
  // Keys are camelCase because they cross into TypeScript. Everything here is
  // already defined above; nothing new is asserted.
  [#metadata((
    variant: variant,
    profile: (
      name: resume-profile.name,
      title: resume-profile.title,
      email: resume-profile.email,
      github: resume-profile.github,
      portfolio: resume-profile.portfolio,
      location: resume-profile.location,
    ),
    label: resume-compositions.at(variant).label,
    summary: resume-compositions.at(variant).summary,
    skills: resume-compositions.at(variant).skills,
    projects: resume-compositions.at(variant).projects,
    platform: resume-compositions.at(variant).platform,
    highlights: resume-highlights.at(variant),
    toolbox: resume-toolbox.at(variant),
    repositories: resume-repositories,
    engagement: resume-engagement,
    education: personal.education,
    languages: personal.languages,
    certifications: personal.certifications,
    interests: personal.interests,
    additionalExperience: personal.additional-experience,
  )) <resume-export>]
}
