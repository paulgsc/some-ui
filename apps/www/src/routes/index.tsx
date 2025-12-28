import { createFileRoute } from "@tanstack/react-router"
import type { AllowedRotationAxis } from "some-ui-slideshow"
import { RotatingNeonSign } from "some-ui-slideshow"

const App = () => {
  const dof: AllowedRotationAxis = "X-axis"
  const args = {
    className: "w-full max-w-xl h-32",
    faceClassName: "bg-sky-200",
    perspective: 1250,
    dof,
  }
  return <RotatingNeonSign {...args} />
}

export const Route = createFileRoute("/")({
  component: App,
})
