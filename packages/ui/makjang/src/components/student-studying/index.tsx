import type { JSX } from "react"
import { useEffect, useState } from "react"

const BOOK_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export const StudyScene = (): JSX.Element => {
  // State for animations
  const [textProgress, setTextProgress] = useState(0)
  const [thoughtBubbleVisible, setThoughtBubbleVisible] = useState(true)
  const [breatheScale, setBreatheScale] = useState(1)
  const [armRotation, setArmRotation] = useState(0) // Add state for arm rotation
  const [headRotation, setHeadRotation] = useState(0)

  // Text for the typing animation
  const codeText = "const studyHard = () => {\n  return success;\n};"
  const displayText = codeText.substring(0, textProgress)

  useEffect(() => {
    // Text typing animation
    const textInterval = setInterval(() => {
      setTextProgress((prev) => {
        if (prev >= codeText.length) {
          return 0 // Reset to start typing again
        }
        return prev + 1
      })
    }, 100) // Increased typing speed

    // Thought bubble animation
    const thoughtInterval = setInterval(() => {
      setThoughtBubbleVisible((prev) => !prev)
    }, 3000)

    // Breathing animation
    const breatheInterval = setInterval(() => {
      setBreatheScale((prev) => (prev === 1 ? 1.02 : 1))
    }, 1500)

    // Arm movement animation
    const armInterval = setInterval(() => {
      setArmRotation((prev) => (prev === 0 ? 2 : 0)) // Subtle arm movement
    }, 2000)

    // Head movement
    const headInterval = setInterval(() => {
      setHeadRotation((prev) => (prev === 0 ? -2 : 0))
    }, 3000)

    return (): void => {
      clearInterval(textInterval)
      clearInterval(thoughtInterval)
      clearInterval(breatheInterval)
      clearInterval(armInterval)
      clearInterval(headInterval)
    }
  }, [])

  // Color palette
  const colors = {
    background: "#f0f4f8",
    desk: "#a67c52",
    student: {
      head: "#ffdbac",
      torso: "#5d8aa8",
      arms: "#5d8aa8",
      hands: "#ffdbac", // Added hand color
      face: "#663300", // Added face color
    },
    monitor: "#2c3e50",
    screen: "#e0f7fa", // Lighter screen color
    books: ["#e74c3c", "#3498db", "#27ae60", "#f39c12"],
    bookshelf: "#8b4513",
    shelfBooks: ["#c0392b", "#2980b9", "#16a085", "#d35400", "#8e44ad"],
    lamp: {
      base: "#7f8c8d",
      light: "#f1c40f",
    },
    thought: "#ffffff",
  }

  return (
    // An illustration, not a themed surface: everything in this scene is drawn
    // from the literal hex palette declared above, and the two grays here are
    // its wall and its floor. Theming only the ground would leave the drawing
    // floating on a mismatched backdrop.
    // eslint-disable-next-line theme-protocol/no-structural-palette-color
    <div className="flex size-full items-center justify-center bg-gray-100 p-6">
      <div className="relative h-96 w-full max-w-2xl overflow-hidden rounded-lg bg-blue-50 shadow-lg">
        {/* Background — see the note on the outer element. */}
        {/* eslint-disable-next-line theme-protocol/no-structural-palette-color */}
        <div className="absolute inset-0 bg-gray-100" />

        {/* Bookshelf */}
        <div
          className="absolute"
          style={{
            left: "10%",
            top: "5%",
            width: "80%",
            height: "25%",
            backgroundColor: colors.bookshelf,
            borderRadius: "4px", // Slightly rounded bookshelf
          }}
        >
          {/* Books on shelf - top row */}
          {BOOK_SLOTS.map((slot) => (
            <div
              key={`book-top-${slot}`}
              className="absolute"
              style={{
                left: `${8 + slot * 7}%`,
                top: "15%",
                width: "5%",
                height: "70%",
                backgroundColor:
                  colors.shelfBooks[slot % colors.shelfBooks.length],
                borderRadius: "2px",
                boxShadow: "1px 1px 2px rgba(0, 0, 0, 0.1)",
              }}
            />
          ))}

          {/* Shelf divider */}
          <div
            className="absolute"
            style={{
              left: "0",
              top: "50%",
              width: "100%",
              height: "2%",
              backgroundColor: "#6d4c41",
            }}
          />
        </div>

        {/* Desk */}
        <div
          className="absolute"
          style={{
            left: "10%",
            bottom: "15%",
            width: "80%",
            height: "10%",
            backgroundColor: colors.desk,
            borderRadius: "4px", // Rounded desk corners
            boxShadow: "2px 2px 5px rgba(0, 0, 0, 0.2)", // Added shadow
          }}
        />

        {/* Desk leg left */}
        <div
          className="absolute"
          style={{
            left: "15%",
            bottom: "0",
            width: "5%",
            height: "15%",
            backgroundColor: colors.desk,
            borderRadius: "4px",
          }}
        />

        {/* Desk leg right */}
        <div
          className="absolute"
          style={{
            right: "15%",
            bottom: "0",
            width: "5%",
            height: "15%",
            backgroundColor: colors.desk,
            borderRadius: "4px",
          }}
        />

        {/* Monitor base */}
        <div
          className="absolute"
          style={{
            left: "45%",
            bottom: "25%",
            width: "10%",
            height: "3%",
            backgroundColor: colors.monitor,
            borderRadius: "2px",
          }}
        />

        {/* Monitor screen with typing animation */}
        <div
          className="absolute"
          style={{
            left: "40%",
            bottom: "28%",
            width: "20%",
            height: "15%",
            backgroundColor: colors.screen,
            border: `3px solid ${colors.monitor}`,
            transform: "perspective(500px) rotateX(5deg)",
            borderRadius: "8px", // Rounded monitor
            overflow: "hidden",
            padding: "8px", // Added padding
            fontFamily: "monospace",
            fontSize: "10px", // Increased font size
            color: "#222", // Darker text
            boxShadow: "3px 3px 7px rgba(0, 0, 0, 0.2)", // Added shadow
          }}
        >
          <pre style={{ lineHeight: "1.4" }}>{displayText}</pre>{" "}
          {/* Increased line height */}
          <div
            className="absolute"
            style={{
              bottom: "8px", // Adjusted cursor position
              left: `${textProgress % 30}px`,
              width: "3px", // Thicker cursor
              height: "12px", // Taller cursor
              backgroundColor: "#222",
              animation: "blink 0.8s infinite", // Slightly faster blink
            }}
          />
        </div>

        {/* Open book */}
        <div
          className="absolute"
          style={{
            left: "25%",
            bottom: "25%",
            width: "13%",
            height: "1%",
            backgroundColor: "#999",
          }}
        />
        <div
          className="absolute"
          style={{
            left: "20%",
            bottom: "26%",
            width: "11%",
            height: "4%",
            backgroundColor: colors.books[0],
            borderRadius: "3px", // Rounded book
            transform: "perspective(500px) rotateY(-10deg)",
            zIndex: 2,
            boxShadow: "1px 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        />
        <div
          className="absolute"
          style={{
            left: "31%",
            bottom: "26%",
            width: "11%",
            height: "4%",
            backgroundColor: colors.books[0],
            borderRadius: "3px",
            transform: "perspective(500px) rotateY(10deg)",
            zIndex: 2,
            boxShadow: "1px 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        />

        {/* Stacked books */}
        <div
          className="absolute"
          style={{
            right: "20%",
            bottom: "25%",
            width: "15%",
            height: "3%",
            backgroundColor: colors.books[1],
            borderRadius: "3px",
            zIndex: 2,
            boxShadow: "1px 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        />
        <div
          className="absolute"
          style={{
            right: "22%",
            bottom: "28%",
            width: "12%",
            height: "3%",
            backgroundColor: colors.books[2],
            borderRadius: "3px",
            zIndex: 3,
            boxShadow: "1px 1px 2px rgba(0, 0, 0, 0.1)",
          }}
        />

        {/* Small study materials */}
        <div
          className="absolute"
          style={{
            left: "65%",
            bottom: "25%",
            width: "5%",
            height: "2%",
            backgroundColor: "#fff",
            borderRadius: "2px",
            zIndex: 2,
            boxShadow: "1px 1px 1px rgba(0, 0, 0, 0.05)",
          }}
        />

        {/* Lamp base */}
        <div
          className="absolute"
          style={{
            right: "15%",
            bottom: "25%",
            width: "5%",
            height: "5%",
            backgroundColor: colors.lamp.base,
            borderRadius: "3px",
          }}
        />

        {/* Lamp arm */}
        <div
          className="absolute"
          style={{
            right: "17%",
            bottom: "30%",
            width: "1%",
            height: "10%",
            backgroundColor: colors.lamp.base,
            borderRadius: "2px",
          }}
        />

        {/* Lamp head */}
        <div
          className="absolute"
          style={{
            right: "15%",
            bottom: "40%",
            width: "8%",
            height: "4%",
            backgroundColor: colors.lamp.base,
            borderRadius: "50% 50% 0 0", // More rounded lamp head
          }}
        />

        {/* Lamp light - with pulsing animation */}
        <div
          className="lamp-light absolute" // Added lamp-light class
          style={{
            right: "16%",
            bottom: "37%",
            width: "6%",
            height: "3%",
            backgroundColor: colors.lamp.light,
            borderRadius: "50%",
            opacity: 0.8, // Slightly more opaque
            boxShadow: "0 0 20px 7px rgba(241, 196, 15, 0.7)", // Brighter glow
          }}
        />

        {/* Student - head with breathing and subtle rotation */}
        <div
          className="student-head absolute" // Added student-head class
          style={{
            left: "55%",
            bottom: "47%",
            width: "10%", // Slightly larger head
            height: "10%",
            backgroundColor: colors.student.head,
            borderRadius: "55%", // More rounded head
            transform: `translateX(-50%) scale(${breatheScale}) rotate(${headRotation}deg)`, // Apply scale and rotation
            transition: "transform 1.5s ease-in-out",
            zIndex: 5,
            boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.1)", // Added shadow
          }}
        >
          {/* Face details */}
          <div
            className="absolute"
            style={{
              top: "40%",
              left: "30%",
              width: "6%",
              height: "6%",
              backgroundColor: colors.student.face,
              borderRadius: "50%",
              opacity: 0.8,
            }}
          />
          <div
            className="absolute"
            style={{
              top: "40%",
              left: "64%",
              width: "6%",
              height: "6%",
              backgroundColor: colors.student.face,
              borderRadius: "50%",
              opacity: 0.8,
            }}
          />
          <div
            className="absolute"
            style={{
              top: "70%",
              left: "50%",
              width: "15%",
              height: "3%",
              backgroundColor: colors.student.face,
              borderRadius: "50%",
              transform: "translateX(-50%)",
              opacity: 0.9,
            }}
          />
        </div>

        {/* Thought bubble */}
        {thoughtBubbleVisible && (
          <>
            {/* Main thought bubble */}
            <div
              className="thought-bubble absolute" // Added thought-bubble class
              style={{
                left: "60%",
                bottom: "60%",
                width: "18%", // Larger bubble
                height: "15%",
                backgroundColor: colors.thought,
                borderRadius: "60%", // More rounded bubble
                border: "2px solid #ddd",
                opacity: 0.95, // More opaque
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 6,
                boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div className="text-md text-center font-bold">💡</div>{" "}
              {/* Larger icon */}
            </div>

            {/* Small bubbles leading to head */}
            <div
              className="absolute"
              style={{
                left: "56%",
                bottom: "56%",
                width: "4%",
                height: "4%",
                backgroundColor: colors.thought,
                borderRadius: "50%",
                border: "1px solid #ddd",
                zIndex: 6,
              }}
            />
            <div
              className="absolute"
              style={{
                left: "59%",
                bottom: "53%",
                width: "3%",
                height: "3%",
                backgroundColor: colors.thought,
                borderRadius: "50%",
                border: "1px solid #ddd",
                zIndex: 6,
              }}
            />
            <div
              className="absolute"
              style={{
                left: "58%",
                bottom: "51%",
                width: "2%",
                height: "2%",
                backgroundColor: colors.thought,
                borderRadius: "50%",
                border: "1px solid #ddd",
                zIndex: 6,
              }}
            />
          </>
        )}

        {/* Student - torso with breathing animation */}
        <div
          className="student-torso absolute" // Added student-torso class
          style={{
            left: "55%",
            bottom: "15%",
            width: "16%", // Wider torso
            height: "32%",
            backgroundColor: colors.student.torso,
            borderRadius: "8px 8px 0 0", // More rounded torso top
            transform: `translateX(-50%) scaleY(${breatheScale * 0.98})`, // Subtler breathing
            transition: "transform 1.5s ease-in-out",
            zIndex: 4,
            boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.1)",
          }}
        />

        {/* Student - left arm with subtle movement and hand */}
        <div
          className="student-arm-left absolute" // Added student-arm-left
          style={{
            left: "36%",
            bottom: "30%",
            width: "13%", // Slightly shorter arm
            height: "3%",
            backgroundColor: colors.student.arms,
            borderRadius: "6px",
            transform: `rotate(${20 + armRotation}deg)`, // Apply arm rotation
            transition: "transform 1.5s ease-in-out",
            zIndex: 3,
            transformOrigin: "right bottom",
          }}
        >
          {/* Left Hand */}
          <div
            className="absolute"
            style={{
              top: "-15%", // Position at the end of the arm
              right: "-10%",
              width: "8%",
              height: "8%",
              backgroundColor: colors.student.hands,
              borderRadius: "50%",
              zIndex: 4,
            }}
          />
        </div>

        {/* Student - right arm with subtle movement and hand */}
        <div
          className="student-arm-right absolute" //Added student-arm-right
          style={{
            right: "36%",
            bottom: "30%",
            width: "13%",
            height: "3%",
            backgroundColor: colors.student.arms,
            borderRadius: "6px",
            transform: `rotate(${-20 - armRotation}deg)`,
            transition: "transform 1.5s ease-in-out",
            zIndex: 3,
            transformOrigin: "left bottom",
          }}
        >
          {/* Right Hand */}
          <div
            className="absolute"
            style={{
              top: "-15%",
              left: "-10%",
              width: "8%",
              height: "8%",
              backgroundColor: colors.student.hands,
              borderRadius: "50%",
              zIndex: 4,
            }}
          />
        </div>

        {/* Add CSS animations */}
        <style>
          {`
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0; }
            }
            @keyframes pulse {
              0% { opacity: 0.6; box-shadow: 0 0 12px 3px rgba(241, 196, 15, 0.4); }
              50% { opacity: 0.9; box-shadow: 0 0 25px 8px rgba(241, 196, 15, 0.8); }
              100% { opacity: 0.6; box-shadow: 0 0 12px 3px rgba(241, 196, 15, 0.4); }
            }
            @keyframes pulseBubble {
              0% { transform: scale(0.97); }
              50% { transform: scale(1.03); }
              100% { transform: scale(0.97); }
            }

            .student-head {
              transition: transform 1.5s ease-in-out;
              transform-origin: 50% 80%;
            }
            .student-torso{
              transition: transform 1.5s ease-in-out;
              transform-origin: 50% 0%;
            }
            .student-arm-left{
              transition: transform 1.5s ease-in-out;
            }
            .student-arm-right{
              transition: transform 1.5s ease-in-out;
            }
            .lamp-light {
              animation: pulse 2s infinite ease-in-out;
            }
            .thought-bubble{
              animation: pulseBubble 3s infinite ease-in-out;
            }
          `}
        </style>
      </div>
    </div>
  )
}
