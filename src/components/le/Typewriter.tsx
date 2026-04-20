import * as React from "react";

type Props = {
  phrases: string[];
  cycleEvery?: number;
  typeSpeed?: number;
  eraseSpeed?: number;
  holdAfterType?: number;
  caretColor?: string;
  color?: string;
};

export function LETypewriter({
  phrases,
  cycleEvery = 120000,
  typeSpeed = 55,
  eraseSpeed = 32,
  holdAfterType = 2400,
  caretColor = "rgba(255,255,255,0.55)",
  color = "rgba(255,255,255,0.55)",
}: Props) {
  const [phraseIdx, setPhraseIdx] = React.useState(0);
  const [text, setText] = React.useState("");
  const [mode, setMode] = React.useState<"typing" | "holding" | "erasing">("typing");

  React.useEffect(() => {
    const current = phrases[phraseIdx];
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (mode === "typing") {
      if (text.length < current.length) {
        timer = setTimeout(
          () => setText(current.slice(0, text.length + 1)),
          typeSpeed
        );
      } else {
        const typeDur = current.length * typeSpeed;
        const eraseDur = current.length * eraseSpeed;
        const hold = Math.max(holdAfterType, cycleEvery - typeDur - eraseDur);
        timer = setTimeout(() => setMode("erasing"), hold);
      }
    } else if (mode === "erasing") {
      if (text.length > 0) {
        timer = setTimeout(() => setText(text.slice(0, -1)), eraseSpeed);
      } else {
        setPhraseIdx((i) => (i + 1) % phrases.length);
        setMode("typing");
      }
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [text, mode, phraseIdx, phrases, cycleEvery, typeSpeed, eraseSpeed, holdAfterType]);

  return (
    <span style={{ color }}>
      {text}
      <span
        aria-hidden="true"
        style={{
          display: "inline-block",
          width: "0.08em",
          height: "0.82em",
          marginLeft: "0.06em",
          marginBottom: "-0.08em",
          background: caretColor,
          animation: "leCaret 1.05s steps(1) infinite",
        }}
      />
    </span>
  );
}
