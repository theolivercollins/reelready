import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getFaqs } from "@/v2/data/faqs";

export function FAQ() {
  const faqs = getFaqs();
  return (
    <section
      id="faq"
      style={{ background: "transparent", color: "#fff", padding: "140px 48px" }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="le-eyebrow" style={{ marginBottom: 24 }}>— FAQ</div>
        <h2 className="le-display" style={{ fontSize: "clamp(44px, 5.5vw, 76px)", lineHeight: 0.98, margin: "0 0 64px", color: "#fff" }}>
          Questions, briefly.
        </h2>
        <Accordion type="single" collapsible>
          {faqs.map(f => (
            <AccordionItem
              key={f.id}
              value={f.id}
              style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
            >
              <AccordionTrigger className="le-display" style={{ fontSize: 22, textAlign: "left", color: "#fff" }}>
                {f.question}
              </AccordionTrigger>
              <AccordionContent style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)" }}>
                {f.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
