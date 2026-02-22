const api = typeof browser !== "undefined" ? browser : chrome

// Initialize default state on install
api.runtime.onInstalled.addListener(() => {
  api.storage.local.set({
    filterEnabled: false,
    filterConfig: {
      invert: 1,
      hueRotate: 180,
      sepia: 0.12,
      brightness: 0.5,
      contrast: 0.92,
    },
  })
})

// Optional: Add keyboard shortcut handler
api.commands.onCommand.addListener((command) => {
  if (command === "toggle-filter") {
    api.storage.local.get("filterEnabled").then(({ filterEnabled }) => {
      const newState = !filterEnabled

      api.storage.local.set({ filterEnabled: newState })

      // Notify all tabs
      api.tabs.query({}).then((tabs) => {
        tabs.forEach((tab) => {
          if (tab.id) {
            api.tabs
              .sendMessage(tab.id, {
                type: "TOGGLE_FILTER",
                enabled: newState,
              })
              .catch(() => {})
          }
        })
      })
    })
  }
})

export {}
