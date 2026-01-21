import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// Fade in with optional delay
export function useFadeIn(delay = 0, duration = 15) {
  const frame = useCurrentFrame();
  return interpolate(frame - delay, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

// Slide up with spring
export function useSlideUp(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 20, stiffness: 100 },
  });

  const translateY = interpolate(progress, [0, 1], [60, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return { translateY, opacity };
}

// Scale pop with spring
export function useScalePop(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const scale = interpolate(progress, [0, 1], [0.5, 1]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);

  return { scale, opacity };
}

// Typewriter effect
export function useTypewriter(text: string, delay = 0, charsPerFrame = 0.5) {
  const frame = useCurrentFrame();
  const effectiveFrame = Math.max(0, frame - delay);
  const charCount = Math.floor(effectiveFrame * charsPerFrame);
  return text.slice(0, Math.min(charCount, text.length));
}

// Stagger delay helper
export function stagger(index: number, baseDelay = 0, gap = 8) {
  return baseDelay + index * gap;
}
