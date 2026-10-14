/**
 * The Actuator (BC4): the only module that writes to VendorDOM or sends
 * the whitelist messages. `realize(actions)` executes what Core named; answers
 * come back to Core as inputs through the inbox it was given.
 */

export type { Actuator } from "./actuator"
export { createActuator } from "./actuator"
export type { BoundAction } from "./bound"
