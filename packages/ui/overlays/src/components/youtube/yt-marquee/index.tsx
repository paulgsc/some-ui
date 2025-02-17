import { Marquee } from "some-ui-shared"
import { cn } from "some-ui-utils"

const reviews = [
  {
    name: "This song is fire🔥🔥🔥",
    username: "@mujik",
    body: "房东的猫 - 所念皆星河「所念皆星河，辗转里反侧」【動態歌詞/Lyrics Video",
    img: "https://avatar.vercel.sh/jack",
  },
  {
    name: "This song is da bomb💣💣💣🔥🔥🔥",
    username: "@lfg",
    body: "買辣椒也用券 - 起風了 (新版)【動態歌詞Lyrics】",
    img: "https://avatar.vercel.sh/jill",
  },
  {
    name: "It's not rain, I'm just pissed!",
    username: "@cindarella",
    body: "No boys, no flowers, just focus on revenge Go Ana!",
    img: "https://avatar.vercel.sh/john",
  },
  {
    name: "UsBank",
    username: "@neverbegan",
    body: "Thank you for choosing U.S. Bank. We noticed you haven't used your account ending in 0915 for several months. ..., so we wanted to check in with you.",
    img: "https://avatar.vercel.sh/jane",
  },
  {
    name: "Sankyu Kindly! 🫠",
    username: "@vaibhavtanwar442",
    body: "Dude u r savior",
    img: "https://avatar.vercel.sh/jenny",
  },
  {
    name: "What is even the point?!",
    username: "@emotion",
    body: "Not joy, just pain, frustration and humiliation, is this real life!",
    img: "https://avatar.vercel.sh/james",
  },
  {
    name: "smooth brained boyo",
    username: "@ast",
    body: "I'm building a tailwindcss linter from scratch, but I don't even know how an ast is working. I hate everything.",
    img: "https://avatar.vercel.sh/tim",
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
