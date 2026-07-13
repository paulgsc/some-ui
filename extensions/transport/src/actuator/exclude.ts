/**
 * Corollary 7.3.1 (the prepaint corollary), Proposition 7.3 (measurement
 * disturbance) — canon §7.
 *
 * A subtree-exclusion helper any detector (Sensor, S4) can use to keep
 * actuator output out of its own sampling. This is *structural*
 * exclusion — deciding, before a node is ever read, that it lies inside
 * an actuator-owned subtree — not a post-hoc filter over already-sampled
 * evidence: Proposition 7.3's proof is exactly that filtering after the
 * fact cannot repair a violation of Axiom 3.5.
 */

import { isSelfTagged } from "./self-tag"

/** True if `node`, or any ancestor of it up to and including `root`, is self-tagged (actuator-owned). */
export function isWithinActuatorSubtree(
  node: Node,
  root: Node = document
): boolean {
  let current: Node | null = node
  while (current !== null) {
    if (current instanceof Element && isSelfTagged(current)) {
      return true
    }
    if (current === root) {
      break
    }
    current = current.parentNode
  }
  return false
}

/**
 * Filters `nodes` down to those *not* rooted inside an actuator-owned
 * subtree — the structural exclusion a detector applies before treating a
 * node as a candidate source of evidence.
 */
export function excludeActuatorSubtree<N extends Node>(
  nodes: Iterable<N>,
  root: Node = document
): Array<N> {
  const result: Array<N> = []
  for (const node of nodes) {
    if (!isWithinActuatorSubtree(node, root)) {
      result.push(node)
    }
  }
  return result
}
