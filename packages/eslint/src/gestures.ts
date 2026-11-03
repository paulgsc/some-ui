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
// The phone's sources: `apps/www/src` and every workspace under `packages/`,
// except a workspace whose `someUi.audience` is `web` or `lan` (neither is in
// the Android app's build), www's `lan` gate and `web` door, this kit, tests,
// and the desktop-only files in DESKTOP_ONLY. Comment lines are skipped, so a
// module can say what it does. Not seen: a paged surface built with neither
// `PageControls` nor the pager (buttons that step an index), which review
// holds (REVIEW.md, "Second implementations and code left behind").

/** Where the phone's two gestures live. */
const GESTURE_MODULES: ReadonlySet<string> = new Set([
  "packages/ui/shared/src/lib/pager/runtime/index.ts",
  "apps/www/src/lib/pull-refresh/runtime.ts",
])

/**
 * Files the phone build carries in a shared workspace but never shows on a
 * phone, each with why (CLAUDE.md, "The phone and the desktop web are
 * separate surfaces": a sweep says where it skips a desktop-only file).
 */
const DESKTOP_ONLY: ReadonlyMap<string, string> = new Map([
  [
    "packages/ui/leetype/src/components/typing-game/prompt-panel/index.tsx",
    "the typing game's prompt, shown only above 768px (`useIsMobile` in Leetype): a physical keyboard's",
  ],
])

/** www's directories no phone build routes to (`apps/www/build.profiles.ts`). */
const WWW_GATES: ReadonlyArray<string> = [
  "apps/www/src/routes/_dashboard/_lan/",
  "apps/www/src/lib/web-surface/",
]

const PHONE_AUDIENCES: ReadonlySet<string> = new Set(["public", "apk"])

const CODE = /\.[cm]?[jt]sx?$/
const TEST =
  /(?:^|\/)(?:__tests__|tests|e2e|testing)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/

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

/** The workspace manifest that owns `file`: the nearest `package.json`. */
function manifestOf(file: string, tracked: ReadonlySet<string>): string | null {
  const parts = file.split("/")
  for (let end = parts.length - 1; end > 0; end -= 1) {
    const manifest = [...parts.slice(0, end), "package.json"].join("/")
    if (tracked.has(manifest)) return manifest
  }
  return null
}

/** A manifest's `someUi.audience`, if it says one. */
function audienceOf(text: string): string | null {
  try {
    const manifest: unknown = JSON.parse(text)
    if (typeof manifest !== "object" || manifest === null) return null
    const someUi: unknown = Reflect.get(manifest, "someUi")
    if (typeof someUi !== "object" || someUi === null) return null
    const audience: unknown = Reflect.get(someUi, "audience")
    return typeof audience === "string" ? audience : null
  } catch {
    return null
  }
}

/**
 * The violations among `tracked` (repo-relative paths), in path order. `read`
 * gives a file's text; it is called only for files the scan covers and their
 * workspaces' manifests.
 */
export function findGestureViolations(
  tracked: ReadonlyArray<string>,
  read: (path: string) => string
): Array<GestureViolation> {
  const all = new Set(tracked)
  const audiences = new Map<string, string | null>()
  const phone = (file: string): boolean => {
    if (!CODE.test(file) || TEST.test(file)) return false
    if (GESTURE_MODULES.has(file) || DESKTOP_ONLY.has(file)) return false
    if (file.startsWith("apps/www/src/")) {
      return !WWW_GATES.some((gate) => file.startsWith(gate))
    }
    if (!file.startsWith("packages/") || file.startsWith("packages/eslint/")) {
      return false
    }
    const manifest = manifestOf(file, all)
    if (manifest === null) return true
    if (!audiences.has(manifest)) {
      audiences.set(manifest, audienceOf(read(manifest)))
    }
    const audience = audiences.get(manifest) ?? null
    return audience === null || PHONE_AUDIENCES.has(audience)
  }

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
