// src/content/content.ts - Vanilla JS version
import "./content.css"

console.log("[DEBUG] Content script file is loading...")

type VideoMetadata = {
  videoId: string
  title: string
  channel: string
  duration: string
  url: string
}

type DropdownAction = "save" | "bookmark" | "share" | "download"

class YouTubeDropdown {
  private container: HTMLElement
  private isOpen = false

  constructor(
    container: HTMLElement,
    onAction: (action: DropdownAction) => void
  ) {
    this.container = container
    this.render(onAction)
  }

  private render(onAction: (action: DropdownAction) => void): void {
    // Create dropdown button
    const button = document.createElement("button")
    button.className = "yt-dropdown-btn"
    button.innerHTML = `
                                              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                                            </svg>
                                                                `

    // Create dropdown menu
    const menu = document.createElement("div")
    menu.className = "yt-dropdown-menu"
    menu.style.display = "none"

    const actions: Array<{
      action: DropdownAction
      label: string
      icon: string
    }> = [
      { action: "save", label: "Save to Session", icon: "💾" },
      { action: "bookmark", label: "Bookmark", icon: "⭐" },
      { action: "share", label: "Share", icon: "🔗" },
      { action: "download", label: "Download Info", icon: "⬇️" },
    ]

    actions.forEach(({ action, label, icon }) => {
      const item = document.createElement("button")
      item.className = "yt-dropdown-item"
      item.innerHTML = `<span class="icon">${icon}</span><span>${label}</span>`
      item.addEventListener("click", (e) => {
        e.stopPropagation()
        this.close()
        onAction(action)
      })
      menu.appendChild(item)
    })

    // Toggle functionality
    button.addEventListener("click", (e) => {
      e.stopPropagation()
      this.toggle()
    })

    // Close when clicking outside
    document.addEventListener("click", () => {
      this.close()
    })

    // Prevent menu clicks from closing
    menu.addEventListener("click", (e) => {
      e.stopPropagation()
    })

    this.container.appendChild(button)
    this.container.appendChild(menu)
  }

  private toggle(): void {
    this.isOpen ? this.close() : this.open()
  }

  private open(): void {
    const menu = this.container.querySelector(
      ".yt-dropdown-menu"
    ) as HTMLElement
    if (menu) {
      menu.style.display = "block"
      this.isOpen = true
    }
  }

  private close(): void {
    const menu = this.container.querySelector(
      ".yt-dropdown-menu"
    ) as HTMLElement
    if (menu) {
      menu.style.display = "none"
      this.isOpen = false
    }
  }

  public destroy(): void {
    this.container.innerHTML = ""
  }
}

class YouTubeContentScript {
  private isExtensionEnabled = true
  private dropdown: YouTubeDropdown | null = null
  private containerElement: HTMLElement | null = null
  private observer: MutationObserver | null = null

  constructor() {
    this.init()
  }

  private async init(): Promise<void> {
    console.log("[YouTubeExtension] Initializing extension...")

    await this.loadExtensionState()
    console.log(
      "[YouTubeExtension] Extension state loaded:",
      this.isExtensionEnabled
    )

    this.setupMessageListener()
    console.log("[YouTubeExtension] Message listener set up.")

    this.setupPageObserver()

    // Initial injection attempt
    console.log("[YouTubeExtension] Attempting initial dropdown injection...")
    this.injectDropdown()
  }

  private async loadExtensionState(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_EXTENSION_STATE",
      })
      this.isExtensionEnabled = response?.enabled ?? true
    } catch (error) {
      console.error("Failed to load extension state:", error)
    }
  }

  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
      if (message.type === "EXTENSION_STATE_CHANGED") {
        this.isExtensionEnabled = message.enabled
        this.updateDropdownVisibility()
      }
    })
  }

  private setupPageObserver(): void {
    console.log(
      "[YouTubeExtension] Setting up MutationObserver for dynamic content..."
    )

    this.observer = new MutationObserver((mutations) => {
      console.log(
        `[YouTubeExtension] MutationObserver triggered: ${mutations.length} mutations detected`
      )

      let shouldReinject = false
      const triggers: Array<string> = []

      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue

        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue

          const el = node as Element

          // Check for key elements being added
          if (
            el.matches("yt-icon-button.dropdown-trigger") ||
            el.querySelector("yt-icon-button.dropdown-trigger")
          ) {
            triggers.push("found dropdown-trigger directly or inside new node")
            shouldReinject = true
          }

          if (
            el.id === "top-level-buttons-computed" ||
            el.querySelector("#top-level-buttons-computed")
          ) {
            triggers.push("found top-level-buttons-computed")
            shouldReinject = true
          }

          if (
            el.id === "menu" ||
            el.tagName.toLowerCase().includes("ytd-menu-renderer")
          ) {
            triggers.push("found menu or ytd-menu-renderer")
            shouldReinject = true
          }
        }
      }

      if (shouldReinject) {
        console.log(
          "[YouTubeExtension] Triggering re-injection because:",
          triggers
        )
        // Small delay to let YouTube finish rendering
        setTimeout(() => {
          console.log(
            "[YouTubeExtension] Running injectDropdown() after mutation..."
          )
          this.injectDropdown()
        }, 300)
      } else {
        console.debug(
          "[YouTubeExtension] No relevant mutations for dropdown injection."
        )
      }
    })

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    console.log("[YouTubeExtension] MutationObserver is now active.")
  }

  private injectDropdown(): void {
    console.log("[YouTubeExtension] Attempting to inject dropdown...")

    // Remove existing dropdown first
    this.removeDropdown()

    // Look for the three-dot "More actions" button
    const moreActionsButton = document.querySelector<HTMLElement>(
      'yt-icon-button.dropdown-trigger, yt-button-shape > button[aria-label="More actions"]'
    )

    if (!moreActionsButton) {
      console.warn(
        '[YouTubeExtension] Could not find "More actions" button (three dots). Retrying in 1s...'
      )
      setTimeout(() => this.injectDropdown(), 1000)
      return
    }

    console.log(
      '[YouTubeExtension] Found "More actions" button:',
      moreActionsButton
    )

    // Ensure parent exists
    const parent = moreActionsButton.parentNode
    if (!parent) {
      console.error(
        "[YouTubeExtension] More actions button has no parent node. Aborting injection."
      )
      return
    }

    console.log(
      "[YouTubeExtension] Parent node of more actions button:",
      parent
    )

    // Create container
    this.containerElement = document.createElement("div")
    this.containerElement.id = "youtube-session-tracker-dropdown"
    this.containerElement.style.display = this.isExtensionEnabled
      ? "block"
      : "none"
    this.containerElement.setAttribute("data-injected", "true")

    console.log(
      "[YouTubeExtension] Created dropdown container:",
      this.containerElement
    )

    try {
      // Insert before the more actions button
      parent.insertBefore(this.containerElement, moreActionsButton)
      console.log("[YouTubeExtension] Successfully inserted dropdown into DOM")
    } catch (err) {
      console.error(
        "[YouTubeExtension] Failed to insert dropdown into DOM:",
        err
      )
      return
    }

    // Verify it's actually in the DOM
    const insertedEl = document.getElementById(
      "youtube-session-tracker-dropdown"
    )
    if (!insertedEl) {
      console.error(
        "[YouTubeExtension] Dropdown was created but not found in DOM after insertion!"
      )
      return
    }

    console.log("[YouTubeExtension] Confirmed dropdown is in DOM:", insertedEl)

    // Create vanilla JS dropdown (no React)
    try {
      this.dropdown = new YouTubeDropdown(
        insertedEl,
        this.handleDropdownAction.bind(this)
      )
      console.log("[YouTubeExtension] Successfully created vanilla dropdown")
    } catch (err) {
      console.error("[YouTubeExtension] Failed to create dropdown:", err)
    }
  }

  private removeDropdown(): void {
    if (this.dropdown) {
      this.dropdown.destroy()
      this.dropdown = null
    }
    if (this.containerElement) {
      this.containerElement.remove()
      this.containerElement = null
    }
  }

  private updateDropdownVisibility(): void {
    if (this.containerElement) {
      this.containerElement.style.display = this.isExtensionEnabled
        ? "block"
        : "none"
    }
  }

  private async handleDropdownAction(action: DropdownAction): Promise<void> {
    const metadata = this.extractVideoMetadata()
    if (!metadata) {
      console.error("Could not extract video metadata")
      return
    }

    const sessionData = {
      ...metadata,
      timestamp: Date.now(),
      action,
    }

    try {
      await chrome.runtime.sendMessage({
        type: "SEND_SESSION_METADATA",
        data: sessionData,
      })
      console.log("Session metadata sent:", sessionData)
    } catch (error) {
      console.error("Failed to send session metadata:", error)
    }
  }

  private extractVideoMetadata(): VideoMetadata | null {
    try {
      // Extract video ID from URL
      const urlParams = new URLSearchParams(window.location.search)
      const videoId = urlParams.get("v")
      if (!videoId) return null

      // Extract title
      const titleElement = document.querySelector(
        "h1.ytd-watch-metadata yt-formatted-string"
      )
      const title = titleElement?.textContent?.trim() || "Unknown Title"

      // Extract channel name
      const channelElement = document.querySelector("ytd-channel-name a")
      const channel = channelElement?.textContent?.trim() || "Unknown Channel"

      // Extract duration (if available)
      const durationElement = document.querySelector(".ytp-time-duration")
      const duration = durationElement?.textContent?.trim() || "00:00"

      return {
        videoId,
        title,
        channel,
        duration,
        url: window.location.href,
      }
    } catch (error) {
      console.error("Error extracting video metadata:", error)
      return null
    }
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect()
    }
    this.removeDropdown()
  }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => new YouTubeContentScript()
  )
} else {
  new YouTubeContentScript()
}
