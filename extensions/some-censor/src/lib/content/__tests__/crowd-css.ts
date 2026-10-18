/**
 * The crowd rules (QD14) as `content.css` spells them: every rule from the
 * section's header to the end of the file, as selector and body. Shared by
 * `selectors.test.ts`, which pins their shape, and `crowd.spec.ts`, which
 * checks that a number is hidden by one of them.
 */

export const CROWD_MARKER = "THE CROWD (QD14)"

export type CssRule = { readonly selector: string; readonly body: string }

export function crowdRules(css: string): Array<CssRule> {
  const start = css.indexOf(CROWD_MARKER)
  if (start === -1) return []
  const section = css
    .slice(css.lastIndexOf("/*", start))
    .replace(/\/\*[\s\S]*?\*\//g, "")
  return [...section.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selector: (m[1] ?? "").trim().replace(/\s+/g, " "),
    body: (m[2] ?? "").trim(),
  }))
}
