import { useEffect, useRef } from "react"
import { useOrchestratorStore } from "@utils/lib/context/zustand-store"
import type { OrchestratorCommand } from "some-types-utils"

import type { EngineState } from "./mock-orchestrator-engine"
import {
  advanceClock,
  applyCommand,
  buildOrchestratorState,
  createEngineState,
} from "./mock-orchestrator-engine"

export type UseMockOrchestratorConfig = {
  stream_id: string
  onSceneChange?: (from: string | null, to: string | null) => void
  onError?: (error: Event | Error) => void
  /** How often the simulated clock advances, in ms. Defaults to 100ms. */
  tickIntervalMs?: number
}

/**
 * Client-only stand-in for `useOrchestrator`. Simulates the same FSM/tick
 * contract entirely in-browser (no WebSocket), so sessions can play without
 * a live orchestrator backend. Drives the same `useOrchestratorStore`, so
 * every existing consumer (OrchestratorControls, ActiveLifetimesPanel,
 * OrchestratorTimeline, useSceneDrivenLayout, OrchestratedYouTubeViewport)
 * keeps working unmodified.
 */
export function useMockOrchestrator({
  stream_id,
  onSceneChange,
  onError,
  tickIntervalMs = 100,
}: UseMockOrchestratorConfig): void {
  const { _setState, _setConnectionStatus, _setCommandSender, _setError } =
    useOrchestratorStore.getState()

  const engineRef = useRef<EngineState>(createEngineState())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevSceneRef = useRef<string | null>(null)
  const callbacksRef = useRef({ onSceneChange, onError })

  useEffect(() => {
    callbacksRef.current = { onSceneChange, onError }
  }, [onSceneChange, onError])

  useEffect(() => {
    const emit = (): void => {
      const next = buildOrchestratorState(engineRef.current)
      const prev = prevSceneRef.current
      const curr = next.current_active_scene

      _setState(next)

      if (prev !== curr) {
        prevSceneRef.current = curr
        queueMicrotask(() => {
          callbacksRef.current.onSceneChange?.(prev, curr)
        })
      }
    }

    const stopTicking = (): void => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    const startTicking = (): void => {
      stopTicking()
      intervalRef.current = setInterval(() => {
        engineRef.current = advanceClock(engineRef.current, Date.now())
        emit()
        if (engineRef.current.mode !== "Running") stopTicking()
      }, tickIntervalMs)
    }

    const handleCommand = (command: OrchestratorCommand): Promise<void> => {
      const wasRunning = engineRef.current.mode === "Running"
      engineRef.current = applyCommand(engineRef.current, command, Date.now())
      const isRunning = engineRef.current.mode === "Running"

      if (isRunning && !wasRunning) startTicking()
      if (!isRunning && wasRunning) stopTicking()

      emit()
      return Promise.resolve()
    }

    _setConnectionStatus(true, false)
    _setError(null)
    _setCommandSender(handleCommand, stream_id)
    emit()

    return (): void => {
      stopTicking()
      _setConnectionStatus(false, false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store setters are stable; re-running per stream_id/tickIntervalMs is intentional
  }, [stream_id, tickIntervalMs])
}
