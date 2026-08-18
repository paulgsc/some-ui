/**
 * What the class strings actually compile to.
 *
 * `veil-styles.test.ts` asserts properties of the class *strings*; this asserts
 * properties of the *CSS*. That gap is where a whole family of bugs lives, and
 * three of them shipped in the first cut of this migration:
 *
 *   - `bg-white/6` and `rounded-xl` compiled to `var(--colors-white)` and
 *     `var(--radius-xl)`, theme tokens that a preflight-less standalone sheet
 *     never defines. The declarations were invalid in every browser.
 *   - `leading-1.5` multiplies the *spacing* scale, so it compiled to
 *     `line-height: calc(0.25rem * 1.5)` — a 6px line-height, not a 1.5 ratio.
 *   - Colors compile to `color-mix(… var(--un-bg-opacity) …)` whose initial
 *     value arrives only via `@property`, unsupported before Firefox 128 while
 *     the manifest declares 112.
 *
 * None of those are visible in the class string, none break the build, and none
 * change layout enough for the geometry assertions in the e2e suite to notice.
 * They just silently drop the rule. So the generator runs here, and the output
 * is checked for the one thing that unites them: a `var()` with nothing behind
 * it.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import unoConfig from "@censor/uno.config"
import { createGenerator } from "unocss"
import { beforeAll, describe, expect, it } from "vitest"

import * as styles from "./veil-styles"

const RAW_CSS = readFileSync(
  resolve(process.cwd(), "src/styles/content.css"),
  "utf8"
)

/**
 * Every class string the module can produce.
 *
 * Enumerated by hand rather than reflected out of the module: reflection needs
 * an `any` cast to call the two builder functions, and it silently produces the
 * literal string "undefined" when a function is handed the wrong argument kind.
 * The completeness test below fails if a new export appears, so the explicit
 * list cannot quietly fall behind.
 */
function allTokens(): Array<string> {
  const lists: Array<string> = [
    ...Object.values(styles.VEIL),
    ...Object.values(styles.META),
    ...Object.values(styles.TITLE),
    styles.META_CHANNEL,
    styles.META_SUB,
    styles.TITLE_LANG,
    ...(["idle", "meta", "title", "whitelist"] as const).map(styles.hintClass),
    ...([0, 1, 2] as const).map(styles.railClass),
  ]
  return [...new Set(lists.flatMap((l) => l.split(/\s+/)).filter(Boolean))]
}

const VEIL_STYLES_SRC = readFileSync(
  resolve(process.cwd(), "src/lib/content/veil-styles.ts"),
  "utf8"
)

let generated = ""
let full = ""

beforeAll(async () => {
  const uno = await createGenerator(unoConfig)
  // Scan veil-styles.ts's *whole source*, prose included, because that is what
  // the build does. The CLI's word splitter does not know a comment from a
  // class string, which is how `card` and `container` — ordinary English in the
  // doc comments there — became emitted `.card` and `.container` shortcuts
  // pulling in `--card`, `--card-foreground`, `--border` and `--radius-lg`.
  // Feeding only the exported tokens would have hidden that entirely.
  //
  // content.css is deliberately *not* scanned here. The CLI parses `.css`
  // inputs as CSS rather than as text, so its prose contributes nothing;
  // passing it as a raw blob would invent findings the build cannot produce.
  const { css } = await uno.generate(VEIL_STYLES_SRC, { preflights: false })
  generated = css
  // The shipped stylesheet is the raw layer concatenated ahead of the
  // utilities, which is what the build emits and therefore what the browser
  // resolves variables against.
  full = `${RAW_CSS}\n${css}`
})

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "")
}

/** `var(--x)` with no inline fallback — the form that dies if --x is unset. */
function unbackedVars(css: string): Array<string> {
  // Comments first. The prose in content.css discusses `@property` and names
  // these very variables; stripping @property blocks out of commented text ate
  // the real declarations that followed, which made this test's first run a
  // false positive rather than the finding it looked like.
  const source = stripComments(css)
  const read = new Set(
    Array.from(source.matchAll(/var\((--[\w-]+)\s*\)/g), (m) => m[1])
  )
  const body = source.replace(/@property[^}]*}/g, "")
  const declared = new Set(
    Array.from(body.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1])
  )
  return [...read]
    .filter((v): v is string => v !== undefined && !declared.has(v))
    .sort()
}

describe("every variable the stylesheet reads has a value", () => {
  it("declares every unbacked var() it uses", () => {
    // The direct guard for --colors-white and --radius-xl. A theme token from
    // the preset is only usable if something ships the token; this sheet ships
    // no preflight, so the answer is always "define it in content.css or use an
    // arbitrary value".
    expect(unbackedVars(full)).toEqual([])
  })

  it("backs every @property initial-value with a plain declaration", () => {
    // Firefox gained @property in 128; this extension declares 112. So an
    // initial value supplied *only* by @property resolves to nothing on
    // 112–127, `color-mix()` becomes invalid, and the declaration is dropped —
    // for a masking extension, that means a fully transparent veil over content
    // whose static occluder has already been lifted.
    //
    // (unbackedVars already excludes @property when computing what counts as
    // declared, so the assertion above covers this too. This one names the
    // registered variables individually, so a failure says which one regressed
    // rather than just that something did.)
    const source = stripComments(full)
    const registered = new Set(
      Array.from(
        source.matchAll(/@property\s+(--[\w-]+)[^}]*initial-value/g),
        (m) => m[1]
      )
    )
    const readBare = new Set(
      Array.from(source.matchAll(/var\((--[\w-]+)\s*\)/g), (m) => m[1])
    )
    const plain = new Set(
      Array.from(
        source.replace(/@property[^}]*}/g, "").matchAll(/(--[\w-]+)\s*:/g),
        (m) => m[1]
      )
    )

    const relied = [...registered].filter(
      (v) => v !== undefined && readBare.has(v)
    )
    expect(
      relied.length,
      "the sheet does use @property-backed values"
    ).toBeGreaterThan(0)
    expect(relied.filter((v) => !plain.has(v))).toEqual([])
  })

  it("still targets a Firefox without @property", () => {
    // The premise of the rule above. Raising the floor to 128 would make the
    // fallbacks redundant — a deliberate decision, not a silent one.
    const manifest: {
      browser_specific_settings?: { gecko?: { strict_min_version?: string } }
    } = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "public/manifest.firefox.json"),
        "utf8"
      )
    )
    const min = Number.parseInt(
      manifest.browser_specific_settings?.gecko?.strict_min_version ?? "0",
      10
    )
    expect(min, "strict_min_version is declared").toBeGreaterThan(0)
    expect(min, "@property landed in Firefox 128").toBeLessThan(128)
  })
})

describe("the utilities mean what they read as", () => {
  it("enumerates every export veil-styles.ts provides", () => {
    // allTokens() is hand-written, so a new export would be styled in the
    // product and invisible to every assertion here.
    expect(Object.keys(styles).sort()).toEqual([
      "META",
      "META_CHANNEL",
      "META_SUB",
      "TITLE",
      "TITLE_LANG",
      "VEIL",
      "hintClass",
      "railClass",
    ])
  })

  it("gives line-height a ratio, not a slice of the spacing scale", () => {
    // leading-1.5 → calc(var(--spacing) * 1.5) → 6px. leading-[1.5] → 1.5.
    const lineHeights = Array.from(
      generated.matchAll(/line-height:\s*([^;}]+)/g),
      (m) => m[1]?.trim() ?? ""
    )
    expect(lineHeights.length, "the veil sets line-height").toBeGreaterThan(0)
    for (const value of lineHeights) {
      expect(value, `line-height: ${value}`).not.toContain("--spacing")
    }
  })

  it("emits a rule for every class the module declares", () => {
    // A typo in a class string is otherwise completely silent: no error, no
    // rule, no styling.
    // Selectors are matched anywhere rather than at line start, because a
    // variant can put the utility second: `group-hover:` compiles to
    // `.group:hover .group-hover\:…`.
    const emitted = new Set(
      Array.from(generated.matchAll(/\.((?:\\.|[^\\{},\s:>+~])+)/g), (m) =>
        (m[1] ?? "").replace(/\\(.)/g, "$1")
      )
    )
    // Namespace classes are identity hooks, not utilities; nothing generates
    // them, and `group` is only a marker for a variant on a descendant.
    const utilities = allTokens().filter(
      (t) => !t.startsWith("boyo-") && t !== "group"
    )
    expect(utilities.filter((t) => !emitted.has(t))).toEqual([])
  })
})

describe("the sheet stays safe to ship into a vendor page", () => {
  it("resets the box model only inside the veil", () => {
    // The utilities assume border-box, which normally comes from preflight —
    // and preflight is exactly what a content script must not ship.
    expect(RAW_CSS).toContain("box-sizing: border-box")
    for (const match of RAW_CSS.matchAll(/([^{}]+)\{[^}]*box-sizing[^}]*\}/g)) {
      expect(match[1], "box-sizing must be scoped to .boyo-veil").toContain(
        ".boyo-veil"
      )
    }
  })

  it("ships no global element reset", () => {
    // A bare `*`, `html` or `body` rule would restyle YouTube.
    const selectors = Array.from(
      stripComments(RAW_CSS).matchAll(/(^|\})\s*([^{}@]+)\{/g),
      (m) => (m[2] ?? "").trim()
    )
    for (const selector of selectors) {
      for (const part of selector.split(",")) {
        const s = part.trim()
        expect(
          ["*", "html", "body", ":root *"].includes(s),
          `"${s}" would restyle the host page`
        ).toBe(false)
      }
    }
  })
})
