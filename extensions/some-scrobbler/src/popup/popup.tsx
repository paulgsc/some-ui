import { createRoot } from "react-dom/client"

const { useState, useEffect } = React

const StatusIcon = ({ status }) => {
  const icons = {
    success: "✓",
    error: "⚠",
    idle: "⏸",
  }

  const colors = {
    success: "text-green-500",
    error: "text-red-500",
    idle: "text-gray-400",
  }

  return (
    <span className={`text-lg font-bold ${colors[status]}`}>
      {icons[status]}
    </span>
  )
}

const Popup = () => {
  const [state, setState] = useState({
    isEnabled: true,
    lastStatus: "idle",
    lastError: null,
    lastSong: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "get-status" }, (response) => {
      if (response) {
        setState(response)
      }
      setLoading(false)
    })
  }, [])

  const handleToggle = () => {
    chrome.runtime.sendMessage({ type: "toggle-tracking" }, () => {
      setState((prev) => ({ ...prev, isEnabled: !prev.isEnabled }))
    })
  }

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="mx-auto size-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
      </div>
    )
  }

  return (
    <div className="min-h-[200px] bg-gray-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">YouTube Tracker</h1>
        <StatusIcon status={state.lastStatus} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm">
          <span className="text-sm font-medium text-gray-700">Tracking</span>
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              state.isEnabled ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                state.isEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {state.lastStatus === "error" && state.lastError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-600">Error:</p>
            <p className="mt-1 text-xs text-red-500">{state.lastError}</p>
          </div>
        )}

        {state.lastStatus === "success" && state.lastSong && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-600">Last tracked:</p>
            <p className="mt-1 truncate text-xs text-green-700">
              {state.lastSong}
            </p>
          </div>
        )}

        <div className="pt-2 text-center">
          <p className="text-xs text-gray-500">
            Status:{" "}
            <span className="font-medium capitalize">{state.lastStatus}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

// Render the app
const container = document.getElementById("popup-root")
if (container) {
  const root = createRoot(container)
  root.render(<TaskPopup />)
}
