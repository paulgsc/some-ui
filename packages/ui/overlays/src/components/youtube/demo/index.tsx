import type { FC } from "react"
import { Button } from "some-ui-shared"
import {
  useActiveFps,
  useConnectionInfo,
  useCpuUsage,
  useCurrentCollection,
  useCurrentProfile,
  useCurrentTransition,
  useIsConnected,
  useIsRecording,
  useIsStreaming,
  useObsCommands,
  useObsStatusWebSocket,
  useRecordTimecode,
  useReplayBufferActive,
  useSceneInfo,
  useStreamTimecode,
  useStudioModeEnabled,
  useVirtualCamActive,
} from "some-ui-utils"

type ObsStatusPanelProps = {
  url?: string
  autoReconnect?: boolean
  reconnectInterval?: number
  debugMode?: boolean
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event | Error) => void
}

/**
 * Main panel component - only subscribes to connection state.
 * Child components subscribe to specific state slices.
 */
export const ObsStatusPanel: FC<ObsStatusPanelProps> = ({
  url = `ws://${window.location.hostname}:3000/ws`,
  autoReconnect = true,
  reconnectInterval = 5000,
  debugMode = false,
  onConnect,
  onDisconnect,
  onError,
}) => {
  // Only connection state in parent - no rerenders from OBS updates
  const { error: wsError, isConnecting } = useObsStatusWebSocket({
    url,
    autoReconnect,
    reconnectInterval,
    debugMode,
    onConnect,
    onDisconnect,
    onError,
  })

  const isConnected = useIsConnected()
  const { error: storeError } = useConnectionInfo()

  const displayError = wsError || storeError

  return (
    <div className="max-w-2xl p-6 bg-gray-50 rounded-lg shadow-md">
      {/* Header */}
      <h2 className="text-2xl font-bold text-gray-800 mb-6">
        OBS Status Panel
      </h2>

      {/* Connection Status Section */}
      <ConnectionStatus
        isConnected={isConnected}
        isConnecting={isConnecting}
        error={displayError}
        debugMode={debugMode}
        autoReconnect={autoReconnect}
        reconnectInterval={reconnectInterval}
      />

      {/* Only render OBS controls when connected */}
      {isConnected && (
        <>
          <StreamControls />
          <SceneManagement />
          <AdditionalFeatures />
          <ObsInformation />
        </>
      )}
    </div>
  )
}

/**
 * Connection status - only rerenders on connection changes
 */
const ConnectionStatus: FC<{
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  debugMode: boolean
  autoReconnect: boolean
  reconnectInterval: number
}> = ({
  isConnected,
  isConnecting,
  error,
  debugMode,
  autoReconnect,
  reconnectInterval,
}) => {
  return (
    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">Connection</h3>

      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-4 h-4 rounded-full ${
            isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
          }`}
        />
        <span className="font-medium text-gray-700">
          {isConnecting
            ? "Connecting..."
            : isConnected
              ? "Connected"
              : "Disconnected"}
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-3">
          <strong>Error:</strong> {error}
        </div>
      )}

      {debugMode && (
        <div className="text-xs text-gray-500 mb-2">
          Debug Mode: Enabled | Reconnect: {autoReconnect ? "On" : "Off"} (
          {reconnectInterval}ms)
        </div>
      )}
    </div>
  )
}

/**
 * Stream controls - subscribes to streaming/recording state and timecodes.
 * Timecodes cause frequent rerenders, but only in this component.
 */
const StreamControls: FC = () => {
  const isConnected = useIsConnected()
  const isStreaming = useIsStreaming()
  const isRecording = useIsRecording()

  // 🔴 Explicit opt-in to frequent updates (timecodes)
  const streamTimecode = useStreamTimecode()
  const recordTimecode = useRecordTimecode()

  const { startStreaming, stopStreaming, startRecording, stopRecording } =
    useObsCommands()

  return (
    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">
        Stream Controls
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-600 mb-1">Stream Status</div>
          <div
            className={`text-lg font-bold ${
              isStreaming ? "text-green-600" : "text-gray-400"
            }`}
          >
            {isStreaming ? "🔴 LIVE" : "Offline"}
          </div>
          {isStreaming && (
            <div className="text-xs text-gray-500 mt-1">{streamTimecode}</div>
          )}
        </div>

        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-600 mb-1">Recording</div>
          <div
            className={`text-lg font-bold ${
              isRecording ? "text-red-600" : "text-gray-400"
            }`}
          >
            {isRecording ? "⏺ REC" : "Not Recording"}
          </div>
          {isRecording && (
            <div className="text-xs text-gray-500 mt-1">{recordTimecode}</div>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={startStreaming}
          disabled={!isConnected || isStreaming}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300"
        >
          Start Stream
        </Button>
        <Button
          onClick={stopStreaming}
          disabled={!isConnected || !isStreaming}
          className="bg-red-600 hover:bg-red-700 disabled:bg-gray-300"
        >
          Stop Stream
        </Button>
        <Button
          onClick={startRecording}
          disabled={!isConnected || isRecording}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300"
        >
          Start Recording
        </Button>
        <Button
          onClick={stopRecording}
          disabled={!isConnected || !isRecording}
          className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300"
        >
          Stop Recording
        </Button>
      </div>
    </div>
  )
}

/**
 * Scene management - only rerenders when scenes change
 */
const SceneManagement: FC = () => {
  const { scenes, currentScene } = useSceneInfo()
  const { switchScene } = useObsCommands()

  return (
    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">Scenes</h3>

      <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
        <div className="text-sm text-blue-700">Current Scene</div>
        <div className="text-lg font-bold text-blue-900">{currentScene}</div>
      </div>

      {scenes.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {scenes.map((scene) => (
            <button
              key={scene.name}
              onClick={() => {
                // eslint-disable-next-line no-console
                console.log("mock switch scene: ", scene.name)
                void switchScene(scene.name)
              }}
              disabled={scene.name === currentScene}
              className={`p-2 rounded text-sm font-medium transition-colors ${
                scene.name === currentScene
                  ? "bg-blue-600 text-white cursor-default"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {scene.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-gray-500 text-sm italic">No scenes available</div>
      )}
    </div>
  )
}

/**
 * Additional features - only rerenders when feature states change
 */
const AdditionalFeatures: FC = () => {
  const isConnected = useIsConnected()
  const studioModeEnabled = useStudioModeEnabled()
  const virtualCamActive = useVirtualCamActive()
  const replayBufferActive = useReplayBufferActive()
  const { name: transitionName, duration: transitionDuration } =
    useCurrentTransition()
  const { toggleStudioMode } = useObsCommands()

  return (
    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">
        Additional Features
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-600">Studio Mode</div>
          <div
            className={`text-base font-medium ${
              studioModeEnabled ? "text-purple-600" : "text-gray-400"
            }`}
          >
            {studioModeEnabled ? "Enabled" : "Disabled"}
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-600">Virtual Cam</div>
          <div
            className={`text-base font-medium ${
              virtualCamActive ? "text-green-600" : "text-gray-400"
            }`}
          >
            {virtualCamActive ? "Active" : "Inactive"}
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-600">Replay Buffer</div>
          <div
            className={`text-base font-medium ${
              replayBufferActive ? "text-green-600" : "text-gray-400"
            }`}
          >
            {replayBufferActive ? "Active" : "Inactive"}
          </div>
        </div>

        <div className="p-3 bg-gray-50 rounded">
          <div className="text-sm text-gray-600">Transition</div>
          <div className="text-base font-medium text-gray-700">
            {transitionName}
          </div>
          <div className="text-xs text-gray-500">{transitionDuration}ms</div>
        </div>
      </div>

      <Button
        onClick={toggleStudioMode}
        disabled={!isConnected}
        className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300"
      >
        Toggle Studio Mode
      </Button>
    </div>
  )
}

/**
 * OBS information - includes stats which update frequently.
 * This component explicitly opts-in to frequent rerenders.
 */
const ObsInformation: FC = () => {
  const { obsVersion, websocketVersion } = useConnectionInfo()
  const currentProfile = useCurrentProfile()
  const currentCollection = useCurrentCollection()

  // 🔴 Explicit opt-in to frequent updates (stats)
  const cpuUsage = useCpuUsage()
  const activeFps = useActiveFps()

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">
        OBS Information
      </h3>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-600">Version:</span>
          <span className="ml-2 font-medium">{obsVersion}</span>
        </div>
        <div>
          <span className="text-gray-600">WebSocket:</span>
          <span className="ml-2 font-medium">{websocketVersion}</span>
        </div>
        <div>
          <span className="text-gray-600">Profile:</span>
          <span className="ml-2 font-medium">{currentProfile}</span>
        </div>
        <div>
          <span className="text-gray-600">Collection:</span>
          <span className="ml-2 font-medium">{currentCollection}</span>
        </div>
        <div>
          <span className="text-gray-600">CPU Usage:</span>
          <span className="ml-2 font-medium">{cpuUsage.toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-gray-600">FPS:</span>
          <span className="ml-2 font-medium">{activeFps.toFixed(1)}</span>
        </div>
      </div>
    </div>
  )
}
