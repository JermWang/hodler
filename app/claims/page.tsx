import { Gift, Shield, AlertTriangle } from "lucide-react";

import { getLatestHodlrEpoch } from "@/app/lib/hodlr/store";
import { HodlrLayout } from "@/app/components/hodlr";
import ClaimsClient from "./ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ClaimsPage() {
  let latest: Awaited<ReturnType<typeof getLatestHodlrEpoch>> = null;

  try {
    latest = await getLatestHodlrEpoch();
  } catch (e) {
    console.error("Failed to load latest HODLR epoch", e);
  }

  return (
    <HodlrLayout>
      <div className="max-w-[860px] px-5 md:px-7 pt-7 pb-14">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-7">
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">Claims</h1>
            <p className="text-xs text-white/30 mt-0.5">Claim your HODLR holder rewards</p>
          </div>
          {latest && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-white/25 font-black uppercase tracking-widest">Epoch</span>
              <span className="font-mono text-sm font-black text-white">#{latest.epochNumber}</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                latest.status === "claim_open"
                  ? "bg-[#B6F04A]/10 text-[#B6F04A] border-[#B6F04A]/20"
                  : "bg-white/[0.04] text-white/30 border-white/[0.06]"
              }`}>
                {latest.status === "claim_open" ? "Claim Open" : latest.status}
              </span>
            </div>
          )}
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-3 px-4 py-3.5 mb-6 rounded-xl border border-amber-500/15 bg-amber-500/[0.04]">
          <Shield className="h-4 w-4 text-amber-400/70 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold text-amber-400/80">Security reminder</div>
            <div className="text-xs text-white/25 mt-0.5 leading-relaxed">
              Never share your seed phrase. Always verify you are on the correct domain before signing transactions.
              HODLR will never ask for your private keys.
            </div>
          </div>
        </div>

        <ClaimsClient latestEpochNumber={latest?.epochNumber ?? 0} claimWindowOpen={latest?.status === "claim_open"} />
      </div>
    </HodlrLayout>
  );
}
