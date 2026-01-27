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

// Google Fonts CSS import for Plus Jakarta Sans (AmpliFi's primary font)
const fontStyles = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
`;

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

const AsciiBackground: React.FC<{ parallaxX?: number; parallaxY?: number }> = ({ parallaxX = 0, parallaxY = 0 }) => {
  const frame = useCurrentFrame();
  const chars = " .:-=+*#%@";
  const cols = 220;
  const rows = 75;
  const charWidth = 10;
  const lineHeight = 16;

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
// SCENE 1: COIN LAUNCH ON WEBSITE
// ============================================

const CoinLaunchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cameraDriftX = Math.sin(frame * 0.04) * 25;
  const cameraDriftY = Math.cos(frame * 0.036) * 15;

  const sceneOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const sceneScale = interpolate(frame, [0, 10], [1.15, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });

  // Form fields appearing with typing effect (faster)
  const field1 = spring({ frame: frame - 2, fps, config: { damping: 15, stiffness: 120 } });
  const field2 = spring({ frame: frame - 7, fps, config: { damping: 15, stiffness: 120 } });
  const field3 = spring({ frame: frame - 12, fps, config: { damping: 15, stiffness: 120 } });
  const field4 = spring({ frame: frame - 17, fps, config: { damping: 15, stiffness: 120 } });

  // Typing animation for token name (faster)
  const tokenName = "$AMP";
  const typedChars = Math.min(tokenName.length, Math.floor((frame - 5) / 2));
  const displayedName = tokenName.slice(0, typedChars);
  const showCursor = frame % 10 < 5 && typedChars < tokenName.length;

  // Launch button
  const buttonScale = spring({ frame: frame - 25, fps, config: { damping: 10, stiffness: 120 } });
  const buttonGlow = Math.sin(frame * 0.3) * 0.3 + 0.7;

  // Click effect
  const clickFrame = 40;
  const isClicked = frame >= clickFrame;
  const clickScale = isClicked ? interpolate(frame, [clickFrame, clickFrame + 3, clickFrame + 6], [1, 0.95, 1], { extrapolateRight: "clamp" }) : 1;

  // Success state
  const successOpacity = interpolate(frame, [43, 53], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const successScale = spring({ frame: frame - 43, fps, config: { damping: 12, stiffness: 100 } });

  // TX simulation
  const txProgress = interpolate(frame, [43, 70], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // 3D card rotation
  const cardRotateY = interpolate(frame, [0, 45, 90], [-8, 0, 8], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cardRotateX = interpolate(frame, [0, 45, 90], [4, 0, -4], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  // Exit transition
  const exitFade = interpolate(frame, [80, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.6}>
        <GlowOrb color={colors.purple} size={400} x={20} y={30} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.0}>
        <GlowOrb color={colors.lime} size={350} x={80} y={70} delay={5} />
      </ParallaxLayer>

      {/* Scene Title */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 80,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Img
          src={staticFile("branding/green-n-yellowPFP.png")}
          style={{ width: 48, height: 48, borderRadius: 12 }}
        />
        <span style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 700, color: colors.white }}>
          Launch Token
        </span>
      </div>

      <FloatingScreen rotateY={cardRotateY} rotateX={cardRotateX} scale={sceneScale}>
        <div
          style={{
            width: 520,
            padding: 36,
            borderRadius: 24,
            backgroundColor: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${colors.lime}15`,
          }}
        >
          {/* Token Name */}
          <div style={{ marginBottom: 20, opacity: field1, transform: `translateY(${(1 - field1) * 20}px)` }}>
            <div style={{ fontSize: 13, color: colors.foregroundSecondary, marginBottom: 8, fontWeight: 500, fontFamily: fonts.body }}>Token Name</div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                backgroundColor: colors.bgElevated,
                border: `1px solid ${colors.lime}40`,
                color: colors.lime,
                fontFamily: fonts.body,
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {displayedName}{showCursor ? "|" : ""}
            </div>
          </div>

          {/* Symbol */}
          <div style={{ marginBottom: 20, opacity: field2, transform: `translateY(${(1 - field2) * 20}px)` }}>
            <div style={{ fontSize: 13, color: colors.foregroundSecondary, marginBottom: 8, fontWeight: 500, fontFamily: fonts.body }}>Symbol</div>
            <div
              style={{
                padding: "14px 18px",
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

          {/* Description */}
          <div style={{ marginBottom: 20, opacity: field3, transform: `translateY(${(1 - field3) * 20}px)` }}>
            <div style={{ fontSize: 13, color: colors.foregroundSecondary, marginBottom: 8, fontWeight: 500, fontFamily: fonts.body }}>Description</div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                backgroundColor: colors.bgElevated,
                border: `1px solid ${colors.border}`,
                color: colors.foregroundSecondary,
                fontFamily: fonts.body,
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              The official AmpliFi token. Holders earn rewards for engagement.
            </div>
          </div>

          {/* Initial Buy */}
          <div style={{ marginBottom: 28, opacity: field4, transform: `translateY(${(1 - field4) * 20}px)` }}>
            <div style={{ fontSize: 13, color: colors.foregroundSecondary, marginBottom: 8, fontWeight: 500, fontFamily: fonts.body }}>Dev Buy (SOL)</div>
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                backgroundColor: colors.bgElevated,
                border: `1px solid ${colors.border}`,
                color: colors.yellow,
                fontFamily: fonts.body,
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              1.0 SOL
            </div>
          </div>

          {/* Launch Button */}
          {!isClicked ? (
            <div
              style={{
                padding: "18px 32px",
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
                  padding: "18px 32px",
                  borderRadius: 16,
                  backgroundColor: `${colors.lime}20`,
                  border: `2px solid ${colors.lime}`,
                  textAlign: "center",
                }}
              >
                <div style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  $AMP Launched!
                </div>
                <div style={{ color: colors.foregroundSecondary, fontSize: 13 }}>
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
          {[...Array(12)].map((_, i) => (
            <FloatingParticle
              key={i}
              delay={43 + i * 2}
              startX={35 + Math.random() * 30}
              startY={55 + Math.random() * 20}
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
// SCENE 2: JOIN CAMPAIGN (HOLDER PERSPECTIVE)
// ============================================

const JoinCampaignScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cameraDriftX = interpolate(frame, [0, 90], [40, -40], { extrapolateRight: "clamp" });
  const cameraDriftY = Math.cos(frame * 0.04) * 12;

  const sceneOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [80, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Campaign card animation
  const cardProgress = spring({ frame: frame - 3, fps, config: { damping: 14, stiffness: 120 } });

  // Campaign details appearing
  const detail1 = spring({ frame: frame - 8, fps, config: { damping: 15, stiffness: 120 } });
  const detail2 = spring({ frame: frame - 13, fps, config: { damping: 15, stiffness: 120 } });
  const detail3 = spring({ frame: frame - 18, fps, config: { damping: 15, stiffness: 120 } });

  // Join button
  const buttonScale = spring({ frame: frame - 25, fps, config: { damping: 10, stiffness: 120 } });
  const buttonGlow = Math.sin(frame * 0.3) * 0.3 + 0.7;

  // Click effect
  const clickFrame = 45;
  const isClicked = frame >= clickFrame;
  const clickScale = isClicked ? interpolate(frame, [clickFrame, clickFrame + 3, clickFrame + 6], [1, 0.95, 1], { extrapolateRight: "clamp" }) : 1;

  // Success state
  const successOpacity = interpolate(frame, [48, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const successScale = spring({ frame: frame - 48, fps, config: { damping: 12, stiffness: 100 } });

  // 3D rotation
  const cardRotateY = interpolate(frame, [0, 45, 90], [6, 0, -6], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cardRotateX = interpolate(frame, [0, 45, 90], [-3, 0, 3], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.7}>
        <GlowOrb color={colors.teal} size={400} x={75} y={25} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.1}>
        <GlowOrb color={colors.purple} size={300} x={25} y={75} delay={10} />
      </ParallaxLayer>

      {/* Scene Title */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 80,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Img
          src={staticFile("branding/green-n-yellowPFP.png")}
          style={{ width: 48, height: 48, borderRadius: 12 }}
        />
        <span style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 700, color: colors.white }}>
          Join Campaign
        </span>
      </div>

      <FloatingScreen rotateY={cardRotateY} rotateX={cardRotateX} scale={1}>
        <div
          style={{
            width: 550,
            padding: 36,
            borderRadius: 24,
            backgroundColor: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${colors.teal}15`,
            opacity: cardProgress,
            transform: `translateY(${(1 - cardProgress) * 30}px)`,
          }}
        >
          {/* Campaign Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
            <Img
              src={staticFile("branding/green-n-yellowPFP.png")}
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                boxShadow: `0 0 20px ${colors.lime}40`,
              }}
            />
            <div>
              <div style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, color: colors.white }}>
                $AMP Campaign
              </div>
              <div style={{ color: colors.lime, fontSize: 14, fontWeight: 500, fontFamily: fonts.body }}>
                Active - 28 days remaining
              </div>
            </div>
          </div>

          {/* Campaign Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
            <div style={{ opacity: detail1, transform: `translateY(${(1 - detail1) * 15}px)` }}>
              <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 4, fontFamily: fonts.body }}>Reward Pool</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 700, color: colors.yellow }}>
                50 SOL
              </div>
            </div>
            <div style={{ opacity: detail2, transform: `translateY(${(1 - detail2) * 15}px)` }}>
              <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 4, fontFamily: fonts.body }}>Participants</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 700, color: colors.lime }}>
                847
              </div>
            </div>
            <div style={{ opacity: detail3, transform: `translateY(${(1 - detail3) * 15}px)` }}>
              <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 4, fontFamily: fonts.body }}>Your Balance</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 700, color: colors.teal }}>
                125K
              </div>
            </div>
          </div>

          {/* Tracking Info */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              backgroundColor: colors.bgElevated,
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 8, fontFamily: fonts.body }}>Tracking</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ padding: "6px 12px", borderRadius: 8, backgroundColor: `${colors.purple}30`, color: colors.purple, fontSize: 14, fontWeight: 500, fontFamily: fonts.body }}>
                @AmpliFiSocial
              </span>
              <span style={{ padding: "6px 12px", borderRadius: 8, backgroundColor: `${colors.lime}30`, color: colors.lime, fontSize: 14, fontWeight: 500, fontFamily: fonts.body }}>
                $AMP
              </span>
            </div>
          </div>

          {/* Join Button */}
          {!isClicked ? (
            <div
              style={{
                padding: "18px 32px",
                borderRadius: 16,
                background: `linear-gradient(135deg, ${colors.teal} 0%, ${colors.lime} 100%)`,
                color: colors.bg,
                fontFamily: fonts.heading,
                fontSize: 18,
                fontWeight: 700,
                textAlign: "center",
                transform: `scale(${buttonScale * clickScale})`,
                boxShadow: `0 0 ${30 * buttonGlow}px ${colors.teal}60`,
                cursor: "pointer",
              }}
            >
              Join Campaign
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
                  padding: "18px 32px",
                  borderRadius: 16,
                  backgroundColor: `${colors.lime}20`,
                  border: `2px solid ${colors.lime}`,
                  textAlign: "center",
                }}
              >
                <div style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 20, fontWeight: 700 }}>
                  You're In! Start tweeting to earn.
                </div>
              </div>
            </div>
          )}
        </div>
      </FloatingScreen>

      {/* Success particles */}
      {isClicked && (
        <>
          {[...Array(10)].map((_, i) => (
            <FloatingParticle
              key={i}
              delay={48 + i * 2}
              startX={35 + Math.random() * 30}
              startY={50 + Math.random() * 25}
              color={i % 2 === 0 ? colors.teal : colors.lime}
            />
          ))}
        </>
      )}

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 3: PERSON TWEETS ABOUT $AMP
// ============================================

const TweetAboutAmpScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cameraDriftX = Math.sin(frame * 0.04) * 20;
  const cameraDriftY = Math.cos(frame * 0.036) * 15;

  const sceneOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [80, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Tweet compose animation
  const composeProgress = spring({ frame: frame - 2, fps, config: { damping: 14, stiffness: 120 } });

  // Typing animation (faster)
  const tweetText = "Just joined the $AMP campaign on @AmpliFiSocial! Holders earn SOL for tweeting. LFG!";
  const typedChars = Math.min(tweetText.length, Math.floor((frame - 8) * 3));
  const displayedText = tweetText.slice(0, typedChars);
  const showCursor = frame % 8 < 4 && typedChars < tweetText.length;

  // Post button
  const postFrame = 45;
  const isPosted = frame >= postFrame;
  const postScale = isPosted ? interpolate(frame, [postFrame, postFrame + 3, postFrame + 6], [1, 0.95, 1], { extrapolateRight: "clamp" }) : 1;

  // Points appearing
  const pointsDelay = 50;
  const pointsOpacity = interpolate(frame, [pointsDelay, pointsDelay + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const pointsScale = spring({ frame: frame - pointsDelay, fps, config: { damping: 10, stiffness: 150 } });
  const pointsY = interpolate(frame, [pointsDelay, pointsDelay + 12], [30, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // 3D rotation
  const cardRotateY = interpolate(frame, [0, 45, 90], [-5, 0, 5], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cardRotateX = interpolate(frame, [0, 45, 90], [3, 0, -3], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity * exitFade }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>
      
      <ParallaxLayer depth={0.6}>
        <GlowOrb color={colors.purple} size={400} x={30} y={40} />
      </ParallaxLayer>
      <ParallaxLayer depth={1.0}>
        <GlowOrb color={colors.lime} size={350} x={70} y={60} delay={5} />
      </ParallaxLayer>

      {/* Scene Title */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 80,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Img
          src={staticFile("branding/green-n-yellowPFP.png")}
          style={{ width: 48, height: 48, borderRadius: 12 }}
        />
        <span style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 700, color: colors.white }}>
          Tweet & Earn
        </span>
      </div>

      <FloatingScreen rotateY={cardRotateY} rotateX={cardRotateX} scale={1}>
        <div
          style={{
            width: 580,
            borderRadius: 24,
            backgroundColor: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px ${colors.purple}15`,
            overflow: "hidden",
            opacity: composeProgress,
            transform: `translateY(${(1 - composeProgress) * 30}px)`,
          }}
        >
          {/* Tweet Header */}
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: 16 }}>
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
              H
            </div>
            <div>
              <div style={{ color: colors.white, fontWeight: 600, fontSize: 16 }}>@holder_degen</div>
              <div style={{ color: colors.foregroundSecondary, fontSize: 13 }}>Posting to everyone</div>
            </div>
          </div>

          {/* Tweet Content */}
          <div style={{ padding: "24px", minHeight: 140 }}>
            <div
              style={{
                color: colors.white,
                fontFamily: fonts.body,
                fontSize: 18,
                lineHeight: 1.5,
              }}
            >
              {displayedText}
              {showCursor && <span style={{ color: colors.lime }}>|</span>}
            </div>
          </div>

          {/* Tweet Footer */}
          <div style={{ padding: "16px 24px", borderTop: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 24 }}>
              <span style={{ color: colors.foregroundSecondary, fontSize: 14 }}>📷</span>
              <span style={{ color: colors.foregroundSecondary, fontSize: 14 }}>GIF</span>
              <span style={{ color: colors.foregroundSecondary, fontSize: 14 }}>📊</span>
            </div>
            <div
              style={{
                padding: "12px 28px",
                borderRadius: 24,
                backgroundColor: isPosted ? colors.lime : "#1DA1F2",
                color: isPosted ? colors.bg : colors.white,
                fontWeight: 700,
                fontSize: 15,
                transform: `scale(${postScale})`,
              }}
            >
              {isPosted ? "Posted!" : "Post"}
            </div>
          </div>
        </div>
      </FloatingScreen>

      {/* Points Badge */}
      {isPosted && (
        <div
          style={{
            position: "absolute",
            right: 200,
            top: "50%",
            transform: `translateY(${-50 + pointsY}px) scale(${pointsScale})`,
            opacity: pointsOpacity,
          }}
        >
          <div
            style={{
              padding: "24px 36px",
              borderRadius: 20,
              backgroundColor: `${colors.lime}20`,
              border: `2px solid ${colors.lime}`,
              textAlign: "center",
              boxShadow: `0 0 40px ${colors.lime}40`,
            }}
          >
            <div style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 48, fontWeight: 800 }}>
              +72
            </div>
            <div style={{ color: colors.foregroundSecondary, fontSize: 16, marginTop: 4 }}>
              points earned
            </div>
          </div>
        </div>
      )}

      {/* Success particles */}
      {isPosted && (
        <>
          {[...Array(8)].map((_, i) => (
            <FloatingParticle
              key={i}
              delay={pointsDelay + i * 2}
              startX={65 + Math.random() * 20}
              startY={40 + Math.random() * 20}
              color={colors.lime}
            />
          ))}
        </>
      )}

      <FloatingAuras count={8} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 4: HOLDER DASHBOARD CLAIMING EARNINGS
// ============================================

const ClaimEarningsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cameraDriftX = Math.sin(frame * 0.05) * 20;
  const cameraDriftY = Math.cos(frame * 0.04) * 15;
  const cameraZoom = interpolate(frame, [0, 40, 45, 60], [1, 1, 1.05, 1.02], { extrapolateRight: "clamp" });

  const sceneOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const exitFade = interpolate(frame, [80, 90], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Dashboard card animation
  const cardProgress = spring({ frame: frame - 2, fps, config: { damping: 14, stiffness: 120 } });

  // Stats appearing
  const stat1 = spring({ frame: frame - 6, fps, config: { damping: 15, stiffness: 120 } });
  const stat2 = spring({ frame: frame - 11, fps, config: { damping: 15, stiffness: 120 } });
  const stat3 = spring({ frame: frame - 16, fps, config: { damping: 15, stiffness: 120 } });

  // Reward amount counting up
  const rewardAmount = interpolate(frame, [10, 35], [0, 3.847], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Claim button
  const claimFrame = 45;
  const isClaimed = frame >= claimFrame;
  const claimScale = isClaimed ? interpolate(frame, [claimFrame, claimFrame + 3, claimFrame + 6], [1, 0.95, 1], { extrapolateRight: "clamp" }) : 1;

  // Success animation
  const successScale = spring({ frame: frame - claimFrame, fps, config: { damping: 10, stiffness: 100 } });
  const successOpacity = interpolate(frame, [claimFrame, claimFrame + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // 3D rotation
  const cardRotateY = interpolate(frame, [0, 45, 90], [6, 0, -6], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const cardRotateX = interpolate(frame, [0, 45, 90], [-3, 0, 3], { extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });

  // Coin positions for flying animation
  const coinPositions = [
    { delay: 48, x: 40, y: 50 },
    { delay: 51, x: 55, y: 45 },
    { delay: 54, x: 48, y: 55 },
    { delay: 57, x: 60, y: 50 },
    { delay: 60, x: 45, y: 48 },
    { delay: 63, x: 52, y: 52 },
  ];

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

      {/* Scene Title */}
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 80,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Img
          src={staticFile("branding/green-n-yellowPFP.png")}
          style={{ width: 48, height: 48, borderRadius: 12 }}
        />
        <span style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 700, color: colors.white }}>
          Claim Rewards
        </span>
      </div>

      <FloatingScreen rotateY={cardRotateY} rotateX={cardRotateX} scale={1}>
        <div
          style={{
            width: 500,
            padding: 40,
            borderRadius: 24,
            backgroundColor: colors.bgSurface,
            border: `2px solid ${colors.lime}40`,
            textAlign: "center",
            boxShadow: `0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 60px ${colors.lime}20`,
            opacity: cardProgress,
            transform: `translateY(${(1 - cardProgress) * 30}px)`,
          }}
        >
          {/* Stats Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>
            <div style={{ opacity: stat1, transform: `translateY(${(1 - stat1) * 15}px)` }}>
              <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 4, fontFamily: fonts.body }}>Total Points</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, color: colors.lime }}>
                2,847
              </div>
            </div>
            <div style={{ opacity: stat2, transform: `translateY(${(1 - stat2) * 15}px)` }}>
              <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 4, fontFamily: fonts.body }}>Rank</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, color: colors.purple }}>
                #12
              </div>
            </div>
            <div style={{ opacity: stat3, transform: `translateY(${(1 - stat3) * 15}px)` }}>
              <div style={{ fontSize: 12, color: colors.foregroundSecondary, marginBottom: 4, fontFamily: fonts.body }}>Epochs</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 700, color: colors.teal }}>
                7
              </div>
            </div>
          </div>

          <div style={{ color: colors.foregroundSecondary, fontSize: 16, marginBottom: 12, fontFamily: fonts.body }}>
            Claimable Rewards
          </div>

          <div
            style={{
              fontFamily: fonts.heading,
              fontSize: 80,
              fontWeight: 800,
              color: colors.lime,
              textShadow: `0 0 40px ${colors.lime}60`,
              marginBottom: 8,
            }}
          >
            {rewardAmount.toFixed(3)}
          </div>

          <div style={{ color: colors.foregroundSecondary, fontSize: 24, marginBottom: 36 }}>
            SOL
          </div>

          {!isClaimed ? (
            <div
              style={{
                padding: "20px 56px",
                borderRadius: 16,
                background: `linear-gradient(135deg, ${colors.lime} 0%, ${colors.yellow} 100%)`,
                color: colors.bg,
                fontFamily: fonts.heading,
                fontSize: 22,
                fontWeight: 700,
                display: "inline-block",
                boxShadow: `0 0 30px ${colors.lime}50`,
                transform: `scale(${claimScale})`,
                cursor: "pointer",
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
                  padding: "20px 56px",
                  borderRadius: 16,
                  backgroundColor: `${colors.lime}20`,
                  border: `2px solid ${colors.lime}`,
                  display: "inline-block",
                }}
              >
                <span style={{ color: colors.lime, fontFamily: fonts.heading, fontSize: 22, fontWeight: 700 }}>
                  Claimed! Check your wallet.
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
// SCENE 5: OUTRO
// ============================================

const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cameraDriftX = Math.sin(frame * 0.03) * 10;
  const cameraDriftY = Math.cos(frame * 0.024) * 8;
  const cameraZoom = interpolate(frame, [0, 30, 90], [0.95, 1, 1.02], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });

  const sceneOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });

  // Logo animation
  const logoOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logoScale = interpolate(frame, [0, 20], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });

  // Tagline
  const taglineOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // URL
  const urlOpacity = interpolate(frame, [25, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const urlY = interpolate(frame, [25, 40], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Subtle pulse
  const pulse = Math.sin(frame * 0.05) * 0.02 + 1;

  // Glow animation
  const glowIntensity = Math.sin(frame * 0.03) * 0.2 + 0.8;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", opacity: sceneOpacity, transform: `scale(${cameraZoom})` }}>
      <ParallaxLayer depth={0.3}>
        <AsciiBackground parallaxX={cameraDriftX} parallaxY={cameraDriftY} />
      </ParallaxLayer>

      {/* Background glow */}
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
        {/* Logo */}
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
            fontSize: 80,
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
            fontSize: 26,
            color: colors.foregroundSecondary,
            opacity: taglineOpacity,
            textAlign: "center",
            maxWidth: 600,
          }}
        >
          Launch. Engage. Earn. Repeat.
        </div>

        {/* URL */}
        <div
          style={{
            marginTop: 40,
            padding: "18px 48px",
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
              fontSize: 24,
              fontWeight: 600,
              color: colors.lime,
            }}
          >
            amplifisocial.xyz
          </span>
        </div>
      </div>

      {/* Social handle */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          display: "flex",
          gap: 32,
          opacity: urlOpacity,
        }}
      >
        <span style={{ color: colors.foregroundSecondary, fontSize: 18 }}>@AmpliFiSocial</span>
      </div>
    </AbsoluteFill>
  );
};

// ============================================
// MAIN COMPOSITION
// ============================================

export const AmpliFiPlatformFlow: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, fontFamily: fonts.body }}>
      {/* Load Google Fonts */}
      <style>{fontStyles}</style>
      
      {/* Scene 1: Coin Launch (0-90 frames = 3s) */}
      <Sequence from={0} durationInFrames={90}>
        <CoinLaunchScene />
      </Sequence>

      {/* Scene 2: Join Campaign (90-180 frames = 3s) */}
      <Sequence from={90} durationInFrames={90}>
        <JoinCampaignScene />
      </Sequence>

      {/* Scene 3: Tweet About $AMP (180-270 frames = 3s) */}
      <Sequence from={180} durationInFrames={90}>
        <TweetAboutAmpScene />
      </Sequence>

      {/* Scene 4: Claim Earnings (270-360 frames = 3s) */}
      <Sequence from={270} durationInFrames={90}>
        <ClaimEarningsScene />
      </Sequence>

      {/* Scene 5: Outro (360-450 frames = 3s) */}
      <Sequence from={360} durationInFrames={90}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
