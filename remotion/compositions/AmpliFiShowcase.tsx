import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
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

// Flash transition overlay
const FlashTransition: React.FC<{ trigger: number; duration?: number }> = ({ trigger, duration = 8 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [trigger, trigger + 2, trigger + duration],
    [0, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: colors.lime,
        opacity,
        zIndex: 100,
      }}
    />
  );
};

// ============================================
// SCENE 1: EXPLOSIVE LOGO INTRO
// ============================================

const ExplosiveLogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
      <GlowOrb color={colors.lime} size={500} x={50} y={50} />
      <GlowOrb color={colors.purple} size={300} x={30} y={60} delay={10} />
      <GlowOrb color={colors.teal} size={250} x={70} y={40} delay={20} />

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
          transform: `scale(${logoScale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${colors.lime} 0%, ${colors.teal} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 60px ${colors.lime}80`,
          }}
        >
          <span style={{ fontSize: 48, fontWeight: 900, color: colors.bg }}>A</span>
        </div>

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

      <FlashTransition trigger={70} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 2: TOKEN LAUNCH SIMULATION
// ============================================

const TokenLaunchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
      <GlowOrb color={colors.purple} size={400} x={20} y={30} />
      <GlowOrb color={colors.lime} size={350} x={80} y={70} delay={5} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 80,
          fontFamily: fonts.heading,
          fontSize: 42,
          fontWeight: 700,
          color: colors.white,
        }}
      >
        Launch on Pump.fun
      </div>

      {/* Mock Form */}
      <div
        style={{
          width: 500,
          padding: 32,
          borderRadius: 24,
          backgroundColor: colors.bgSurface,
          border: `1px solid ${colors.border}`,
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

      <FlashTransition trigger={85} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 3: ENGAGEMENT TRACKING
// ============================================

const EngagementTrackingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tweets = [
    { user: "@crypto_whale", text: "Just bought $AMP, this is going to moon!", delay: 5, points: 45 },
    { user: "@defi_degen", text: "The @AmpliFi rewards are insane!", delay: 20, points: 62 },
    { user: "@sol_maxi", text: "$AMP holders eating good today", delay: 35, points: 38 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
      <GlowOrb color={colors.purple} size={400} x={75} y={25} />
      <GlowOrb color={colors.teal} size={300} x={25} y={75} delay={10} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 60,
          fontFamily: fonts.heading,
          fontSize: 42,
          fontWeight: 700,
          color: colors.white,
        }}
      >
        Real-Time Engagement Tracking
      </div>

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
                <div style={{ color: colors.lime, fontFamily: fonts.body, fontSize: 14, fontWeight: 600 }}>
                  {tweet.user}
                </div>
                <div style={{ color: colors.foregroundSecondary, fontFamily: fonts.body, fontSize: 14, marginTop: 4 }}>
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
          {Math.min(145, Math.floor(interpolate(frame, [40, 80], [0, 145], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })))}
        </div>
      </div>

      <FlashTransition trigger={85} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 4: REWARD CLAIM SIMULATION
// ============================================

const RewardClaimScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
      <GlowOrb color={colors.lime} size={500} x={50} y={50} />
      <GlowOrb color={colors.yellow} size={300} x={70} y={30} delay={5} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 80,
          fontFamily: fonts.heading,
          fontSize: 42,
          fontWeight: 700,
          color: colors.white,
        }}
      >
        Claim Your Rewards
      </div>

      {/* Reward Card */}
      <div
        style={{
          width: 450,
          padding: 40,
          borderRadius: 24,
          backgroundColor: colors.bgSurface,
          border: `2px solid ${colors.lime}40`,
          textAlign: "center",
          boxShadow: `0 0 60px ${colors.lime}20`,
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

      <FlashTransition trigger={85} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 5: STATS DASHBOARD
// ============================================

const StatsDashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = [
    { label: "Total Holders", value: "12,847", color: colors.lime, delay: 5 },
    { label: "SOL Distributed", value: "847.5", color: colors.yellow, delay: 12 },
    { label: "Active Campaigns", value: "156", color: colors.purple, delay: 19 },
    { label: "Tweets Tracked", value: "89.2K", color: colors.teal, delay: 26 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
      <GlowOrb color={colors.lime} size={400} x={20} y={20} />
      <GlowOrb color={colors.purple} size={350} x={80} y={80} delay={10} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 80,
          fontFamily: fonts.heading,
          fontSize: 42,
          fontWeight: 700,
          color: colors.white,
        }}
      >
        Platform Stats
      </div>

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

      <FlashTransition trigger={85} />
    </AbsoluteFill>
  );
};

// ============================================
// SCENE 6: CLEAN WIND-DOWN TITLE SCREEN
// ============================================

const WindDownTitleScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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
    <AbsoluteFill style={{ backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
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
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 32,
            background: `linear-gradient(135deg, ${colors.lime} 0%, ${colors.teal} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 80px ${colors.lime}40`,
          }}
        >
          <span style={{ fontSize: 60, fontWeight: 900, color: colors.bg }}>A</span>
        </div>

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

      {/* Scene 3: Engagement Tracking (180-270 frames = 3s) */}
      <Sequence from={180} durationInFrames={90}>
        <EngagementTrackingScene />
      </Sequence>

      {/* Scene 4: Reward Claim (270-360 frames = 3s) */}
      <Sequence from={270} durationInFrames={90}>
        <RewardClaimScene />
      </Sequence>

      {/* Scene 5: Stats Dashboard (360-450 frames = 3s) */}
      <Sequence from={360} durationInFrames={90}>
        <StatsDashboardScene />
      </Sequence>

      {/* Scene 6: Wind-Down Title (450-570 frames = 4s) */}
      <Sequence from={450} durationInFrames={120}>
        <WindDownTitleScreen />
      </Sequence>
    </AbsoluteFill>
  );
};
