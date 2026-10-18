/**
 * The crowd rules (QD14) as `content.css` spells them: every rule from the
 * section's header to the end of the file, as selector and body. Shared by
 * `selectors.test.ts`, which pins their shape, and `crowd.spec.ts`, which
 * checks that a number is hidden by one of them. The comments' rules, the
 * section before it, are read the same way.
 */

export const CROWD_MARKER = "THE CROWD (QD14)"
const COMMENTS_MARKER = "NO COMMENTS (QD14, #1805)"

export type CssRule = { readonly selector: string; readonly body: string }

export function crowdRules(css: string): Array<CssRule> {
  return sectionRules(css, CROWD_MARKER, css.length)
}

export function commentsRules(css: string): Array<CssRule> {
  const end = css.indexOf(CROWD_MARKER)
  return sectionRules(css, COMMENTS_MARKER, css.lastIndexOf("/*", end))
}

function sectionRules(
  css: string,
  marker: string,
  end: number
): Array<CssRule> {
  const start = css.indexOf(marker)
  if (start === -1 || end <= start) return []
  const section = css
    .slice(css.lastIndexOf("/*", start), end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
  return [...section.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? "").trim().replace(/\s+/g, " "),
    body: (m[2] ?? "").trim(),
  }))
}
