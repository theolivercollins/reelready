import { useEffect, useState } from "react";

interface LECyclingWordProps {
  words: string[];
  /** Milliseconds each word holds before the next swaps in. Default 3400. */
  interval?: number;
}

/**
 * Cascade-drop word cycler — matches the `HA_Cascade` variant from
 * hero_anims.jsx. Each letter of the incoming word re-animates with a
 * 45ms stagger using the shared `le-cascade` keyframes in tokens.css.
 */
export function LECyclingWord({ words, interval = 3400 }: LECyclingWordProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (words.length <= 1) return;
    const t = setTimeout(() => setIdx(i => (i + 1) % words.length), interval);
    return () => clearTimeout(t);
  }, [idx, interval, words]);

  const word = words[idx] ?? "";
  // Reserve layout space for the widest word so the trailing copy
  // ("more listings.") stays pinned and doesn't shift between swaps.
  const longest = words.reduce((a, b) => (a.length >= b.length ? a : b), "");

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        verticalAlign: "baseline",
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: "'tnum'",
      }}
    >
      {/* Invisible ghost: holds the width of the widest word */}
      <span aria-hidden="true" style={{ visibility: "hidden", whiteSpace: "pre" }}>
        {longest}
      </span>
      {/* Animated word, absolutely positioned over the ghost */}
      <span
        aria-live="polite"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          whiteSpace: "pre",
        }}
      >
        {word.split("").map((ch, i) => (
          <span
            key={`${idx}-${i}`}
            style={{
              display: "inline-block",
              animation: "le-cascade 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
              animationDelay: `${i * 45}ms`,
            }}
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        ))}
      </span>
    </span>
  );
}
