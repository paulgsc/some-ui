/**
 * The audio preferences, through the tenant settings repository. Optimistic:
 * a speaker toggle that waits on a round-trip feels broken, so the query
 * cache is updated in place and every reader flips in one render.
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

export function useAudioPreferences(): UseAudioPreferencesReturn {
  const { data: settings } = useSettings()
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
