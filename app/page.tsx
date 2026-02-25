import { HodlrLayout, HoldingsCalculator } from "./components/hodlr";
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
      <div className="px-4 md:px-6 pt-8 pb-12 min-h-[calc(100vh-60px)] flex items-center justify-center">
        <HoldingsCalculator 
          currentEpochPool={currentEpochPool}
          totalHolders={totalHolders}
          topHolderDays={topHolderDays}
        />
      </div>
    </HodlrLayout>
  );
}
