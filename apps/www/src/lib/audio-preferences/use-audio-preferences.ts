/**
 * The app's audio preferences, read and written through the tenant
 * settings repository that already persists everything else about a person.
 *
 * Optimistic on purpose: a speaker toggle that waits on a round-trip before
 * the icon changes feels broken, and the write is a localStorage put behind
 * a simulated latency. The query cache is updated in place so every reader -
 * the indicator, the speech provider, the session viewport - flips together
 * in one render.
 */

import { useCallback } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { settingsKey, useSettings, useUpdateSettings } from "@/lib/tenant"

import type { AudioPreferences } from "."
import { DEFAULT_AUDIO_PREFERENCES, withAudioDefaults } from "."

export type UseAudioPreferencesReturn = {
  preferences: AudioPreferences
  /** False until the stored settings have loaded. */
  isReady: boolean
  update: (next: AudioPreferences) => void
}

export function useAudioPreferences(options?: {
  enabled?: boolean
}): UseAudioPreferencesReturn {
  const { data: settings } = useSettings(options)
  const updateSettings = useUpdateSettings()
  const queryClient = useQueryClient()

  // Defaults, not "off", while settings load: this app's Korean modules are
  // pronunciation-led, and briefly rendering as muted then flipping on is a
  // worse surprise than the honest default.
  const preferences = settings
    ? withAudioDefaults(settings.audio)
    : DEFAULT_AUDIO_PREFERENCES

  const update = useCallback(
    (next: AudioPreferences) => {
      if (!settings) return
      const updated = { ...settings, audio: next }
      queryClient.setQueryData(settingsKey, updated)
      updateSettings.mutate(updated)
    },
    [settings, queryClient, updateSettings]
  )

  return { preferences, isReady: settings !== undefined, update }
}
