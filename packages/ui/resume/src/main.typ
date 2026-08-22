// Entry point for every rendered résumé.
//
// Four independent axes, all supplied as typst `--input` values so nothing
// about a rendered document is hard-coded here:
//
//   variant   which composition (audience) is being argued
//   template  which layout renders it
//   theme     which palette the layout draws with
//   font      which pinned family it sets
//
// These are the same four knobs the eventual server-side renderer takes per
// request. Keeping them as inputs — rather than as separate source files per
// combination — is what makes the static build and a dynamic renderer able to
// share one template set.
#import "data/resume.typ": resume-compositions, resume-engagement, resume-highlights, resume-profile, resume-repositories, resume-toolbox
#import "data/personal.typ": personal
#import "theme/index.typ": resolve-font, resolve-theme
#import "lib/fit.typ": assert-one-page
#import "templates/rail.typ"
#import "templates/classic.typ"
#import "templates/compact.typ"

#let templates = (
  rail: (render: rail.render, base: 8.9pt),
  classic: (render: classic.render, base: 9.6pt),
  compact: (render: compact.render, base: 8.7pt),
)

#let variant = sys.inputs.at("variant", default: "backend")
#let template-name = sys.inputs.at("template", default: "rail")
#let theme-name = sys.inputs.at("theme", default: "teal")
#let font-name = sys.inputs.at("font", default: "lato")

#assert(
  variant in resume-compositions,
  message: "unknown variant '" + variant + "' — expected one of "
    + resume-compositions.keys().join(", "),
)
#assert(
  template-name in templates,
  message: "unknown template '" + template-name + "' — expected one of "
    + templates.keys().join(", "),
)

#let chosen = templates.at(template-name)

#set document(
  title: resume-profile.name + " — Résumé (" + variant + ")",
  author: resume-profile.name,
  keywords: ("software engineer", "Rust", "TypeScript", "backend", "distributed systems"),
)

#(chosen.render)((
  profile: resume-profile,
  personal: personal,
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

#assert-one-page(variant + "/" + template-name)
