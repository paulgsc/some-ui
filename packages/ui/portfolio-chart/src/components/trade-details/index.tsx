type TradeDetailsProps = {
  logic: string
  evaluation: string
  nextStrategy: string
}

export const TradeDetails = ({
  logic,
  evaluation,
  nextStrategy,
}: TradeDetailsProps) => {
  return (
    <div className="mt-4 space-y-3">
      <DetailSection title="Trading Logic" content={logic} />
      <DetailSection title="Evaluation" content={evaluation} />
      <DetailSection title="Next Strategy" content={nextStrategy} />
    </div>
  )
}

type DetailSectionProps = {
  title: string
  content: string
}

const DetailSection = ({ title, content }: DetailSectionProps) => {
  return (
    <div>
      <h4 className="text-sm font-medium">{title}</h4>
      <p className="text-muted-foreground text-sm">{content}</p>
    </div>
  )
}
