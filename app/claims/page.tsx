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
      <div className="max-w-[900px] px-4 md:px-6 pt-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Gift className="h-6 w-6 text-emerald-400" />
              <h1 className="text-2xl font-bold text-white">Claims</h1>
            </div>
            <p className="text-sm text-[#9AA3B2]">Claim your HODLR holder rewards</p>
          </div>
          {latest && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#9AA3B2]">Epoch</span>
              <span className="font-mono text-sm font-semibold text-white">#{latest.epochNumber}</span>
              <span className={`text-xs px-2 py-0.5 rounded border ${
                latest.status === "claim_open"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-white/[0.03] text-[#9AA3B2] border-white/5"
              }`}>
                {latest.status === "claim_open" ? "Claim Open" : latest.status}
              </span>
            </div>
          )}
        </div>

        {/* Security Warning */}
        <div className="flex items-start gap-3 px-4 py-3 mb-6 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <Shield className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-amber-400">Security reminder</div>
            <div className="text-xs text-[#9AA3B2] mt-1">
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
