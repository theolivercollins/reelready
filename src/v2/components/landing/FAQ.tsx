import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { getFaqs } from "@/v2/data/faqs";

export function FAQ() {
  const faqs = getFaqs();
  return (
    <section
      id="faq"
      data-theme="light"
      style={{ background: "var(--le-bg)", color: "var(--le-text)", padding: "140px 48px" }}
    >
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="le-eyebrow" style={{ marginBottom: 24 }}>— FAQ</div>
        <h2 className="le-display" style={{ fontSize: "clamp(48px, 6vw, 96px)", lineHeight: 1, margin: "0 0 64px" }}>
          Questions, briefly.
        </h2>
        <Accordion type="single" collapsible>
          {faqs.map(f => (
            <AccordionItem key={f.id} value={f.id}>
              <AccordionTrigger className="le-display" style={{ fontSize: 22, textAlign: "left" }}>
                {f.question}
              </AccordionTrigger>
              <AccordionContent style={{ fontSize: 15, color: "var(--le-text-muted)", lineHeight: 1.6, fontFamily: "var(--le-font-sans)" }}>
                {f.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
