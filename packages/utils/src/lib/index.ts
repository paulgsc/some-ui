// Temporary re-export shim (UTL-HOIST S1, #530) - cn/string/date/array
// utils moved to @some-ui/core-utils. Removed in UTL-CUTOVER once consumers
// repoint directly at the new package.
export * from "@some-ui/core-utils"
export { assertNever } from "./assert-never"
export * from "./hooks"
export * from "./speech"
export { useCycleRotationAdapter, useViewport } from "./polyhedron"
export {
  createEventBus,
  selectProgress,
  selectIsRunning,
  selectTotalDuration,
  selectCurrentTime,
  selectConnectionStatus,
  useSceneLifetimes,
  useOrchestratorStore,
  useOrchestratorClock,
  useMode,
  useIsRunning,
  useIsPaused,
  useIsTerminal,
  setSessionKey,
  setSuspended,
  getSessionKey,
  getSuspended,
  useSessionKey,
  useSuspended,
  useRegionRectStore,
  useRegionRect,
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
  useRecordTimecode,
  usePrimaryScene,
  useReplayBufferActive,
  useSceneInfo,
  useStreamTimecode,
  useStudioModeEnabled,
  useVirtualCamActive,
} from "./context"
export {
  preloadRegistryComponents,
  hasRegistryKey,
  lazyWithPreload,
  renderRegistryComponent,
} from "./registry"
export type { ComponentEnhancer } from "./registry"
export * from "./discovery"
