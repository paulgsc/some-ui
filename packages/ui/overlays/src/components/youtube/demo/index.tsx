import type { FC } from "react"
import { useObsWebSocket } from "@overlays/hooks/use-obs-socket"

type ObsStatusPanelProps = {
  serverUrl?: string
}

export const ObsStatusPanel: FC<ObsStatusPanelProps> = ({
  serverUrl = `ws://${window.location.hostname}:${3000}/ws/obs`,
}) => {
  const { status, isConnected, isConnecting, error, connect, disconnect } =
    useObsWebSocket({
      url: serverUrl,
      onConnect: () => console.log("Connected to OBS WebSocket"),
      onDisconnect: () => console.log("Disconnected from OBS WebSocket"),
      onError: (e) => console.error("OBS WebSocket error:", e),
    })

  return (
    <div className="obs-status-panel">
      <h2>OBS Status</h2>

      {/* Connection status */}
      <div className="connection-status">
        <div
          className={`status-indicator ${isConnected ? "connected" : "disconnected"}`}
        >
          {isConnected ? "●" : "○"}
        </div>
        <span>
          {isConnecting
            ? "Connecting..."
            : isConnected
              ? "Connected"
              : "Disconnected"}
        </span>

        {error && <div className="error-message">Error: {error}</div>}

        <div className="connection-actions">
          <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>

      {/* OBS Status */}
      {isConnected && (
        <div className="obs-info">
          <div className="status-row">
            <div className="status-label">Stream:</div>
            <div
              className={`status-value ${status.streaming ? "active" : "inactive"}`}
            >
              {status.streaming ? "LIVE" : "Offline"}
              {status.streaming && (
                <span className="timecode"> ({status.stream_timecode})</span>
              )}
            </div>
          </div>

          <div className="status-row">
            <div className="status-label">Recording:</div>
            <div
              className={`status-value ${status.recording ? "active" : "inactive"}`}
            >
              {status.recording ? "Recording" : "Not Recording"}
              {status.recording && (
                <span className="timecode"> ({status.recording_timecode})</span>
              )}
            </div>
          </div>

          <div className="status-row">
            <div className="status-label">Current Scene:</div>
            <div className="status-value">{status.current_scene}</div>
          </div>

          <div className="scenes-list">
            <h3>Available Scenes</h3>
            {status.scenes.length > 0 ? (
              <ul>
                {status.scenes.map((scene) => (
                  <li
                    key={scene}
                    className={
                      scene === status.current_scene ? "active-scene" : ""
                    }
                  >
                    {scene}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No scenes available</p>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .obs-status-panel {
          padding: 16px;
          border-radius: 8px;
          background-color: #f5f5f5;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          max-width: 500px;
        }

        h2 {
          margin-top: 0;
          margin-bottom: 16px;
          color: #333;
        }

        .connection-status {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }

        .status-indicator {
          font-size: 24px;
          margin-right: 8px;
        }

        .connected {
          color: #4caf50;
        }

        .disconnected {
          color: #f44336;
        }

        .error-message {
          margin-top: 8px;
          color: #f44336;
        }

        .connection-actions {
          margin-left: auto;
        }

        button {
          padding: 8px 16px;
          background-color: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }

        .obs-info {
          margin-top: 16px;
        }

        .status-row {
          display: flex;
          margin-bottom: 8px;
        }

        .status-label {
          width: 100px;
          font-weight: bold;
        }

        .active {
          color: #4caf50;
          font-weight: bold;
        }

        .inactive {
          color: #9e9e9e;
        }

        .timecode {
          font-size: 0.85em;
          font-weight: normal;
        }

        .scenes-list {
          margin-top: 16px;
        }

        h3 {
          margin-top: 0;
          margin-bottom: 8px;
          font-size: 1em;
        }

        ul {
          list-style-type: none;
          padding: 0;
          margin: 0;
        }

        li {
          padding: 4px 0;
        }

        .active-scene {
          font-weight: bold;
          color: #2196f3;
        }
      `}</style>
    </div>
  )
}
