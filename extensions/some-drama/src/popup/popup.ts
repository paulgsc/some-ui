import { PopupStateMachine } from "@drama/lib/background/fsm"

import "@drama/styles/popup.css"

import { PopupRenderer } from "@drama/lib/background/renderer"

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
