/**
 * `auditLegibility`'s `TreeWalker` never visits a generated pseudo-element
 * (`::before`/`::after`/`::marker` are not nodes) or enters an `<iframe>`'s
 * document. Both resolve as explicit `"underdetermined"` outcomes rather than
 * silent gaps (the paint grammar's `PG-GEN-PSEUDO`/`PG-SCOPE-IFRAME-CONTENT`
 * rows, `docs/legibility-paint-grammar.md`).
 *
 * jsdom does not implement two-argument `getComputedStyle`, so production
 * code no-ops there (see `pseudoElementStyleIsSupported`); only real Chromium
 * proves the pseudo-element detection, while the jsdom suite proves the
 * no-op is safe. The iframe half is ordinary computed style, covered by both.
 *
 * Injects the real compiled `legibility-audit.ts` into a bare page via
 * `legibility-audit-harness.ts`, bypassing the full pipeline's confounding
 * per-surface repair.
 */
import {
  auditPage,
  LEGIBILITY_AUDIT_LAUNCH_OPTIONS,
  legibilityAuditTest as test,
} from "@filter/playwright/fixtures/legibility-audit-harness"
import { expect } from "@playwright/test"

// Declared in the spec file, not the shared harness — see
// LEGIBILITY_AUDIT_LAUNCH_OPTIONS for why a shared `.use()` fails.
test.use({ launchOptions: LEGIBILITY_AUDIT_LAUNCH_OPTIONS })

test.describe("legibility audit's generated-pseudo-element hazard against real Chromium (#1358)", () => {
  test("a ::before with real content forces its host underdetermined instead of trusting the host's own color", async ({
    page,
    scriptContent,
  }) => {
    await page.setContent(`
      <style>.badge::before { content: "x"; }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="badge" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    // The ::before would otherwise be invisible, and #carrier would resolve
    // its own legible black-on-white with no signal. Backdrop is
    // underdetermined too: a ::before paints between an element's background
    // and its text, so the backdrop walk sees the hazard on #carrier itself.
    expect(
      result.attrs,
      `expected #carrier to be forced fully underdetermined by its own ::before: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("a bare clearfix ::before (empty content, no background) does not force underdetermined", async ({
    page,
    scriptContent,
  }) => {
    await page.setContent(`
      <style>.clearfix::before { content: ""; display: table; }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="clearfix" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    // An inert clearfix (empty content, no background) paints nothing;
    // flagging every one would be noise.
    expect(
      result.attrs,
      `expected an inert clearfix ::before not to affect #carrier's own resolved color: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: [0, 0, 0, 1], backdrop: [1, 1, 1, 1] }])
  })

  test("a ::before with real content but display:none does not force underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // A breakpoint hiding a decorative ::before keeps a non-"none" content
    // while display:none suppresses the box; flagging it would be noise.
    await page.setContent(`
      <style>.badge::before { content: "x"; display: none; }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="badge" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected a display:none ::before not to affect #carrier's own resolved color: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: [0, 0, 0, 1], backdrop: [1, 1, 1, 1] }])
  })

  test("a ::before with real content but visibility:hidden does not force underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // visibility:hidden keeps the box in layout but suppresses its paint;
    // display alone stays "inline" and would not catch it.
    await page.setContent(`
      <style>.badge::before { content: "x"; visibility: hidden; background-color: rgb(10,10,10); }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="badge" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected a visibility:hidden ::before not to affect #carrier's own resolved color: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: [0, 0, 0, 1], backdrop: [1, 1, 1, 1] }])
  })

  test("an empty-content ::before with its own real background still forces underdetermined", async ({
    page,
    scriptContent,
  }) => {
    await page.setContent(`
      <style>.overlay::before { content: ""; background-color: rgb(10,10,10); }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="overlay" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected #carrier to be forced fully underdetermined by its own background-painting ::before: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("an empty-content ::before with only a border still forces underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // A border (or outline, or box-shadow) paints an occluding shape with no
    // background at all.
    await page.setContent(`
      <style>.bordered::before { content: ""; border: 4px solid rgb(10,10,10); }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="bordered" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected #carrier to be forced fully underdetermined by its own border-only ::before: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("an empty-content ::before with only a box-shadow still forces underdetermined", async ({
    page,
    scriptContent,
  }) => {
    await page.setContent(`
      <style>.shadowed::before { content: ""; box-shadow: 0 0 0 100px rgb(10,10,10); }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="shadowed" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected #carrier to be forced fully underdetermined by its own box-shadow-only ::before: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("a page-authored html::before does not disable hazard detection (capability probe)", async ({
    page,
    scriptContent,
  }) => {
    // A capability probe reading html::before would be disabled for good by
    // a page authoring its own html::before. Here html::before is real
    // content, and detection on #carrier's ::before must still fire.
    await page.setContent(`
      <style>
        html::before { content: "loading"; }
        .badge::before { content: "x"; }
      </style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="badge" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected #carrier's own ::before hazard to still be detected despite html::before: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("an ancestor's own ::before hazard makes a descendant's backdrop underdetermined too", async ({
    page,
    scriptContent,
  }) => {
    // An ancestor's ::before can paint over an unrelated descendant (e.g. a
    // fixed overlay from a static ancestor), so the backdrop walk must check
    // it too, not just the candidate's own pseudo-elements.
    await page.setContent(`
      <style>.overlay::before { content: ""; background-color: rgb(10,10,10); }</style>
      <div id="ancestor" class="overlay" style="background-color: rgb(200,200,200)">
        <span id="descendant" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    const descendantEntry = result.attrs.find(
      (a) => Array.isArray(a.foreground) && a.foreground[0] === 0
    )
    expect(
      descendantEntry,
      `expected a #descendant entry with a real foreground: ${JSON.stringify(result.attrs)}`
    ).toBeDefined()
    expect(
      descendantEntry?.backdrop,
      `expected #descendant's backdrop to be underdetermined because of #ancestor's own ::before: ${JSON.stringify(result.attrs)}`
    ).toBe("underdetermined")

    // The verdict must reflect that, not read "legible" from the raw pair.
    const descendantAction = result.actions.find((a) =>
      a.key.startsWith("rgb(0, 0, 0)")
    )
    expect(
      descendantAction?.verdict,
      `expected the descendant's own verdict to be underdetermined: ${JSON.stringify(result.actions)}`
    ).toBe("underdetermined")
  })

  test("a hazard on an ancestor beyond one that already resolved opaque still forces underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // The pseudo-hazard check must not stop once a nearer ancestor's
    // background resolves: #outer (no background of its own) has a hazardous
    // ::before beyond #middle's rgb(200,200,200).
    await page.setContent(`
      <style>.overlay::before { content: ""; background-color: rgb(10,10,10); }</style>
      <div id="outer" class="overlay">
        <div id="middle" style="background-color: rgb(200,200,200)">
          <span id="descendant" style="color: rgb(0,0,0)">hi</span>
        </div>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    const descendantEntry = result.attrs.find(
      (a) => Array.isArray(a.foreground) && a.foreground[0] === 0
    )
    expect(
      descendantEntry?.backdrop,
      `expected #descendant's backdrop to be underdetermined despite #middle's own background already resolving opaque: ${JSON.stringify(result.attrs)}`
    ).toBe("underdetermined")
  })

  test("a page-wide universal ::before selector does not disable hazard detection (capability probe)", async ({
    page,
    scriptContent,
  }) => {
    // A synthetic tag name still matches a page-wide *::before rule.
    await page.setContent(`
      <style>
        *::before { content: ""; }
        .badge::before { content: "x"; }
      </style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="badge" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected #carrier's own ::before hazard to still be detected despite a page-wide *::before rule: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("an unrecognized (CSS Color 4) background on an empty pseudo-element still forces underdetermined", async ({
    page,
    scriptContent,
  }) => {
    // parsePreciseColor only knows hex and rgb()/rgba(); an opaque oklch()
    // background is still an occluding layer.
    await page.setContent(`
      <style>.oklch-bg::before { content: ""; background-color: oklch(0 0 0); }</style>
      <div id="ancestor" style="background-color: rgb(255,255,255)">
        <span id="carrier" class="oklch-bg" style="color: rgb(0,0,0)">hi</span>
      </div>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(
      result.attrs,
      `expected #carrier to be forced fully underdetermined by its own oklch()-painted ::before: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("an ::marker color override registers its host as a new underdetermined candidate", async ({
    page,
    scriptContent,
  }) => {
    // Colour set on <body>, which the TreeWalker never visits (it is the
    // root; PG-GEOM-ROOT-EXCLUDED), so it cannot become a candidate. <ul>/<li>
    // inherit it, so ownTextColor finds no explicit colour on either <li> —
    // unlike an `li { color: white }` rule, which would count as explicit.
    await page.setContent(`
      <html>
        <head><style>#marked::marker { color: rgb(17,17,17); }</style></head>
        <body style="color: white; background-color: rgb(17,17,17)">
          <ul>
            <li id="plain">hi</li>
            <li id="marked">hi</li>
          </ul>
        </body>
      </html>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    // #plain inherits everything and has no marker override: not a
    // candidate. #marked has no own colour either, but its ::marker paints an
    // independently coloured glyph. Backdrop is underdetermined too, as for
    // ::before above.
    expect(
      result.attrs,
      `expected only #marked to become a new, fully underdetermined candidate: ${JSON.stringify(result.attrs)}`
    ).toEqual([{ foreground: "underdetermined", backdrop: "underdetermined" }])
  })

  test("a plain <li> with no marker override is not affected", async ({
    page,
    scriptContent,
  }) => {
    await page.setContent(`
      <html>
        <body style="color: white; background-color: rgb(17,17,17)">
          <ul>
            <li id="plain">hi</li>
          </ul>
        </body>
      </html>
    `)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(result.attrs).toEqual([])
  })
})

test.describe("legibility audit's iframe diagnostic carrier against real Chromium (#1358)", () => {
  test("a rendered iframe registers as its own underdetermined/underdetermined carrier", async ({
    page,
    scriptContent,
  }) => {
    await page.setContent(`<iframe id="frame" src="about:blank"></iframe>`)
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(result.attrs).toEqual([
      { foreground: "underdetermined", backdrop: "underdetermined" },
    ])
    expect(result.actions).toEqual([
      {
        kind: "tag-legibility",
        key: "underdetermined~underdetermined",
        verdict: "underdetermined",
      },
    ])
  })

  test("an unrendered iframe (display:none) is not registered", async ({
    page,
    scriptContent,
  }) => {
    await page.setContent(
      `<iframe id="frame" src="about:blank" style="display:none"></iframe>`
    )
    await page.addScriptTag({ content: scriptContent })

    const result = await auditPage(page)

    expect(result.attrs).toEqual([])
  })
})
