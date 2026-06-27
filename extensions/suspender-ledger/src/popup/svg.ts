// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Parse a trusted, hardcoded SVG string into an importable DOM node.
 *
 * Using DOMParser (rather than `innerHTML`) keeps `web-ext lint` quiet: it
 * flags every `innerHTML` write as UNSAFE_VAR_ASSIGNMENT regardless of whether
 * the markup is dynamic. Only ever call this with literal SVG — never with a
 * user-controlled string.
 */
export function svgNode(markup: string): Node {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  return document.importNode(doc.documentElement, true)
}
