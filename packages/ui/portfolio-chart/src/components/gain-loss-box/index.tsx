type GainLossBoxProps = {
  label: string
  value: string
  isPositive: boolean
}

export const GainLossBox = ({ label, value, isPositive }: GainLossBoxProps) => {
  return (
    <div
      className={`rounded-lg p-4 ${
        isPositive
          ? "bg-green-100 dark:bg-green-900/20"
          : "bg-red-100 dark:bg-red-900/20"
      }`}
    >
      <p className="text-muted-foreground text-sm">{label}</p>
      <p
        className={`text-2xl font-bold ${
          isPositive
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        }`}
      >
        {value}
      </p>
    </div>
  )
}
