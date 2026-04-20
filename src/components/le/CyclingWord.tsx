import * as React from "react";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const baseWrap: React.CSSProperties = {
  display: "inline-block",
  verticalAlign: "baseline",
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: "'tnum'",
};

type AnimProps = { words: string[]; interval?: number };

function HA_Scramble({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  const [display, setDisplay] = React.useState(words[0]);
  const rafRef = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    const next = words[(idx + 1) % words.length];
    const dwell = Math.max(400, interval - 1100);
    const hold = setTimeout(() => {
      const startTime = performance.now();
      const lockDelay = 52;
      const total = next.length * lockDelay + 420;
      const glyphInt = 32;
      let lastFrame = 0;
      const tick = (t: number) => {
        const elapsed = t - startTime;
        if (elapsed > total) {
          setDisplay(next);
          setIdx((i) => (i + 1) % words.length);
          return;
        }
        if (t - lastFrame > glyphInt) {
          lastFrame = t;
          const out: string[] = [];
          for (let i = 0; i < next.length; i++) {
            const lockTime = i * lockDelay + 80;
            out.push(
              elapsed >= lockTime
                ? next[i]
                : LETTERS[Math.floor(Math.random() * LETTERS.length)]
            );
          }
          setDisplay(out.join(""));
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }, dwell);
    return () => {
      clearTimeout(hold);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [idx, interval, words]);
  return <span style={baseWrap}>{display}</span>;
}

function SFHalf({
  half,
  prev,
  cur,
  delay,
}: {
  half: "top" | "bottom";
  prev: string;
  cur: string;
  delay: number;
}) {
  const [phase, setPhase] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setPhase(1), delay);
    return () => clearTimeout(t);
  }, [delay]);
  const isTop = half === "top";
  return (
    <span
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        overflow: "hidden",
        clipPath: isTop ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "100%",
          textAlign: "center",
          transformOrigin: isTop ? "center bottom" : "center top",
          transform:
            phase === 1
              ? isTop
                ? "rotateX(-90deg)"
                : "rotateX(0deg)"
              : isTop
                ? "rotateX(0deg)"
                : "rotateX(90deg)",
          transition: "transform 260ms cubic-bezier(0.7, 0, 0.3, 1)",
        }}
      >
        {phase === 0 ? (prev === " " ? "\u00A0" : prev) : cur === " " ? "\u00A0" : cur}
      </span>
    </span>
  );
}

function HA_SplitFlap({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setIdx((i) => (i + 1) % words.length), interval);
    return () => clearTimeout(t);
  }, [idx, interval, words]);
  const cur = words[idx];
  const prev = words[(idx - 1 + words.length) % words.length];
  const maxLen = Math.max(...words.map((w) => w.length));
  const cells: { p: string; c: string; key: string; delay: number }[] = [];
  for (let i = 0; i < maxLen; i++) {
    cells.push({
      p: prev[i] || " ",
      c: cur[i] || " ",
      key: `${idx}-${i}`,
      delay: i * 45,
    });
  }
  return (
    <span style={{ ...baseWrap, position: "relative" }}>
      {cells.map(({ p, c, key, delay }) => (
        <span
          key={key}
          style={{
            display: "inline-block",
            position: "relative",
            perspective: 400,
            width: "0.55em",
            textAlign: "center",
          }}
        >
          <span style={{ opacity: 0, display: "inline-block" }}>
            {c === " " ? "\u00A0" : c}
          </span>
          <SFHalf half="top" prev={p} cur={c} delay={delay} />
          <SFHalf half="bottom" prev={p} cur={c} delay={delay} />
        </span>
      ))}
    </span>
  );
}

function HA_Cascade({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setIdx((i) => (i + 1) % words.length), interval);
    return () => clearTimeout(t);
  }, [idx, interval, words]);
  const word = words[idx];
  return (
    <span style={baseWrap}>
      {word.split("").map((c, i) => (
        <span
          key={`${idx}-${i}`}
          style={{
            display: "inline-block",
            animation: "le-cascade 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
            animationDelay: `${i * 45}ms`,
          }}
        >
          {c === " " ? "\u00A0" : c}
        </span>
      ))}
    </span>
  );
}

function HA_Typewriter({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  const [display, setDisplay] = React.useState(words[0]);
  React.useEffect(() => {
    const current = words[idx];
    const next = words[(idx + 1) % words.length];
    const stepMs = 65;
    const dwell = interval - (current.length + next.length) * stepMs - 300;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const hold = setTimeout(() => {
      for (let i = 1; i <= current.length; i++) {
        timeouts.push(
          setTimeout(() => setDisplay(current.slice(0, current.length - i)), i * stepMs)
        );
      }
      for (let i = 1; i <= next.length; i++) {
        timeouts.push(
          setTimeout(
            () => setDisplay(next.slice(0, i)),
            current.length * stepMs + 140 + i * stepMs
          )
        );
      }
      timeouts.push(
        setTimeout(
          () => setIdx((k) => (k + 1) % words.length),
          (current.length + next.length) * stepMs + 240
        )
      );
    }, Math.max(400, dwell));
    return () => {
      clearTimeout(hold);
      timeouts.forEach(clearTimeout);
    };
  }, [idx, interval, words]);
  return (
    <span style={baseWrap}>
      {display}
      <span
        style={{
          display: "inline-block",
          width: "0.06em",
          height: "0.9em",
          marginLeft: "0.04em",
          background: "currentColor",
          verticalAlign: "text-bottom",
          animation: "le-caret 900ms steps(2) infinite",
        }}
      />
    </span>
  );
}

function HA_Clapper({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setIdx((i) => (i + 1) % words.length), interval);
    return () => clearTimeout(t);
  }, [idx, interval, words]);
  return (
    <span style={{ ...baseWrap, overflow: "hidden" }}>
      <span
        key={idx}
        style={{
          display: "inline-block",
          transformOrigin: "center top",
          animation: "le-clapper 620ms cubic-bezier(0.6, -0.25, 0.3, 1.3) both",
        }}
      >
        {words[idx]}
      </span>
    </span>
  );
}

function HA_Marquee({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setIdx((i) => (i + 1) % words.length), interval);
    return () => clearTimeout(t);
  }, [idx, interval, words]);
  const maxLen = Math.max(...words.map((w) => w.length));
  return (
    <span
      style={{
        ...baseWrap,
        position: "relative",
        overflow: "hidden",
        verticalAlign: "bottom",
      }}
    >
      <span style={{ visibility: "hidden", display: "inline-block" }}>
        {"M".repeat(maxLen)}
      </span>
      <span
        key={idx}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          whiteSpace: "nowrap",
          animation: "le-marquee-in 520ms cubic-bezier(0.33, 1, 0.68, 1) both",
        }}
      >
        {words[idx]}
      </span>
    </span>
  );
}

function HA_Blur({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    const t = setTimeout(() => setIdx((i) => (i + 1) % words.length), interval);
    return () => clearTimeout(t);
  }, [idx, interval, words]);
  const maxLen = Math.max(...words.map((w) => w.length));
  return (
    <span style={{ ...baseWrap, position: "relative" }}>
      <span style={{ visibility: "hidden", display: "inline-block" }}>
        {"M".repeat(maxLen)}
      </span>
      <span
        key={idx}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          animation: "le-blur-in 620ms ease-out both",
        }}
      >
        {words[idx]}
      </span>
    </span>
  );
}

function HA_Glitch({ words, interval = 3400 }: AnimProps) {
  const [idx, setIdx] = React.useState(0);
  const [glitching, setGlitching] = React.useState(false);
  React.useEffect(() => {
    const g = setTimeout(() => setGlitching(true), Math.max(0, interval - 220));
    const t = setTimeout(() => {
      setIdx((i) => (i + 1) % words.length);
      setGlitching(false);
    }, interval);
    return () => {
      clearTimeout(g);
      clearTimeout(t);
    };
  }, [idx, interval, words]);
  const w = words[idx];
  return (
    <span style={{ ...baseWrap, position: "relative" }}>
      <span
        style={{
          display: "inline-block",
          animation: glitching ? "le-glitch 220ms steps(4) both" : "none",
        }}
      >
        {w}
      </span>
      {glitching && (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              color: "oklch(0.65 0.25 25)",
              mixBlendMode: "screen",
              transform: "translate(2px, 0)",
              opacity: 0.9,
            }}
          >
            {w}
          </span>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              color: "oklch(0.65 0.2 200)",
              mixBlendMode: "screen",
              transform: "translate(-2px, 0)",
              opacity: 0.9,
            }}
          >
            {w}
          </span>
        </>
      )}
    </span>
  );
}

export const HERO_ANIMS = {
  scramble: HA_Scramble,
  splitflap: HA_SplitFlap,
  cascade: HA_Cascade,
  typewriter: HA_Typewriter,
  clapper: HA_Clapper,
  marquee: HA_Marquee,
  blur: HA_Blur,
  glitch: HA_Glitch,
} as const;

export type HeroAnimKind = keyof typeof HERO_ANIMS;

export const HERO_ANIM_LABELS: Record<HeroAnimKind, string> = {
  scramble: "Scramble lock",
  splitflap: "Split-flap",
  cascade: "Cascade drop",
  typewriter: "Typewriter",
  clapper: "Clapperboard",
  marquee: "Marquee",
  blur: "Blur dissolve",
  glitch: "Glitch cut",
};

export function LECyclingWord({
  words,
  interval = 3400,
  kind = "cascade",
}: {
  words: string[];
  interval?: number;
  kind?: HeroAnimKind;
}) {
  const Cmp = HERO_ANIMS[kind] || HA_Scramble;
  return <Cmp words={words} interval={interval} />;
}
