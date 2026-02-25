import { HodlrLayout, HoldingsCalculator, HeroGraphic } from "./components/hodlr";
import { ArrowDown } from "lucide-react";
import {
  getHodlrBoardStats,
  getHodlrEpochStats,
  listHodlrRankings,
} from "./lib/hodlr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  let currentEpochPool = 10;
  let totalHolders = 500;
  let topHolderDays = 90;

  try {
    const stats = await getHodlrBoardStats();
    const latestEpoch = stats.latestEpoch;
    const epochStats = latestEpoch ? await getHodlrEpochStats(latestEpoch.id) : null;
    const topHolders = latestEpoch ? await listHodlrRankings(latestEpoch.id) : [];

    currentEpochPool = epochStats ? Number(BigInt(epochStats.totalPoolLamports || "0")) / 1e9 : 10;
    totalHolders = topHolders.length > 0 ? Math.max(topHolders.length * 10, 100) : 500;
    topHolderDays = topHolders.length > 0 && topHolders[0]?.holdingDays ? topHolders[0].holdingDays : 90;
  } catch (e) {
    console.error("Failed to load HODLR home stats", e);
  }

  return (
    <HodlrLayout>
      <div className="flex flex-col min-h-[calc(100vh-52px)]">
        {/* Hero Section */}
        <section className="relative flex flex-col items-center justify-center pt-20 pb-16 px-5 md:px-8 border-b border-white/[0.05]">
          <div className="text-center max-w-3xl mx-auto mb-12 relative z-10">
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight mb-6 leading-tight">
              Hold longer. <br className="md:hidden" />
              <span className="text-[#B6F04A]">Earn more.</span>
            </h1>
            <p className="text-base md:text-xl text-white/50 leading-relaxed font-medium">
              HODLR is a deterministic rewards protocol. Your yield is calculated exponentially based on two factors: your token balance and how long you hold.
            </p>
          </div>
          
          <HeroGraphic />

          <div className="mt-16 animate-bounce text-white/20">
            <ArrowDown className="h-6 w-6" />
          </div>
        </section>

        {/* Calculator Section */}
        <section className="flex-1 flex items-center justify-center px-5 md:px-8 py-20 bg-[#080809]">
          <div className="w-full max-w-lg relative z-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white tracking-tight mb-2">Estimate Your Yield</h2>
              <p className="text-sm text-white/40">Use the calculator below to project your potential SOL earnings</p>
            </div>
            <HoldingsCalculator 
              currentEpochPool={currentEpochPool}
              totalHolders={totalHolders}
              topHolderDays={topHolderDays}
            />
          </div>
        </section>
      </div>
    </HodlrLayout>
  );
}
