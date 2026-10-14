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
// These are the same four knobs the LAN render service (scripts/serve.mjs)
// takes per request. Keeping them as inputs — rather than as separate source
// files per combination — is what lets the static build and that renderer
// share one template set: both call src/resume.typ. This entry takes no PII;
// the service passes it another way (see that file).
#import "resume.typ": render-resume

#render-resume((
  variant: sys.inputs.at("variant", default: "backend"),
  template: sys.inputs.at("template", default: "rail"),
  theme: sys.inputs.at("theme", default: "teal"),
  font: sys.inputs.at("font", default: "lato"),
  pii: none,
))
