type SuccessFeedbackProps = {
  show: boolean
  points: number
}

export const SuccessFeedback = ({
  show,
  points,
}: SuccessFeedbackProps): React.JSX.Element | null => {
  if (!show) return null

  return (
    <div
      className="absolute text-4xl font-bold text-green-400 pointer-events-none z-50 animate-ping"
      style={{
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
      }}
    >
      +{points}
    </div>
  )
}
