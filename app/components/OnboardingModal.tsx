"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Sparkles, Twitter, Coins, Trophy, Rocket } from "lucide-react";
import { cn } from "@/app/lib/utils";

interface OnboardingStep {
  id: number;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  visual: React.ReactNode;
  accent: string;
}

function ContractAddressVisual() {
  const [highlighted, setHighlighted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHighlighted(true), 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-sm text-foreground-secondary mb-2">Token Contract Address</div>
      <div className="relative bg-dark-card border border-dark-border rounded-xl px-4 py-3 font-mono text-sm">
        <span className="text-foreground-secondary">7xKp...9Qm</span>
        <span
          className={cn(
            "font-bold transition-all duration-500",
            highlighted
              ? "text-amplifi-lime scale-110 inline-block"
              : "text-foreground-secondary"
          )}
        >
          AMP
        </span>
      </div>
      <div
        className={cn(
          "flex items-center gap-2 text-amplifi-lime transition-all duration-500",
          highlighted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        )}
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-medium">AmpliFi-powered token</span>
      </div>
    </div>
  );
}

function BuyTokensVisual() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 800),
      setTimeout(() => setStep(3), 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div
          className={cn(
            "bg-dark-card border border-dark-border rounded-xl p-4 transition-all duration-300 hover-shimmer",
            step >= 1 ? "opacity-100 scale-100" : "opacity-0 scale-95"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
              M
            </div>
            <div>
              <div className="font-semibold text-white">$MEME</div>
              <div className="text-xs text-foreground-secondary">Buy on Pump.fun</div>
            </div>
          </div>
        </div>

      </div>

      <div
        className={cn(
          "flex justify-center transition-all duration-300 mt-4",
          step >= 2 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
        )}
      >
        <div className="flex items-center gap-1.5 text-amplifi-lime">
          <Coins className="h-4 w-4" />
          <span className="text-sm font-medium">+1,000 tokens</span>
        </div>
      </div>

      <div
        className={cn(
          "text-center transition-all duration-300 mt-4",
          step >= 3 ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="text-sm text-foreground-secondary">You&apos;re now a holder</div>
      </div>
    </div>
  );
}

function JoinCampaignVisual() {
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setJoined(true), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={cn(
          "bg-dark-card border rounded-xl p-4 transition-all duration-500",
          joined ? "border-amplifi-lime shadow-lg shadow-amplifi-lime/20" : "border-dark-border"
        )}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
          <div className="font-semibold text-white">$MEME Campaign</div>
        </div>
        <div className="text-xs text-foreground-secondary mb-3">
          Reward Pool: 5 SOL
        </div>
        <button
          className={cn(
            "w-full py-2 px-4 rounded-lg text-sm font-medium transition-all duration-300",
            joined
              ? "bg-amplifi-lime text-dark-bg"
              : "bg-dark-border text-white"
          )}
        >
          {joined ? "Joined!" : "Join Campaign"}
        </button>
      </div>

      <div
        className={cn(
          "flex items-center gap-2 text-amplifi-purple transition-all duration-500",
          joined ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
        )}
      >
        <Twitter className="h-4 w-4" />
        <span className="text-sm">Connect your X account</span>
      </div>
    </div>
  );
}

function GetPaidVisual() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 300),
      setTimeout(() => setStep(2), 700),
      setTimeout(() => setStep(3), 1100),
      setTimeout(() => setStep(4), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const tweets = [
    { type: "Tweet", points: "+50" },
    { type: "Retweet", points: "+30" },
    { type: "Reply", points: "+20" },
  ];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="space-y-2">
        {tweets.map((tweet, i) => (
          <div
            key={tweet.type}
            className={cn(
              "flex items-center justify-between bg-dark-card border border-dark-border rounded-lg px-3 py-2 min-w-[180px] transition-all duration-300",
              step > i ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
            )}
          >
            <span className="text-sm text-foreground-secondary">{tweet.type}</span>
            <span className="text-sm font-medium text-amplifi-lime">{tweet.points}</span>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "flex items-center gap-2 bg-gradient-to-r from-amplifi-lime/20 to-amplifi-teal/20 border border-amplifi-lime/30 rounded-xl px-4 py-3 transition-all duration-500",
          step >= 4 ? "opacity-100 scale-100" : "opacity-0 scale-95"
        )}
      >
        <Trophy className="h-5 w-5 text-amplifi-lime" />
        <div>
          <div className="text-sm font-semibold text-white">Epoch Rewards</div>
          <div className="text-xs text-amplifi-lime">+0.25 SOL earned</div>
        </div>
      </div>
    </div>
  );
}

const STEPS: OnboardingStep[] = [
  {
    id: 1,
    icon: <Rocket className="h-6 w-6" />,
    title: "Spot the AMP suffix",
    subtitle: "Tokens ending in 'AMP' are powered by AmpliFi. Holders get paid to promote.",
    visual: <ContractAddressVisual />,
    accent: "amplifi-lime",
  },
  {
    id: 2,
    icon: <Coins className="h-6 w-6" />,
    title: "Buy some tokens",
    subtitle: "Purchase the token on Pump.fun or any DEX. You're now an eligible holder.",
    visual: <BuyTokensVisual />,
    accent: "amplifi-purple",
  },
  {
    id: 3,
    icon: <Twitter className="h-6 w-6" />,
    title: "Join the campaign",
    subtitle: "Connect your X account and join the project's marketing campaign.",
    visual: <JoinCampaignVisual />,
    accent: "amplifi-teal",
  },
  {
    id: 4,
    icon: <Trophy className="h-6 w-6" />,
    title: "Get paid to shill",
    subtitle: "Tweet about the project. Earn points. Get SOL rewards every epoch.",
    visual: <GetPaidVisual />,
    accent: "amplifi-lime",
  },
];

interface OnboardingModalProps {
  forceOpen?: boolean;
  onClose?: () => void;
}

export function OnboardingModal({ forceOpen, onClose }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Reset step when modal opens
  useEffect(() => {
    if (forceOpen) {
      setCurrentStep(0);
    }
  }, [forceOpen]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleNext = useCallback(() => {
    if (isAnimating) return;
    if (currentStep < STEPS.length - 1) {
      setIsAnimating(true);
      setCurrentStep((s) => s + 1);
      setTimeout(() => setIsAnimating(false), 400);
    } else {
      handleClose();
    }
  }, [currentStep, isAnimating, handleClose]);

  const handlePrev = useCallback(() => {
    if (isAnimating) return;
    if (currentStep > 0) {
      setIsAnimating(true);
      setCurrentStep((s) => s - 1);
      setTimeout(() => setIsAnimating(false), 400);
    }
  }, [currentStep, isAnimating]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    },
    [handleClose, handleNext, handlePrev]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const step = STEPS[currentStep];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div 
        className="relative w-full max-w-md rounded-2xl shadow-2xl hover-shimmer"
        style={{ 
          "--shimmer-bg": "#0b0c0e", 
          "--shimmer-radius": "16px" 
        } as React.CSSProperties}
      >
        {/* Inner content wrapper to ensure readability */}
        <div className="relative z-10 bg-dark-bg rounded-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-foreground-secondary hover:text-white transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Progress dots */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                if (!isAnimating) {
                  setIsAnimating(true);
                  setCurrentStep(i);
                  setTimeout(() => setIsAnimating(false), 400);
                }
              }}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                i === currentStep
                  ? `w-6 bg-${step.accent}`
                  : "w-2 bg-dark-border hover:bg-foreground-secondary"
              )}
              style={
                i === currentStep
                  ? { backgroundColor: `var(--${step.accent}, #a3e635)` }
                  : undefined
              }
            />
          ))}
        </div>

        {/* Content */}
        <div className="pt-14 pb-6 px-6">
          {/* Step icon and title */}
          <div className="text-center mb-6">
            <div
              className={cn(
                "inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4 transition-all duration-300",
                `bg-${step.accent}/10 text-${step.accent}`
              )}
              style={{
                backgroundColor: `color-mix(in srgb, var(--${step.accent}, #a3e635) 10%, transparent)`,
                color: `var(--${step.accent}, #a3e635)`,
              }}
            >
              {step.icon}
            </div>
            <h2 className="text-xl font-bold text-white mb-2">{step.title}</h2>
            <p className="text-sm text-foreground-secondary max-w-xs mx-auto">
              {step.subtitle}
            </p>
          </div>

          {/* Visual */}
          <div
            key={currentStep}
            className="min-h-[180px] flex items-center justify-center"
          >
            {step.visual}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-dark-border bg-dark-card/50">
          <button
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={cn(
              "flex items-center gap-1 text-sm font-medium transition-colors",
              currentStep === 0
                ? "text-foreground-secondary/50 cursor-not-allowed"
                : "text-foreground-secondary hover:text-white"
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-1 bg-amplifi-lime text-dark-bg px-4 py-2 rounded-lg text-sm font-semibold hover:bg-amplifi-lime/90 transition-colors"
          >
            {currentStep === STEPS.length - 1 ? "Get Started" : "Next"}
            {currentStep < STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Skip link */}
        <div className="text-center pb-4">
          <button
            onClick={handleClose}
            className="text-xs text-foreground-secondary hover:text-white transition-colors"
          >
            Skip intro
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

