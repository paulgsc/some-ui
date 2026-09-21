/**
 * The Actuator (BC4, #1437): the only module that writes to VendorDOM or
 * calls `browser.*`. `realize(actions)` executes what Core named; answers
 * come back to Core as inputs through the inbox it was given.
 */

export type { Actuator, ActuatorPorts } from "./actuator"
export { createActuator, VEIL_EXIT_FALLBACK_MS } from "./actuator"
export type {
  BoundAction,
  BoundCardAction,
  BoundOtherAction,
  CustodyRole,
  CustodyTarget,
} from "./bound"
export type { GestureDelegation, GesturePorts } from "./gestures"
export { attachGestures } from "./gestures"
