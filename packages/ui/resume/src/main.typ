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
// Keeping them as inputs, rather than a source file per combination, is what
// lets the static build and the LAN render service share one template set:
// both call src/resume.typ. This entry never takes PII (RP1).
#import "resume.typ": render-resume

#render-resume((
  variant: sys.inputs.at("variant", default: "backend"),
  template: sys.inputs.at("template", default: "rail"),
  theme: sys.inputs.at("theme", default: "teal"),
  font: sys.inputs.at("font", default: "lato"),
  pii: none,
))
