/**
 * The Sensor (BC2, #1435): the only reader of VendorDOM. Wraps mutation and
 * navigation, classifies nodes by table lookup, keeps element ↔ card
 * identity and the retry queue, and emits tokens for Core.
 */

export type { NodeClass } from "./classify"
export { classifyNode } from "./classify"
export type { Identity, Reconciliation } from "./identity"
export { createIdentity } from "./identity"
export type { QueueEntry, RetryQueue } from "./queue"
export { createRetryQueue, RESOLVE_BUDGET_MS, RETRY_INTERVAL_MS } from "./queue"
export type { Sensor, SensorCensus, SensorPorts } from "./sensor"
export { createSensor, NAV_DEBOUNCE_MS } from "./sensor"
