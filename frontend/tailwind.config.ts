import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "#0A0B14",
          secondary: "#10121E",
          card: "#161828",
          border: "#1E2235",
          hover: "#1C1F32",
        },
        brand: {
          blue: "#3B82F6",
          indigo: "#6366F1",
          purple: "#8B5CF6",
          glow: "#818CF8",
        },
        text: {
          primary: "#F1F5F9",
          secondary: "#94A3B8",
          muted: "#475569",
        },
        status: {
          paid: "#10B981",
          unpaid: "#EF4444",
          partial: "#F59E0B",
          draft: "#6B7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 0 0 1px rgba(99,102,241,0.08), 0 4px 24px rgba(0,0,0,0.4)",
        glow: "0 0 20px rgba(99,102,241,0.3)",
        "glow-sm": "0 0 10px rgba(99,102,241,0.2)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
        "gradient-card": "linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(139,92,246,0.03) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
