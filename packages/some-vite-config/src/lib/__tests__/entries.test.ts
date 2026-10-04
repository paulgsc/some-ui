import { resolve } from "path"
import { describe, expect, it } from "vitest"

import { createBuildConfig, libraryEntries } from "@/lib/build-config.js"
import { generatePackageJsonFields } from "@/lib/package-json/generate.js"

/**
 * Subpath entries: what the build emits, what the package exports and what
 * the declarations plugin publishes types for all come from
 * `libraryEntries`, so none of the three can name an entry the others miss.
 */

const ROOT = "/repo/packages/speech"

describe("libraryEntries", () => {
  it("is the main entry alone without subpaths", () => {
    expect(libraryEntries({ packageName: "@some-ui/chat" })).toEqual([
      { subpath: ".", outputName: "@some-ui/chat", source: "src/index.ts" },
    ])
  })

  it("puts each subpath beside the main entry, under the package's output name", () => {
    expect(
      libraryEntries({
        packageName: "@some-ui/speech",
        entries: { http: "src/http.ts", "web-speech": "src/web-speech.ts" },
      })
    ).toEqual([
      { subpath: ".", outputName: "@some-ui/speech", source: "src/index.ts" },
      {
        subpath: "./http",
        outputName: "@some-ui/speech/http",
        source: "src/http.ts",
      },
      {
        subpath: "./web-speech",
        outputName: "@some-ui/speech/web-speech",
        source: "src/web-speech.ts",
      },
    ])
  })

  it("refuses a name that is not one path segment", () => {
    expect(() =>
      libraryEntries({ packageName: "p", entries: { "a/b": "src/a.ts" } })
    ).toThrow('"a/b" is not a subpath name')
    expect(() =>
      libraryEntries({ packageName: "p", entries: { ".": "src/a.ts" } })
    ).toThrow('"." is not a subpath name')
  })

  it("refuses subpaths in a format that bundles one entry", () => {
    expect(() =>
      libraryEntries({
        packageName: "p",
        formats: ["es", "umd"],
        entries: { a: "src/a.ts" },
      })
    ).toThrow("a umd build has one entry")
  })
})

describe("createBuildConfig", () => {
  it("keeps a single entry a string, named as it always was", () => {
    const { lib } = createBuildConfig({ packageName: "@some-ui/chat" }, ROOT)

    expect(lib.entry).toBe(resolve(ROOT, "src/index.ts"))
    expect(lib.fileName("es", "index")).toBe("@some-ui/chat.es.js")
  })

  it("names each entry's file by its output name", () => {
    const { lib } = createBuildConfig(
      { packageName: "@some-ui/speech", entries: { http: "src/http.ts" } },
      ROOT
    )

    expect(lib.entry).toEqual({
      "@some-ui/speech": resolve(ROOT, "src/index.ts"),
      "@some-ui/speech/http": resolve(ROOT, "src/http.ts"),
    })
    expect(lib.fileName("es", "@some-ui/speech/http")).toBe(
      "@some-ui/speech/http.es.js"
    )
  })
})

describe("generatePackageJsonFields", () => {
  it("exports each subpath with its own types, beside the main entry", () => {
    const { exports } = generatePackageJsonFields({
      packageName: "@some-ui/speech",
      entries: { native: "src/native.ts" },
    })

    expect(exports).toEqual({
      ".": {
        types: "./dist/@some-ui/speech.d.ts",
        import: "./dist/@some-ui/speech.es.js",
        default: "./dist/@some-ui/speech.es.js",
      },
      "./style.css": "./dist/speech.css",
      "./native": {
        types: "./dist/@some-ui/speech/native.d.ts",
        import: "./dist/@some-ui/speech/native.es.js",
        default: "./dist/@some-ui/speech/native.es.js",
      },
    })
  })
})
