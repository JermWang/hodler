// AmpliFi Design Tokens for Remotion
// Matches the main app design system exactly

export const colors = {
  // Backgrounds (from globals.css dark theme)
  bg: "#0B0C0E",
  bgElevated: "rgba(20, 22, 26, 0.80)",
  bgSurface: "rgba(28, 31, 38, 0.85)",

  // Brand colors (from tailwind.config.ts amplifi namespace)
  lime: "#C6FF3A",
  limeDark: "#A6E62E",
  purple: "#7C5CFF",
  purpleDark: "#6a4de6",
  teal: "#2EF2C2",
  tealDark: "#26d4aa",
  yellow: "#FFE85A",
  orange: "#FF4D2D",
  blue: "#1F4BFF",

  // Text colors (from globals.css dark theme)
  white: "#FFFFFF",
  foreground: "#FFFFFF",
  foregroundSecondary: "rgba(255, 255, 255, 0.68)",
  foregroundMuted: "rgba(255, 255, 255, 0.48)",

  // Borders (from globals.css dark theme)
  border: "rgba(255, 255, 255, 0.18)",
  borderStrong: "rgba(255, 255, 255, 0.24)",
  
  // Glass effects
  glassBorder: "rgba(255, 255, 255, 0.16)",
  glassBg: "rgba(28, 31, 38, 0.7)",
};

// Fonts from globals.css and tailwind.config.ts
export const fonts = {
  heading: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
  body: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
};

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  full: 9999,
};
