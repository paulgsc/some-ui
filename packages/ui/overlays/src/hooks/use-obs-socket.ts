import { useCallback, useEffect, useRef, useState } from "react"

export type ObsStatus = {
  streaming: boolean
  recording: boolean
  stream_timecode: string
  recording_timecode: string
  scenes: Array<string>
  current_scene: string
}

type UseObsWebSocketOptions = {
  url?: string
  autoReconnect?: boolean
  reconnectInterval?: number
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Event) => void
}

export const useObsWebSocket = ({
  url = `ws://${window.location.hostname}:${window.location.port}/ws/obs`,
  autoReconnect = false,
  reconnectInterval = 5000,
  onConnect,
  onDisconnect,
  onError,
}: UseObsWebSocketOptions = {}) => {
  const [status, setStatus] = useState<ObsStatus>({
    streaming: false,
    recording: false,
    stream_timecode: "00:00:00.000",
    recording_timecode: "00:00:00.000",
    scenes: [],
    current_scene: "",
  })

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const hasConnectedOnce = useRef(false)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState < 2) {
      // Avoid creating a new socket if one is already open or connecting
      return
    }

    clearReconnectTimer()
    setIsConnecting(true)
    setError(null)

    console.log(`Attempting to connect to ${url}...`)

    const socket = new WebSocket(url)
    socketRef.current = socket

    const connectionTimeout = window.setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        console.log("Connection attempt timed out")
        socket.close()
      }
    }, 10000)

    socket.onopen = () => {
      window.clearTimeout(connectionTimeout)
      setIsConnected(true)
      setIsConnecting(false)
      setError(null)
      hasConnectedOnce.current = true
      onConnect()
    }

    socket.onmessage = (event) => {
      try {
        const newStatus = JSON.parse(event.data) as ObsStatus
        setStatus((prev) => ({ ...prev, ...newStatus }))
      } catch (e) {
        console.error("Failed to parse OBS status update:", e)
      }
    }

    socket.onclose = (event) => {
      window.clearTimeout(connectionTimeout)
      setIsConnected(false)
      setIsConnecting(false)
      onDisconnect()

      if (autoReconnect && hasConnectedOnce.current) {
        const delay = Math.min(
          30000,
          reconnectInterval * Math.pow(1.5, Math.floor(Math.random() * 5))
        )
        console.log(`Reconnecting in ${delay}ms...`)
        reconnectTimerRef.current = window.setTimeout(() => {
          connect()
        }, delay)
      }
    }

    socket.onerror = (e) => {
      console.log(`WebSocket error connecting to: ${url}`)
      console.log("Connection state:", socket.readyState)
      console.log("Error details:", e)
      setError(`WebSocket connection error to ${url}`)
      setIsConnecting(false)
      onError(e)
    }
  }, [
    url,
    autoReconnect,
    reconnectInterval,
    onConnect,
    onDisconnect,
    onError,
    clearReconnectTimer,
  ])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    clearReconnectTimer()
  }, [clearReconnectTimer])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [])

  const isSceneAvailable = useCallback(
    (sceneName: string) => status.scenes.includes(sceneName),
    [status.scenes]
  )

  return {
    status,
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect,
    isSceneAvailable,
  }
}
