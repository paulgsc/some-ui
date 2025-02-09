import { cn } from "some-ui-utils"

type CreditItem = {
  job: string
  name: string
}

export const ScrollingCredits = () => {
  const credits: Array<CreditItem> = [
    { job: "directed by", name: "christopher nolan" },
    { job: "produced by", name: "steven spielberg" },
    { job: "screenplay by", name: "michael bay" },
    { job: "director of photography", name: "wolfgang petersen" },
    { job: "story", name: "david fincher" },
    { job: "visual effects supervisor", name: "jerry bruckheimer" },
    { job: "cast supervisor", name: "john doe" },
  ]

  // Repeat credits multiple times to create longer scroll
  const repeatedCredits = [
    ...credits,
    ...credits,
    ...credits,
    ...credits,
    ...credits,
  ]

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-gray-700 to-gray-900">
      <div
        className={cn(
          "absolute left-1/2 w-[400px] -translate-x-1/2 text-center font-light uppercase text-white",
          "animate-credits-scroll"
        )}
      >
        <h1 className="mb-12 text-5xl">Life of John Doe</h1>

        {repeatedCredits.map((credit, index) => (
          <div key={index} className="mb-12">
            <div className="mb-1 text-lg">{credit.job}</div>
            <div className="text-3xl">{credit.name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
