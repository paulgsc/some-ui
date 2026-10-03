import { describe, expect, it } from "vitest"

import { summarizeLessonVoice } from "@/lib/lesson-voice"

describe("summarizeLessonVoice", () => {
  it("names a voice that speaks Korean, and its platform", () => {
    expect(
      summarizeLessonVoice({
        platform: "browser",
        voice: "Google 한국의",
        speaksLanguage: true,
      })
    ).toEqual({
      label: "Google 한국의 · your browser's own voice",
      detail:
        "Korean lessons are read by Google 한국의, your browser's own voice.",
      warning: false,
    })
  })

  it("does not warn about a platform that speaks Korean in an unnamed default voice", () => {
    expect(
      summarizeLessonVoice({
        platform: "phone",
        voice: null,
        speaksLanguage: true,
      })
    ).toEqual({
      label: "Default voice · this phone's text-to-speech",
      detail:
        "Korean lessons are read by its default Korean voice, this phone's text-to-speech.",
      warning: false,
    })
  })

  it("warns when a browser reads Korean in another language's voice", () => {
    const summary = summarizeLessonVoice({
      platform: "browser",
      voice: "Samantha",
      speaksLanguage: false,
    })
    expect(summary.warning).toBe(true)
    expect(summary.detail).toContain("reads Korean with Samantha")
  })

  it("warns when a browser has no voices at all", () => {
    const summary = summarizeLessonVoice({
      platform: "browser",
      voice: null,
      speaksLanguage: false,
    })
    expect(summary.warning).toBe(true)
    expect(summary.detail).toContain("offers no voice for Korean")
  })

  it("warns when the voice service has no Korean voice", () => {
    const summary = summarizeLessonVoice({
      platform: "hosted",
      voice: null,
      speaksLanguage: false,
    })
    expect(summary.warning).toBe(true)
    expect(summary.detail).toContain("Pick a provider with one in Settings")
  })

  it("warns when the phone has no Korean voice", () => {
    const summary = summarizeLessonVoice({
      platform: "phone",
      voice: null,
      speaksLanguage: false,
    })
    expect(summary.warning).toBe(true)
    expect(summary.detail).toContain("Settings → Voice")
  })
})
