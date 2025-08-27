import { useEffect, useState } from "react"
import type { FC } from "react"
import { Button } from "@mujik/components/ui/button"
import { Switch } from "@mujik/components/ui/switch"
import { Activity, Music, Settings } from "lucide-react"

export const Popup: FC = () => {
  const [isEnabled, setIsEnabled] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionCount, setSessionCount] = useState(0)

  useEffect(() => {
    loadExtensionState()
    loadSessionStats()
  }, [])

  const loadExtensionState = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_EXTENSION_STATE",
      })
      setIsEnabled(response?.enabled ?? true)
    } catch (error) {
      console.error("Failed to load extension state:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadSessionStats = async () => {
    // In a real implementation, you might want to track session stats
    // For now, we'll use a placeholder
    setSessionCount(Math.floor(Math.random() * 50))
  }

  const handleToggle = async (enabled: boolean) => {
    setIsLoading(true)
    try {
      await chrome.runtime.sendMessage({
        type: "TOGGLE_EXTENSION",
        enabled,
      })
      setIsEnabled(enabled)
    } catch (error) {
      console.error("Failed to toggle extension:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const openYouTube = () => {
    chrome.tabs.create({ url: "https://www.youtube.com" })
  }

  const openSettings = () => {
    // In a real implementation, you might open a settings page
    console.log("Settings clicked")
  }

  return (
    <div
      style={{
        width: "320px",
        minHeight: "400px",
        padding: "20px",
        backgroundColor: "#ffffff",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "24px",
          paddingBottom: "16px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <Music size={24} style={{ color: "#3b82f6", marginRight: "12px" }} />
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "600",
              color: "#111827",
            }}
          >
            YouTube Session Tracker
          </h1>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "14px",
              color: "#6b7280",
            }}
          >
            Track and save your music sessions
          </p>
        </div>
      </div>

      {/* Main Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px",
          backgroundColor: "#f9fafb",
          borderRadius: "8px",
          marginBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: "500",
              color: "#111827",
            }}
          >
            Extension Active
          </p>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "14px",
              color: "#6b7280",
            }}
          >
            {isEnabled ? "Tracking YouTube sessions" : "Extension disabled"}
          </p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
        />
      </div>

      {/* Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            padding: "16px",
            backgroundColor: "#eff6ff",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <Activity
            size={20}
            style={{ color: "#3b82f6", margin: "0 auto 8px" }}
          />
          <p
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: "700",
              color: "#1e40af",
            }}
          >
            {sessionCount}
          </p>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "12px",
              color: "#3b82f6",
            }}
          >
            Sessions Tracked
          </p>
        </div>

        <div
          style={{
            padding: "16px",
            backgroundColor: "#f0fdf4",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <Music size={20} style={{ color: "#16a34a", margin: "0 auto 8px" }} />
          <p
            style={{
              margin: 0,
              fontSize: "24px",
              fontWeight: "700",
              color: "#15803d",
            }}
          >
            {isEnabled ? "ON" : "OFF"}
          </p>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "12px",
              color: "#16a34a",
            }}
          >
            Status
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "20px",
        }}
      >
        <Button
          onClick={openYouTube}
          variant="default"
          style={{
            width: "100%",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            padding: "12px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "background-color 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#2563eb"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#3b82f6"
          }}
        >
          <Music size={16} style={{ marginRight: "8px" }} />
          Open YouTube
        </Button>

        <Button
          onClick={openSettings}
          variant="outline"
          style={{
            width: "100%",
            backgroundColor: "transparent",
            color: "#374151",
            border: "1px solid #d1d5db",
            padding: "12px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f3f4f6"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent"
          }}
        >
          <Settings size={16} style={{ marginRight: "8px" }} />
          Settings
        </Button>
      </div>

      {/* Footer */}
      <div
        style={{
          paddingTop: "16px",
          borderTop: "1px solid #e5e7eb",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "#9ca3af",
          }}
        >
          YouTube Session Tracker v1.0.0
        </p>
        <p
          style={{
            margin: "4px 0 0 0",
            fontSize: "12px",
            color: "#9ca3af",
          }}
        >
          Click on YouTube videos to use the dropdown
        </p>
      </div>
    </div>
  )
}
