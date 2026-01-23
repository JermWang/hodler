"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Flame, Trophy, Users } from "lucide-react";

import { DataCard, DataCardHeader } from "@/app/components/ui/data-card";
import {
  RankingTable,
  RankingTableHeader,
  RankingTableHead,
  RankingTableBody,
  RankingTableRow,
  RankingTableCell,
} from "@/app/components/ui/ranking-table";

type CampaignInfo = {
  id: string;
  name: string;
};

type EpochInfo = {
  id: string;
  epochNumber: number;
  startAtUnix: number;
  endAtUnix: number;
} | null;

type ActiveShiller = {
  rank: number;
  walletPubkey: string;
  twitterUsername: string | null;
  twitterProfileImageUrl: string | null;
  totalScore: number;
  engagements: number;
};

type PayoutLeader = {
  rank: number;
  walletPubkey: string;
  twitterUsername: string | null;
  twitterProfileImageUrl: string | null;
  totalEarnedLamports: string;
};

function lamportsToSol(lamports: string): string {
  const value = BigInt(lamports || "0");
  const sol = Number(value) / 1e9;
  return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function formatEpochWindow(epoch: EpochInfo): string {
  if (!epoch) return "";
  const start = new Date(epoch.startAtUnix * 1000);
  const end = new Date(epoch.endAtUnix * 1000);
  return `${start.toLocaleString()} to ${end.toLocaleString()}`;
}

export default function CampaignLeaderboardPage() {
  const params = useParams();
  const campaignId = String((params as any)?.id ?? "").trim();

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
  const [currentEpoch, setCurrentEpoch] = useState<EpochInfo>(null);
  const [activeShillers, setActiveShillers] = useState<ActiveShiller[]>([]);
  const [payoutLeaders, setPayoutLeaders] = useState<PayoutLeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseName = useMemo(() => {
    const rawName = String(campaign?.name ?? "").trim();
    return rawName.replace(/\s+engagement\s+campaign\s*$/i, "").trim() || rawName;
  }, [campaign?.name]);

  useEffect(() => {
    if (!campaignId) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/leaderboard?limit=50`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(String(json?.error || "Failed to fetch leaderboard"));

        setCampaign(json?.campaign ?? null);
        setCurrentEpoch(json?.currentEpoch ?? null);
        setActiveShillers(Array.isArray(json?.activeShillers) ? json.activeShillers : []);
        setPayoutLeaders(Array.isArray(json?.payoutLeaders) ? json.payoutLeaders : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [campaignId]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="mx-auto max-w-[1280px] px-6 pt-28 pb-16">
        <Link
          href="/campaigns"
          className="inline-flex items-center text-sm text-foreground-secondary hover:text-amplifi-lime mb-8 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Campaigns
        </Link>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-lime/10">
                <Trophy className="h-6 w-6 text-amplifi-lime" />
              </div>
              <h1 className="text-3xl font-bold text-white">{baseName || "Campaign"}</h1>
            </div>
            <div className="text-sm text-foreground-secondary">Engagement leaderboard</div>
            {currentEpoch ? (
              <div className="text-xs text-foreground-secondary mt-2">
                Current epoch: #{currentEpoch.epochNumber} ({formatEpochWindow(currentEpoch)})
              </div>
            ) : (
              <div className="text-xs text-foreground-secondary mt-2">No active epoch right now.</div>
            )}
          </div>

          <div className="flex flex-col items-start md:items-end gap-2">
            <Link
              href={`/campaigns/${encodeURIComponent(campaignId)}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white/80 font-medium hover:bg-white/15 hover:text-white transition-colors"
            >
              View campaign details
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amplifi-lime"></div>
          </div>
        ) : error ? (
          <DataCard>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
                <Users className="h-7 w-7 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Error Loading Leaderboard</h3>
              <p className="text-sm text-foreground-secondary max-w-sm">{error}</p>
            </div>
          </DataCard>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <DataCard>
              <DataCardHeader
                title="Active Shillers"
                subtitle={currentEpoch ? "Top engagers this epoch" : "No active epoch"}
              />
              {activeShillers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-border mb-4">
                    <Flame className="h-7 w-7 text-foreground-secondary" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">No shillers yet</h3>
                  <p className="text-sm text-foreground-secondary max-w-sm">Engagements will show here after tracking runs.</p>
                </div>
              ) : (
                <RankingTable>
                  <RankingTableHeader>
                    <RankingTableHead>Rank</RankingTableHead>
                    <RankingTableHead>User</RankingTableHead>
                    <RankingTableHead align="right">Score</RankingTableHead>
                    <RankingTableHead align="right">Engagements</RankingTableHead>
                  </RankingTableHeader>
                  <RankingTableBody>
                    {activeShillers.map((row) => (
                      <RankingTableRow key={row.walletPubkey} highlight={row.rank <= 3}>
                        <RankingTableCell>
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold bg-dark-border text-foreground-secondary border-dark-border">
                            {row.rank}
                          </span>
                        </RankingTableCell>
                        <RankingTableCell>
                          <div className="flex items-center gap-3">
                            {row.twitterProfileImageUrl ? (
                              <img
                                src={row.twitterProfileImageUrl}
                                alt=""
                                className="h-9 w-9 rounded-full object-cover border border-dark-border"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
                                {row.walletPubkey.slice(0, 2)}
                              </div>
                            )}
                            <div>
                              {row.twitterUsername ? (
                                <a
                                  href={`https://x.com/${row.twitterUsername}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-white hover:text-amplifi-lime transition-colors flex items-center gap-1"
                                >
                                  @{row.twitterUsername}
                                  <ExternalLink className="h-3 w-3 opacity-50" />
                                </a>
                              ) : (
                                <span className="font-medium text-white">{shortenAddress(row.walletPubkey)}</span>
                              )}
                              <div className="text-xs text-foreground-secondary font-mono">{shortenAddress(row.walletPubkey)}</div>
                            </div>
                          </div>
                        </RankingTableCell>
                        <RankingTableCell align="right">
                          <span className="font-semibold text-white">{Number(row.totalScore || 0).toFixed(2)}</span>
                        </RankingTableCell>
                        <RankingTableCell align="right">
                          <span className="font-semibold text-white">{Number(row.engagements || 0).toLocaleString()}</span>
                        </RankingTableCell>
                      </RankingTableRow>
                    ))}
                  </RankingTableBody>
                </RankingTable>
              )}
            </DataCard>

            <DataCard>
              <DataCardHeader title="Payout Leaders" subtitle="Top earners in this campaign" />
              {payoutLeaders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-border mb-4">
                    <Trophy className="h-7 w-7 text-foreground-secondary" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">No payouts yet</h3>
                  <p className="text-sm text-foreground-secondary max-w-sm">Payout leaders appear after epochs settle.</p>
                </div>
              ) : (
                <RankingTable>
                  <RankingTableHeader>
                    <RankingTableHead>Rank</RankingTableHead>
                    <RankingTableHead>User</RankingTableHead>
                    <RankingTableHead align="right">Total Earned</RankingTableHead>
                  </RankingTableHeader>
                  <RankingTableBody>
                    {payoutLeaders.map((row) => (
                      <RankingTableRow key={row.walletPubkey} highlight={row.rank <= 3}>
                        <RankingTableCell>
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold bg-dark-border text-foreground-secondary border-dark-border">
                            {row.rank}
                          </span>
                        </RankingTableCell>
                        <RankingTableCell>
                          <div className="flex items-center gap-3">
                            {row.twitterProfileImageUrl ? (
                              <img
                                src={row.twitterProfileImageUrl}
                                alt=""
                                className="h-9 w-9 rounded-full object-cover border border-dark-border"
                              />
                            ) : (
                              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
                                {row.walletPubkey.slice(0, 2)}
                              </div>
                            )}
                            <div>
                              {row.twitterUsername ? (
                                <a
                                  href={`https://x.com/${row.twitterUsername}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-white hover:text-amplifi-lime transition-colors flex items-center gap-1"
                                >
                                  @{row.twitterUsername}
                                  <ExternalLink className="h-3 w-3 opacity-50" />
                                </a>
                              ) : (
                                <span className="font-medium text-white">{shortenAddress(row.walletPubkey)}</span>
                              )}
                              <div className="text-xs text-foreground-secondary font-mono">{shortenAddress(row.walletPubkey)}</div>
                            </div>
                          </div>
                        </RankingTableCell>
                        <RankingTableCell align="right">
                          <span className="text-amplifi-lime font-bold">{lamportsToSol(row.totalEarnedLamports)} SOL</span>
                        </RankingTableCell>
                      </RankingTableRow>
                    ))}
                  </RankingTableBody>
                </RankingTable>
              )}
            </DataCard>
          </div>
        )}
      </div>
    </div>
  );
}
