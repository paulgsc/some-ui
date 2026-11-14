/**
 * The render image's stage serves every page a recorder opens (RI2, #2887).
 * `infra/render/Dockerfile` builds only the recording stage
 * (`build:stage`, `apps/www/stage/main.tsx`) into /opt/stage, and the
 * recorders serve it with `--dist /opt/stage`: a recorder that starts opening
 * a page the stage does not mount, or a page dropped from the stage, would
 * record the stage's not-found page on home and nowhere else.
 *
 * Read as plain text, as RI1 is. A page opened by a shape `openedIn` does not
 * know, from a value `unread` cannot see, is not seen; the last cases keep the
 * reading honest.
 */

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/** apps/www/src/lib/render-image/__tests__ -> apps/www. */
const WWW = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")
const RECORDERS = "tests/record"
const STAGE = "stage/main.tsx"

function read(path: string): string {
  return readFileSync(join(WWW, path), "utf8")
}

/** The paths the stage mounts, from its `stageRoutes` list. */
function stagePaths(main: string): Set<string> {
  const list = /const stageRoutes = \[([\s\S]*?)\] as const/.exec(main)
  expect(list, "stage/main.tsx's stageRoutes").not.toBeNull()
  return new Set(
    [...(list?.[1] ?? "").matchAll(/\[\s*\w+\s*,\s*"(\/[^"]*)"\s*\]/g)].map(
      ([, path]) => path
    )
  )
}

/** Each path a recorder's text joins to an origin, with where it is. */
function openedIn(file: string, text: string): Array<[string, string]> {
  const shapes = [
    /\$\{[\w.]*origin\}(\/[\w\-/]*)/gi,
    /\borigin\s*\+\s*["'`](\/[\w\-/]*)/gi,
    /new URL\(\s*["'`](\/[\w\-/]*)["'`]\s*,\s*[\w.]*origin\b/gi,
  ]
  return shapes.flatMap((shape) =>
    [...text.matchAll(shape)].map(([, path]): [string, string] => [path, file])
  )
}

/**
 * Each navigation whose literal argument names no page in a shape above
 * (`page.goto("/x")` against a base URL, `${origin}${path}`): a recorder
 * that opens a page the reading can't see fails rather than passing unread.
 * A navigation to a value built elsewhere (`url(...)`, `shot.url`) is read
 * where that value is built.
 */
function unread(file: string, text: string): Array<string> {
  return [...text.matchAll(/\.goto\(\s*(["'`][^)]*)/g)]
    .map(([, arg]) => arg)
    .filter((arg) => openedIn(file, arg).length === 0)
    .map((arg) => `${file} ${arg}`)
}

/** Every recorder source in tests/record, as RI1 lists them. */
function recorders(): Array<[string, string]> {
  return readdirSync(join(WWW, RECORDERS))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => [file, read(join(RECORDERS, file))])
}

/** Each page a recorder opens that the stage does not mount, as `file path`. */
function unserved(files: Array<[string, string]>, main: string): Array<string> {
  const stage = stagePaths(main)
  return [
    ...files
      .flatMap(([file, text]) => openedIn(file, text))
      .filter(([path]) => !stage.has(path))
      .map(([path, file]) => `${file} ${path}`),
    ...files.flatMap(([file, text]) => unread(file, text)),
  ].sort()
}

describe("the render image's stage (RI2)", () => {
  it("serves every page a recorder opens", () => {
    expect(unserved(recorders(), read(STAGE))).toEqual([])
  })

  it("is the page build:stage builds", () => {
    expect(read("package.json")).toMatch(/"build:stage": "WWW_STAGE=1 vite/)
    expect(read("stage/index.html")).toMatch(/src="\.\/main\.tsx"/)
  })

  it("fails a recorder that opens a page the stage lacks, or one it cannot read", () => {
    const files = [
      ...recorders(),
      ["new.ts", "await page.goto(`${site.origin}/jobs?record=true`)"],
      ["old.ts", 'await page.goto(origin + "/studio")'],
      ["url.ts", 'await page.goto(new URL("/renders", site.origin).href)'],
      ["base.ts", 'await page.goto("/settings")'],
    ] satisfies Array<[string, string]>
    expect(unserved(files, read(STAGE))).toEqual([
      'base.ts "/settings"',
      "new.ts /jobs",
      "old.ts /studio",
      "url.ts /renders",
    ])
  })

  it("fails a stage that drops a page a recorder opens", () => {
    const dropped = read(STAGE).replace(/\s*\[EssayRoute, "\/essay"\],/, "")
    expect(dropped).not.toEqual(read(STAGE))
    expect(unserved(recorders(), dropped)).toContain(
      "essay-recording.ts /essay"
    )
  })
})
