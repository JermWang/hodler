/**
 * AmpliFi Engagement Scoring Engine
 * 
 * Calculates engagement scores based on:
 * - Base engagement points (tweet type)
 * - Token balance weight (sqrt scaling)
 * - Time consistency bonus
 * - Anti-spam dampening
 */

import { TwitterTweet, getTweetType } from "./twitter";

export interface EngagementWeights {
  likeBps: number;      // Basis points for likes (1000 = 0.1x)
  retweetBps: number;   // Basis points for retweets (3000 = 0.3x)
  replyBps: number;     // Basis points for replies (5000 = 0.5x)
  quoteBps: number;     // Basis points for quote tweets (6000 = 0.6x)
}

export interface ScoringContext {
  weights: EngagementWeights;
  holderTokenBalance: bigint;
  totalTokenSupply: bigint;
  previousEngagements: EngagementHistory[];
  epochStartUnix: number;
  epochEndUnix: number;
  influenceMultiplier?: number;
}

export interface EngagementHistory {
  tweetId: string;
  tweetText: string;
  tweetType: string;
  createdAtUnix: number;
  finalScore: number;
}

export interface ScoringResult {
  basePoints: number;
  balanceWeight: number;
  timeConsistencyBonus: number;
  antiSpamDampener: number;
  finalScore: number;
  isDuplicate: boolean;
  isSpam: boolean;
  spamReason?: string;
}

const BASE_POINTS = {
  original: 10,
  retweet: 3,
  reply: 5,
  quote: 6,
  like: 1,
};

/**
 * Calculate base engagement points for a tweet
 */
export function calculateBasePoints(
  tweet: TwitterTweet,
  weights: EngagementWeights
): number {
  const tweetType = getTweetType(tweet);
  
  let basePoints: number;
  let weightBps: number;

  switch (tweetType) {
    case "original":
      basePoints = BASE_POINTS.original;
      weightBps = 10000; // 1x for original tweets
      break;
    case "retweet":
      basePoints = BASE_POINTS.retweet;
      weightBps = weights.retweetBps;
      break;
    case "reply":
      basePoints = BASE_POINTS.reply;
      weightBps = weights.replyBps;
      break;
    case "quote":
      basePoints = BASE_POINTS.quote;
      weightBps = weights.quoteBps;
      break;
    default:
      basePoints = 1;
      weightBps = weights.likeBps;
  }

  return (basePoints * weightBps) / 10000;
}

/**
 * Calculate balance weight using square root scaling
 * This prevents whales from dominating the reward pool
 */
export function calculateBalanceWeight(
  holderBalance: bigint,
  totalSupply: bigint
): number {
  if (totalSupply === 0n || holderBalance === 0n) {
    return 0;
  }

  // Calculate holder's share as a decimal
  const shareRatio = Number(holderBalance) / Number(totalSupply);
  
  // Apply square root scaling
  // sqrt(share) gives diminishing returns for larger holders
  const sqrtWeight = Math.sqrt(shareRatio);
  
  // Normalize to a reasonable range (0.1 to 10)
  // A holder with 1% of supply gets weight ~1.0
  // A holder with 0.01% gets weight ~0.1
  // A holder with 25% gets weight ~5.0
  const normalizedWeight = sqrtWeight * 10;
  
  return Math.max(0.1, Math.min(10, normalizedWeight));
}

/**
 * Calculate time consistency bonus
 * Rewards sustained engagement over burst activity
 */
export function calculateTimeConsistencyBonus(
  previousEngagements: EngagementHistory[],
  epochStartUnix: number,
  epochEndUnix: number
): number {
  if (previousEngagements.length === 0) {
    return 1.0; // No history, neutral bonus
  }

  const epochDuration = epochEndUnix - epochStartUnix;
  const dayInSeconds = 86400;
  const epochDays = Math.ceil(epochDuration / dayInSeconds);

  // Count unique days with engagement
  const engagementDays = new Set<number>();
  for (const engagement of previousEngagements) {
    const dayIndex = Math.floor((engagement.createdAtUnix - epochStartUnix) / dayInSeconds);
    if (dayIndex >= 0 && dayIndex < epochDays) {
      engagementDays.add(dayIndex);
    }
  }

  // Calculate consistency ratio
  const consistencyRatio = engagementDays.size / epochDays;

  // Bonus ranges from 1.0 (no consistency) to 1.5 (daily engagement)
  return 1.0 + (consistencyRatio * 0.5);
}

/**
 * Calculate anti-spam dampener
 * Reduces score for suspicious patterns
 */
export function calculateAntiSpamDampener(
  tweet: TwitterTweet,
  previousEngagements: EngagementHistory[]
): { dampener: number; isSpam: boolean; isDuplicate: boolean; reason?: string } {
  let dampener = 1.0;
  let isSpam = false;
  let isDuplicate = false;
  let reason: string | undefined;

  // Check for duplicate content
  const tweetTextNormalized = normalizeTweetText(tweet.text);
  for (const prev of previousEngagements) {
    const prevNormalized = normalizeTweetText(prev.tweetText);
    const similarity = calculateTextSimilarity(tweetTextNormalized, prevNormalized);
    
    if (similarity > 0.9) {
      isDuplicate = true;
      dampener = 0;
      reason = "Duplicate content detected";
      return { dampener, isSpam, isDuplicate, reason };
    }
    
    if (similarity > 0.7) {
      dampener = Math.min(dampener, 0.3);
      reason = "Similar content to previous engagement";
    }
  }

  // Check for excessive frequency (more than 10 engagements per hour)
  const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
  const recentEngagements = previousEngagements.filter(
    (e) => e.createdAtUnix > oneHourAgo
  );
  
  if (recentEngagements.length > 10) {
    dampener = Math.min(dampener, 0.5);
    isSpam = true;
    reason = "Excessive engagement frequency";
  }

  // Check for very short tweets (likely low effort)
  if (tweet.text.length < 20 && getTweetType(tweet) === "original") {
    dampener = Math.min(dampener, 0.7);
    reason = "Very short content";
  }

  // Check for repetitive patterns (same words repeated)
  if (hasRepetitivePattern(tweet.text)) {
    dampener = Math.min(dampener, 0.5);
    isSpam = true;
    reason = "Repetitive pattern detected";
  }

  return { dampener, isSpam, isDuplicate, reason };
}

/**
 * Normalize tweet text for comparison
 */
function normalizeTweetText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "") // Remove URLs
    .replace(/@\w+/g, "") // Remove mentions
    .replace(/#\w+/g, "") // Remove hashtags
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Calculate text similarity using Jaccard index
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.split(" ").filter((w) => w.length > 2));
  const words2 = new Set(text2.split(" ").filter((w) => w.length > 2));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Check for repetitive patterns in text
 */
function hasRepetitivePattern(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  if (words.length < 4) return false;

  const wordCounts = new Map<string, number>();
  for (const word of words) {
    if (word.length > 2) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  // Check if any word appears more than 3 times
  for (const count of wordCounts.values()) {
    if (count > 3) return true;
  }

  return false;
}

/**
 * Calculate complete engagement score
 */
export function calculateEngagementScore(
  tweet: TwitterTweet,
  context: ScoringContext
): ScoringResult {
  const tweetType = getTweetType(tweet);

  // Calculate base points
  const basePoints = calculateBasePoints(tweet, context.weights);

  // Calculate balance weight
  const balanceWeight = calculateBalanceWeight(
    context.holderTokenBalance,
    context.totalTokenSupply
  );

  // Calculate time consistency bonus
  const timeConsistencyBonus = calculateTimeConsistencyBonus(
    context.previousEngagements,
    context.epochStartUnix,
    context.epochEndUnix
  );

  // Calculate anti-spam dampener
  const { dampener: antiSpamDampener, isSpam, isDuplicate, reason } = calculateAntiSpamDampener(
    tweet,
    context.previousEngagements
  );

  const rawInfluenceMultiplier = Number(context.influenceMultiplier ?? 1);
  const influenceMultiplier =
    tweetType === "original" || tweetType === "retweet" || tweetType === "reply" || tweetType === "quote"
      ? Math.max(1, Math.min(3, Number.isFinite(rawInfluenceMultiplier) ? rawInfluenceMultiplier : 1))
      : 1;

  // Calculate final score
  const finalScore = basePoints * balanceWeight * timeConsistencyBonus * antiSpamDampener * influenceMultiplier;

  return {
    basePoints,
    balanceWeight,
    timeConsistencyBonus,
    antiSpamDampener,
    finalScore,
    isDuplicate,
    isSpam,
    spamReason: reason,
  };
}

/**
 * Maximum earners per epoch - Bags.fm supports 100 wallets, but 1 slot is the creator
 * so 99 raiders can earn rewards
 */
export const MAX_EARNERS_PER_EPOCH = 99;

/**
 * Calculate reward distribution for an epoch
 * Only the top MAX_EARNERS_PER_EPOCH scorers receive rewards
 */
export function calculateEpochRewards(
  scores: Array<{ walletPubkey: string; totalScore: number }>,
  rewardPoolLamports: bigint,
  maxEarners: number = MAX_EARNERS_PER_EPOCH
): Array<{ walletPubkey: string; rewardLamports: bigint; shareBps: number }> {
  // Sort by score descending and take only top earners
  const sortedScores = [...scores].sort((a, b) => b.totalScore - a.totalScore);
  const topEarners = sortedScores.slice(0, maxEarners);
  
  const totalScore = topEarners.reduce((sum, s) => sum + s.totalScore, 0);
  
  if (totalScore === 0) {
    return topEarners.map((s) => ({
      walletPubkey: s.walletPubkey,
      rewardLamports: 0n,
      shareBps: 0,
    }));
  }

  return topEarners.map((s) => {
    const shareBps = Math.floor((s.totalScore / totalScore) * 10000);
    const rewardLamports = (rewardPoolLamports * BigInt(shareBps)) / 10000n;
    
    return {
      walletPubkey: s.walletPubkey,
      rewardLamports,
      shareBps,
    };
  });
}
