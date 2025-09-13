import ReactDOM from "react-dom/client"

import { Popup } from "./popup-card"

import "./popup.css"

const root = ReactDOM.createRoot(
  document.getElementById("popup-root") as HTMLElement
)

root.render(<Popup />)
