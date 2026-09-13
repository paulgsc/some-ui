/**
 * TSC-SF2 (#1358) — `auditLegibility`'s `TreeWalker` structurally never
 * visits a generated pseudo-element (`::before`/`::after`/`::marker` are
 * not nodes) or traverses into an `<iframe>`'s own document. Both were
 * silently invisible to the audit — `docs/legibility-paint-grammar.md`'s
 * own `PG-GEN-PSEUDO`/`PG-SCOPE-IFRAME-CONTENT` rows recorded them as
 * `unknown` (TSC-SF1, #1357). This closes both as explicit
 * `"underdetermined"` outcomes rather than silent, untested gaps.
 *
 * jsdom cannot exercise the pseudo-element half at all: `getComputedStyle`'s
 * two-argument form is unimplemented there (confirmed directly against
 * jsdom's own source — `legibility-audit.ts`'s own
 * `pseudoElementStyleIsSupported` doc comment has the full trace), so the
 * production code detects that and no-ops rather than corrupting jsdom's
 * own unit tests. Only a real Chromium run can prove the hazard-detection
 * logic itself; `legibility-audit.test.ts`'s own jsdom suite instead proves
 * the no-op is safe (asserts the existing candidates are unaffected under
 * jsdom). The iframe half needs no such split — an iframe's own `display`/
 * `visibility` are ordinary, non-pseudo computed style jsdom handles
 * correctly, so that half is covered by both jsdom unit tests and this file.
 *
 * Same isolation rationale as #1374's own spec: injects the real compiled
 * `legibility-audit.ts` module into a bare page via
 * `legibility-audit-harness.ts`, bypassing the full `--load-extension`
 * pipeline's own confounding per-surface repair.
 */
import {
  auditPage,
  legibilityAuditTest as test,
} from "@filter/playwright/fixtures/legibility-audit-harness"
import { expect } from "@playwright/test"

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

    // Before this fix: the ::before is structurally invisible to the audit,
    // so #carrier would resolve its own real (perfectly legible) black-on-
    // white color, with no signal at all that a generated box exists here.
    // Backdrop is underdetermined too, not just foreground: a ::before
    // paints between an element's own background and its own text in real
    // paint order, so resolveEffectiveBackdrop's own ancestor walk sees the
    // exact same hazard on #carrier itself (its own first iteration).
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

    // An inert clearfix hack (empty content, no background/background-image
    // of its own) paints nothing — flagging every such element on every
    // page would make this check far noisier than the risk it guards
    // against.
    expect(
      result.attrs,
      `expected an inert clearfix ::before not to affect #carrier's own resolved color: ${JSON.stringify(result.attrs)}`
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
    // Codex's own finding: a border (or outline, or box-shadow) paints a
    // real, potentially occluding shape with no background-color/image at
    // all — checking only background would have missed this.
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
    // Codex's own finding: the original capability probe read
    // document.documentElement's own ::before, which a real audited page
    // (unlike this file's own tests) can perfectly well author its own
    // rule for — silently and permanently disabling this entire hazard
    // check for that page's whole lifetime. This is the exact scenario:
    // html::before is real content here, and detection on #carrier's own
    // (unrelated) ::before must still fire correctly.
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
    // Codex's own finding: checking only the candidate's own pseudo-elements
    // missed an ancestor's ::before painting over a completely unrelated
    // descendant — e.g. a position:fixed overlay hasPositioningHazard alone
    // would not catch either, since the *ancestor* itself can stay static.
    // resolveEffectiveBackdrop's own ancestor walk must see this too, not
    // just auditLegibility's per-candidate foreground check.
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

    // The overall verdict must reflect that too — not silently "legible"
    // just because the descendant's own raw foreground/ordinary-background
    // pair would otherwise pass contrast.
    const descendantAction = result.actions.find((a) =>
      a.key.startsWith("rgb(0, 0, 0)")
    )
    expect(
      descendantAction?.verdict,
      `expected the descendant's own verdict to be underdetermined: ${JSON.stringify(result.actions)}`
    ).toBe("underdetermined")
  })

  test("an ::marker color override registers its host as a new underdetermined candidate", async ({
    page,
    scriptContent,
  }) => {
    // Color set on <body> itself, not a div inside the audited subtree:
    // `auditLegibility`'s own TreeWalker never visits its own root, so
    // <body> can never become a candidate itself (confirmed by this exact
    // property already, PG-GEOM-ROOT-EXCLUDED) — an ancestor div inline-
    // styled the same way would incorrectly become its own real candidate
    // and contaminate this assertion. <ul>/<li> both inherit <body>'s color
    // via plain cascade, so ownTextColor correctly finds no explicit own
    // color on either <li> (their own computed color equals what their
    // immediate parent already computes) — unlike an `li { color: white }`
    // type-selector rule, which itself counts as an explicit declaration
    // once it differs from <ul>'s own inherited value.
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

    // #plain has no explicit own color anywhere (plain inheritance all the
    // way down) and no marker override, so it is correctly not a candidate
    // at all — unaffected by this fix. #marked has no *own* explicit color
    // either, so before this fix it would also silently be no candidate at
    // all, even though its ::marker paints a completely separate,
    // independently-colored glyph this audit never saw. Backdrop is
    // underdetermined too, not just foreground — resolveEffectiveBackdrop's
    // own ancestor walk sees the identical marker-mismatch hazard on
    // #marked itself (its own first iteration), same as the ::before cases
    // above.
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
