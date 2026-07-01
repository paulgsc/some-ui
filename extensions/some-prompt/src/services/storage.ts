type ExtensionSettings = {
  enabled: boolean
  maxUtteranceLength: number
  minUtteranceLength: number
  serverUrl: string
  postThrottleMs: number
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  maxUtteranceLength: 200,
  minUtteranceLength: 3,
  serverUrl: "http://nixos.local:3000/utter",
  postThrottleMs: 500,
}

export class StorageService {
  static async getSettings(): Promise<ExtensionSettings> {
    try {
      const result = await chrome.storage.sync.get("settings")
      return { ...DEFAULT_SETTINGS, ...result.settings }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to load settings, using defaults:", error)
      return DEFAULT_SETTINGS
    }
  }

  static async updateSettings(
    settings: Partial<ExtensionSettings>
  ): Promise<void> {
    try {
      const currentSettings = await this.getSettings()
      const newSettings = { ...currentSettings, ...settings }
      await chrome.storage.sync.set({ settings: newSettings })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to save settings:", error)
      throw error
    }
  }

  static async resetSettings(): Promise<void> {
    try {
      await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to reset settings:", error)
      throw error
    }
  }

  static onSettingsChanged(
    callback: (settings: ExtensionSettings) => void
  ): void {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.settings) {
        callback(changes.settings.newValue)
      }
    })
  }
}
