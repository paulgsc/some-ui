// document_start

document.documentElement.setAttribute("data-sw-prepaint", "")

// Chrome MV3 injects extension CSS with href=null in document.styleSheets, so
// URL-based detection in findPrepaintSheet() can't locate this sheet at runtime.
// Capture the reference here (document_start, before any page CSS loads) and
// expose it on window so content.js — same isolated world — can retrieve it.
window.__swPrepaintSheet =
  document.styleSheets.length > 0
    ? document.styleSheets[document.styleSheets.length - 1]
    : undefined
