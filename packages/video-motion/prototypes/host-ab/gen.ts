// Bakes the tin owlet (@some-ui/styles/brand/cast, unchanged) into a rig:
// the cast's own nodes, regrouped into named parts that move, plus the parts
// a host needs that the still drawing lacks (lids, a lower beak, two tin
// wings, a wind-up key bow that turns, and a few effect glyphs).
// Prototype only (HOST-AB): run from packages/video-motion with tsx.
import { writeFileSync } from "node:fs"
import { castNodes, nodesText } from "@some-ui/styles/brand/cast"
import type { CastNode } from "@some-ui/styles/brand/cast"

const out = process.argv[2]!
const P = "h" // id prefix
const id = (n: string) => `${P}-${n}`
const all = castNodes("tin-owlet", id)
const txt = (nodes: ReadonlyArray<CastNode>) =>
  nodesText(nodes, { ground: "none", glow: false })
const pick = (...ix: number[]) => ix.map((i) => all[i]!)
const range = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => a + i)

const TIN = `url(#${id("tin")})`
const BRASS = `url(#${id("brass")})`

// lids: a tin shutter over each lens, clipped to the lens rim
const lid = (side: "l" | "r", cx: number) => `
  <clipPath id="${id(`clip-${side}`)}"><circle cx="${cx}" cy="41" r="7.25"/></clipPath>
  <g clip-path="url(#${id(`clip-${side}`)})">
    <g data-part="lid-${side}" data-cx="${cx}">
      <rect x="${cx - 11}" y="14" width="22" height="20" fill="${TIN}"/>
      <rect x="${cx - 11}" y="14" width="22" height="20" fill="url(#${id("tin-shade")})"/>
      <line x1="${cx - 11}" y1="34" x2="${cx + 11}" y2="34" stroke="#55626f" stroke-width="1.1"/>
    </g>
    <g data-part="low-${side}">
      <ellipse cx="${cx}" cy="58" rx="12" ry="9" fill="${TIN}"/>
      <ellipse cx="${cx}" cy="58" rx="12" ry="9" fill="none" stroke="#55626f" stroke-width="1.1"/>
    </g>
  </g>`

// A wing drawn along +x from its pivot; rotated to aim.
const wingShape = `
  <path d="M-1 -4.6C7 -7 19 -6 27 -1.2C28.6 0 28.6 0.8 27 1.6C19 6 7 6.6 -1 4.6Z" fill="${TIN}"/>
  <path d="M-1 -4.6C7 -7 19 -6 27 -1.2C28.6 0 28.6 0.8 27 1.6C19 6 7 6.6 -1 4.6Z" fill="url(#${id("tin-shade")})"/>
  <path d="M-1 -4.6C7 -7 19 -6 27 -1.2C28.6 0 28.6 0.8 27 1.6C19 6 7 6.6 -1 4.6Z" fill="none" stroke="#6f7d8b" stroke-width="0.8"/>
  <path d="M8 -1.6H22M8 1.8H20" stroke="#7c8a98" stroke-width="0.8" stroke-linecap="round"/>
  <circle cx="0" cy="0" r="2.4" fill="#7c8a98"/><circle cx="-0.6" cy="-0.6" r="0.9" fill="#fff" opacity="0.8"/>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-22 -30 140 140" class="rig">
<defs>
  ${txt(pick(0, 1))}
  <radialGradient id="${id("steam")}" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
</defs>
<g data-part="shadow">${txt(pick(4))}</g>
<g data-part="bob">
  <path d="M72 46H80" stroke="${BRASS}" stroke-width="3.4" stroke-linecap="round"/>
  <g transform="translate(80.5 46)"><g data-part="key-bow">
    <ellipse cx="0" cy="-4.4" rx="2.8" ry="3.8" fill="none" stroke="${BRASS}" stroke-width="2.3"/>
    <ellipse cx="0" cy="4.4" rx="2.8" ry="3.8" fill="none" stroke="${BRASS}" stroke-width="2.3"/>
    <circle cx="0" cy="0" r="2" fill="${BRASS}"/>
  </g></g>
  <g transform="translate(36 25)"><g data-part="tuft-l"><path d="M-6 -7L0 0" stroke="#8b99a7" stroke-width="3" stroke-linecap="round"/></g></g>
  <g transform="translate(60 25)"><g data-part="tuft-r"><path d="M6 -7L0 0" stroke="#8b99a7" stroke-width="3" stroke-linecap="round"/></g></g>
  <g data-part="body">${txt(pick(...range(7, 20)))}</g>
  <g data-part="face">
    ${txt(pick(21, 22, 23))}
    <g data-part="iris-l" data-cx="38.5">${txt(pick(24, 25, 26))}</g>
    ${txt(pick(27))}
    ${txt(pick(28, 29, 30))}
    <g data-part="iris-r" data-cx="57.5">${txt(pick(31, 32, 33))}</g>
    ${txt(pick(34))}
    ${lid("l", 38.5)}
    ${lid("r", 57.5)}
    <g data-part="mouth"><ellipse cx="48" cy="53.2" rx="3.1" ry="2.6" fill="#1a1410"/></g>
    <g data-part="beak-low"><path d="M45.4 52.6L50.6 52.6L48 56.6Z" fill="#a9853f"/></g>
    ${txt(pick(35, 36))}
  </g>
  ${txt(pick(37, 38, 39))}
  <g data-part="wing-l-pivot" transform="translate(27 60)"><g data-part="wing-l">${wingShape}</g></g>
  <g data-part="wing-r-pivot" transform="translate(69 60)"><g data-part="wing-r">${wingShape}</g></g>
</g>
<g data-part="fx-sweat" opacity="0"><path d="M0 -5C2.6 -1 3.6 1.2 3.6 2.6A3.6 3.6 0 0 1 -3.6 2.6C-3.6 1.2 -2.6 -1 0 -5Z" fill="#9fdcff" stroke="#e8f7ff" stroke-width="0.6"/><ellipse cx="-1.2" cy="1.6" rx="0.9" ry="1.3" fill="#fff" opacity="0.8"/></g>
<g data-part="fx-steam" opacity="0">
  <circle cx="26" cy="8" r="5" fill="url(#${id("steam")})"/><circle cx="70" cy="8" r="5" fill="url(#${id("steam")})"/>
  <circle cx="22" cy="2" r="3.6" fill="url(#${id("steam")})"/><circle cx="74" cy="2" r="3.6" fill="url(#${id("steam")})"/>
</g>
<g data-part="fx-spark" opacity="0">
  <path d="M0 -6L1.4 -1.4L6 0L1.4 1.4L0 6L-1.4 1.4L-6 0L-1.4 -1.4Z" fill="#fff6c8"/>
</g>
<g data-part="fx-spark2" opacity="0">
  <path d="M0 -4L1 -1L4 0L1 1L0 4L-1 1L-4 0L-1 -1Z" fill="#fff6c8"/>
</g>
<g data-part="fx-q" opacity="0"><text x="0" y="0" font-family="Display" font-weight="800" font-size="18" fill="#4ff0d8" text-anchor="middle">?</text></g>
<g data-part="fx-bang" opacity="0"><text x="0" y="0" font-family="Display" font-weight="800" font-size="18" fill="#ffd27a" text-anchor="middle">!</text></g>
</svg>`

writeFileSync(out, svg.replace(/\n\s*/g, "\n"))
console.log(`wrote ${out}: ${svg.length} chars`)
