import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedNumber } from "./AnimatedNumber";

describe("AnimatedNumber", () => {
  it("renders the final label when animate=false (reduced motion)", () => {
    render(<AnimatedNumber value={380} label="$380" animate={false} />);
    expect(screen.getByText("$380")).toBeTruthy();
  });

  it("renders the final label when animate=true and start has completed", () => {
    render(<AnimatedNumber value={380} label="$380" animate={true} />);
    expect(screen.getByText("$380")).toBeTruthy();
  });
});
