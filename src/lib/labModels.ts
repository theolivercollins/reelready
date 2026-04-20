// Kept in sync with lib/providers/atlas.ts::ATLAS_MODELS. Source of
// truth for the UI — model labels, per-clip cost, end-frame support.
// If a new model is registered server-side, add it here too.
//
// Pricing convention: priceCents / priceLabel represent the cost of
// one STANDARD 5-second clip. Atlas's public rates are per-second, so
// these values = perSecond × 5. If a 10-second clip is rendered, real
// cost is 2x the label.

export interface LabModelInfo {
  key: string;
  slug: string;
  label: string;
  shortLabel: string;
  priceCents: number;
  priceLabel: string;
  supportsEndFrame: boolean;
  note?: string;
  hidden?: boolean;
}

export const LAB_MODELS: LabModelInfo[] = [
  {
    key: "kling-v3-pro",
    slug: "kwaivgi/kling-v3.0-pro/image-to-video",
    label: "Kling 3.0 Pro",
    shortLabel: "v3 Pro",
    priceCents: 48,
    priceLabel: "$0.48",
    supportsEndFrame: true,
    note: "Newest. End-frame support. Known shake issue on single-image shots — stability prefix mitigation applied.",
  },
  {
    key: "kling-v3-std",
    slug: "kwaivgi/kling-v3.0-std/image-to-video",
    label: "Kling 3.0 Std",
    shortLabel: "v3 Std",
    priceCents: 36,
    priceLabel: "$0.36",
    supportsEndFrame: true,
    hidden: true,
    note: "Like 3.0 Pro but lower quality. Hidden from picker — re-enable if ever needed.",
  },
  {
    key: "kling-v2-6-pro",
    slug: "kwaivgi/kling-v2.6-pro/image-to-video",
    label: "Kling 2.6 Pro",
    shortLabel: "v2.6 Pro",
    priceCents: 30,
    priceLabel: "$0.30",
    supportsEndFrame: true,
    note: "Smoothest motion for single-image shots. Current strong default for interiors.",
  },
  {
    key: "kling-v2-1-pair",
    slug: "kwaivgi/kling-v2.1-i2v-pro/start-end-frame",
    label: "Kling 2.1 Start-End-Frame",
    shortLabel: "v2.1 Pair",
    priceCents: 38,
    priceLabel: "$0.38",
    supportsEndFrame: true,
    note: "Purpose-built for paired scenes (start + end photo). Can use long, detailed prompts effectively.",
  },
  {
    key: "kling-v2-master",
    slug: "kwaivgi/kling-v2.0-i2v-master",
    label: "Kling 2.0 Master",
    shortLabel: "v2 Master",
    priceCents: 111,
    priceLabel: "$1.11",
    supportsEndFrame: false,
    note: "Premium quality; single-frame only (no end-frame support). Expensive — use for hero shots.",
  },
  {
    key: "kling-o3-pro",
    slug: "kwaivgi/kling-video-o3-pro/image-to-video",
    label: "Kling O3 Pro",
    shortLabel: "O3 Pro",
    priceCents: 48,
    priceLabel: "$0.48",
    supportsEndFrame: true,
    note: "Minimal movement — tends to look static. Good for feature closeups, weak for dynamic shots.",
  },
];

export function getLabModel(key: string): LabModelInfo | undefined {
  return LAB_MODELS.find((m) => m.key === key);
}
