document.addEventListener("DOMContentLoaded", function () {
  const toggleBtn = document.getElementById("toggleBtn")
  const status = document.getElementById("status")

  // Update status display
  function updateStatus(hidden) {
    if (hidden) {
      status.innerHTML = `
                                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                                                                </svg>
                                                                          Comments Hidden
                                                                                  </span>
                                                                                        `
    } else {
      status.innerHTML = `
                                        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                  <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                                                                        </svg>
                                                                                  Comments Visible
                                                                                          </span>
                                                                                                `
    }
  }

  // Handle toggle button click
  toggleBtn.addEventListener("click", function () {
    // Add loading state
    toggleBtn.disabled = true
    toggleBtn.textContent = "Processing..."
    toggleBtn.className = toggleBtn.className.replace(
      "bg-blue-600 hover:bg-blue-700",
      "bg-gray-400 cursor-not-allowed"
    )

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(
        tabs[0].id,
        { action: "toggleComments" },
        function (response) {
          // Reset button state
          toggleBtn.disabled = false
          toggleBtn.textContent = "Toggle Comments"
          toggleBtn.className = toggleBtn.className.replace(
            "bg-gray-400 cursor-not-allowed",
            "bg-blue-600 hover:bg-blue-700"
          )

          if (chrome.runtime.lastError) {
            // Handle error - likely not on a GitHub page
            status.innerHTML = `
                                                              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                                            <svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                                                                            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                                                                                                          </svg>
                                                                                                                        Not on GitHub
                                                                                                                                    </span>
                                                                                                                                              `
            return
          }

          if (response && response.success) {
            updateStatus(response.hidden)
          }
        }
      )
    })
  })

  // Check initial state when popup opens
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const url = tabs[0].url
    if (url.includes("github.com")) {
      // On GitHub, assume comments are hidden by default
      updateStatus(true)
    }
  })
})
