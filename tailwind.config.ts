import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#121212",
          muted: "#5a5a5a",
          faint: "#8a8a8a",
        },
        paper: "#faf9f7",
        rule: "#e6e4df",
        accent: "#326891",
        relax: "#2d6a4f",
        catchup: "#bc6c25",
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "Times", "serif"],
        sans: [
          '"Helvetica Neue"',
          "Helvetica",
          "Arial",
          "system-ui",
          "sans-serif",
        ],
        poppins: ["var(--font-poppins)", "Poppins", "sans-serif"],
      },
      boxShadow: {
        frame: "0 24px 80px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
