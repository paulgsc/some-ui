// The phone's sources, for the checks that hold a rule only where the phone
// shows it (GES5 in `./gestures.ts`, HS2 in `./stays-put.ts`): `apps/www/src`
// and every workspace under `packages/`, except a workspace whose
// `someUi.audience` is `web` or `lan` (neither is in the Android app's build),
// www's `lan` gate and `web` door, this kit, tests, and the desktop-only files
// in DESKTOP_ONLY.

import { workspaceRootOf } from "./vestiges.ts"

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
 * Whether a file is a phone source, over `tracked` (repo-relative paths).
 * `read` gives a workspace manifest's text, read once per workspace.
 */
export function phoneSources(
  tracked: ReadonlyArray<string>,
  read: (path: string) => string
): (file: string) => boolean {
  const all = new Set(tracked)
  const audiences = new Map<string, string | null>()
  return (file) => {
    if (!CODE.test(file) || TEST.test(file)) return false
    if (DESKTOP_ONLY.has(file)) return false
    if (file.startsWith("apps/www/src/")) {
      return !WWW_GATES.some((gate) => file.startsWith(gate))
    }
    if (!file.startsWith("packages/") || file.startsWith("packages/eslint/")) {
      return false
    }
    const workspace = workspaceRootOf(file)
    if (workspace === undefined) return true
    const manifest = `${workspace}/package.json`
    if (!all.has(manifest)) return true
    if (!audiences.has(manifest)) {
      audiences.set(manifest, audienceOf(read(manifest)))
    }
    const audience = audiences.get(manifest) ?? null
    return audience === null || PHONE_AUDIENCES.has(audience)
  }
}
