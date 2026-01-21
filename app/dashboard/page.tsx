"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Users, Rocket } from "lucide-react";
import Link from "next/link";

const HolderDashboard = dynamic(() => import("@/app/holder/page"), { ssr: false });
const CreatorDashboard = dynamic(() => import("@/app/creator/page"), { ssr: false });

function DashboardContent() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "creator" ? "creator" : "holder";

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Mode Toggle */}
      <div className="sticky top-16 z-30 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
        <div className="mx-auto max-w-[1280px] px-6 py-3">
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard?mode=holder"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "holder"
                  ? "bg-amplifi-lime text-dark-bg"
                  : "bg-dark-elevated text-foreground-secondary hover:text-white hover:bg-dark-border"
              }`}
            >
              <Users className="h-4 w-4" />
              Raider
            </Link>
            <Link
              href="/dashboard?mode=creator"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === "creator"
                  ? "bg-amplifi-purple text-white"
                  : "bg-dark-elevated text-foreground-secondary hover:text-white hover:bg-dark-border"
              }`}
            >
              <Rocket className="h-4 w-4" />
              Creator
            </Link>
          </div>
        </div>
      </div>

      {/* Dashboard Content */}
      {mode === "creator" ? <CreatorDashboard /> : <HolderDashboard />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-amplifi-lime border-t-transparent" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
