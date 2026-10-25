/**
 * The tokens of "The phone is Android, and only Android" (CLAUDE.md), as a pure
 * function over the tracked files. `scripts/check-android-only.ts` runs it.
 */

import {
  describeAndroidOnlyViolation,
  findAndroidOnlyViolations,
} from "@eslint/android-only.js"
import { describe, expect, it } from "vitest"

function scan(
  files: Record<string, string>
): ReturnType<typeof findAndroidOnlyViolations> {
  return findAndroidOnlyViolations(
    Object.keys(files),
    (path) => files[path] ?? ""
  )
}

describe("findAndroidOnlyViolations: tokens", () => {
  it("fails each token, with its line", () => {
    const code = [
      "const Ctx = window.webkitAudioContext ?? AudioContext",
      "ok()",
      "if (/iPhone/.test(navigator.userAgent)) tweak()",
    ].join("\n")
    const html = [
      "<head>",
      '  <link rel="apple-touch-icon" href="/icon.png">',
      '  <meta name="apple-mobile-web-app-capable" content="yes">',
      '  <meta name="apple-itunes-app" content="app-id=1">',
      "</head>",
    ].join("\n")
    expect(scan({ "src/a.ts": code, "index.html": html })).toEqual([
      {
        kind: "token",
        file: "index.html",
        line: 2,
        token: "an Apple meta or link tag",
      },
      {
        kind: "token",
        file: "index.html",
        line: 3,
        token: "an Apple meta or link tag",
      },
      {
        kind: "token",
        file: "index.html",
        line: 4,
        token: "an Apple meta or link tag",
      },
      { kind: "token", file: "src/a.ts", line: 1, token: "webkitAudioContext" },
      {
        kind: "token",
        file: "src/a.ts",
        line: 3,
        token: "an iOS device name",
      },
    ])
  })

  it("reads a token in any case, in a comment, and in an identifier", () => {
    for (const text of [
      "// handles WEBKITAUDIOCONTEXT",
      "const Ctx = window.webkitOfflineAudioContext",
      "/* iPadOS quirk */",
      "const isPod = /ipod/i.test(ua)",
      "// Apple-Touch-Icon",
      "const isIPhone = test(ua)",
      "const isIPad = test(ua)",
      "const IS_IPHONE = test(ua)",
      "const is_ipad = test(ua)",
      'device: "iPhone15"',
    ]) {
      expect(scan({ "a.ts": text })).toHaveLength(1)
    }
  })

  it("leaves a name that only contains the letters of one", () => {
    for (const text of [
      "const ipAddress = host()",
      "const ipaddr = host()",
      'import ipaddr from "ipaddr.js"',
      "const tripod = stand()",
      "ipodium()",
      "unipad",
      "const pineapple = touch()",
      "apple-pie",
      'const t = "x86_64-apple-darwin"',
      "font-family: -apple-system, sans-serif",
    ]) {
      expect(scan({ "a.ts": text })).toEqual([])
    }
  })

  it("leaves a Chrome user agent, a CSS prefix and a prefixed API Chrome needs alone", () => {
    const text = [
      'const ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"',
      'style.getPropertyValue("-webkit-text-fill-color")',
      "const Recognition = window.webkitSpeechRecognition",
    ].join("\n")
    expect(scan({ "a.ts": text })).toEqual([])
  })
})

describe("findAndroidOnlyViolations: scope", () => {
  it("scans source and markup, not prose", () => {
    const token = "iPhone apple-touch-icon webkitAudioContext"
    for (const path of ["CLAUDE.md", "docs/canon/x.typ", "image.png"]) {
      expect(scan({ [path]: token })).toEqual([])
    }
    for (const path of [
      "a.ts",
      "a.tsx",
      "a.mjs",
      "a.html",
      "a.css",
      "a.json",
      "manifest.webmanifest",
      "android/app/src/Main.kt",
      "android/app/build.gradle",
      "crates/x/src/lib.rs",
      "scripts/x.sh",
      ".github/workflows/x.yml",
    ]) {
      expect(scan({ [path]: token }).length).toBeGreaterThan(0)
    }
  })

  it("does not read what it does not scan, nor the files that define the tokens", () => {
    const read: Array<string> = []
    const violations = findAndroidOnlyViolations(
      [
        "CLAUDE.md",
        "image.png",
        "packages/eslint/src/android-only.ts",
        "packages/eslint/tests/android-only.test.ts",
        "src/a.ts",
      ],
      (path) => {
        read.push(path)
        return "iphone"
      }
    )
    expect(read).toEqual(["src/a.ts"])
    expect(violations).toHaveLength(1)
  })

  it("fails a tracked path that names a token, whatever the file is", () => {
    expect(
      scan({
        "apps/www/public/apple-touch-icon.png": "",
        "docs/iPhone-notes.md": "",
        "assets/my_ipad.png": "",
        "src/fine.ts": "",
      })
    ).toEqual([
      {
        kind: "path",
        file: "apps/www/public/apple-touch-icon.png",
        token: "an Apple meta or link tag",
      },
      {
        kind: "path",
        file: "assets/my_ipad.png",
        token: "an iOS device name",
      },
      {
        kind: "path",
        file: "docs/iPhone-notes.md",
        token: "an iOS device name",
      },
    ])
  })
})

describe("findAndroidOnlyViolations: an iOS project", () => {
  it("fails the files `cap add ios` writes, by path alone", () => {
    const paths = [
      "apps/mobile/ios/App/App/AppDelegate.swift",
      "apps/mobile/ios/App/Podfile",
      "apps/mobile/ios/App/Podfile.lock",
      "apps/mobile/ios/App/App/Info.plist",
      "App.xcodeproj/project.pbxproj",
      "App.xcworkspace/contents.xcworkspacedata",
      "App/App.entitlements",
      "Config/debug.xcconfig",
      "src/Thing.swift",
    ]
    const found = scan(Object.fromEntries(paths.map((path) => [path, ""])))
    expect(new Set(found.map((v) => v.file))).toEqual(new Set(paths))
    for (const violation of found) {
      expect(violation).toMatchObject({
        kind: "path",
        token: "an iOS project file",
      })
    }
  })

  it("passes look-alike paths, and the words in a file's text", () => {
    expect(
      scan({
        "apps/mobile/android/app/src/main/AndroidManifest.xml": "",
        "src/bios/index.ts": "",
        "src/ios-free/readme.ts": "",
        "src/swiftly.ts": "",
        "src/podfiles.ts": "",
        "src/notes.ts":
          "// no ios/ folder, no Podfile, no Info.plist, no .swift",
      })
    ).toEqual([])
  })
})

describe("describeAndroidOnlyViolation", () => {
  it("says one line naming the place and the rule", () => {
    const token = describeAndroidOnlyViolation({
      kind: "token",
      file: "a.ts",
      line: 3,
      token: "webkitAudioContext",
    })
    const path = describeAndroidOnlyViolation({
      kind: "path",
      file: "public/apple-touch-icon.png",
      token: "an Apple meta or link tag",
    })
    expect(token).toContain("a.ts:3")
    expect(path).toContain("public/apple-touch-icon.png")
    for (const text of [token, path]) {
      expect(text).toContain("Android only")
      expect(text).not.toContain("\n")
    }
  })
})
