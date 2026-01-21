import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Img,
  staticFile,
} from "remotion";
import { colors, fonts } from "../shared/tokens";

// ============================================
// SHARED COMPONENTS
// ============================================

const GlowOrb: React.FC<{ color: string; size: number; x: number; y: number; delay?: number }> = ({
  color,
  size,
  x,
  y,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const pulse = Math.sin((frame - delay) * 0.1) * 0.3 + 1;
  const opacity = interpolate(frame - delay, [0, 15], [0, 0.6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${color}60 0%, transparent 70%)`,
        filter: "blur(40px)",
        transform: `translate(-50%, -50%) scale(${pulse})`,
        opacity,
      }}
    />
  );
};

const FloatingParticle: React.FC<{ delay: number; startX: number; startY: number; color: string }> = ({
  delay,
  startX,
  startY,
  color,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 100, stiffness: 50 },
  });

  const y = interpolate(progress, [0, 1], [startY, startY - 30]);
  const opacity = interpolate(frame - delay, [0, 10, 40, 60], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const scale = interpolate(frame - delay, [0, 20], [0.5, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div
      style={{
        position: "absolute",
        left: `${startX}%`,
        top: `${y}%`,
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: color,
        opacity,
        transform: `scale(${scale})`,
        boxShadow: `0 0 20px ${color}`,
      }}
    />
  );
};

// Floating Aura Particles
const FloatingAuras: React.FC<{ count?: number }> = ({ count = 6 }) => {
  const frame = useCurrentFrame();
  
  const particles = Array.from({ length: count }, (_, i) => {
    const seed = i * 137.5;
    const baseX = (seed % 100);
    const baseY = ((seed * 2.3) % 100);
    const speed = 0.3 + (i % 3) * 0.15;
    const size = 80 + (i % 4) * 40;
    
    const x = baseX + Math.sin(frame * speed * 0.02 + seed) * 15;
    const y = baseY + Math.cos(frame * speed * 0.015 + seed * 0.7) * 10;
    const opacity = 0.15 + Math.sin(frame * 0.03 + seed) * 0.1;
    
    return { x, y, size, opacity };
  });

  return (
    <>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${colors.lime}40 0%, transparent 70%)`,
            filter: "blur(30px)",
            transform: "translate(-50%, -50%)",
            opacity: p.opacity,
            zIndex: 1,
          }}
        />
      ))}
    </>
  );
};

// 3D Floating Screen wrapper
const FloatingScreen: React.FC<{
  children: React.ReactNode;
  rotateY?: number;
  rotateX?: number;
  scale?: number;
}> = ({ children, rotateY = 0, rotateX = 0, scale = 1 }) => {
  return (
    <div style={{ perspective: 1200, perspectiveOrigin: "50% 50%" }}>
      <div
        style={{
          transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Scene transition types
type TransitionType = "fade" | "slide-left" | "slide-right" | "zoom" | "wipe" | "blur";

// Elegant scene wrapper with fade, parallax, and camera motion
const SceneWrapper: React.FC<{ 
  children: React.ReactNode; 
  cameraRotateY?: number; 
  cameraRotateX?: number;
  transitionIn?: TransitionType;
  transitionOut?: TransitionType;
  parallaxIntensity?: number;
}> = ({ 
  children, 
  cameraRotateY = 0,
  cameraRotateX = 0,
  transitionIn = "fade",
  transitionOut = "fade",
  parallaxIntensity = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Transition in effects
  const fadeIn = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const fadeOut = interpolate(frame, [75, 90], [1, 0], { extrapolateLeft: "clamp", easing: Easing.in(Easing.quad) });
  
  // Slide transitions
  const slideInX = transitionIn === "slide-left" 
    ? interpolate(frame, [0, 20], [-100, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })
    : transitionIn === "slide-right"
    ? interpolate(frame, [0, 20], [100, 0], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })
    : 0;
    
  const slideOutX = transitionOut === "slide-left"
    ? interpolate(frame, [70, 90], [0, -100], { extrapolateLeft: "clamp", easing: Easing.in(Easing.cubic) })
    : transitionOut === "slide-right"
    ? interpolate(frame, [70, 90], [0, 100], { extrapolateLeft: "clamp", easing: Easing.in(Easing.cubic) })
    : 0;
  
  // Zoom transitions
  const zoomIn = transitionIn === "zoom"
    ? interpolate(frame, [0, 20], [1.3, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })
    : 1;
  const zoomOut = transitionOut === "zoom"
    ? interpolate(frame, [70, 90], [1, 0.8], { extrapolateLeft: "clamp", easing: Easing.in(Easing.cubic) })
    : 1;
  
  // Blur transitions
  const blurIn = transitionIn === "blur"
    ? interpolate(frame, [0, 15], [20, 0], { extrapolateRight: "clamp" })
    : 0;
  const blurOut = transitionOut === "blur"
    ? interpolate(frame, [75, 90], [0, 20], { extrapolateLeft: "clamp" })
    : 0;
  
  // Camera motion - more dramatic
  const cameraProgress = interpolate(frame, [0, 90], [0, 1], { extrapolateRight: "clamp" });
  const rotY = cameraRotateY + Math.sin(cameraProgress * Math.PI) * 6 * parallaxIntensity;
  const rotX = cameraRotateX + Math.cos(cameraProgress * Math.PI * 0.5) * 3 * parallaxIntensity;
  
  // Parallax drift
  const driftX = Math.sin(frame * 0.02) * 15 * parallaxIntensity;
  const driftY = Math.cos(frame * 0.015) * 10 * parallaxIntensity;
  
  // Scale breathing
  const breathe = 1 + Math.sin(frame * 0.03) * 0.01;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: fadeIn * fadeOut,
        transform: `
          translateX(${slideInX + slideOutX + driftX}px) 
          translateY(${driftY}px)
          scale(${zoomIn * zoomOut * breathe}) 
          perspective(1200px) 
          rotateY(${rotY}deg) 
          rotateX(${rotX}deg)
        `,
        transformOrigin: "center center",
        filter: blurIn + blurOut > 0 ? `blur(${blurIn + blurOut}px)` : undefined,
      }}
    >
      {children}
    </div>
  );
};

// Parallax layer for depth effect
const ParallaxLayer: React.FC<{ 
  children: React.ReactNode; 
  depth: number; 
  offsetX?: number;
  offsetY?: number;
}> = ({ children, depth, offsetX = 0, offsetY = 0 }) => {
  const frame = useCurrentFrame();
  
  const x = offsetX + Math.sin(frame * 0.02 + depth) * (20 * depth);
  const y = offsetY + Math.cos(frame * 0.015 + depth) * (15 * depth);
  const scale = 1 + (depth - 1) * 0.05;
  
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        zIndex: Math.floor(10 - depth),
      }}
    >
      {children}
    </div>
  );
};

// ASCII Background - animated grid of characters filling 1920x1080
const AsciiBackground: React.FC<{ parallaxX?: number; parallaxY?: number }> = ({ parallaxX = 0, parallaxY = 0 }) => {
  const frame = useCurrentFrame();
  const chars = " .:-=+*#%@";
  const cols = 220;
  const rows = 75;
  const charWidth = 10;
  const lineHeight = 16;

  // Generate pseudo-random but deterministic pattern
  const getChar = (x: number, y: number, t: number) => {
    const noise = Math.sin(x * 0.3 + t * 0.02) * Math.cos(y * 0.3 - t * 0.015) +
                  Math.sin((x + y) * 0.2 + t * 0.01) * 0.5;
    const normalized = (noise + 1.5) / 3;
    const index = Math.floor(normalized * (chars.length - 1));
    return chars[Math.max(0, Math.min(chars.length - 1, index))];
  };

  const grid: string[][] = [];
  for (let y = 0; y < rows; y++) {
    const row: string[] = [];
    for (let x = 0; x < cols; x++) {
      row.push(getChar(x, y, frame));
    }
    grid.push(row);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: -50 + parallaxY * 0.3,
        left: -100 + parallaxX * 0.3,
        width: cols * charWidth,
        height: rows * lineHeight,
        overflow: "visible",
        opacity: 0.07,
        zIndex: 0,
      }}
    >
      <pre
        style={{
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 14,
          lineHeight: 1.15,
          color: colors.lime,
          margin: 0,
          padding: 0,
          whiteSpace: "pre",
          letterSpacing: "0.08em",
        }}
      >
        {grid.map((row) => row.join("")).join("\n")}
      </pre>
    </div>
  );
};

// ============================================
// SCENE 1: EXPLOSIVE LOGO INTRO
// ============================================

const ExplosiveLogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera drift for parallax
  const cameraDriftX = Math.sin(frame * 0.025) * 30;
  const cameraDriftY = Math.cos(frame * 0.02) * 20;

  // Logo scale with overshoot
  const logoScale = spring({
    frame: frame - 5,
    fps,
    config: { damping: 8, stiffness: 150 },
  });

  // Shockwave effect
  const shockwaveScale = interpolate(frame, [10, 40], [0, 3], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const shockwaveOpacity = interpolate(frame, [10, 40], [0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Text reveal
  const textOpacity = interpolate(frame, [25, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const textY = interpolate(frame, [25, 40], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(1.5)) });

  // Tagline
  const taglineOpacity = interpolate(frame, [45, 55], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Zoom out effect at end
  const endZoom = interpolate(frame, [70, 90], [1, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.quad) });
  const endFade = interpolate(frame, [75, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.5}>
        <GlowOrb color={colors.lime} size={500} x={50} y={50} />
      </ParallaxLayer>
      <ParallaxLayer depth={0.8}>
        <GlowOrb color={colors.purple} size={300} x={30} y={60} delay={10} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.2}>
        <GlowOrb color={colors.teal} size={250} x={70} y={40} delay={20} />
      </ParallaxLayer>

      {/* Shockwave */}
      <div
        style={{
          position: "absolute",
          width: 200,
          height: 200,
          borderRadius: "50%",
          border: `3px solid ${colors.lime}`,
          transform: `scale(${shockwaveScale})`,
          opacity: shockwaveOpacity,
        }}
      />

      {/* Logo */}
      <div
        style={{
          transform: `scale(${logoScale * endZoom})`,
          opacity: endFade,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        <Img
          src={staticFile("branding/green-n-yellowPFP.png")}
          style={{
            width: 120,
            height: 120,
            borderRadius: 24,
            boxShadow: `0 0 60px ${colors.lime}80`,
          }}
        />

        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 80,
            fontWeight: 800,
            color: colors.white,
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
            letterSpacing: "-0.03em",
          }}
        >
          AmpliFi
        </div>

        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 24,
            color: colors.foregroundSecondary,
            opacity: taglineOpacity,
          }}
        >
          Holders Amplify. Holders Earn.
        </div>
      </div>

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 2: TOKEN LAUNCH SIMULATION
// ============================================

const TokenLaunchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera motion
  const cameraDriftX = Math.sin(frame * 0.02) * 25;
  const cameraDriftY = Math.cos(frame * 0.018) * 15;
  const cameraZoom = interpolate(frame, [0, 45, 90], [1.05, 1, 1.02], { extrapolateRight: "clamp" });

  // Scene fade in from zoom
  const sceneOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const sceneScale = interpolate(frame, [0, 20], [1.15, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

  // Form fields appearing
  const field1 = spring({ frame: frame - 5, fps, config: { damping: 15, stiffness: 100 } });
  const field2 = spring({ frame: frame - 12, fps, config: { damping: 15, stiffness: 100 } });
  const field3 = spring({ frame: frame - 19, fps, config: { damping: 15, stiffness: 100 } });

  // Launch button
  const buttonScale = spring({ frame: frame - 30, fps, config: { damping: 10, stiffness: 120 } });
  const buttonGlow = Math.sin(frame * 0.2) * 0.3 + 0.7;

  // Click effect
  const clickFrame = 50;
  const isClicked = frame >= clickFrame;
  const clickScale = isClicked ? interpolate(frame, [clickFrame, clickFrame + 5, clickFrame + 10], [1, 0.95, 1], { extrapolateRight: "clamp" }) : 1;

  // Success state
  const successOpacity = interpolate(frame, [55, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const successScale = spring({ frame: frame - 55, fps, config: { damping: 12, stiffness: 100 } });

  // TX simulation
  const txProgress = interpolate(frame, [55, 75], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Enhanced 3D card rotation
  const cardRotateY = interpolate(frame, [0, 45, 90], [-8, 0, 8], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cardRotateX = interpolate(frame, [0, 45, 90], [4, 0, -4], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  // Exit transition
  const exitSlide = interpolate(frame, [75, 90], [0, -80], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [75, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.6}>
        <GlowOrb color={colors.purple} size={400} x={20} y={30} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.0}>
        <GlowOrb color={colors.lime} size={350} x={80} y={70} delay={5} />
      </ParallaxLayer>

      <FloatingScreen rotateY={cardRotateY} rotateX={cardRotateX} scale={1}>
        <div
          style={{
            width: 500,
            padding: 32,
            borderRadius: 24,
            backgroundColor: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${colors.lime}15`,
          }}
        >
        {/* Token Name */}
        <div style={{ marginBottom: 16, opacity: field1, transform: `translateY(${(1 - field1) * 20}px)` }}>
          <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 6 }}>Token Name</div>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              backgroundColor: colors.bgElevated,
              border: `1px solid ${colors.border}`,
              color: colors.white,
              fontFamily: fonts.body,
              fontSize: 16,
            }}
          >
            $AMPLIFI
          </div>
        </div>

        {/* Symbol */}
        <div style={{ marginBottom: 16, opacity: field2, transform: `translateY(${(1 - field2) * 20}px)` }}>
          <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 6 }}>Symbol</div>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              backgroundColor: colors.bgElevated,
              border: `1px solid ${colors.border}`,
              color: colors.white,
              fontFamily: fonts.body,
              fontSize: 16,
            }}
          >
            AMP
          </div>
        </div>

        {/* Initial Buy */}
        <div style={{ marginBottom: 24, opacity: field3, transform: `translateY(${(1 - field3) * 20}px)` }}>
          <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 6 }}>Initial Buy (SOL)</div>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              backgroundColor: colors.bgElevated,
              border: `1px solid ${colors.border}`,
              color: colors.lime,
              fontFamily: fonts.body,
              fontSize: 16,
            }}
          >
            0.5 SOL
          </div>
        </div>

        {/* Launch Button */}
        {!isClicked ? (
          <div
            style={{
              padding: "16px 32px",
              borderRadius: 16,
              background: `linear-gradient(135deg, ${colors.lime} 0%, ${colors.teal} 100%)`,
              color: colors.bg,
              fontFamily: fonts.heading,
              fontSize: 18,
              fontWeight: 700,
              textAlign: "center",
              transform: `scale(${buttonScale * clickScale})`,
              boxShadow: `0 0 ${30 * buttonGlow}px ${colors.lime}60`,
              cursor: "pointer",
            }}
          >
            Launch Token
          </div>
        ) : (
          <div
            style={{
              opacity: successOpacity,
              transform: `scale(${successScale})`,
            }}
          >
            <div
              style={{
                padding: "16px 32px",
                borderRadius: 16,
                backgroundColor: `${colors.lime}20`,
                border: `2px solid ${colors.lime}`,
                textAlign: "center",
              }}
            >
              <div style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Token Launched!
              </div>
              <div style={{ color: colors.foregroundSecondary, fontSize: 12 }}>
                TX: {txProgress.toFixed(0)}% confirmed
              </div>
            </div>
          </div>
        )}
        </div>
      </FloatingScreen>

      {/* Floating particles on success */}
      {isClicked && (
        <>
          {[...Array(8)].map((_, i) => (
            <FloatingParticle
              key={i}
              delay={55 + i * 3}
              startX={35 + Math.random() * 30}
              startY={60 + Math.random() * 20}
              color={i % 2 === 0 ? colors.lime : colors.teal}
            />
          ))}
        </>
      )}

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 3: ENGAGEMENT TRACKING
// ============================================

const EngagementTrackingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera motion - sweeping from right to left
  const cameraDriftX = interpolate(frame, [0, 90], [40, -40], { extrapolateRight: "clamp" });
  const cameraDriftY = Math.cos(frame * 0.02) * 12;
  
  // Scene transitions
  const sceneOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [78, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const tweets = [
    { user: "@crypto_whale", text: "Just aped into $AMP via @AmpliFiSocial - holders get 50% of creator fees!", delay: 5, points: 45, type: "Original Tweet" },
    { user: "@defi_degen", text: "@AmpliFiSocial is changing the game. Tweet to earn, hold to earn. LFG!", delay: 20, points: 62, type: "Quote Tweet" },
    { user: "@sol_maxi", text: "Replying to @AmpliFiSocial - just claimed 2.4 SOL from my engagement rewards", delay: 35, points: 38, type: "Reply" },
    { user: "@diamond_hands", text: "RT @AmpliFiSocial: Epoch 7 rewards are LIVE. Claim now at amplifisocial.xyz", delay: 50, points: 25, type: "Retweet" },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.7}>
        <GlowOrb color={colors.purple} size={400} x={75} y={25} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.1}>
        <GlowOrb color={colors.teal} size={300} x={25} y={75} delay={10} />
      </ParallaxLayer>

      {/* Tweet Feed */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 600 }}>
        {tweets.map((tweet, i) => {
          const tweetProgress = spring({ frame: frame - tweet.delay, fps, config: { damping: 14, stiffness: 100 } });
          const pointsDelay = tweet.delay + 15;
          const pointsOpacity = interpolate(frame, [pointsDelay, pointsDelay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const pointsScale = spring({ frame: frame - pointsDelay, fps, config: { damping: 10, stiffness: 150 } });

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 20,
                borderRadius: 16,
                backgroundColor: colors.bgSurface,
                border: `1px solid ${colors.border}`,
                opacity: tweetProgress,
                transform: `translateX(${(1 - tweetProgress) * -50}px)`,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${colors.purple} 0%, ${colors.teal} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: colors.white,
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                {tweet.user[1].toUpperCase()}
              </div>

              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: colors.lime, fontFamily: fonts.body, fontSize: 14, fontWeight: 600 }}>
                    {tweet.user}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      backgroundColor: colors.purple + "30",
                      color: colors.purple,
                      fontWeight: 600,
                    }}
                  >
                    {tweet.type}
                  </span>
                </div>
                <div style={{ color: colors.foregroundSecondary, fontFamily: fonts.body, fontSize: 13, marginTop: 4 }}>
                  {tweet.text}
                </div>
              </div>

              {/* Points Badge */}
              <div
                style={{
                  padding: "8px 16px",
                  borderRadius: 12,
                  backgroundColor: `${colors.lime}20`,
                  border: `1px solid ${colors.lime}40`,
                  opacity: pointsOpacity,
                  transform: `scale(${pointsScale})`,
                }}
              >
                <span style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 18, fontWeight: 700 }}>
                  +{tweet.points}
                </span>
                <span style={{ color: colors.foregroundSecondary, fontSize: 12, marginLeft: 4 }}>pts</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total Counter */}
      <div
        style={{
          position: "absolute",
          bottom: 80,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ color: colors.foregroundSecondary, fontSize: 16 }}>Total Engagement Score:</div>
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 36,
            fontWeight: 800,
            color: colors.lime,
            textShadow: `0 0 30px ${colors.lime}60`,
          }}
        >
          {Math.min(170, Math.floor(interpolate(frame, [40, 85], [0, 170], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })))}
        </div>
      </div>

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 4: REWARD CLAIM SIMULATION
// ============================================

const RewardClaimScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera motion - zoom in on claim
  const cameraDriftX = Math.sin(frame * 0.025) * 20;
  const cameraDriftY = Math.cos(frame * 0.02) * 15;
  const cameraZoom = interpolate(frame, [0, 50, 55, 70], [1, 1, 1.08, 1.05], { extrapolateRight: "clamp" });
  
  // Scene transitions
  const sceneOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [78, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Reward amount counting up
  const rewardAmount = interpolate(frame, [10, 50], [0, 2.847], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Claim button
  const claimFrame = 55;
  const isClaimed = frame >= claimFrame;

  // Success animation
  const successScale = spring({ frame: frame - claimFrame, fps, config: { damping: 10, stiffness: 100 } });
  const successOpacity = interpolate(frame, [claimFrame, claimFrame + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Coins flying
  const coinPositions = [
    { delay: 60, x: 40, y: 50 },
    { delay: 63, x: 55, y: 45 },
    { delay: 66, x: 48, y: 55 },
    { delay: 69, x: 60, y: 50 },
    { delay: 72, x: 45, y: 48 },
  ];

  // Enhanced 3D rotation
  const cardRotateY = interpolate(frame, [0, 45, 90], [6, 0, -6], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cardRotateX = interpolate(frame, [0, 45, 90], [-3, 0, 3], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade, transform: `scale(${cameraZoom})` }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.5}>
        <GlowOrb color={colors.lime} size={500} x={50} y={50} />
      </ParallaxLayer>
      <ParallaxLayer depth={0.9}>
        <GlowOrb color={colors.yellow} size={300} x={70} y={30} delay={5} />
      </ParallaxLayer>

      <FloatingScreen rotateY={cardRotateY} rotateX={cardRotateX} scale={1}>
        <div
          style={{
            width: 450,
            padding: 40,
            borderRadius: 24,
            backgroundColor: colors.bgSurface,
            border: `2px solid ${colors.lime}40`,
            textAlign: "center",
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 60px ${colors.lime}20`,
          }}
        >
          <div style={{ color: colors.foregroundSecondary, fontSize: 16, marginBottom: 8 }}>
            Claimable Rewards
          </div>

        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            fontWeight: 800,
            color: colors.lime,
            textShadow: `0 0 40px ${colors.lime}60`,
            marginBottom: 8,
          }}
        >
          {rewardAmount.toFixed(3)}
        </div>

        <div style={{ color: colors.foregroundSecondary, fontSize: 20, marginBottom: 32 }}>
          SOL
        </div>

        {!isClaimed ? (
          <div
            style={{
              padding: "18px 48px",
              borderRadius: 16,
              background: `linear-gradient(135deg, ${colors.lime} 0%, ${colors.yellow} 100%)`,
              color: colors.bg,
              fontFamily: fonts.heading,
              fontSize: 20,
              fontWeight: 700,
              display: "inline-block",
              boxShadow: `0 0 30px ${colors.lime}50`,
            }}
          >
            Claim Now
          </div>
        ) : (
          <div
            style={{
              opacity: successOpacity,
              transform: `scale(${successScale})`,
            }}
          >
            <div
              style={{
                padding: "18px 48px",
                borderRadius: 16,
                backgroundColor: `${colors.lime}20`,
                border: `2px solid ${colors.lime}`,
                display: "inline-block",
              }}
            >
              <span style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 20, fontWeight: 700 }}>
                Claimed!
              </span>
            </div>
          </div>
        )}
        </div>
      </FloatingScreen>

      {/* Flying coins */}
      {coinPositions.map((coin, i) => (
        <FloatingParticle
          key={i}
          delay={coin.delay}
          startX={coin.x}
          startY={coin.y}
          color={colors.yellow}
        />
      ))}

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 5: STATS DASHBOARD
// ============================================

const StatsDashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera motion - slow pan across stats
  const cameraDriftX = interpolate(frame, [0, 90], [-30, 30], { extrapolateRight: "clamp" });
  const cameraDriftY = Math.sin(frame * 0.02) * 10;
  const cameraRotate = interpolate(frame, [0, 90], [-2, 2], { extrapolateRight: "clamp" });
  
  // Scene transitions
  const sceneOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [78, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const stats = [
    { label: "Total Holders", value: "12,847", color: colors.lime, delay: 5 },
    { label: "SOL Distributed", value: "847.5", color: colors.yellow, delay: 12 },
    { label: "Active Campaigns", value: "156", color: colors.purple, delay: 19 },
    { label: "Tweets Tracked", value: "89.2K", color: colors.teal, delay: 26 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade, transform: `perspective(1200px) rotateY(${cameraRotate}deg)` }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.6}>
        <GlowOrb color={colors.lime} size={400} x={20} y={20} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.0}>
        <GlowOrb color={colors.purple} size={350} x={80} y={80} delay={10} />
      </ParallaxLayer>

      {/* Stats Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          width: 700,
        }}
      >
        {stats.map((stat, i) => {
          const cardProgress = spring({ frame: frame - stat.delay, fps, config: { damping: 14, stiffness: 100 } });
          const valueProgress = interpolate(frame - stat.delay, [10, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

          return (
            <div
              key={i}
              style={{
                padding: 32,
                borderRadius: 20,
                backgroundColor: colors.bgSurface,
                border: `1px solid ${stat.color}30`,
                opacity: cardProgress,
                transform: `scale(${0.8 + cardProgress * 0.2}) translateY(${(1 - cardProgress) * 30}px)`,
              }}
            >
              <div style={{ color: colors.foregroundSecondary, fontSize: 14, marginBottom: 8 }}>
                {stat.label}
              </div>
              <div
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 42,
                  fontWeight: 800,
                  color: stat.color,
                  opacity: valueProgress,
                }}
              >
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 6: TWITTER CONNECTION
// ============================================

const TwitterConnectionScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera motion - slide in from right
  const cameraDriftX = interpolate(frame, [0, 30, 90], [60, 0, -20], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const cameraDriftY = Math.cos(frame * 0.018) * 12;
  
  // Scene transitions
  const sceneOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [78, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Card slide in
  const cardProgress = spring({ frame: frame - 5, fps, config: { damping: 14, stiffness: 100 } });

  // Steps animation
  const step1 = spring({ frame: frame - 15, fps, config: { damping: 15, stiffness: 100 } });
  const step2 = spring({ frame: frame - 30, fps, config: { damping: 15, stiffness: 100 } });
  const step3 = spring({ frame: frame - 45, fps, config: { damping: 15, stiffness: 100 } });

  // Success checkmark
  const successFrame = 60;
  const isSuccess = frame >= successFrame;
  const successScale = spring({ frame: frame - successFrame, fps, config: { damping: 10, stiffness: 150 } });

  // Enhanced 3D rotation
  const cardRotateY = interpolate(frame, [0, 45, 90], [-6, 0, 6], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cardRotateX = interpolate(frame, [0, 45, 90], [3, 0, -3], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.7}>
        <GlowOrb color={colors.teal} size={400} x={30} y={40} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.1}>
        <GlowOrb color={colors.purple} size={350} x={70} y={60} delay={10} />
      </ParallaxLayer>

      <FloatingScreen rotateY={cardRotateY} rotateX={cardRotateX} scale={1}>
        <div
          style={{
            width: 500,
            padding: 40,
            borderRadius: 24,
            backgroundColor: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            opacity: cardProgress,
            transform: `translateY(${(1 - cardProgress) * 40}px)`,
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${colors.teal}15`,
          }}
        >
          {/* Twitter Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              backgroundColor: "#1DA1F2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 40px rgba(29, 161, 242, 0.4)",
            }}
          >
            <span style={{ fontSize: 40, color: colors.white }}>𝕏</span>
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Step 1 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: step1,
              transform: `translateX(${(1 - step1) * -30}px)`,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: frame >= 25 ? colors.lime : colors.bgElevated,
                border: `2px solid ${frame >= 25 ? colors.lime : colors.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: frame >= 25 ? colors.bg : colors.foregroundSecondary,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {frame >= 25 ? "✓" : "1"}
            </div>
            <span style={{ color: colors.white, fontSize: 16 }}>Sign message with wallet</span>
          </div>

          {/* Step 2 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: step2,
              transform: `translateX(${(1 - step2) * -30}px)`,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: frame >= 40 ? colors.lime : colors.bgElevated,
                border: `2px solid ${frame >= 40 ? colors.lime : colors.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: frame >= 40 ? colors.bg : colors.foregroundSecondary,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {frame >= 40 ? "✓" : "2"}
            </div>
            <span style={{ color: colors.white, fontSize: 16 }}>Authorize Twitter OAuth</span>
          </div>

          {/* Step 3 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: step3,
              transform: `translateX(${(1 - step3) * -30}px)`,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: frame >= 55 ? colors.lime : colors.bgElevated,
                border: `2px solid ${frame >= 55 ? colors.lime : colors.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: frame >= 55 ? colors.bg : colors.foregroundSecondary,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {frame >= 55 ? "✓" : "3"}
            </div>
            <span style={{ color: colors.white, fontSize: 16 }}>Start earning points!</span>
          </div>
        </div>

        {/* Success State */}
        {isSuccess && (
          <div
            style={{
              marginTop: 24,
              padding: "16px 24px",
              borderRadius: 12,
              backgroundColor: `${colors.lime}20`,
              border: `1px solid ${colors.lime}40`,
              textAlign: "center",
              transform: `scale(${successScale})`,
            }}
          >
            <span style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 18, fontWeight: 600 }}>
              @crypto_holder connected!
            </span>
          </div>
        )}
        </div>
      </FloatingScreen>

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 7: LEADERBOARD
// ============================================

const LeaderboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera motion - vertical scroll feel
  const cameraDriftX = Math.sin(frame * 0.02) * 15;
  const cameraDriftY = interpolate(frame, [0, 90], [20, -20], { extrapolateRight: "clamp" });
  const cameraScale = interpolate(frame, [0, 20, 70, 90], [1.05, 1, 1, 0.95], { extrapolateRight: "clamp" });
  
  // Scene transitions
  const sceneOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [78, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const leaderboardData = [
    { rank: 1, user: "@whale_holder", points: "12,847", reward: "4.2 SOL", color: colors.yellow },
    { rank: 2, user: "@degen_trader", points: "9,234", reward: "2.8 SOL", color: colors.foregroundSecondary },
    { rank: 3, user: "@sol_maxi", points: "7,891", reward: "1.9 SOL", color: colors.orange },
    { rank: 4, user: "@crypto_fan", points: "5,432", reward: "1.2 SOL", color: colors.foregroundMuted },
    { rank: 5, user: "@diamond_hands", points: "4,123", reward: "0.8 SOL", color: colors.foregroundMuted },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade, transform: `scale(${cameraScale})` }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.6}>
        <GlowOrb color={colors.yellow} size={400} x={50} y={30} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.0}>
        <GlowOrb color={colors.lime} size={300} x={25} y={70} delay={10} />
      </ParallaxLayer>

      {/* Leaderboard Table */}
      <div
        style={{
          width: 700,
          borderRadius: 20,
          backgroundColor: colors.bgSurface,
          border: `1px solid ${colors.border}`,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 120px 120px",
            padding: "16px 24px",
            backgroundColor: colors.bgElevated,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ color: colors.foregroundSecondary, fontSize: 12, fontWeight: 600 }}>RANK</span>
          <span style={{ color: colors.foregroundSecondary, fontSize: 12, fontWeight: 600 }}>HOLDER</span>
          <span style={{ color: colors.foregroundSecondary, fontSize: 12, fontWeight: 600, textAlign: "right" }}>POINTS</span>
          <span style={{ color: colors.foregroundSecondary, fontSize: 12, fontWeight: 600, textAlign: "right" }}>REWARD</span>
        </div>

        {/* Rows */}
        {leaderboardData.map((row, i) => {
          const rowDelay = 10 + i * 8;
          const rowProgress = spring({ frame: frame - rowDelay, fps, config: { damping: 15, stiffness: 100 } });

          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "60px 1fr 120px 120px",
                padding: "16px 24px",
                borderBottom: i < leaderboardData.length - 1 ? `1px solid ${colors.border}` : "none",
                opacity: rowProgress,
                transform: `translateX(${(1 - rowProgress) * -40}px)`,
                backgroundColor: row.rank === 1 ? `${colors.yellow}10` : "transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {row.rank <= 3 ? (
                  <span style={{ fontSize: 20 }}>{row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : "🥉"}</span>
                ) : (
                  <span style={{ color: colors.foregroundSecondary, fontWeight: 600 }}>#{row.rank}</span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${colors.purple} 0%, ${colors.teal} 100%)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: colors.white,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  {row.user[1].toUpperCase()}
                </div>
                <span style={{ color: colors.white, fontWeight: 500 }}>{row.user}</span>
              </div>
              <span style={{ color: colors.lime, fontWeight: 700, textAlign: "right", fontFamily: fonts.heading }}>
                {row.points}
              </span>
              <span style={{ color: colors.yellow, fontWeight: 600, textAlign: "right" }}>
                {row.reward}
              </span>
            </div>
          );
        })}
      </div>

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 8: CLEAN WIND-DOWN TITLE SCREEN
// ============================================

const WindDownTitleScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera motion - slow zoom in and settle
  const cameraDriftX = Math.sin(frame * 0.015) * 10;
  const cameraDriftY = Math.cos(frame * 0.012) * 8;
  const cameraZoom = interpolate(frame, [0, 60, 120], [0.95, 1, 1.02], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  
  // Scene fade in
  const sceneOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  // Slow, elegant fade in
  const logoOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logoScale = interpolate(frame, [0, 40], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });

  // Tagline
  const taglineOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // URL
  const urlOpacity = interpolate(frame, [50, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const urlY = interpolate(frame, [50, 70], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Subtle pulse on logo
  const pulse = Math.sin(frame * 0.05) * 0.02 + 1;

  // Gentle glow animation
  const glowIntensity = Math.sin(frame * 0.03) * 0.2 + 0.8;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity, transform: `scale(${cameraZoom})` }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      {/* Subtle background glow */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${colors.lime}15 0%, transparent 60%)`,
          filter: "blur(100px)",
          opacity: glowIntensity,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          opacity: logoOpacity,
          transform: `scale(${logoScale * pulse})`,
        }}
      >
        {/* Logo Mark */}
        <Img
          src={staticFile("branding/green-n-yellowPFP.png")}
          style={{
            width: 140,
            height: 140,
            borderRadius: 32,
            boxShadow: `0 0 80px ${colors.lime}40`,
          }}
        />

        {/* Brand Name */}
        <div
          style={{
            fontFamily: fonts.heading,
            fontSize: 72,
            fontWeight: 800,
            color: colors.white,
            letterSpacing: "-0.03em",
          }}
        >
          AmpliFi
        </div>

        {/* Tagline */}
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 24,
            color: colors.foregroundSecondary,
            opacity: taglineOpacity,
            textAlign: "center",
            maxWidth: 500,
          }}
        >
          Turn your holders into your marketing engine
        </div>

        {/* URL */}
        <div
          style={{
            marginTop: 32,
            padding: "16px 40px",
            borderRadius: 16,
            backgroundColor: `${colors.lime}15`,
            border: `1px solid ${colors.lime}30`,
            opacity: urlOpacity,
            transform: `translateY(${urlY}px)`,
          }}
        >
          <span
            style={{
              fontFamily: fonts.heading,
              fontSize: 22,
              fontWeight: 600,
              color: colors.lime,
            }}
          >
            amplifisocial.xyz
          </span>
        </div>
      </div>

      {/* Social handles */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          display: "flex",
          gap: 32,
          opacity: urlOpacity,
        }}
      >
        <span style={{ color: colors.foregroundSecondary, fontSize: 16 }}>@AmpliFiSocial</span>
      </div>
    </AbsoluteFill>
  );
};

// ============================================
// MAIN COMPOSITION
// ============================================

export const AmpliFiShowcase: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg }}>
      {/* Scene 1: Explosive Logo (0-90 frames = 3s) */}
      <Sequence from={0} durationInFrames={90}>
        <ExplosiveLogoIntro />
      </Sequence>

      {/* Scene 2: Token Launch (90-180 frames = 3s) */}
      <Sequence from={90} durationInFrames={90}>
        <TokenLaunchScene />
      </Sequence>

      {/* Scene 3: Twitter Connection (180-270 frames = 3s) */}
      <Sequence from={180} durationInFrames={90}>
        <TwitterConnectionScene />
      </Sequence>

      {/* Scene 4: Engagement Tracking (270-360 frames = 3s) */}
      <Sequence from={270} durationInFrames={90}>
        <EngagementTrackingScene />
      </Sequence>

      {/* Scene 5: Leaderboard (360-450 frames = 3s) */}
      <Sequence from={360} durationInFrames={90}>
        <LeaderboardScene />
      </Sequence>

      {/* Scene 6: Reward Claim (450-540 frames = 3s) */}
      <Sequence from={450} durationInFrames={90}>
        <RewardClaimScene />
      </Sequence>

      {/* Scene 7: Stats Dashboard (540-630 frames = 3s) */}
      <Sequence from={540} durationInFrames={90}>
        <StatsDashboardScene />
      </Sequence>

      {/* Scene 8: Wind-Down Title (630-750 frames = 4s) */}
      <Sequence from={630} durationInFrames={120}>
        <WindDownTitleScreen />
      </Sequence>
    </AbsoluteFill>
  );
};
