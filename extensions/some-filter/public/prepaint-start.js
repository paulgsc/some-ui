// document_start

// This file previously also captured a reference to the manifest-injected
// prepaint.css CSSStyleSheet object and exposed it on window for content.js
// to locate and disable. That mechanism is gone — see prepaint.ts for the
// full root-cause writeup. document.styleSheets never enumerated this sheet
// at all under Chrome MV3 content-script CSS injection (confirmed via a
// 60-frame polling probe, flat at 0 the entire time), even though the CSS
// rules themselves apply to the page correctly and fast (confirmed via a
// cascade-sentinel custom property going live within a single animation
// frame). Suppression now operates purely on this attribute; no sheet
// object is ever needed, so there is nothing left for this file to capture.

document.documentElement.setAttribute("data-sw-prepaint", "")
