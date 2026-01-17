
// initialization-manager.ts
// Handles extension lifecycle WITHOUT aggressive cleanup

export class InitializationManager {
  private initialized = false
  private cleanupMarker = `boyo-session-${Date.now()}`

  /**
   * Initialize WITHOUT nuking existing overlays
   * Only mark session for tracking
   */
  async initializeClean(): Promise<void> {
    if (this.initialized) return

    console.log("[BOYO] Starting initialization")

    // Mark this session
    document.body.dataset.boyoSession = this.cleanupMarker

    this.initialized = true
    console.log("[BOYO] Initialization complete, session:", this.cleanupMarker)
  }

  /**
   * Check if overlay belongs to current session
   */
  isCurrentSession(overlay: HTMLElement): boolean {
    return overlay.dataset.boyoSession === this.cleanupMarker
  }

  /**
   * Get current session marker for tagging new overlays
   */
  getSessionMarker(): string {
    return this.cleanupMarker
  }

  /**
   * Check if we should process this element
   * Returns false if element is from a previous session and should be skipped
   */
  shouldProcess(element: Element): boolean {
    const overlay = element.querySelector(".boyo-overlay") as HTMLElement
    if (!overlay) return true // No overlay, safe to process

    // If overlay exists but from old session, skip
    return this.isCurrentSession(overlay)
  }
}

// Singleton instance
export const initManager = new InitializationManager()
