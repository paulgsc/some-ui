import { describe, expect, it } from "vitest"

import type { AudioPreferences } from "."
import {
  AUDIO_CHANNELS,
  DEFAULT_AUDIO_PREFERENCES,
  isFullyMuted,
  setAllEnabled,
  setChannelEnabled,
  setChannelVolume,
  summarizeAudio,
  withAudioDefaults,
} from "."

/**
 * The summary is what a person reads off the chrome at a glance, and the
 * defaults-merge is what stands between a returning user and a blank page.
 * Both are small enough to look obviously right and both fail silently when
 * they aren't.
 */

describe("summarizeAudio", () => {
  const of = (speech: boolean, effects: boolean): AudioPreferences => ({
    speech: { enabled: speech, volume: 1 },
    effects: { enabled: effects, volume: 0.5 },
  })

  it("distinguishes all four states, not just on and off", () => {
    expect(summarizeAudio(of(true, true))).toEqual({
      icon: "🔉",
      label: "Voice + Effects",
    })
    expect(summarizeAudio(of(true, false))).toEqual({
      icon: "🔊",
      label: "Voice",
    })
    expect(summarizeAudio(of(false, true))).toEqual({
      icon: "🎵",
      label: "Effects",
    })
    expect(summarizeAudio(of(false, false))).toEqual({
      icon: "🔇",
      label: "Sound off",
    })
  })

  it("gives every state its own glyph, so the icon alone is informative", () => {
    const icons = [
      summarizeAudio(of(true, true)).icon,
      summarizeAudio(of(true, false)).icon,
      summarizeAudio(of(false, true)).icon,
      summarizeAudio(of(false, false)).icon,
    ]

    expect(new Set(icons).size).toBe(icons.length)
  })
})

describe("channel updates", () => {
  it("changes one channel without disturbing the other", () => {
    const next = setChannelEnabled(DEFAULT_AUDIO_PREFERENCES, "speech", false)

    expect(next.speech.enabled).toBe(false)
    expect(next.effects).toEqual(DEFAULT_AUDIO_PREFERENCES.effects)
    // Immutable: the query cache holds the previous object and compares by
    // reference to decide whether anything re-renders.
    expect(DEFAULT_AUDIO_PREFERENCES.speech.enabled).toBe(true)
  })

  it("keeps volume inside 0-1 whatever a slider hands it", () => {
    expect(
      setChannelVolume(DEFAULT_AUDIO_PREFERENCES, "speech", 4).speech.volume
    ).toBe(1)
    expect(
      setChannelVolume(DEFAULT_AUDIO_PREFERENCES, "speech", -2).speech.volume
    ).toBe(0)
    expect(
      setChannelVolume(DEFAULT_AUDIO_PREFERENCES, "speech", 0.25).speech.volume
    ).toBe(0.25)
  })

  it("mutes and unmutes every channel there is, not a hardcoded pair", () => {
    const silent = setAllEnabled(DEFAULT_AUDIO_PREFERENCES, false)

    expect(isFullyMuted(silent)).toBe(true)
    expect(AUDIO_CHANNELS.every(({ id }) => !silent[id].enabled)).toBe(true)
    expect(isFullyMuted(setAllEnabled(silent, true))).toBe(false)
  })

  it("preserves volumes across a mute, so unmuting restores the mix", () => {
    const quiet = setChannelVolume(DEFAULT_AUDIO_PREFERENCES, "effects", 0.2)
    const roundTripped = setAllEnabled(setAllEnabled(quiet, false), true)

    expect(roundTripped.effects.volume).toBe(0.2)
  })
})

describe("withAudioDefaults", () => {
  it("fills in a settings blob written before audio preferences existed", () => {
    // What `readJSON` hands back for a browser holding the old shape. The
    // failure this prevents is not a missing toggle - it is reading
    // `.speech.enabled` off undefined and blanking the page.
    expect(withAudioDefaults(undefined)).toEqual(DEFAULT_AUDIO_PREFERENCES)
  })

  it("fills in a channel added after the person last saved", () => {
    const filled = withAudioDefaults({
      speech: { enabled: false, volume: 0.3 },
    })

    expect(filled.speech).toEqual({ enabled: false, volume: 0.3 })
    expect(filled.effects).toEqual(DEFAULT_AUDIO_PREFERENCES.effects)
  })

  it("keeps a stored choice rather than resetting it to the default", () => {
    const stored: AudioPreferences = {
      speech: { enabled: false, volume: 0 },
      effects: { enabled: false, volume: 0 },
    }

    expect(withAudioDefaults(stored)).toEqual(stored)
  })
})
