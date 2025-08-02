import { createRoot } from "react-dom/client"

import Popup from "./popup-card"

import "./popup.css"

const container = document.getElementById("popup-root")
if (container) {
  const root = createRoot(container)
  root.render(<Popup />)
}
