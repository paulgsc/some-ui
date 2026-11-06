// GES5 (#2524): on the phone, a card of several turns by a swipe through the
// one shared pager, and no screen carries swipe or drag-direction code of its
// own. A pure function over the tracked files; `scripts/check-gestures.ts`
// runs it.
//
// Two rules, over every source file a phone build can carry (below):
//
// - **A touch or pointer handler lives in the pager's runtime or the pull's.**
//   A React `onTouch*`/`onPointer*` prop, a `"touchmove"`-style event name
//   (what `addEventListener` takes), or an import of a gesture library fails
//   anywhere else: each is a gesture with its own thresholds, which is how a
//   phone ends up with two swipes that disagree (GES1, #1302).
// - **`PageControls` comes with the pager.** A file that renders
//   `<PageControls` also calls `usePager`, so a paged list that turns by Prev
//   and Next turns by a swipe too (MOB-GESTURE: a gesture supplements a
//   visible control).
//
// Over the phone's sources (`./phone-sources.ts`), less the two gesture
// runtimes. Comment lines are skipped, so a module can say what it does. Not seen: a paged surface built with neither
// `PageControls` nor the pager (buttons that step an index), which review
// holds (REVIEW.md, "Second implementations and code left behind").

import { phoneSources } from "./phone-sources.ts"

/** Where the phone's two gestures live. */
const GESTURE_MODULES: ReadonlySet<string> = new Set([
  "packages/ui/shared/src/lib/pager/runtime/index.ts",
  "apps/www/src/lib/pull-refresh/runtime.ts",
])

type Token = { readonly name: string; readonly pattern: RegExp }

const HANDLERS: ReadonlyArray<Token> = [
  {
    name: "a touch or pointer handler prop",
    pattern:
      /\bon(?:Touch(?:Start|Move|End|Cancel)|Pointer(?:Down|Move|Up|Cancel))(?:Capture)?\b/,
  },
  {
    name: "a touch or pointer event name",
    pattern:
      /["'`](?:touch(?:start|move|end|cancel)|pointer(?:down|move|up|cancel))["'`]/,
  },
  {
    name: "a gesture library",
    pattern:
      /\bfrom\s+["'](?:@use-gesture\/|react-swipeable|swiper|embla-carousel|hammerjs)/,
  },
]

const PAGE_CONTROLS = /<PageControls\b/
const PAGER = /\busePager\(/

export type GestureViolation =
  | {
      readonly kind: "handler"
      readonly file: string
      readonly line: number
      readonly token: string
    }
  | { readonly kind: "unpaged"; readonly file: string }

/** A line that is only a comment: `//`, or inside a block's `*` lines. */
const COMMENT = /^\s*(?:\/\/|\/\*|\*)/

/**
 * The violations among `tracked` (repo-relative paths), in path order. `read`
 * gives a file's text; it is called only for files the scan covers and their
 * workspaces' manifests.
 */
export function findGestureViolations(
  tracked: ReadonlyArray<string>,
  read: (path: string) => string
): Array<GestureViolation> {
  const onThePhone = phoneSources(tracked, read)
  const phone = (file: string): boolean =>
    !GESTURE_MODULES.has(file) && onThePhone(file)

  const violations: Array<GestureViolation> = []
  for (const file of [...tracked].sort()) {
    if (!phone(file)) continue
    const text = read(file)
    for (const [index, line] of text.split("\n").entries()) {
      if (COMMENT.test(line)) continue
      for (const token of HANDLERS) {
        if (token.pattern.test(line)) {
          violations.push({
            kind: "handler",
            file,
            line: index + 1,
            token: token.name,
          })
        }
      }
    }
    if (PAGE_CONTROLS.test(text) && !PAGER.test(text)) {
      violations.push({ kind: "unpaged", file })
    }
  }
  return violations
}

/** One human-readable line per violation, naming the fix. */
export function describeGestureViolation(violation: GestureViolation): string {
  switch (violation.kind) {
    case "handler": {
      return `${violation.file}:${violation.line}: ${violation.token}. A card turns by the shared pager (\`usePager\`, @some-ui/shared); a gesture lives only in the pager's runtime or the pull's.`
    }
    case "unpaged": {
      return `${violation.file}: renders PageControls without \`usePager\`. Attach the shared pager to the paged list, so a swipe turns its page as Prev and Next do.`
    }
    default: {
      const unhandled: never = violation
      throw new Error(`Unhandled gesture violation: ${String(unhandled)}`)
    }
  }
}
