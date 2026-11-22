/**
 * C1029 (#3399): generated assets live on home, served by URL, never in the
 * repo, a bundle or the phone's disk, as a pure function over the tracked
 * files. `scripts/check-assets.ts` runs it.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  debtKeysIn,
  describeAssetViolation,
  findAssetViolations,
  findStaleExemptions,
} from "@eslint/assets.js"
import { describe, expect, it } from "vitest"

type DebtList = NonNullable<Parameters<typeof findAssetViolations>[3]>

function scan(
  files: Record<string, string>,
  debt: DebtList = [],
  base: ReadonlyMap<string, number> | null = null
): ReturnType<typeof findAssetViolations> {
  return findAssetViolations(
    Object.keys(files),
    (path) => files[path] ?? "",
    base,
    debt
  )
}

/** The files `scan` flags, with each one's site count. */
function flagged(files: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const violation of scan(files)) {
    if ("sites" in violation) out[violation.file] = violation.sites
  }
  return out
}

describe("findAssetViolations: media", () => {
  it("fails every media extension, in any folder, a test's included", () => {
    const exts = [
      "png",
      "jpg",
      "JPEG",
      "gif",
      "webp",
      "ico",
      "pdf",
      "wav",
      "mp3",
      "m4a",
      "ogg",
      "webm",
      "mp4",
      "mov",
      "woff",
      "woff2",
      "ttf",
      "otf",
    ]
    for (const ext of exts) {
      const file = `packages/a/tests/clip.${ext}`
      expect(scan({ [file]: "" })).toEqual([
        { kind: "media", file, line: 0, sites: 1 },
      ])
    }
  })

  it("passes source that is not media: svg, the Gradle jar, code", () => {
    expect(
      scan({
        "packages/some-styles/brand/favicon.svg": "<svg/>",
        "apps/mobile/android/gradle/wrapper/gradle-wrapper.jar": "",
        "src/png.ts": "export const png = 1",
      })
    ).toEqual([])
  })

  it("exempts the launcher icons and the extensions' icons, and no more", () => {
    expect(
      flagged({
        "apps/mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png": "",
        "apps/mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png":
          "",
        "extensions/common/brand/icon-48.png": "",
        "extensions/suspender-ledger/public/assets/icon-128.png": "",
        "apps/mobile/android/app/src/main/res/drawable/splash.png": "",
        "extensions/common/brand/hero.png": "",
        "extensions/some-mujik/public/assets/icon-512.png": "",
      })
    ).toEqual({
      "apps/mobile/android/app/src/main/res/drawable/splash.png": 1,
      "extensions/common/brand/hero.png": 1,
      "extensions/some-mujik/public/assets/icon-512.png": 1,
    })
  })
})

describe("findAssetViolations: copy into a public folder", () => {
  const sync = [
    'import { copyFileSync } from "node:fs"',
    'const publicDir = join(appDir, "public")',
    "copyFileSync(src, join(publicDir, file))",
  ].join("\n")

  it("fails a script that imports fs, copies, and names public, a site a call", () => {
    expect(scan({ "apps/www/scripts/sync.mjs": sync })).toEqual([
      { kind: "copy", file: "apps/www/scripts/sync.mjs", line: 3, sites: 1 },
    ])
    for (const [from, call] of [
      ["fs/promises", "cpSync(a, b)"],
      ["fs/promises", "await cp(a, b)"],
      ["fs", "symlinkSync(a, b)"],
      ["fs", "fs.copyFile(a, b)"],
      ["fs", "fs.promises.copyFile(a, b)"],
      ["fs-extra", "fse.copySync(a, b)"],
      ["fs", "link(a, b)"],
    ] as const) {
      const text = [
        `import * as fs from "${from}"`,
        "const to = `${root}/public/sfx`",
        call,
      ].join("\n")
      expect(flagged({ "scripts/x.ts": text })).toEqual({ "scripts/x.ts": 1 })
    }
    expect(
      flagged({ "scripts/x.ts": `${sync}\ncpSync(a, b)\nlinkSync(a, b)` })
    ).toEqual({ "scripts/x.ts": 3 })
  })

  it("fails a write of a media file under public/, and a shell copy inside a script", () => {
    expect(
      flagged({
        "scripts/gen.mjs": 'fs.writeFileSync("apps/www/public/gen.png", png)',
        "scripts/run.mjs": 'execSync("cp -r out apps/www/public")',
      })
    ).toEqual({ "scripts/gen.mjs": 1, "scripts/run.mjs": 1 })
  })

  it("passes a copy with no public path, a public path with no copy, a word, and a test", () => {
    expect(
      scan({
        "a/compile.mjs": [
          'import { copyFileSync } from "node:fs"',
          'copyFileSync(join(out, "a.pdf"), join(out, "b.pdf"))',
        ].join("\n"),
        "a/serve.mjs":
          'import { readFileSync } from "node:fs"\nconst p = "public/"',
        "a/no-fs.ts": 'const p = "public/"\nlink(a, b)',
        "a/__tests__/x.test.ts": sync,
        "a/class.ts": 'import fs from "fs"\nclass A { public cp(x) {} }',
        "a/note.mjs": [
          'import fs from "node:fs"',
          'const p = "/public/"',
          "// the working tree's copy (for a baseline)",
          'fs.writeFileSync("public/manifest.json", text)',
        ].join("\n"),
      })
    ).toEqual([])
  })

  it("fails a cp, rsync, ln or mv into a public folder in a workflow, shell, Dockerfile or Makefile", () => {
    expect(
      flagged({
        ".github/workflows/deploy.yml": [
          "      # cp -r src apps/www/public/ in a comment",
          '          cp -r "$src"/. "apps/www/public/$dir"/',
        ].join("\n"),
        "scripts/a.sh": "rsync -a out/ public/",
        "scripts/b.sh": "cp -r out/ dist/",
        "scripts/c.sh": "mkdir -p public && cp a ./public",
        "scripts/d.sh": "cp -r \\\n  out \\\n  apps/www/public",
        "apps/www/Dockerfile": "RUN mv /out/x.pdf /app/public/",
        "apps/www/Makefile": "\tln -s ../x public",
        ".github/workflows/pr.yml": "  # public/sw.js is a plain asset",
      })
    ).toEqual({
      ".github/workflows/deploy.yml": 1,
      "apps/www/Dockerfile": 1,
      "apps/www/Makefile": 1,
      "scripts/a.sh": 1,
      "scripts/c.sh": 1,
      "scripts/d.sh": 1,
    })
    expect(
      scan({ "scripts/d.sh": "echo\ncp -r \\\n  out \\\n  public" })
    ).toEqual([{ kind: "copy", file: "scripts/d.sh", line: 2, sites: 1 }])
  })

  it("passes the Pages build's copy into its own bundle", () => {
    expect(
      scan({
        ".github/workflows/pages.yml":
          '  cp -r "$src"/. "apps/www/public/$dir"/',
      })
    ).toEqual([])
  })

  it("reads a package.json's scripts only, at the script's line", () => {
    const manifest = JSON.stringify(
      {
        description: "uses cp to copy into public/",
        scripts: { build: "vite build", dev: "ln -s ../x public/x && vite" },
      },
      null,
      2
    )
    expect(scan({ "apps/www/package.json": manifest })).toEqual([
      { kind: "copy", file: "apps/www/package.json", line: 5, sites: 1 },
    ])
    expect(scan({ "apps/www/package.json": "{ not json" })).toEqual([])
  })
})

describe("findAssetViolations: writes on the phone's disk", () => {
  it("fails each Filesystem write in phone code, at its line", () => {
    for (const call of [
      "Filesystem.writeFile(o)",
      "Filesystem.appendFile(o)",
      "Filesystem.downloadFile(o)",
      "Filesystem . copy(o)",
      "Filesystem.rename(o)",
      "Filesystem?.writeFile(o)",
      'Filesystem["writeFile"](o)',
    ]) {
      expect(scan({ "apps/www/src/lib/v/files.ts": call })).toEqual([
        {
          kind: "write",
          file: "apps/www/src/lib/v/files.ts",
          line: 1,
          sites: 1,
        },
      ])
    }
    expect(
      scan({
        "packages/ui/a/src/save.ts": [
          'const { Filesystem } = await import("@capacitor/filesystem")',
          "await Filesystem",
          "  .writeFile({ path, data })",
          "await Filesystem.appendFile(o)",
        ].join("\n"),
      })
    ).toEqual([
      { kind: "write", file: "packages/ui/a/src/save.ts", line: 2, sites: 2 },
    ])
  })

  it("passes a read, a test, code off the phone, and the share sheet's copy", () => {
    const write = "await Filesystem.writeFile({ path, data })"
    expect(
      scan({
        "apps/www/src/lib/v/read.ts": "await Filesystem.readFile(o)",
        "apps/www/src/lib/v/files.test.ts": write,
        "apps/www/vite.config.ts": write,
        "scripts/render.ts": write,
        "apps/www/src/lib/share-files/index.ts": write,
      })
    ).toEqual([])
  })
})

describe("findAssetViolations: the debt", () => {
  const twoWrites = "Filesystem.writeFile(o)\nFilesystem.appendFile(o)"
  const files = {
    "a/clip.wav": "",
    "apps/www/src/lib/v/files.ts": twoWrites,
  }
  const debt: DebtList = [
    { rule: "media", path: "a/clip.wav", row: "r" },
    { rule: "write", path: "apps/www/src/lib/v/files.ts", sites: 2, row: "r" },
  ]
  const base = new Map([
    ["media a/clip.wav", 1],
    ["write apps/www/src/lib/v/files.ts", 2],
  ])

  it("takes owed violations off, by rule and path", () => {
    expect(scan(files, debt, base)).toEqual([])
    expect(
      scan(files, [{ rule: "copy", path: "a/clip.wav", row: "r" }])
    ).toEqual([
      { kind: "media", file: "a/clip.wav", line: 0, sites: 1 },
      { kind: "write", file: "apps/www/src/lib/v/files.ts", line: 1, sites: 2 },
      {
        kind: "staleDebt",
        file: "a/clip.wav",
        rule: "copy",
        sites: 0,
        owed: 1,
      },
    ])
  })

  it("fails a file whose sites grew past its line", () => {
    const grown = {
      ...files,
      "apps/www/src/lib/v/files.ts": `${twoWrites}\nFilesystem.downloadFile(o)`,
    }
    expect(scan(grown, debt, base)).toEqual([
      {
        kind: "grewDebt",
        file: "apps/www/src/lib/v/files.ts",
        rule: "write",
        sites: 3,
        owed: 2,
      },
    ])
  })

  it("fails a line above its file's sites, so the fix lowers or deletes it", () => {
    const fewer = {
      "a/clip.wav": "",
      "apps/www/src/lib/v/files.ts": "Filesystem.writeFile(o)",
    }
    expect(scan(fewer, debt, base)).toEqual([
      {
        kind: "staleDebt",
        file: "apps/www/src/lib/v/files.ts",
        rule: "write",
        sites: 1,
        owed: 2,
      },
    ])
    expect(scan({ "a/clip.wav": "" }, debt, base)).toHaveLength(1)
  })

  it("fails a line the base lacks or holds lower, and passes one it holds", () => {
    expect(scan(files, debt, new Map([["media a/clip.wav", 1]]))).toEqual([
      {
        kind: "newDebt",
        file: "apps/www/src/lib/v/files.ts",
        rule: "write",
        sites: 2,
        owed: 0,
      },
    ])
    const lower = new Map([...base, ["write apps/www/src/lib/v/files.ts", 1]])
    expect(scan(files, debt, lower)).toEqual([
      {
        kind: "newDebt",
        file: "apps/www/src/lib/v/files.ts",
        rule: "write",
        sites: 2,
        owed: 1,
      },
    ])
    const wider = new Map([...base, ["media gone.png", 1]])
    expect(scan(files, debt, wider)).toEqual([])
  })

  it("describes every violation", () => {
    for (const violation of [
      ...scan(files),
      ...scan({}, debt),
      ...scan(files, debt, new Map()),
      ...findStaleExemptions([], () => ""),
    ]) {
      expect(describeAssetViolation(violation)).toContain(violation.file)
    }
  })
})

describe("findStaleExemptions", () => {
  it("fails each exemption that matches nothing, and none that matches", () => {
    expect(findStaleExemptions(["a.ts"], () => "")).toHaveLength(4)
    expect(
      findStaleExemptions(
        [
          "apps/mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png",
          "extensions/common/brand/icon-16.png",
          "apps/www/src/lib/share-files/index.ts",
          ".github/workflows/pages.yml",
        ],
        () => "Filesystem.writeFile(o)\n  cp -r a apps/www/public/sfx/"
      )
    ).toEqual([])
  })
})

describe("debtKeysIn", () => {
  it("reads the rule's own debt, with its sites", () => {
    const text = readFileSync(
      fileURLToPath(new URL("../src/assets.ts", import.meta.url)),
      "utf8"
    )
    const keys = debtKeysIn(text)
    expect(keys?.get("copy apps/www/scripts/sync-resume.mjs")).toBe(1)
    expect(keys?.get("write apps/www/src/lib/call-videos/files.ts")).toBe(2)
    expect(keys?.size).toBe(10)
  })

  it("reads an entry in any order, on one line, and is null with no markers", () => {
    expect(
      debtKeysIn(
        [
          "// debt:start",
          '  { rule: "media", path: "a.png", row: "r" },',
          '  { row: "r", sites: 3, path: "b.ts", rule: "write" },',
          "  { rule: 'media', path: 'c.png' },",
          "// debt:end",
        ].join("\n")
      )
    ).toEqual(
      new Map([
        ["media a.png", 1],
        ["write b.ts", 3],
      ])
    )
    expect(debtKeysIn("const DEBT = []")).toBeNull()
  })
})
