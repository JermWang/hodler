import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
} from "remotion";
import { colors, fonts } from "../shared/tokens";

// Scene 1: Logo reveal with glow
const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const glowOpacity = interpolate(frame, [20, 40], [0, 0.8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Glow effect */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.lime}40 0%, transparent 70%)`,
          opacity: glowOpacity,
          filter: "blur(60px)",
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `scale(${scale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        <Img
          src={staticFile("branding/amplifi/AmpliFi-logo-white-logo.png")}
          style={{ width: 120, height: 120 }}
        />
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            fontWeight: 700,
            color: colors.white,
            opacity: textOpacity,
            letterSpacing: "-0.02em",
          }}
        >
          AmpliFi
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Tagline
const Tagline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = ["Holders", "Amplify.", "Holders", "Earn."];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        {words.map((word, i) => {
          const delay = i * 12;
          const progress = spring({
            frame: frame - delay,
            fps,
            config: { damping: 15, stiffness: 120 },
          });

          const translateY = interpolate(progress, [0, 1], [40, 0]);
          const opacity = interpolate(progress, [0, 1], [0, 1]);

          const isAccent = word === "Amplify." || word === "Earn.";

          return (
            <div
              key={i}
              style={{
                fontFamily: fonts.heading,
                fontSize: 64,
                fontWeight: 700,
                color: isAccent ? colors.lime : colors.white,
                transform: `translateY(${translateY}px)`,
                opacity,
              }}
            >
              {word}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: How it works - 3 steps
const HowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const steps = [
    { icon: "💰", title: "Project Pays", desc: "Creator fees fund rewards", color: colors.lime },
    { icon: "📢", title: "Holders Engage", desc: "Tweet to earn points", color: colors.purple },
    { icon: "🎁", title: "Earn Rewards", desc: "Claim SOL each epoch", color: colors.teal },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 120,
          fontFamily: fonts.heading,
          fontSize: 48,
          fontWeight: 700,
          color: colors.white,
          opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
        }}
      >
        How It Works
      </div>

      {/* Steps */}
      <div
        style={{
          display: "flex",
          gap: 80,
          marginTop: 60,
        }}
      >
        {steps.map((step, i) => {
          const delay = 20 + i * 15;
          const progress = spring({
            frame: frame - delay,
            fps,
            config: { damping: 14, stiffness: 100 },
          });

          const scale = interpolate(progress, [0, 1], [0.5, 1]);
          const opacity = interpolate(progress, [0, 1], [0, 1]);

          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                transform: `scale(${scale})`,
                opacity,
              }}
            >
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 24,
                  backgroundColor: `${step.color}20`,
                  border: `2px solid ${step.color}40`,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  fontSize: 48,
                }}
              >
                {step.icon}
              </div>
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 24,
                  fontWeight: 600,
                  color: colors.white,
                }}
              >
                {step.title}
              </div>
              <div
                style={{
                  fontFamily: fonts.body,
                  fontSize: 16,
                  color: colors.foregroundSecondary,
                  textAlign: "center",
                  maxWidth: 180,
                }}
              >
                {step.desc}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Features showcase
const Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const features = [
    { title: "Launch on Pump.fun", desc: "One-click token launches with vanity mints" },
    { title: "Engagement Scoring", desc: "AI-powered tweet tracking and point assignment" },
    { title: "Auto Rewards", desc: "SOL distributed every epoch to active holders" },
    { title: "Creator Dashboard", desc: "Track and claim your project fees" },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 100,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 40,
          maxWidth: 1200,
        }}
      >
        {features.map((feature, i) => {
          const delay = i * 12;
          const progress = spring({
            frame: frame - delay,
            fps,
            config: { damping: 16, stiffness: 100 },
          });

          const translateX = interpolate(progress, [0, 1], [i % 2 === 0 ? -60 : 60, 0]);
          const opacity = interpolate(progress, [0, 1], [0, 1]);

          return (
            <div
              key={i}
              style={{
                backgroundColor: colors.bgSurface,
                borderRadius: 20,
                padding: 32,
                border: `1px solid ${colors.border}`,
                transform: `translateX(${translateX}px)`,
                opacity,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 28,
                  fontWeight: 600,
                  color: colors.lime,
                  marginBottom: 12,
                }}
              >
                {feature.title}
              </div>
              <div
                style={{
                  fontFamily: fonts.body,
                  fontSize: 18,
                  color: colors.foregroundSecondary,
                }}
              >
                {feature.desc}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: CTA
const CallToAction: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 80 },
  });

  const buttonProgress = spring({
    frame: frame - 20,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const pulse = Math.sin(frame * 0.15) * 0.05 + 1;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Background glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.lime}30 0%, transparent 60%)`,
          filter: "blur(80px)",
          transform: `scale(${pulse})`,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          transform: `translateY(${interpolate(titleProgress, [0, 1], [40, 0])}px)`,
          opacity: titleProgress,
        }}
      >
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 56,
            fontWeight: 700,
            color: colors.white,
            textAlign: "center",
          }}
        >
          Ready to Amplify?
        </div>

        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 24,
            color: colors.foregroundSecondary,
            textAlign: "center",
            maxWidth: 600,
          }}
        >
          Launch your token. Reward your holders. Grow together.
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "20px 48px",
            backgroundColor: colors.lime,
            borderRadius: 16,
            fontFamily: fonts.heading,
            fontSize: 24,
            fontWeight: 600,
            color: colors.bg,
            transform: `scale(${interpolate(buttonProgress, [0, 1], [0.8, 1])})`,
            opacity: buttonProgress,
            boxShadow: `0 0 40px ${colors.lime}60`,
          }}
        >
          amplifisocial.xyz
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Main composition
export const AmpliFiIntro: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Scene 1: Logo (0-90 frames = 3s) */}
      <Sequence from={0} durationInFrames={90}>
        <LogoReveal />
      </Sequence>

      {/* Scene 2: Tagline (90-180 frames = 3s) */}
      <Sequence from={90} durationInFrames={90}>
        <Tagline />
      </Sequence>

      {/* Scene 3: How it works (180-270 frames = 3s) */}
      <Sequence from={180} durationInFrames={90}>
        <HowItWorks />
      </Sequence>

      {/* Scene 4: Features (270-360 frames = 3s) */}
      <Sequence from={270} durationInFrames={90}>
        <Features />
      </Sequence>

      {/* Scene 5: CTA (360-450 frames = 3s) */}
      <Sequence from={360} durationInFrames={90}>
        <CallToAction />
      </Sequence>
    </AbsoluteFill>
  );
};
