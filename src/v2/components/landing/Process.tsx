interface Step {
  n: string;
  title: string;
  body: string;
  imageUrl: string;
}

const STEPS: Step[] = [
  {
    n: "01 / 03",
    title: "Upload",
    body: "Drop 20–60 photos. We handle exposure, orientation, and metadata. Takes a minute.",
    imageUrl: "https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=80",
  },
  {
    n: "02 / 03",
    title: "Direct",
    body: "Our model scripts the shot plan — camera work, room order, voice, and mood.",
    imageUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80",
  },
  {
    n: "03 / 03",
    title: "Deliver",
    body: "A human editor reviews. You receive 16:9 and 9:16 cuts, ready to broadcast.",
    imageUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=80",
  },
];

export function Process() {
  return (
    <section
      id="process"
      style={{
        background: "var(--le-bg)",
        color: "var(--le-text)",
        padding: "140px 48px",
        maxWidth: 1440,
        margin: "0 auto",
      }}
      data-theme="light"
    >
      <div className="le-eyebrow" style={{ marginBottom: 24 }}>— THE PROCESS</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 80, gap: 48 }}>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: 0 }}>
          Three steps.
          <br />
          One day.
        </h2>
        <p style={{ maxWidth: 320, fontSize: 14, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)" }}>
          Every frame directed by our model. Every cut approved by a human editor. No templates, no stock, no crew.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
        {STEPS.map(step => (
          <div key={step.n}>
            <div className="le-eyebrow" style={{ marginBottom: 16 }}>{step.n}</div>
            <div
              className="le-img-placeholder"
              style={{
                aspectRatio: "4 / 3",
                backgroundImage: `url(${step.imageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                marginBottom: 24,
              }}
              aria-hidden
            />
            <h3 className="le-display" style={{ fontSize: 32, margin: "0 0 12px" }}>{step.title}</h3>
            <p style={{ fontSize: 14, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)", margin: 0 }}>
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
