export type { ConformanceResult, FieldFinding } from "./conformance"
export { checkConformance } from "./conformance"

export type {
  Contract,
  ContractExpectation,
  ContractRequest,
  HttpMethod,
  PathBinding,
  UnknownFieldPolicy,
} from "./contract"
export {
  acceptedStatuses,
  API_V1_PREFIX,
  bindPath,
  defineContract,
  fullPath,
  requestUrl,
  schemaStatuses,
} from "./contract"

export type {
  DriftFinding,
  DriftReport,
  RouteEntry,
  RouteInventory,
} from "./drift"
export {
  assertSupportedInventory,
  checkDrift,
  InventoryShapeError,
  InventoryVersionError,
  parseInventory,
  RouteInventorySchema,
  SUPPORTED_SCHEMA_VERSION,
} from "./drift"

export type {
  ContractOutcome,
  Finding,
  OutcomeStatus,
  ProbeOptions,
  Severity,
} from "./probe"
export { probeContract } from "./probe"

export { allContracts, assertUniqueIds, selectContracts } from "./registry"

export type { RunReport, RunSummary } from "./report"
export {
  exitCode,
  renderDrift,
  renderOutcomes,
  renderSummary,
  summarize,
} from "./report"
