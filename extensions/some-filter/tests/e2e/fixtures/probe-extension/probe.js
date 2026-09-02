// #1262 Gate 0, G0.4 — throwaway probe, never shipped, never wired into
// production. Runs at document_start in this content script's own isolated
// JS world (the standard WebExtension content-script model: the DOM is
// shared with the page, but the JS heap — including built-in prototypes
// like Element.prototype — is not) and patches Element.prototype.attachShadow
// there. If a page's own (main-world) script calling el.attachShadow(...)
// ever observes this patch, a marker attribute lands on <html>; if the two
// worlds' prototypes are genuinely independent (the expected result — see
// docs/gate0/1262-falsification-report.md's G0.4), the marker never
// appears, because the page's attachShadow call runs entirely against its
// own world's unpatched original.
;(function () {
  const original = Element.prototype.attachShadow
  let count = 0

  Element.prototype.attachShadow = function (...args) {
    count += 1
    document.documentElement.setAttribute(
      "data-probe-isolated-world-intercepted",
      String(count)
    )
    return original.apply(this, args)
  }
})()
