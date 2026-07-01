import { useEffect, useState } from "react"
import type { FC } from "react"
import type {
  BackgroundMessage,
  BackgroundResponse,
  ExtensionSettings,
} from "@prompt/types/storage"

const Popup: FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings>({
    enabled: true,
    maxUtteranceLength: 200,
    minUtteranceLength: 3,
    serverUrl: "http://nixos.local:3000/utter",
    postThrottleMs: 500,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async (): Promise<void> => {
    try {
      const message: BackgroundMessage = { type: "GET_SETTINGS" }
      const response: BackgroundResponse =
        await chrome.runtime.sendMessage(message)

      if (response.success) {
        setSettings(response.data)
      } else {
        showMessage("error", "Failed to load settings")
      }
    } catch (error) {
      showMessage("error", "Failed to communicate with background script")
    } finally {
      setLoading(false)
    }
  }

  const updateSettings = async (
    newSettings: Partial<ExtensionSettings>
  ): Promise<void> => {
    setSaving(true)
    try {
      const message: BackgroundMessage = {
        type: "UPDATE_SETTINGS",
        payload: newSettings,
      }
      const response: BackgroundResponse =
        await chrome.runtime.sendMessage(message)

      if (response.success) {
        setSettings(response.data)
        showMessage("success", "Settings saved successfully")
      } else {
        showMessage("error", "Failed to save settings")
      }
    } catch (error) {
      showMessage("error", "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const showMessage = (type: "success" | "error", text: string): void => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleToggleEnabled = (): void => {
    updateSettings({ enabled: !settings.enabled })
  }

  const handleMaxLengthChange = (value: number): void => {
    if (value >= settings.minUtteranceLength && value <= 1000) {
      updateSettings({ maxUtteranceLength: value })
    }
  }

  const handleMinLengthChange = (value: number): void => {
    if (value >= 1 && value <= settings.maxUtteranceLength) {
      updateSettings({ minUtteranceLength: value })
    }
  }

  const handleServerUrlChange = (url: string): void => {
    updateSettings({ serverUrl: url })
  }

  const handleThrottleChange = (value: number): void => {
    if (value >= 100 && value <= 5000) {
      updateSettings({ postThrottleMs: value })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-96 w-80 items-center justify-center bg-gray-50 p-6">
        <div className="text-gray-600">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="min-h-96 w-80 bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 p-4 text-white">
        <h1 className="text-lg font-semibold">Typing Mirror</h1>
        <p className="text-sm text-blue-100">
          Configure your typing mirror settings
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-100 text-green-800"
              : "border-red-200 bg-red-100 text-red-800"
          } border-b`}
        >
          {message.text}
        </div>
      )}

      {/* Settings */}
      <div className="space-y-6 p-4">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">
              Enable Extension
            </label>
            <p className="text-xs text-gray-500">Turn typing mirror on/off</p>
          </div>
          <button
            onClick={handleToggleEnabled}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? "bg-blue-600" : "bg-gray-300"
            } ${saving ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                settings.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Text Length Limits */}
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Maximum Text Length: {settings.maxUtteranceLength}
            </label>
            <input
              type="range"
              min="10"
              max="1000"
              value={settings.maxUtteranceLength}
              onChange={(e) => handleMaxLengthChange(Number(e.target.value))}
              disabled={saving}
              className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>10</span>
              <span>1000</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Minimum Text Length: {settings.minUtteranceLength}
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={settings.minUtteranceLength}
              onChange={(e) => handleMinLengthChange(Number(e.target.value))}
              disabled={saving}
              className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-500">
              <span>1</span>
              <span>50</span>
            </div>
          </div>
        </div>

        {/* Server URL */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Server URL
          </label>
          <input
            type="url"
            value={settings.serverUrl}
            onChange={(e) => handleServerUrlChange(e.target.value)}
            disabled={saving}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="http://localhost:3000/utter"
          />
        </div>

        {/* Throttle Setting */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Post Throttle: {settings.postThrottleMs}ms
          </label>
          <input
            type="range"
            min="100"
            max="5000"
            step="100"
            value={settings.postThrottleMs}
            onChange={(e) => handleThrottleChange(Number(e.target.value))}
            disabled={saving}
            className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>100ms</span>
            <span>5000ms</span>
          </div>
        </div>

        {/* Hotkey Info */}
        <div className="rounded-md bg-blue-50 p-3">
          <h3 className="mb-1 text-sm font-medium text-blue-800">Hotkey</h3>
          <p className="text-xs text-blue-600">
            Press{" "}
            <kbd className="rounded bg-blue-200 px-1 py-0.5 text-xs">
              Ctrl+Shift+U
            </kbd>{" "}
            to toggle the overlay visibility
          </p>
        </div>

        {/* Status */}
        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Status:</span>
            <span
              className={`font-medium ${
                settings.enabled ? "text-green-600" : "text-gray-500"
              }`}
            >
              {settings.enabled ? "Active" : "Disabled"}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Popup
