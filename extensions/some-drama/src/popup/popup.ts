import { PopupStateMachine } from "@drama/lib/popup/fsm"

import "@drama/styles/popup.css"

import { PopupRenderer } from "@drama/lib/popup/renderer"

document.addEventListener("DOMContentLoaded", () => {
  const rootWorkspace = document.getElementById("popup-root")
  if (!rootWorkspace) return

  // Initialize the clear, decoupled systems architecture
  const stateMachine = new PopupStateMachine((updatedPhase) => {
    rendererEngine.render(updatedPhase)
  })

  const rendererEngine = new PopupRenderer(rootWorkspace, stateMachine)

  // Initialize systemic processes
  void stateMachine.boot()
})
