/**
 * GES5's check, as a pure function over the tracked files:
 * `scripts/check-gestures.ts` runs it.
 */

import {
  describeGestureViolation,
  findGestureViolations,
} from "@eslint/gestures.js"
import { describe, expect, it } from "vitest"

function scan(
  files: Record<string, string>
): ReturnType<typeof findGestureViolations> {
  return findGestureViolations(Object.keys(files), (path) => files[path] ?? "")
}

const manifest = (audience: string): string =>
  JSON.stringify({ name: "x", someUi: { audience } })

describe("findGestureViolations: a gesture outside the pager and the pull", () => {
  it("fails a handler prop, an event name and a gesture library, with its line", () => {
    const code = [
      "<div onPointerDown={down} onTouchMoveCapture={move} />",
      'node.addEventListener("touchstart", start)',
      'import { useDrag } from "@use-gesture/react"',
    ].join("\n")
    expect(scan({ "apps/www/src/components/deck.tsx": code })).toEqual([
      {
        kind: "handler",
        file: "apps/www/src/components/deck.tsx",
        line: 1,
        token: "a touch or pointer handler prop",
      },
      {
        kind: "handler",
        file: "apps/www/src/components/deck.tsx",
        line: 2,
        token: "a touch or pointer event name",
      },
      {
        kind: "handler",
        file: "apps/www/src/components/deck.tsx",
        line: 3,
        token: "a gesture library",
      },
    ])
  })

  it("leaves the pager's runtime and the pull's their gestures", () => {
    const listens = 'node.addEventListener("touchmove", onMove)'
    expect(
      scan({
        "packages/ui/shared/src/lib/pager/runtime/index.ts": listens,
        "apps/www/src/lib/pull-refresh/runtime.ts": listens,
      })
    ).toEqual([])
  })

  it("reads a phone workspace, and not one the Android app never builds", () => {
    const code = "<div onTouchStart={start} />"
    expect(
      scan({
        "packages/ui/apk-thing/package.json": manifest("apk"),
        "packages/ui/apk-thing/src/a.tsx": code,
        "packages/ui/both/package.json": manifest("public"),
        "packages/ui/both/src/a.tsx": code,
        "packages/ui/desk/package.json": manifest("web"),
        "packages/ui/desk/src/a.tsx": code,
        "packages/ui/home/package.json": manifest("lan"),
        "packages/ui/home/src/a.tsx": code,
        "packages/react-hooks/package.json": JSON.stringify({ name: "h" }),
        "packages/react-hooks/src/a.ts": code,
      }).map((violation) => violation.file)
    ).toEqual([
      "packages/react-hooks/src/a.ts",
      "packages/ui/apk-thing/src/a.tsx",
      "packages/ui/both/src/a.tsx",
    ])
  })

  it("skips tests, comments, www's lan gate and web door, extensions and the desktop-only files", () => {
    const code = "<div onPointerMove={move} />"
    expect(
      scan({
        "apps/www/src/components/__tests__/a.test.tsx": code,
        "apps/www/src/components/b.test.tsx": code,
        "apps/www/src/components/c.tsx": "// onPointerMove is the pager's",
        "apps/www/src/routes/_dashboard/_lan/obs.tsx": code,
        "apps/www/src/lib/web-surface/index.ts": code,
        "extensions/some-drama/src/drag.ts": code,
        "packages/ui/leetype/src/components/typing-game/prompt-panel/index.tsx":
          "<PageControls page={0} />",
      })
    ).toEqual([])
  })
})

describe("findGestureViolations: PageControls comes with the pager", () => {
  it("fails a PageControls with no usePager in its file, and passes one with it", () => {
    expect(
      scan({
        "apps/www/src/components/list.tsx": "<PageControls page={page} />",
        "apps/www/src/components/paged.tsx":
          "const { attach } = usePager({ canPrev, canNext, onPage })\n<PageControls page={page} />",
      })
    ).toEqual([{ kind: "unpaged", file: "apps/www/src/components/list.tsx" }])
  })
})

describe("describeGestureViolation", () => {
  it("names the place and the fix", () => {
    expect(
      describeGestureViolation({
        kind: "handler",
        file: "a.tsx",
        line: 3,
        token: "a touch or pointer handler prop",
      })
    ).toMatch(/^a\.tsx:3: a touch or pointer handler prop\. .*usePager/)
    expect(
      describeGestureViolation({ kind: "unpaged", file: "b.tsx" })
    ).toMatch(/^b\.tsx: renders PageControls without `usePager`/)
  })
})
