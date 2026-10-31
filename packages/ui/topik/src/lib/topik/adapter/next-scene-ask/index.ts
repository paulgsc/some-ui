/**
 * The next scene's prompt, asked of the owner's home (docs/makjang/README.md,
 * "Asking home for the next scene"): the port the host injects. The host
 * keeps each ask on the device and carries it home, which hands it to the
 * routine that writes the drama; topik builds the prompt, hands it over,
 * and shows what the host says of it. Keeping an ask is synchronous, so
 * nothing here waits.
 */

/** What the host says of its asks, for the screen to show as it is. */
export type SceneAskSnapshot = {
  /** Where the newest ask is, and since when, in the person's terms. */
  said: string
  /** Home holds the newest ask. */
  held: boolean
}

export type SceneAsk = {
  getSnapshot: () => SceneAskSnapshot
  subscribe: (listener: () => void) => () => void
  /**
   * Keeps one prompt on this device to go home: its stamp (`sceneStamp`),
   * when it was asked for, its markdown (`nextSceneFile`) and the scene notes
   * it names, by id. Says whether the device kept it.
   */
  ask: (prompt: {
    stamp: string
    at: string
    text: string
    notes: ReadonlyArray<string>
  }) => boolean
}
