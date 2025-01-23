import { Marquee } from "some-ui-shared"
import { cn } from "some-ui-utils"

const reviews = [
  {
    name: "HR",
    username: "@lol",
    body: "Hi Paul, Unfortunately you were not selected for the position at Sc***er. They ended up moving forward with a different candidate.",
    img: "https://avatar.vercel.sh/jack",
  },
  {
    name: "Goo Ha Na",
    username: "@cindarella",
    body: "No rain, no flowers!",
    img: "https://avatar.vercel.sh/jill",
  },
  {
    name: "Top Listener of Crush",
    username: "@music",
    body: "You were in the top 0.25% of listeners in December 2024",
    img: "https://avatar.vercel.sh/john",
  },
  {
    name: "Thought of the day",
    username: "@neverbegan",
    body: "Today is as good as it gets, but today was a bad day",
    img: "https://avatar.vercel.sh/jane",
  },
  {
    name: "Levy",
    username: "@farmer",
    body: "One day I will be grandmother! Interesting start the procedure!",
    img: "https://avatar.vercel.sh/jenny",
  },
  {
    name: "defensive defection",
    username: "@goodfaith",
    body: "Be skeptical not cynical",
    img: "https://avatar.vercel.sh/james",
  },
]

const firstRow = reviews

const ReviewCard = ({
  img,
  name,
  username,
  body,
}: {
  img: string
  name: string
  username: string
  body: string
}): React.JSX.Element => {
  return (
    <figure
      className={cn(
        "relative w-64 cursor-pointer overflow-hidden rounded-xl border p-4",
        // light styles
        "border-gray-950/[.1] bg-gray-950/[.01] hover:bg-gray-950/[.05]",
        // dark styles
        "dark:border-gray-50/[.1] dark:bg-gray-50/[.10] dark:hover:bg-gray-50/[.15]"
      )}
    >
      <div className="flex flex-row items-center gap-2">
        <img className="rounded-full" width="32" height="32" alt="" src={img} />
        <div className="flex flex-col">
          <figcaption className="text-sm font-medium dark:text-white">
            {name}
          </figcaption>
          <p className="text-xs font-medium dark:text-white/40">{username}</p>
        </div>
      </div>
      <blockquote className="mt-2 text-sm">{body}</blockquote>
    </figure>
  )
}

const YoutubeMarquee = (): React.JSX.Element => {
  return (
    <div className="relative size-full overflow-clip rounded-lg border md:shadow-xl">
      <Marquee pauseOnHover className="[--duration:20s]">
        {firstRow.map((review) => (
          <ReviewCard key={review.username} {...review} />
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-white"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white"></div>
    </div>
  )
}

export default YoutubeMarquee
