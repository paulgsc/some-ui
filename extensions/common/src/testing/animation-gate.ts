/**
 * Which elements are left running an infinite CSS animation while their
 * overlay is dormant — the CSS half of "a dormant overlay runs nothing".
 *
 * An overlay goes dormant (minimised, hidden) by putting a gate on its root,
 * and its stylesheet turns animations off under that gate:
 *
 *   #xx-root.xx-dormant, #xx-root.xx-dormant * { animation: none; }
 *
 * That only works for elements *inside* the gated root. An element the
 * overlay appends elsewhere (some-drama's blossom layer lived in the shared
 * overlay root, beside the card) keeps animating however dormant the card
 * is, and no rule inside the gate can reach it. This finds exactly those:
 *
 *   ungatedInfiniteAnimations(document, css, "#dc-root.dc-dormant")
 *   // → elements matched by an `infinite` animation rule that are not
 *   //   inside an element matching the gate — or every such element, if the
 *   //   stylesheet has no `gate *` rule setting `animation: none`.
 *
 * Call it with the overlay in a dormant state; it should return []. It reads
 * the stylesheet's source, not computed styles, so it runs in jsdom.
 */
export function ungatedInfiniteAnimations(
  doc: Document,
  css: string,
  gate: string
): Array<Element> {
  const rules = styleRules(css)
  const hasGateRule = rules.some(
    (r) =>
      splitSelectors(r.selector).some(
        (s) => normalize(s) === normalize(`${gate} *`)
      ) && /(^|;)\s*animation(-name)?\s*:\s*none\b/.test(r.body)
  )

  const found = new Set<Element>()
  for (const rule of rules) {
    if (
      !/(^|;)\s*animation(-iteration-count)?\s*:[^;]*\binfinite\b/.test(
        rule.body
      )
    ) {
      continue
    }
    for (const raw of splitSelectors(rule.selector)) {
      const selector = raw.replace(
        /::?(before|after|placeholder|marker)\b/g,
        ""
      )
      let matches: Array<Element>
      try {
        matches = Array.from(doc.querySelectorAll(selector.trim() || "*"))
      } catch {
        continue // a selector jsdom cannot parse is not one we can check
      }
      for (const el of matches) {
        if (!hasGateRule || el.closest(gate) === null) found.add(el)
      }
    }
  }
  return Array.from(found)
}

type StyleRule = { selector: string; body: string }

/** Style rules at any depth of @media/@supports/@layer; @keyframes skipped. */
function styleRules(css: string): Array<StyleRule> {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const out: Array<StyleRule> = []
  const walk = (text: string): void => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf("{", i)
      if (open === -1) return
      const prelude = text.slice(i, open).trim()
      const close = matchingBrace(text, open)
      const body = text.slice(open + 1, close)
      if (prelude.startsWith("@")) {
        if (/^@(media|supports|layer|container)\b/.test(prelude)) walk(body)
      } else {
        out.push({ selector: prelude, body })
      }
      i = close + 1
    }
  }
  walk(src)
  return out
}

function matchingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}" && --depth === 0) return i
  }
  return text.length
}

/** Split a selector list on top-level commas (not those inside :is(…)). */
function splitSelectors(list: string): Array<string> {
  const parts: Array<string> = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === "(") depth++
    else if (c === ")") depth--
    else if (c === "," && depth === 0) {
      parts.push(list.slice(start, i))
      start = i + 1
    }
  }
  parts.push(list.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, " ").trim()
}
