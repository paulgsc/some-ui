import { Marquee } from "some-ui-shared"
import { cn } from "some-ui-utils"

const reviews = [
  {
    name: "Leetcode",
    username: "@boring as ...",
    body: "day n of planning to grind leetcode, but never doing it.",
    img: "https://avatar.vercel.sh/jack",
  },
  {
    name: "Liverpool won but...",
    username: "@dead inside",
    body: "Yay! Liverpool won the league again! So wai me no feel no nothing? sadness!😔",
    img: "https://avatar.vercel.sh/jill",
  },
  {
    name: "You've only got 7 days left",
    username: "namecheap",
    body: "One or more of your domains will expire in 7 days. Luckily, i'ts easy to renew just by clicking the button below.",
    img: "https://avatar.vercel.sh/john",
  },
  {
    name: "UsBank",
    username: "@neverbegan",
    body: "Thank you for choosing U.S. Bank. We noticed you haven't used your account ending in 0915 for several months. ..., so we wanted to check in with you.",
    img: "https://avatar.vercel.sh/jane",
  },
  {
    name: "What is even the point?!",
    username: "@emotion",
    body: "Not joy, just pain, frustration and humiliation, is this real life!",
    img: "https://avatar.vercel.sh/james",
  },
  {
    name: "I come to you again",
    username: "browser",
    body: "I'm a browser refugee. Google chrome is no more for boyo, currently coping with mozilla, but feels like google throttles it on sites like youtebe. I'm I really destined to be sad boi?!",
    img: "https://www.mozilla.org/favicon.ico",
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
