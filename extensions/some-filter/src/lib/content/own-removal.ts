/**
 * Removals this extension performed itself, for `isSelfAuthored`
 * (`adapter/pipeline.ts`, Axiom 3.5).
 *
 * "One of our nodes is gone" is ambiguous on its own: we took it down, or the
 * vendor did (Remark 7.2), and the second case must be repaired. So a
 * removal is read as our own only when the exact node was removed through
 * `removeOwnNode()`. A vendor removing the same node never passes through
 * here, and still schedules a round.
 *
 * Without this, every first pass paid for a second full round on a static
 * page: the veil's removal at commit, and the transition freeze's removal,
 * each looked like vendor evidence.
 */

const removedByUs = new WeakSet<Node>()

/** Removes `node` from the tree and records that this extension did it. */
export function removeOwnNode(node: ChildNode): void {
  removedByUs.add(node)
  node.remove()
}

/** True when `node` left the tree through `removeOwnNode()`. */
export function wasRemovedByUs(node: Node): boolean {
  return removedByUs.has(node)
}
