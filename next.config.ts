import type { NextConfig } from "next";

const config: NextConfig = {
  // API-only app — no pages needed
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default config;
