import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        foreground: "#000000",
        primary: {
          DEFAULT: "#4F46E5",
          hover: "#4338CA",
        },
        pop: {
          black: "#000000",
          gray: "#171717",
          "gray-100": "#f5f5f5",
          muted: "#6e6e73",
          border: "#e4e4e7",
          accent: "#818CF8",
          coral: "#f97316",
        },
      },
      fontFamily: {
        sans: ["Satoshi", "var(--font-geist-sans)", "Inter", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "20px",
        "2xl": "24px",
        full: "9999px",
      },
      boxShadow: {
        pop: "rgba(16, 24, 40, 0.08) 0px 12px 16px -4px, rgba(16, 24, 40, 0.03) 0px 4px 6px -2px",
        "pop-xl": "rgba(0, 0, 0, 0.08) 20px 25px 31px 0px",
      },
      letterSpacing: {
        h1: "-2.32px",
        h2: "-1.9px",
      },
    },
  },
  plugins: [],
};

export default config;
