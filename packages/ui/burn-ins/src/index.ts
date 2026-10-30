export { BurnInsPreview } from "./components/preview"
export { BurnInRecorder } from "./components/record"
export { BurnInStage } from "./components/stage"
export {
  boxesOf,
  DESIGNS,
  frameAt,
  isKind,
  KINDS,
  prepare,
  REGIONS_OF,
  runtimeMs,
} from "./lib/burn-in"
export type {
  BurnInData,
  BurnInFrame,
  Kind,
  Parsed,
  Prepared,
} from "./lib/burn-in"
export { toSrt } from "./lib/captions/srt"
export { FRAME, REGIONS, SAFE_AREA, SAFE_INSETS } from "./lib/geometry"
export { RECORDER_GLOBAL } from "./runtime/record"
