/**
 * `@some-ui/voice-capture/testing`: the one simulated microphone and the
 * scenario family every screen's tests share, so no screen
 * writes a fake microphone of its own. Not the phone's code: nothing here
 * reaches the microphone, and fast-check is only for tests.
 */
export type {
  MicFinish,
  MicOpen,
  MicScript,
  SimulatedMicrophone,
} from "./lib/simulated-microphone"
export { simulatedMicrophone, SPEAKING } from "./lib/simulated-microphone"
export type {
  KeepScript,
  ScenarioBounds,
  ScenarioBuild,
  ScenarioEnding,
  ScenarioMicrophone,
  ScenarioPage,
  ScenarioPhone,
  ScenarioRun,
  ScenarioScreen,
  ScenarioStep,
  TakeScenario,
} from "./lib/scenario"
export {
  assertTakeProperties,
  boundOf,
  kitScreen,
  kitScreens,
  memoryKeep,
  runTakeScenario,
  SCENARIO_BOUNDS,
  takeScenarios,
} from "./lib/scenario"
export type {
  MemoryTakes,
  SimulatedPattern,
  SimulatedPlayer,
} from "./lib/pattern-testing"
export {
  memoryShelf,
  memoryTakes,
  simulatedPattern,
  simulatedPlayer,
  takeButton,
} from "./lib/pattern-testing"
