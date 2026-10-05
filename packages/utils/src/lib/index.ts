// Temporary re-export shim (UTL-HOIST S1, #530) - cn/string/date/array
// utils moved to @some-ui/core-utils. Removed in UTL-CUTOVER once consumers
// repoint directly at the new package.
export * from "@some-ui/core-utils"
export { assertNever } from "./assert-never"
export * from "./hooks"
export {
  selectTotalDuration,
  selectCurrentTime,
  useSceneLifetimes,
  useOrchestratorStore,
  useOrchestratorClock,
  useIsRunning,
  useIsPaused,
  useIsTerminal,
  setSessionKey,
  setSuspended,
  useSessionKey,
  useSuspended,
  usePrimaryScene,
} from "./context"
export { lazyWithPreload, renderRegistryComponent } from "./registry"
export type { ComponentEnhancer } from "./registry"
export * from "./discovery"
