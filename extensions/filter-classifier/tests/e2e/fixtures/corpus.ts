/**
 * The classifier corpus (#721 Story 1, #722) — a small, representative
 * sample of vendor-DOM render states spanning hostile → comfortable, each
 * carrying a human-verified ground truth rather than an assertion invented
 * to match whatever the code currently does. `corpus.spec.ts` is the
 * falsifiable check that the shipped classifier agrees with every entry
 * here; a mismatch is a finding about the classifier, not the fixture.
 *
 * Every numeric color below was checked against the *real* `comfortReport`/
 * `satisfiesComfort` math (relativeLuminance, contrast ratio, HSL
 * saturation) before being labeled — see this PR's description for the
 * verification, not hand-waved from the swatch registry's existing
 * examples. Adding a fixture found "in the wild" (a real site that reads
 * as hostile, or a false positive/negative) means doing the same: verify
 * the label against the actual predicate, then add an entry — this file
 * *is* the review record #721 Story 5 asks for, in-repo and diffable
 * instead of behind a live UI.
 *
 * `<meta name="color-scheme" content="light dark">` on every fixture that
 * carries an explicit `background-color`/`color` (#735): without it,
 * Chromium's own forced/auto-dark rendering repaints those literal,
 * ground-truth colors toward a "smarter" dark-mode-appropriate palette on
 * any machine with system dark mode active — a paint-time transform
 * `getComputedStyle` (and so the classifier and Playwright) never sees, but
 * a Comfort Lab reviewer's eyes do. The tell: `transparent-ambiguous` below
 * has no explicit colors and was never affected — only fixtures with
 * authored colors were. Declaring `color-scheme` tells the browser this
 * page's colors are intentional, not the "unprepared light page" forced-dark
 * exists to correct.
 */

export type HumanLabel =
  /** A light, unthemed vendor page — the everyday case some-filter themes. */
  | "needs-theming"
  /** Dark, and it satisfies Φ_comfort — the shipped classifier should exonerate it. */
  | "comfortable"
  /** Dark by luminance alone, but fails Φ_comfort — the #722 "sun" pattern: harsh, not comfortable, and today's luminance-only detector cannot tell the difference. */
  | "hostile"
  /** Near the classifier's own decision threshold — genuinely ambiguous, not a bug in either verdict. */
  | "borderline"
  /** No explicit background anywhere — theme-detector.ts's own documented "unknown == probably light" bias applies. */
  | "ambiguous"

export type CorpusFixture = {
  readonly id: string
  /** Short name for the recognized pattern this fixture encodes. */
  readonly grammar: string
  readonly label: HumanLabel
  /** Why a human would call it this — the verification record. */
  readonly note: string
  /** Ground truth for `detect().alreadyDark` (theme-detector.ts's luminance-only verdict). */
  readonly expectAlreadyDark: boolean
  /**
   * Ground truth for `satisfiesComfort` on the sampled body (bg, text) pair.
   * `null` when Φ_comfort isn't meaningfully evaluable here (the page isn't
   * a dark-theme candidate, or carries no explicit color to sample).
   */
  readonly expectComfortable: boolean | null
  readonly html: () => string
}

export const CORPUS: ReadonlyArray<CorpusFixture> = [
  {
    id: "plain-light-card",
    grammar: "unthemed-light-canvas",
    label: "needs-theming",
    note:
      "Ordinary white-background vendor page. Not 'hostile' in the glare " +
      "sense — just the default light content some-filter exists to theme.",
    expectAlreadyDark: false,
    expectComfortable: null,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light dark" /><title>Plain Light Card</title></head>
  <body style="background-color: rgb(255, 255, 255); color: rgb(17, 24, 39); margin: 0">
    <main style="background-color: rgb(255, 255, 255); padding: 16px">
      <h1>Ordinary article</h1>
      <p>An unthemed vendor page — the everyday case.</p>
    </main>
  </body>
</html>`,
  },

  {
    id: "default-swatch-rendered",
    grammar: "comfortable-dark-default",
    label: "comfortable",
    note:
      "Body wears the shipped default swatch's own (bg0, text0) tokens — " +
      "#0d1117 / #cfdae8. text0 was originally #e2e8f0 (luminance 0.80, " +
      "contrast 15.35): a blind Comfort Lab eye score on that exact pair " +
      'came back hostile (overall 19, "the text is basically the sun", ' +
      "#735) despite passing the original predicate, so CONTRAST_BAND_MAX " +
      "tightened from 16 to 14 and text0 was redimmed to #cfdae8 (same " +
      "~214° hue, luminance 0.69) rather than leaving a known-hostile " +
      "default shipping. Verified against the new pair: contrast 13.38 " +
      "(inside [7.5, 14], with margin below warm-paper-dark's 13.64 — the " +
      "next-highest registry swatch), both channels chromatically biased, " +
      "background well above the black floor. `some-filter`'s own " +
      'registry test ("every registry entry satisfies Φ_comfort") enforces ' +
      "this with zero exceptions — a hostile swatch fails the build, it " +
      "does not ship (swatches.test.ts).",
    expectAlreadyDark: true,
    expectComfortable: true,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light dark" /><title>Default Swatch Rendered</title></head>
  <body style="background-color: rgb(13, 17, 23); color: rgb(207, 218, 232); margin: 0">
    <main style="background-color: rgb(13, 17, 23); padding: 16px">
      <h1>Already themed</h1>
      <p>A vendor page that happens to already wear our own default tokens.</p>
    </main>
  </body>
</html>`,
  },

  {
    id: "muted-warm-dark",
    grammar: "comfortable-dark-muted",
    label: "comfortable",
    note:
      "The epic's own 'Theme A' example: a muted warm-dark background with " +
      "low-contrast warm-gray text. Verified: contrast 7.72 (just inside the " +
      "comfort band), chromatic bias on both channels, background well above " +
      "the black floor. A different palette from the shipped default, and " +
      "still comfortable — the point of Φ_comfort being a predicate over a " +
      "family, not one fixed pair.",
    expectAlreadyDark: true,
    expectComfortable: true,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light dark" /><title>Muted Warm Dark</title></head>
  <body style="background-color: rgb(30, 26, 22); color: rgb(190, 170, 150); margin: 0">
    <main style="background-color: rgb(30, 26, 22); padding: 16px">
      <h1>Warm, muted, comfortable</h1>
      <p>Slightly muted dark gray canvas, low-contrast warm gray text.</p>
    </main>
  </body>
</html>`,
  },

  {
    id: "sun-glare-badges",
    grammar: "harsh-saturated-badges-on-void",
    label: "hostile",
    note:
      "#722's motivating pattern: a near-black canvas carrying pure-white " +
      "text and several fully-saturated accent badges — the 'stares back " +
      "like the sun' complaint the issue's annotated screenshot names. " +
      "Verified against the body's own (bg, text) pair: contrast 21.0 (above " +
      "the 16 ceiling), text luminance 1.0 (fails textNotBrightest), " +
      "background luminance 0 (fails bgNotBlack), fully achromatic (fails " +
      "chromaticBias) — every clause fails. theme-detector.ts's luminance-" +
      "only detect() nonetheless reports alreadyDark=true, since 0 luminance " +
      "reads as unambiguously dark: the exact gap this corpus exists to make " +
      "checkable rather than anecdotal.",
    expectAlreadyDark: true,
    expectComfortable: false,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light dark" /><title>Sun Glare Badges</title></head>
  <body style="background-color: rgb(0, 0, 0); color: rgb(255, 255, 255); margin: 0">
    <main style="background-color: rgb(0, 0, 0); padding: 16px">
      <h1>Dashboard</h1>
      <p>Status board with maximum-contrast accent badges.</p>
      <span style="background-color: rgb(34, 255, 170); color: rgb(0, 0, 0); padding: 2px 8px; border-radius: 4px;">S1 Formalization</span>
      <span style="background-color: rgb(255, 191, 0); color: rgb(0, 0, 0); padding: 2px 8px; border-radius: 4px;">S2 Implementation</span>
      <span style="background-color: rgb(255, 51, 51); color: rgb(0, 0, 0); padding: 2px 8px; border-radius: 4px;">S3 Blocking</span>
    </main>
  </body>
</html>`,
  },

  {
    id: "cool-blue-preserve-band",
    grammar: "comfortable-dark-alt-swatch",
    label: "comfortable",
    note:
      "The registry's cool-blue-gray swatch tokens, rendered. Verified: " +
      "contrast 12.18 (in band), chromatic bias on both channels, background " +
      "luminance 0.008 (well above the black floor despite being visually " +
      "near-black) — the same 'preserve-band-looking but not actually void' " +
      "shape as the near-black surfaces some-filter's own hostile-page " +
      "fixture already exercises for per-element tagging.",
    expectAlreadyDark: true,
    expectComfortable: true,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light dark" /><title>Cool Blue Preserve Band</title></head>
  <body style="background-color: rgb(18, 22, 32); color: rgb(203, 213, 225); margin: 0">
    <main style="background-color: rgb(18, 22, 32); padding: 16px">
      <h1>Cool blue-gray</h1>
      <p>A distinct comfortable palette from the shipped default.</p>
    </main>
  </body>
</html>`,
  },

  {
    id: "borderline-mid-gray",
    grammar: "achromatic-borderline-threshold",
    label: "borderline",
    note:
      "rgb(161,161,161) ≈ luminance 0.356, straddling classifyPage's default " +
      "threshold=0.4 (theme-detector.test.ts already documents this exact " +
      "value flipping isLight under a lower threshold). Verified Φ_comfort " +
      "on the body's own (bg, text): contrast 8.13 and text luminance both " +
      "pass, but the gray is fully achromatic — chromaticBias fails alone. " +
      "Two independent forms of 'borderline' on the same fixture: the page- " +
      "level verdict is threshold-sensitive, and the comfort verdict fails " +
      "on exactly one of four clauses rather than all of them.",
    expectAlreadyDark: true,
    expectComfortable: false,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light dark" /><title>Borderline Mid Gray</title></head>
  <body style="background-color: rgb(161, 161, 161); color: rgb(0, 0, 0); margin: 0">
    <main style="background-color: rgb(161, 161, 161); padding: 16px">
      <h1>Neither clearly light nor clearly dark</h1>
      <p>An achromatic mid-gray canvas, right at the classifier's own threshold.</p>
    </main>
  </body>
</html>`,
  },

  {
    id: "neon-text-moderate-surface",
    grammar: "bright-text-on-moderate-dark-surface",
    label: "hostile",
    note:
      "#735's counterpoint to a merely-bright-background case ('a bright bg " +
      "is trivial to target'): an ordinary moderate-dark surface (bgLuminance " +
      "0.012 — comfortably clear of the black floor, and itself chromatically " +
      "biased) carrying saturated near-yellow body copy, not badges. Verified: " +
      "contrast 15.97 (inside the [7.5, 16] band, nowhere near the ceiling) " +
      "and the background is unmistakably not a void — a contrast-or-" +
      "blackness-only check waves this straight through. Only textLuminance " +
      "0.937 (just over the 0.92 ceiling) fails. This is the fixture #722's " +
      "'sun' framing was always about but sun-glare-badges (max-contrast, " +
      "black void) can't isolate on its own: bright text is the hostile " +
      "signal, independent of how dark or void the background is.",
    expectAlreadyDark: true,
    expectComfortable: false,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="color-scheme" content="light dark" /><title>Neon Text Moderate Surface</title></head>
  <body style="background-color: rgb(28, 28, 32); color: rgb(255, 255, 102); margin: 0">
    <main style="background-color: rgb(28, 28, 32); padding: 16px">
      <h1>Changelog</h1>
      <p>Every line of body copy here is set in the same searing near-yellow — no badges, no accents, just paragraph after paragraph bright enough to read like a screen left on max brightness in the dark.</p>
    </main>
  </body>
</html>`,
  },

  {
    id: "transparent-ambiguous",
    grammar: "transparent-unknown-fallback",
    label: "ambiguous",
    note:
      "No explicit background-color anywhere in the document — matches " +
      "theme-detector.ts's own documented bias ('Unknown == probably " +
      "light'). Nothing to sample for Φ_comfort either: there is no bg to " +
      "judge, only the browser default.",
    expectAlreadyDark: false,
    expectComfortable: null,
    html: () => `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Transparent Ambiguous</title></head>
  <body>
    <main>
      <h1>No explicit background anywhere</h1>
      <p>Relies entirely on the browser's own default canvas.</p>
    </main>
  </body>
</html>`,
  },
]
