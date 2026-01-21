"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Trophy, Medal, Award, TrendingUp, Users, Coins,
  ChevronRight, ExternalLink, Crown
} from "lucide-react";
import { DataCard, DataCardHeader, MetricDisplay } from "@/app/components/ui/data-card";
import {
  RankingTable,
  RankingTableHeader,
  RankingTableHead,
  RankingTableBody,
  RankingTableRow,
  RankingTableCell,
} from "@/app/components/ui/ranking-table";

interface LeaderboardEntry {
  rank: number;
  walletPubkey: string;
  twitterUsername: string | null;
  twitterProfileImageUrl: string | null;
  totalEarnedLamports: string;
  totalEngagements: number;
  campaignsJoined: number;
}

interface LeaderboardStats {
  totalEarners: number;
  totalDistributedLamports: string;
}

function lamportsToSol(lamports: string): string {
  const value = BigInt(lamports || "0");
  const sol = Number(value) / 1e9;
  return sol.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-300" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return null;
}

function getRankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-yellow-400/20 text-yellow-400 border-yellow-400/30";
  if (rank === 2) return "bg-gray-300/20 text-gray-300 border-gray-300/30";
  if (rank === 3) return "bg-amber-600/20 text-amber-600 border-amber-600/30";
  return "bg-dark-border text-foreground-secondary border-dark-border";
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<LeaderboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"all" | "week" | "month">("all");

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/leaderboard?limit=50&period=${period}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch leaderboard");
        }

        setLeaderboard(data.leaderboard || []);
        setStats(data.stats || null);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [period]);

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="mx-auto max-w-[1280px] px-6 pt-28 pb-16">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amplifi-lime/10">
                <Trophy className="h-6 w-6 text-amplifi-lime" />
              </div>
              <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
            </div>
            <p className="text-foreground-secondary">
              Top earners across all AmpliFi campaigns
            </p>
          </div>

          {/* Period Filter */}
          <div className="flex items-center gap-2 bg-dark-elevated rounded-xl p-1">
            {(["all", "month", "week"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-amplifi-lime text-dark-bg"
                    : "text-foreground-secondary hover:text-white"
                }`}
              >
                {p === "all" ? "All Time" : p === "month" ? "This Month" : "This Week"}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <DataCard variant="elevated" className="p-5">
            <MetricDisplay
              value={stats ? lamportsToSol(stats.totalDistributedLamports) : "0.00"}
              label="Total Distributed"
              suffix=" SOL"
              size="md"
              accent="lime"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-5">
            <MetricDisplay
              value={stats?.totalEarners.toString() || "0"}
              label="Total Earners"
              size="md"
              accent="teal"
            />
          </DataCard>
          <DataCard variant="elevated" className="p-5 hidden lg:block">
            <MetricDisplay
              value={leaderboard.length.toString()}
              label="Showing Top"
              size="md"
            />
          </DataCard>
        </div>

        {/* Leaderboard Table */}
        <DataCard>
          <DataCardHeader
            title="Top Earners"
            subtitle={`${period === "all" ? "All time" : period === "month" ? "Last 30 days" : "Last 7 days"} rankings`}
          />

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amplifi-lime"></div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 mb-4">
                <TrendingUp className="h-7 w-7 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Error Loading Leaderboard</h3>
              <p className="text-sm text-foreground-secondary max-w-sm">{error}</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-border mb-4">
                <Users className="h-7 w-7 text-foreground-secondary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Earners Yet</h3>
              <p className="text-sm text-foreground-secondary max-w-sm mb-6">
                Be the first to earn rewards by joining campaigns and engaging with projects.
              </p>
              <Link
                href="/campaigns"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amplifi-lime text-dark-bg text-sm font-semibold hover:bg-amplifi-lime-dark transition-colors"
              >
                Explore Campaigns
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <RankingTable>
              <RankingTableHeader>
                <RankingTableHead>Rank</RankingTableHead>
                <RankingTableHead>User</RankingTableHead>
                <RankingTableHead align="right">Engagements</RankingTableHead>
                <RankingTableHead align="right">Campaigns</RankingTableHead>
                <RankingTableHead align="right">Total Earned</RankingTableHead>
              </RankingTableHeader>
              <RankingTableBody>
                {leaderboard.map((entry) => (
                  <RankingTableRow key={entry.walletPubkey} highlight={entry.rank <= 3}>
                    <RankingTableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border text-sm font-bold ${getRankBadgeClass(entry.rank)}`}
                        >
                          {entry.rank}
                        </span>
                        {getRankIcon(entry.rank)}
                      </div>
                    </RankingTableCell>
                    <RankingTableCell>
                      <div className="flex items-center gap-3">
                        {entry.twitterProfileImageUrl ? (
                          <img
                            src={entry.twitterProfileImageUrl}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover border border-dark-border"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-amplifi-purple to-amplifi-teal flex items-center justify-center text-white font-bold text-xs">
                            {entry.walletPubkey.slice(0, 2)}
                          </div>
                        )}
                        <div>
                          {entry.twitterUsername ? (
                            <a
                              href={`https://x.com/${entry.twitterUsername}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-white hover:text-amplifi-lime transition-colors flex items-center gap-1"
                            >
                              @{entry.twitterUsername}
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </a>
                          ) : (
                            <span className="font-medium text-white">
                              {shortenAddress(entry.walletPubkey)}
                            </span>
                          )}
                          <p className="text-xs text-foreground-secondary font-mono">
                            {shortenAddress(entry.walletPubkey)}
                          </p>
                        </div>
                      </div>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="font-semibold text-white">
                        {entry.totalEngagements.toLocaleString()}
                      </span>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="font-semibold text-white">{entry.campaignsJoined}</span>
                    </RankingTableCell>
                    <RankingTableCell align="right">
                      <span className="text-amplifi-lime font-bold">
                        {lamportsToSol(entry.totalEarnedLamports)} SOL
                      </span>
                    </RankingTableCell>
                  </RankingTableRow>
                ))}
              </RankingTableBody>
            </RankingTable>
          )}
        </DataCard>

        {/* CTA */}
        <div className="mt-8 text-center">
          <p className="text-foreground-secondary mb-4">
            Want to climb the leaderboard? Start earning rewards today.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amplifi-lime text-dark-bg font-semibold hover:bg-amplifi-lime-dark transition-colors"
            >
              <Award className="h-4 w-4" />
              Join Campaigns
            </Link>
            <Link
              href="/holder"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-dark-border text-white font-medium hover:bg-dark-elevated transition-colors"
            >
              <Coins className="h-4 w-4" />
              View Your Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
