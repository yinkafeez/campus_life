import { useState } from "react";
import Sheet from "../../components/ui/Sheet";
import Button from "../../components/ui/Button";
import styles from "./OrientationBriefing.module.css";

const slides = (touch, university) => [
  {
    title: `Welcome to ${university ?? "campus"}!`,
    body: [
      "This is a simulated, fictional campus: admission, grades, money and elections are all part of the game.",
      "New students start with orientation week: walk to a few important places. Each one ticks itself off when you arrive.",
    ],
  },
  {
    title: "Getting around",
    body: touch
      ? [
          "Drag the joystick (bottom left) to walk. Tap Run to go faster.",
          "Drag anywhere else on the screen to look around.",
        ]
      : [
          "W A S D or the arrow keys walk; hold Shift to run.",
          "Drag with the mouse to look around.",
        ],
  },
  {
    title: "Finding places",
    body: [
      "Your current objective sits in the top-left corner. Tap Guide me and follow the glowing trail.",
      touch
        ? "The map button (top) lists every place on campus."
        : "Press M (or the map button) for the campus map and directory.",
    ],
  },
  {
    title: "People and safety",
    body: [
      `People with gold name tags are campus guides: walk up and ${touch ? "tap Talk" : "press E"} to ask the way.`,
      "Other players are real people. Be kind, and never share your phone number or address. You can mute, block or report anyone.",
    ],
  },
  {
    title: "Your phone",
    body: [
      "The phone button (top right) opens everything else: friends, messages, studies, money, games, elections and your wardrobe.",
      "Menus never pause the world — close them and carry on walking.",
    ],
  },
];

/** A short first-visit briefing: controls, objectives, safety. Shown once per device. */
export default function OrientationBriefing({ touch, university, onDone }) {
  const list = slides(touch, university);
  const [i, setI] = useState(0);
  const slide = list[i];
  const last = i === list.length - 1;

  return (
    <Sheet title="Orientation briefing" onClose={onDone}>
      <div className={styles.slide} aria-live="polite">
        <p className={styles.count}>
          {i + 1} / {list.length}
        </p>
        <h3 className={styles.title}>{slide.title}</h3>
        {slide.body.map((line) => (
          <p key={line} className={styles.text}>
            {line}
          </p>
        ))}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Skip
        </Button>
        {i > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setI(i - 1)}>
            Back
          </Button>
        )}
        <Button size="sm" onClick={() => (last ? onDone() : setI(i + 1))}>
          {last ? "Start exploring" : "Next"}
        </Button>
      </div>
    </Sheet>
  );
}
