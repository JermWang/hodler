"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { OnboardingModal } from "./OnboardingModal";

const STORAGE_KEY = "amplifi_onboarding_seen";

interface OnboardingContextType {
  openOnboarding: () => void;
  resetAndOpenOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Check localStorage on mount for first-visit auto-show
  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Small delay to let page load first
      const timer = setTimeout(() => setIsOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const openOnboarding = useCallback(() => {
    setIsOpen(true);
  }, []);

  const resetAndOpenOnboarding = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "true");
    }
  }, []);

  return (
    <OnboardingContext.Provider value={{ openOnboarding, resetAndOpenOnboarding }}>
      {children}
      {isOpen && <OnboardingModal forceOpen onClose={handleClose} />}
    </OnboardingContext.Provider>
  );
}
