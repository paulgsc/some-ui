/**
 * The Actuator (BC4): the only module that writes to VendorDOM.
 * `realize(actions)` executes what Core named.
 */

export type { Actuator } from "./actuator"
export { createActuator } from "./actuator"
export type { BoundAction, MarkedRow } from "./bound"
export { setPageRules, setSwitchedOff } from "./switch"
