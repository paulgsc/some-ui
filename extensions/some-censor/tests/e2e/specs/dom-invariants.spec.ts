/**
 * DOM invariant tests — assert browser runtime behaviour that the TypeScript
 * compiler assumes. Failures here mean a browser update invalidated a type-level
 * assumption and the relevant extraction code must be re-audited.
 *
 * Specifically: TypeScript (and WebIDL) declare Element.textContent as
 * `string | null`, but every spec-compliant browser returns "" for elements
 * with no children and a string for all other connected elements. These tests
 * pin that runtime contract so CI fails if it ever changes.
 */

import { expect, test } from "@censor/playwright/fixture"

// ─────────────────────────────────────────────────────────────────────────────
// T-DOM1: textContent is always typeof "string", never null
// ─────────────────────────────────────────────────────────────────────────────

test("T-DOM1: Element.textContent is always a string, never null", async ({
  page,
}) => {
  await page.setContent(`
    <div id="empty"></div>
    <div id="text"> hello world </div>
    <span id="span-empty"></span>
    <button id="btn">click me</button>
    <p id="nested"><strong>bold</strong> text</p>
  `)

  const result = await page.evaluate(() => {
    // Elements created via innerHTML / setContent
    const ids = ["empty", "text", "span-empty", "btn", "nested"]
    const queried = ids.map((id) => {
      const el = document.getElementById(id)!
      return {
        id,
        textContentType: typeof el.textContent,
        isString: typeof el.textContent === "string",
        value: el.textContent,
      }
    })

    // Freshly created (detached) elements — covers extraction helpers that
    // operate on elements not yet attached to the DOM
    const tags = [
      "div",
      "span",
      "button",
      "section",
      "article",
      "p",
      "h1",
      "li",
      "a",
      // YouTube-specific custom elements used in extraction (meta.ts)
      "yt-formatted-string",
      "ytd-channel-name",
    ]
    const created = tags.map((tag) => {
      const el = document.createElement(tag)
      return {
        tag,
        textContentType: typeof el.textContent,
        isString: typeof el.textContent === "string",
      }
    })

    return { queried, created }
  })

  for (const item of result.queried) {
    expect(
      item.isString,
      `#${item.id}.textContent should be typeof string (got ${item.textContentType})`
    ).toBe(true)
  }

  for (const item of result.created) {
    expect(
      item.isString,
      `<${item.tag}>.textContent should be typeof string (got ${item.textContentType})`
    ).toBe(true)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// T-DOM2: empty element textContent is "" not null
// ─────────────────────────────────────────────────────────────────────────────

test("T-DOM2: empty Element.textContent is empty string, not null", async ({
  page,
}) => {
  await page.setContent(`<div id="empty"></div>`)

  const result = await page.evaluate(() => {
    const el = document.getElementById("empty")!
    return {
      textContent: el.textContent,
      isEmptyString: el.textContent === "",
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      isNull: el.textContent === null,
    }
  })

  expect(result.isNull, "textContent must not be null").toBe(false)
  expect(result.isEmptyString, 'empty element textContent must be ""').toBe(
    true
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// T-DOM3: .trim() on textContent always safe (no null dereference)
// ─────────────────────────────────────────────────────────────────────────────

test("T-DOM3: .trim() on textContent never throws", async ({ page }) => {
  await page.setContent(`
    <div id="empty"></div>
    <div id="whitespace">   </div>
    <div id="content">  trimmed  </div>
  `)

  const result = await page.evaluate(() => {
    const ids = ["empty", "whitespace", "content"]
    return ids.map((id) => {
      const el = document.getElementById(id)!
      let trimmed: string | undefined
      let threw = false
      try {
        // This is the pattern used in extract/meta.ts and yt-meta.ts
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        trimmed = el.textContent?.trim()
      } catch {
        threw = true
      }
      return { id, trimmed, threw }
    })
  })

  for (const item of result) {
    expect(
      item.threw,
      `textContent?.trim() must not throw on #${item.id}`
    ).toBe(false)
    expect(
      typeof item.trimmed,
      `trimmed result for #${item.id} should be string`
    ).toBe("string")
  }
})
