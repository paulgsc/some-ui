/**
 * The Actuator (BC4): the only module that writes to VendorDOM.
 * `realize(actions)` executes what Core named.
 */

export type { Actuator } from "./actuator"
export { createActuator } from "./actuator"
export type { BoundAction } from "./bound"
export { setSwitchedOff } from "./switch"
