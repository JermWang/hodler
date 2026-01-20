import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // AmpliFi Brand Colors
        amplifi: {
          blue: "#1F4BFF",
          "blue-dark": "#1a3fd9",
          navy: "#0B1C3D",
          orange: "#FF4D2D",
          "orange-dark": "#e6442a",
          // New dark theme accent colors
          lime: "#C6FF3A",
          "lime-dark": "#A6E62E",
          yellow: "#FFE85A",
          purple: "#7C5CFF",
          "purple-dark": "#6a4de6",
          teal: "#2EF2C2",
          "teal-dark": "#26d4aa",
        },
        // Dark theme backgrounds
        dark: {
          bg: "rgba(11, 12, 14, 0.75)",
          "bg-solid": "#0B0C0E",
          elevated: "rgba(20, 22, 26, 0.80)",
          surface: "rgba(28, 31, 38, 0.85)",
          border: "#262A33",
        },
        // Semantic colors
        background: {
          DEFAULT: "#F7F8FA",
          dark: "#0B0C0E",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          dark: "#1C1F26",
          elevated: "#14161A",
        },
        foreground: {
          DEFAULT: "#0A0A0A",
          muted: "#6B7280",
          secondary: "#A1A1AA",
          inverted: "#FFFFFF",
        },
        border: {
          DEFAULT: "#E5E7EB",
          dark: "#262A33",
        },
        // Component colors
        primary: {
          DEFAULT: "#1F4BFF",
          foreground: "#FFFFFF",
          hover: "#1a3fd9",
        },
        secondary: {
          DEFAULT: "#0B1C3D",
          foreground: "#FFFFFF",
          hover: "#0a1830",
        },
        accent: {
          DEFAULT: "#FF4D2D",
          foreground: "#FFFFFF",
          hover: "#e6442a",
        },
        destructive: {
          DEFAULT: "#ef4444",
          foreground: "#FFFFFF",
        },
        muted: {
          DEFAULT: "#F7F8FA",
          foreground: "#6B7280",
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#0A0A0A",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Custom sizes matching the design spec
        "display-1": ["64px", { lineHeight: "1.1", fontWeight: "700" }],
        "display-2": ["56px", { lineHeight: "1.1", fontWeight: "700" }],
        "heading-1": ["48px", { lineHeight: "1.2", fontWeight: "600" }],
        "heading-2": ["40px", { lineHeight: "1.2", fontWeight: "600" }],
        "heading-3": ["28px", { lineHeight: "1.3", fontWeight: "600" }],
        "heading-4": ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "body": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "caption": ["14px", { lineHeight: "1.5", fontWeight: "500" }],
        "meta": ["13px", { lineHeight: "1.5", fontWeight: "500" }],
      },
      spacing: {
        // Section spacing
        "section-desktop": "96px",
        "section-tablet": "64px",
        "section-mobile": "48px",
      },
      maxWidth: {
        layout: "1200px",
        content: "960px",
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
      },
      boxShadow: {
        card: "0 8px 24px rgba(0, 0, 0, 0.08)",
        "card-hover": "0 12px 32px rgba(0, 0, 0, 0.12)",
        "card-dark": "0 10px 30px rgba(0, 0, 0, 0.4)",
        "card-dark-hover": "0 14px 40px rgba(0, 0, 0, 0.5)",
        glow: "0 0 20px rgba(31, 75, 255, 0.3)",
        "glow-accent": "0 0 20px rgba(255, 77, 45, 0.3)",
        "glow-lime": "0 0 20px rgba(198, 255, 58, 0.3)",
        "glow-purple": "0 0 20px rgba(124, 92, 255, 0.3)",
        "glow-teal": "0 0 20px rgba(46, 242, 194, 0.3)",
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-blue": "linear-gradient(135deg, #1F4BFF 0%, #0B1C3D 100%)",
        "gradient-dark": "linear-gradient(180deg, #0B1C3D 0%, #000000 100%)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
