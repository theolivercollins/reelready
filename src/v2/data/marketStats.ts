export interface MarketStatValue {
  label: string;
  numericMax?: number;
}

export interface MarketStatRow {
  id: string;
  dimension: string;
  market: MarketStatValue;
  elevate: MarketStatValue;
  source: { label: string; url: string };
}

const MOCK_ROWS: MarketStatRow[] = [
  {
    id: "cost",
    dimension: "Cost per listing video",
    market: { label: "$1,200–$2,500", numericMax: 2500 },
    elevate: { label: "$380", numericMax: 380 },
    source: {
      label: "NAR + videographer market rates (2024)",
      url: "https://www.nar.realtor/research-and-statistics",
    },
  },
  {
    id: "turnaround",
    dimension: "Turnaround",
    market: { label: "5–10 business days", numericMax: 10 },
    elevate: { label: "Under 24 hours", numericMax: 1 },
    source: {
      label: "Industry videographer survey (2024)",
      url: "https://www.wyzowl.com/video-marketing-statistics/",
    },
  },
  {
    id: "effort",
    dimension: "Agent effort per video",
    market: { label: "~4 hours", numericMax: 240 },
    elevate: { label: "2 minutes", numericMax: 2 },
    source: {
      label: "Listing workflow audit — Recasi",
      url: "https://www.listingelevate.com",
    },
  },
  {
    id: "engagement",
    dimension: "Listing engagement with video vs. without",
    market: { label: "403% more inquiries", numericMax: 403 },
    elevate: { label: "Every listing gets one", numericMax: 100 },
    source: {
      label: "NAR 2024 Real Estate Video report",
      url: "https://www.nar.realtor/research-and-statistics",
    },
  },
  {
    id: "preference",
    dimension: "Sellers preferring agents who market with video",
    market: { label: "73% prefer video agents", numericMax: 73 },
    elevate: { label: "Default, not an upsell", numericMax: 100 },
    source: {
      label: "NAR Home Buyers & Sellers Report",
      url: "https://www.nar.realtor/research-and-statistics",
    },
  },
];

export async function getMarketStats(): Promise<MarketStatRow[]> {
  return MOCK_ROWS;
}
