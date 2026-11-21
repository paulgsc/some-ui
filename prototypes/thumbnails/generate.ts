/**
 * Thumbnail prototypes (#3361, THUMB round; scratch, never merges).
 *
 * Four template directions, each drawn for every genre in GENRE_PAINT with a
 * short (real or plausible) title and a long one, as 1280×720 PNGs (YouTube's
 * size) and a 320×180 check, plus one contact sheet per direction. Run from
 * the repo root:
 *
 *   NODE_PATH=$(npm root -g) node_modules/.bin/tsx prototypes/thumbnails/generate.ts
 *
 * Everything that decides the bytes is an input here: the cast (cast.ts),
 * the mark (mark.ts), the paint (copied from genre-thumbs.tsx), the titles,
 * and two pinned fonts from @fontsource (Barlow Condensed 5.3.0, JetBrains
 * Mono 5.3.0) embedded as data URLs, so no system font is reached. Run twice:
 * it writes hashes.txt and compares against the previous run's.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  castNodes,
  type CastNode,
  type Character,
} from "../../packages/some-styles/src/brand/cast"
import {
  MOCHI_BODY,
  MOCHI_CHEEK,
  MOCHI_FACE,
} from "../../packages/some-styles/src/brand/mark"
import { CASES, GENRES, SHAPES, type Genre } from "./genres"

// Playwright as this sandbox installs it (globally; `require` honours NODE_PATH).
const { chromium } = createRequire(import.meta.url)(
  "playwright"
) as typeof import("playwright")

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, "out")
const FONTS = join(HERE, "../../node_modules/.pnpm")

const font = (pkg: string, file: string): string =>
  `data:font/woff2;base64,${readFileSync(
    join(FONTS, pkg, "node_modules/@fontsource", file)
  ).toString("base64")}`

const FONT_CSS = `
@font-face{font-family:"Barlow Condensed";font-weight:800;src:url(${font("@fontsource+barlow-condensed@5.3.0", "barlow-condensed/files/barlow-condensed-latin-800-normal.woff2")}) format("woff2")}
@font-face{font-family:"Barlow Condensed";font-weight:600;src:url(${font("@fontsource+barlow-condensed@5.3.0", "barlow-condensed/files/barlow-condensed-latin-600-normal.woff2")}) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:600;src:url(${font("@fontsource+jetbrains-mono@5.3.0", "jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2")}) format("woff2")}
`

// ── drawing helpers ────────────────────────────────────────────────────────

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

/**
 * The stage's square key-light glow reads as a box on a thumbnail's ground,
 * so it is left out here; the shadow under a character stays.
 */
const drawn = (c: CastNode): boolean =>
  !(c.tag === "rect" && String(c.attrs.fill ?? "").endsWith("-glow)"))

const nodeSvg = (n: CastNode, ground: string): string => {
  const attrs = { ...n.attrs } as Record<string, string | number>
  if (attrs["data-ground"] === "true") {
    delete attrs["data-ground"]
    attrs.fill = ground
  }
  const a = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join("")
  const kids = (n.children ?? [])
    .filter(drawn)
    .map((c) => nodeSvg(c, ground))
    .join("")
  return `<${n.tag}${a}>${kids}</${n.tag}>`
}

/** A character as an <svg>, its ground transparent unless given. */
const character = (
  who: Character,
  key: string,
  {
    size,
    ground = "transparent",
    flip = false,
  }: { size: number; ground?: string; flip?: boolean }
): string => {
  const body = castNodes(who, (name) => `${key}-${who}-${name}`)
    .filter(drawn)
    .map((n) => nodeSvg(n, ground))
    .join("")
  const inner = flip
    ? `<g transform="translate(96 0) scale(-1 1)">${body}</g>`
    : body
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}">${inner}</svg>`
}

/** The flat mark (for the badge), in `brand` with `ink` for its face. */
const mark = (size: number, brand: string, ink: string): string =>
  `<svg viewBox="0 0 64 64" width="${size}" height="${size}"><path d="${MOCHI_BODY}" fill="${brand}"/><ellipse cx="19.5" cy="38.5" rx="3.4" ry="2.2" fill="${MOCHI_CHEEK}" opacity="0.7"/><ellipse cx="44.5" cy="38.5" rx="3.4" ry="2.2" fill="${MOCHI_CHEEK}" opacity="0.7"/><path d="${MOCHI_FACE}" fill="${ink}"/></svg>`

/** A tiny tin-bird glyph for a badge: the sparrow's head, flat, in one colour. */
const birdGlyph = (size: number, colour: string): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path d="M12 5c-4 0-7 3-7 7 0 2 1 4 2 5l1 3h8l1-3c1-1 2-3 2-5 0-4-3-7-7-7z" fill="${colour}"/><path d="M12 5c0-2 1-3 3-3" fill="none" stroke="${colour}" stroke-width="1.6" stroke-linecap="round"/><circle cx="9.5" cy="11" r="1.7" fill="#0000"/><circle cx="9.5" cy="11" r="1.6" fill="#1118"/><circle cx="14.5" cy="11" r="1.9" fill="#1118"/><path d="M11 14h2.4l-1.2 2z" fill="#1118"/></svg>`

// ── the directions ─────────────────────────────────────────────────────────

type Cast = ReadonlyArray<Character>
type Input = { genre: Genre; title: string; cast: Cast }
type Direction = {
  id: string
  name: string
  css: string
  body: (i: Input) => string
}

const hasOwner = (cast: Cast): boolean => cast.includes("mochi")
const birds = (cast: Cast): Cast => cast.filter((c) => c !== "mochi")

/** Who speaks, in words: the badge's text, the same rule for every genre. */
const voiceWords = (cast: Cast): string =>
  hasOwner(cast) ? "My voice + a synthetic voice" : "Synthetic voice"

const shape = (g: Genre, { opacity = 1 } = {}): string => {
  const { hue, ground } = GENRES[g]
  return `<svg viewBox="0 0 320 180" width="100%" height="100%" style="opacity:${opacity}">${SHAPES[g](hue, `${hue}55`, ground)}</svg>`
}

const BASE = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:720px;overflow:hidden}
.t{position:absolute;inset:0;overflow:hidden}
.title{font-family:"Barlow Condensed";font-weight:800;line-height:.95;letter-spacing:-.005em;text-wrap:balance}
.label{font-family:"Barlow Condensed";font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.mono{font-family:"JetBrains Mono";font-weight:600}
`

/**
 * C2's constant band: the tin birds' own steel, a colour no genre takes
 * (and neither sky nor leaf, which mean status, C410), so the band itself
 * says "synthetic voice" on every video.
 */
const TIN_BAND = { band: "#c3ccd6", ink: "#1c232b" } as const

/**
 * C2 (the owner's pick, Nov 21): C's upper area (the genre shape behind the
 * title) over a D-style footer band, a solid field with a hard edge, 20% of
 * the height, holding the cast and the voice words. `paint` picks the band.
 */
const c2 = (
  id: string,
  name: string,
  paint: (g: Genre) => { band: string; ink: string }
): Direction => ({
  id,
  name,
  css: `
.shape{position:absolute;right:-30px;top:6px;width:600px;height:338px}
.text{position:absolute;left:64px;width:660px;top:44px;bottom:184px;display:flex;flex-direction:column;justify-content:flex-end;gap:16px}
.fit{max-height:420px}
.genre{font-size:38px}
.band{position:absolute;left:0;right:0;bottom:0;height:144px;display:flex;align-items:center;padding:0 48px 0 40px;gap:18px}
.band .who{display:flex;align-items:center;gap:0}
.voice{display:flex;flex-direction:column;gap:4px}
.voice .big{font-size:60px;line-height:.95}
.voice .small{font-size:28px}
.owner{margin-left:auto;display:flex;align-items:center;gap:10px}
.owner .big{font-size:60px;line-height:.95}
`,
  body: ({ genre, title, cast }) => {
    const { hue, ground } = GENRES[genre]
    const { band, ink } = paint(genre)
    const bird = birds(cast)
    return `<div class="t" style="background:${ground}">
<div class="shape">${shape(genre, { opacity: 0.55 })}</div>
<div class="text">
<div class="label genre" style="color:${hue}">${esc(GENRES[genre].name)}</div>
<div class="title fit" data-max="124" data-min="62" style="color:#f6efe2;text-shadow:0 4px 0 ${ground}">${esc(title)}</div>
</div>
<div class="band" style="background:${band};color:${ink}">
<div class="who">${bird.map((c, i) => character(c, `${id}${i}`, { size: 132 })).join("")}</div>
<div class="voice"><div class="title big">SYNTHETIC VOICE</div><div class="mono small">voiced by ${bird.length > 1 ? "tin birds" : "a tin bird"}</div></div>
${hasOwner(cast) ? `<div class="owner">${character("mochi", `${id}m`, { size: 132 })}<div class="title big">+ ME</div></div>` : ""}
</div></div>`
  },
})

const DIRECTIONS: ReadonlyArray<Direction> = [
  {
    id: "a-stage-left",
    name: "A · Stage left: the cast speaks, nothing else says so",
    css: `
.stage{position:absolute;left:0;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:0}
.stage .row{display:flex;align-items:flex-end;justify-content:center}
.glow{position:absolute;left:-120px;top:60px;width:700px;height:600px;border-radius:50%}
.text{position:absolute;left:470px;right:64px;top:72px;bottom:72px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.fit{max-height:470px}
.genre{font-size:40px}
`,
    body: ({ genre, title, cast }) => {
      const { hue, ground } = GENRES[genre]
      const size = cast.length > 1 ? 250 : 340
      return `<div class="t" style="background:${ground}">
<div class="glow" style="background:radial-gradient(closest-side, ${hue}33, ${hue}00)"></div>
<div class="stage"><div class="row">${cast
        .map((c, i) =>
          character(c, `a${i}`, {
            size,
            flip: c !== "mochi" && cast.length > 1,
          })
        )
        .join("")}</div></div>
<div class="text">
<div class="label genre" style="color:${hue}">${esc(GENRES[genre].name)}</div>
<div class="title fit" data-max="128" data-min="64" style="color:#f6efe2">${esc(title)}</div>
</div></div>`
    },
  },
  {
    id: "b-centre-badge",
    name: "B · Centred cast, constant badge in words",
    css: `
.cast{position:absolute;left:0;right:0;top:104px;display:flex;justify-content:center;gap:8px}
.text{position:absolute;left:90px;right:90px;top:340px;bottom:100px;display:flex;align-items:center;justify-content:center;text-align:center}
.fit{max-height:280px;width:100%}
.badge{position:absolute;right:36px;top:36px;display:flex;align-items:center;gap:12px;padding:12px 22px 12px 16px;border-radius:999px;font-size:44px}
.genre{position:absolute;left:0;right:0;bottom:44px;text-align:center;font-size:38px}
.rule{position:absolute;left:0;right:0;bottom:0;height:14px}
`,
    body: ({ genre, title, cast }) => {
      const { hue, ground } = GENRES[genre]
      return `<div class="t" style="background:radial-gradient(ellipse at 50% 30%, ${hue}26, ${ground} 62%) ${ground}">
<div class="cast">${cast
        .map((c, i) => character(c, `b${i}`, { size: 240 }))
        .join("")}</div>
<div class="badge mono" style="background:#f6efe2;color:${ground}">${birdGlyph(56, ground)}<span>${esc(voiceWords(cast).toUpperCase())}</span></div>
<div class="text"><div class="title fit" data-max="118" data-min="60" style="color:#f6efe2">${esc(title)}</div></div>
<div class="label genre" style="color:${hue}">${esc(GENRES[genre].name)}</div>
<div class="rule" style="background:${hue}"></div>
</div>`
    },
  },
  {
    id: "c-shape-and-bird",
    name: "C · Genre shape behind, tin bird with its words",
    css: `
.shape{position:absolute;right:-30px;top:10px;width:600px;height:338px}
.text{position:absolute;left:64px;width:640px;top:60px;bottom:220px;display:flex;flex-direction:column;justify-content:flex-end;gap:18px}
.fit{max-height:380px}
.genre{font-size:38px}
.foot{position:absolute;left:0;right:0;bottom:0;height:200px;display:flex;align-items:flex-end;padding:0 40px 22px 56px;gap:18px}
.foot .who{display:flex;align-items:flex-end}
.say{font-size:46px;line-height:1.1;padding-bottom:36px}
.say b{display:block;font-size:28px;opacity:.75;font-weight:600}
.owner{margin-left:auto;display:flex;align-items:flex-end;gap:12px;padding-bottom:18px}
`,
    body: ({ genre, title, cast }) => {
      const { hue, ground } = GENRES[genre]
      const bird = birds(cast)
      return `<div class="t" style="background:${ground}">
<div class="shape">${shape(genre, { opacity: 0.55 })}</div>
<div class="text">
<div class="label genre" style="color:${hue}">${esc(GENRES[genre].name)}</div>
<div class="title fit" data-max="124" data-min="62" style="color:#f6efe2;text-shadow:0 4px 0 ${ground}">${esc(title)}</div>
</div>
<div class="foot" style="background:linear-gradient(${ground}00, ${ground} 40%)">
<div class="who">${bird.map((c, i) => character(c, `c${i}`, { size: 190 })).join("")}</div>
<div class="say mono" style="color:${hue}"><b style="color:#f6efe2">VOICED BY</b>${bird.length > 1 ? "tin birds" : "a tin bird"} · synthetic</div>
${hasOwner(cast) ? `<div class="owner">${character("mochi", "cm", { size: 150 })}<div class="say mono" style="color:#f6efe2;padding-bottom:30px"><b>AND</b>me</div></div>` : ""}
</div></div>`
    },
  },
  {
    id: "d-banner",
    name: "D · Title on top, a hue banner holds cast, shape and words",
    css: `
.text{position:absolute;left:64px;right:64px;top:48px;height:420px;display:flex;align-items:center}
.fit{max-height:420px;width:100%}
.banner{position:absolute;left:0;right:0;bottom:0;height:200px;display:flex;align-items:center;padding:0 40px 0 24px;gap:8px}
.banner .who{display:flex;align-items:flex-end;margin-top:-90px}
.icon{width:224px;height:126px;margin-left:auto;border-radius:16px;overflow:hidden}
.words{display:flex;flex-direction:column;gap:6px;margin-left:16px}
.words .g{font-size:64px;line-height:1}
.words .v{font-size:38px}
`,
    body: ({ genre, title, cast }) => {
      const { hue, ground } = GENRES[genre]
      return `<div class="t" style="background:${ground}">
<div class="text"><div class="title fit" data-max="140" data-min="64" style="color:#f6efe2">${esc(title)}</div></div>
<div class="banner" style="background:${hue}">
<div class="who">${cast
        .map((c, i) =>
          character(c, `d${i}`, { size: 230, ground: "transparent" })
        )
        .join("")}</div>
<div class="words" style="color:${ground}"><div class="label g">${esc(GENRES[genre].name)}</div><div class="mono v">${esc(voiceWords(cast).toLowerCase())}</div></div>
<div class="icon" style="background:${ground}">${shape(genre)}</div>
</div></div>`
    },
  },
  c2(
    "c2a-hue-band",
    "C2a · C's upper area, a band in the genre's hue",
    (g) => ({
      band: GENRES[g].hue,
      ink: GENRES[g].ground,
    })
  ),
  c2(
    "c2b-tin-band",
    "C2b · C's upper area, one tin-steel band on every video",
    () => TIN_BAND
  ),
]

// ── the page and its title fit ─────────────────────────────────────────────

/**
 * Fits each `.fit` by stepping its font size down 2px at a time from
 * data-max until it stays inside its max-height, never below data-min (at
 * which a title past the box is cut, and the contact sheet shows it).
 * Measured by the browser from the embedded fonts, so the same every run.
 */
const FIT = `
for (const el of document.querySelectorAll(".fit")) {
  const max = Number(el.dataset.max), min = Number(el.dataset.min)
  const limit = parseFloat(getComputedStyle(el).maxHeight)
  el.style.maxHeight = "none"
  let size = max
  el.style.fontSize = size + "px"
  while (size > min && el.scrollHeight > limit) { size -= 2; el.style.fontSize = size + "px" }
  if (el.scrollHeight > limit) { el.style.maxHeight = limit + "px"; el.style.overflow = "hidden"; el.dataset.cut = "1" }
}
`

const page = (d: Direction, i: Input): string =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONT_CSS}${BASE}${d.css}</style></head><body>${d.body(i)}</body></html>`

const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex")

const main = async (): Promise<void> => {
  mkdirSync(OUT, { recursive: true })
  // The repo pins its own Playwright, whose browser revision this sandbox lacks.
  const browser = await chromium.launch({
    executablePath: process.env.THUMB_CHROMIUM ?? "/opt/pw-browsers/chromium",
  })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  })
  const p = await ctx.newPage()
  const hashes: Array<string> = []
  const cuts: Array<string> = []
  const sheets: Record<
    string,
    Array<{ full: string; small: string; label: string }>
  > = {}

  type Shot = { full: string; small: string; label: string }

  /** One thumbnail at 1280×720 and its 320×180 check, written and hashed. */
  const shoot = async (
    d: Direction,
    input: Input,
    name: string,
    label: string
  ): Promise<Shot> => {
    const dir = join(OUT, d.id)
    mkdirSync(dir, { recursive: true })
    await p.setViewportSize({ width: 1280, height: 720 })
    await p.setContent(page(d, input), { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    await p.evaluate(FIT)
    if (await p.evaluate(() => document.querySelector("[data-cut]") !== null))
      cuts.push(`${d.id}/${name}`)
    const full = await p.screenshot({ type: "png" })
    writeFileSync(join(dir, `${name}.png`), full)
    hashes.push(`${sha(full)}  ${d.id}/${name}.png`)

    // The small check: the full render scaled to 320×180 by the browser,
    // as a phone's feed draws it.
    const b64 = full.toString("base64")
    await p.setViewportSize({ width: 320, height: 180 })
    await p.setContent(
      `<!DOCTYPE html><html><body style="margin:0"><img src="data:image/png;base64,${b64}" width="320" height="180" style="display:block"></body></html>`,
      { waitUntil: "load" }
    )
    const small = await p.screenshot({ type: "png" })
    writeFileSync(join(dir, `${name}.320.png`), small)
    hashes.push(`${sha(small)}  ${d.id}/${name}.320.png`)
    return { full: b64, small: small.toString("base64"), label }
  }

  const sheetCss = `${FONT_CSS}
body{margin:0;background:#141414;color:#ddd;font-family:"JetBrains Mono";padding:40px}
h1{font-family:"Barlow Condensed";font-weight:800;font-size:56px;margin:0 0 8px}
h2{font-family:"Barlow Condensed";font-weight:600;font-size:36px;margin:40px 0 16px;letter-spacing:.04em}
p{margin:0 0 24px;font-size:20px;opacity:.7}
figure{margin:0}figcaption{font-size:20px;opacity:.85;margin-top:8px}
img{display:block}`

  const snap = async (
    html: string,
    width: number,
    file: string
  ): Promise<void> => {
    await p.setViewportSize({ width, height: 800 })
    await p.setContent(html, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    const sheet = await p.screenshot({ type: "png", fullPage: true })
    writeFileSync(join(OUT, file), sheet)
    hashes.push(`${sha(sheet)}  ${file}`)
  }

  // First: the four cases the owner judges by (#3361), every direction,
  // side by side at full size and at 320×180.
  for (const d of DIRECTIONS) {
    const shots: Record<"short" | "long", Array<Shot & { source: string }>> = {
      short: [],
      long: [],
    }
    for (const c of CASES)
      for (const variant of ["short", "long"] as const) {
        const t = c.titles[variant]
        const shot = await shoot(
          d,
          { genre: c.genre, title: t.title, cast: c.cast },
          `case-${c.id}-${variant}`,
          c.label
        )
        shots[variant].push({ ...shot, source: t.source })
      }
    const section = (variant: "short" | "long", heading: string): string => {
      const row = shots[variant]
      const fulls = row
        .map(
          (s) =>
            `<figure><img src="data:image/png;base64,${s.full}" width="1280" height="720"><figcaption><b>${esc(s.label)}</b> · ${esc(s.source)}</figcaption></figure>`
        )
        .join("")
      const smalls = row
        .map(
          (s) =>
            `<figure><img src="data:image/png;base64,${s.small}" width="320" height="180"><figcaption>${esc(s.label)}</figcaption></figure>`
        )
        .join("")
      return `<h2>${heading}: full size, 1280×720</h2><div style="display:grid;grid-template-columns:1280px 1280px;gap:32px">${fulls}</div><h2>${heading}: 320×180, true size</h2><div style="display:grid;grid-template-columns:repeat(4,320px);gap:32px">${smalls}</div>`
    }
    await snap(
      `<!DOCTYPE html><html><head><style>${sheetCss}</style></head><body><h1>${esc(d.name)}</h1><p>The four cases: the weekly call, an explainer (cards essay), the weekly Rust Rounds essay, the interview essay. Each caption names where its title came from.</p>${section("short", "Titles as the episodes carry them")}${section("long", "The same four with a long title")}</body></html>`,
      2672,
      `four-${d.id}.png`
    )
  }

  // Then every genre, as before.
  for (const d of DIRECTIONS) {
    sheets[d.id] = []
    for (const genre of Object.keys(GENRES) as Array<Genre>)
      for (const variant of ["short", "long"] as const)
        sheets[d.id]!.push(
          await shoot(
            d,
            {
              genre,
              title: GENRES[genre].titles[variant],
              cast: GENRES[genre].cast,
            },
            `${genre}-${variant}`,
            `${GENRES[genre].name} · ${variant}`
          )
        )
  }

  // One contact sheet per direction: every genre and title, full size at a
  // half-size preview beside its true 320×180 check.
  for (const d of DIRECTIONS) {
    const cells = sheets[d.id]!.map(
      (c) =>
        `<figure><img class="f" src="data:image/png;base64,${c.full}"><img class="s" src="data:image/png;base64,${c.small}"><figcaption>${esc(c.label)}</figcaption></figure>`
    ).join("")
    const html = `<!DOCTYPE html><html><head><style>${FONT_CSS}
body{margin:0;background:#141414;color:#ddd;font-family:"JetBrains Mono";padding:32px;width:2000px}
h1{font-family:"Barlow Condensed";font-weight:800;font-size:44px;margin:0 0 24px}
.g{display:grid;grid-template-columns:1fr 1fr;gap:28px}
figure{margin:0;display:grid;grid-template-columns:640px 320px;gap:16px;align-items:end}
.f{width:640px;height:360px;display:block}.s{width:320px;height:180px;display:block}
figcaption{grid-column:1/3;font-size:18px;opacity:.8}
</style></head><body><h1>${esc(d.name)}</h1><p style="margin:0 0 24px;font-size:18px;opacity:.7">Left: 1280×720 shown at half size. Right: the 320×180 render at its true size.</p><div class="g">${cells}</div></body></html>`
    await p.setViewportSize({ width: 2064, height: 800 })
    await p.setContent(html, { waitUntil: "load" })
    await p.evaluate(() => document.fonts.ready)
    const sheet = await p.screenshot({ type: "png", fullPage: true })
    writeFileSync(join(OUT, `sheet-${d.id}.png`), sheet)
    hashes.push(`${sha(sheet)}  sheet-${d.id}.png`)
  }
  await browser.close()

  const file = join(OUT, "hashes.txt")
  const now = `${hashes.join("\n")}\n`
  if (existsSync(file)) {
    const before = readFileSync(file, "utf8")
    console.log(
      before === now
        ? "hashes: identical to the previous run"
        : "hashes: DIFFER from the previous run"
    )
  }
  writeFileSync(file, now)
  console.log(
    `${hashes.length} PNGs; titles cut at the minimum size: ${cuts.length ? cuts.join(", ") : "none"}`
  )
}

await main()
