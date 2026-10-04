import {
  isPreferredTag,
  LANGUAGE_TAG,
  SPOKEN_LANGUAGES,
  spokenLanguageOf,
} from "@speech/lib/language"
import { describe, expect, it } from "vitest"

describe("spokenLanguageOf - where a platform's tag becomes one of ours", () => {
  it.each([
    ["ko-KR", "korean"],
    ["ko_KR", "korean"],
    ["KO", "korean"],
    ["kor", "korean"],
    ["en-US", "english"],
    ["en_GB", "english"],
    ["eng", "english"],
  ] as const)("reads %s as %s", (tag, language) => {
    expect(spokenLanguageOf(tag)).toBe(language)
  })

  it.each(["kok-IN", "kn-IN", "ja-JP", "", "k"])(
    "reads %j as no language of ours, whatever it starts with",
    (tag) => {
      expect(spokenLanguageOf(tag)).toBeNull()
    }
  )

  it("reads back every tag it hands a platform", () => {
    for (const language of SPOKEN_LANGUAGES) {
      expect(spokenLanguageOf(LANGUAGE_TAG[language])).toBe(language)
      expect(isPreferredTag(LANGUAGE_TAG[language], language)).toBe(true)
    }
  })

  it("prefers the exact tag, separator-blind, and nothing else", () => {
    expect(isPreferredTag("ko_KR", "korean")).toBe(true)
    expect(isPreferredTag("en-GB", "english")).toBe(false)
  })
})
