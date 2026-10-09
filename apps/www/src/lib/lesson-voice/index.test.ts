import { describe, expect, it } from "vitest"

import { deviceKindOf, summarizeLessonVoice } from "@/lib/lesson-voice"

describe("summarizeLessonVoice", () => {
  it("names a voice that speaks Korean, and its platform", () => {
    expect(
      summarizeLessonVoice({
        platform: "browser",
        voice: "Google 한국의",
        availability: "available",
      })
    ).toEqual({
      label: "Google 한국의 · your browser's own voice",
      detail:
        "Korean lessons are read by Google 한국의, your browser's own voice.",
      fix: null,
      warning: false,
    })
  })

  it("does not warn about a platform that speaks Korean in an unnamed default voice", () => {
    expect(
      summarizeLessonVoice({
        platform: "phone",
        voice: null,
        availability: "available",
      })
    ).toEqual({
      label: "Default voice · this phone's text-to-speech",
      detail:
        "Korean lessons are read by its default Korean voice, this phone's text-to-speech.",
      fix: null,
      warning: false,
    })
  })

  it("warns when a browser reads Korean in another language's voice", () => {
    const summary = summarizeLessonVoice({
      platform: "browser",
      voice: "Samantha",
      availability: "missing",
    })
    expect(summary.warning).toBe(true)
    expect(summary.detail).toContain("reads Korean with Samantha")
  })

  it("warns when a browser has no voices at all", () => {
    const summary = summarizeLessonVoice({
      platform: "browser",
      voice: null,
      availability: "missing",
    })
    expect(summary.warning).toBe(true)
    expect(summary.detail).toContain("offers no voice for Korean")
  })

  it("warns when the voice service has no Korean voice", () => {
    const summary = summarizeLessonVoice({
      platform: "hosted",
      voice: null,
      availability: "missing",
    })
    expect(summary.warning).toBe(true)
    expect(summary.fix).toBe("Pick a provider with a Korean voice in Settings.")
  })

  it("does not warn while a platform has not said yet, or could not say", () => {
    for (const availability of ["checking", "unverifiable"] as const) {
      const summary = summarizeLessonVoice({
        platform: "browser",
        voice: null,
        availability,
      })
      expect(summary.warning).toBe(false)
      expect(summary.fix).toBeNull()
    }
  })

  it("warns when the phone has no Korean voice", () => {
    const summary = summarizeLessonVoice({
      platform: "phone",
      voice: null,
      availability: "missing",
    })
    expect(summary.warning).toBe(true)
    expect(summary.fix).toBe("Install one from Settings → Voice.")
  })
})

describe("the one step that adds a Korean voice, on the device in hand", () => {
  const noKorean = {
    platform: "browser",
    voice: "Samantha",
    availability: "missing",
  } as const

  it.each([
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129 Mobile",
      "android",
      "search “Text-to-speech”",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15",
      "mac",
      "Manage Voices… → Korean",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129",
      "windows",
      "Speech → Manage voices → Add voices → Korean",
    ],
    [
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129",
      "other",
      "your system’s speech settings",
    ],
  ])("%s", (userAgent, device, step) => {
    expect(deviceKindOf(userAgent)).toBe(device)
    const { fix } = summarizeLessonVoice(noKorean, deviceKindOf(userAgent))
    expect(fix).toContain(step)
    expect(fix).toContain("Then reload this page. Or sign in")
  })
})
