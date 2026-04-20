import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarketComparison } from "./MarketComparison";

beforeEach(() => {
  class MockIO {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(_cb: IntersectionObserverCallback) {}
  }
  (globalThis as any).IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: true, // reduced-motion on, easier to assert
    media: q, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
});

describe("MarketComparison", () => {
  it("renders all market-stat rows loaded from the data module", async () => {
    render(<MarketComparison />);
    await waitFor(() => {
      expect(screen.getByText("Cost per listing video")).toBeTruthy();
      expect(screen.getByText("Turnaround")).toBeTruthy();
    });
  });

  it("renders an accessible link for each citation", async () => {
    render(<MarketComparison />);
    await waitFor(() => {
      const links = screen.getAllByRole("link");
      expect(links.length).toBeGreaterThanOrEqual(3);
      for (const a of links) {
        expect(a.getAttribute("href")).toMatch(/^https?:\/\//);
      }
    });
  });
});
